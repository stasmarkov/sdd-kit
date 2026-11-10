// Dependency-free JSON Schema validator for the keyword subset the workflow
// output schemas and the bridge tool inputs use.
//
// validate(schema, value) returns an array of { path, keyword } errors, where
// path is an RFC 6901 JSON Pointer to the offending value ("" is the root).
// An empty array means the value is valid. A schema that uses a keyword outside
// the subset is a programming error, so validate() throws and names the keyword
// and its location in the schema instead of silently accepting the value.

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'examples', 'format'])

const VALIDATING = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'const', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'additionalProperties',
  'anyOf', 'oneOf', 'pattern'
])

const escapeToken = (token) => String(token).replace(/~/g, '~0').replace(/\//g, '~1')

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(type, value) {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeOf(a) !== typeOf(b) || a === null || typeof a !== 'object') return false
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

function checkKeywords(schema, schemaPath) {
  if (schema === true || schema === false) return
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`schema at ${schemaPath || '/'} must be an object or boolean`)
  }
  for (const key of Object.keys(schema)) {
    if (!ANNOTATIONS.has(key) && !VALIDATING.has(key)) {
      throw new Error(`unsupported schema keyword "${key}" at ${schemaPath || '/'}`)
    }
  }
}

// Rejects unsupported keywords anywhere in the schema, including branches the
// value never reaches, so a bad schema fails the same way for every input.
function assertSupported(schema, schemaPath) {
  checkKeywords(schema, schemaPath)
  if (schema === true || schema === false) return
  for (const [name, sub] of Object.entries(schema.properties || {})) {
    assertSupported(sub, `${schemaPath}/properties/${escapeToken(name)}`)
  }
  if (schema.items !== undefined) assertSupported(schema.items, `${schemaPath}/items`)
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties === 'object') {
    assertSupported(schema.additionalProperties, `${schemaPath}/additionalProperties`)
  }
  for (const key of ['anyOf', 'oneOf']) {
    ;(schema[key] || []).forEach((b, i) => assertSupported(b, `${schemaPath}/${key}/${i}`))
  }
}

// Evaluates anyOf/oneOf branches. When the combinator fails and exactly one branch
// accepts the value's type, that branch's errors are reported (they point at the
// real defect); otherwise a single error names the combinator.
function walkBranches(keyword, branches, accepts, value, path, schemaPath, out) {
  const results = branches.map((b, i) => {
    const sub = []
    walk(b, value, path, `${schemaPath}/${keyword}/${i}`, sub)
    return { branch: b, errors: sub }
  })
  if (accepts(results.filter((r) => r.errors.length === 0).length)) return
  const typed = results.filter((r) => r.branch === true || r.branch.type === undefined
    || (Array.isArray(r.branch.type) ? r.branch.type : [r.branch.type]).some((t) => matchesType(t, value)))
  if (typed.length === 1 && typed[0].errors.length > 0) out.push(...typed[0].errors)
  else out.push({ path, keyword })
}

function walk(schema, value, path, schemaPath, out) {
  if (schema === true) return
  if (schema === false) {
    out.push({ path, keyword: 'false schema' })
    return
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((t) => matchesType(t, value))) {
      out.push({ path, keyword: 'type' })
      return
    }
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => deepEqual(e, value))) {
    out.push({ path, keyword: 'enum' })
  }
  if (schema.const !== undefined && !deepEqual(schema.const, value)) {
    out.push({ path, keyword: 'const' })
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) out.push({ path, keyword: 'minimum' })
    if (schema.maximum !== undefined && value > schema.maximum) out.push({ path, keyword: 'maximum' })
  }

  if (typeof value === 'string') {
    const length = [...value].length
    if (schema.minLength !== undefined && length < schema.minLength) out.push({ path, keyword: 'minLength' })
    if (schema.maxLength !== undefined && length > schema.maxLength) out.push({ path, keyword: 'maxLength' })
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) {
      out.push({ path, keyword: 'pattern' })
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push({ path, keyword: 'minItems' })
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push({ path, keyword: 'maxItems' })
    if (schema.items !== undefined) {
      value.forEach((item, i) => walk(schema.items, item, `${path}/${i}`, `${schemaPath}/items`, out))
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties || {}
    for (const name of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) {
        out.push({ path: `${path}/${escapeToken(name)}`, keyword: 'required' })
      }
    }
    for (const [name, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, name)) {
        walk(sub, value[name], `${path}/${escapeToken(name)}`, `${schemaPath}/properties/${escapeToken(name)}`, out)
      }
    }
    if (schema.additionalProperties !== undefined) {
      for (const name of Object.keys(value)) {
        if (Object.prototype.hasOwnProperty.call(props, name)) continue
        const at = `${path}/${escapeToken(name)}`
        if (schema.additionalProperties === false) {
          out.push({ path: at, keyword: 'additionalProperties' })
        } else if (schema.additionalProperties !== true) {
          walk(schema.additionalProperties, value[name], at, `${schemaPath}/additionalProperties`, out)
        }
      }
    }
  }

  if (schema.anyOf !== undefined) walkBranches('anyOf', schema.anyOf, (n) => n >= 1, value, path, schemaPath, out)
  if (schema.oneOf !== undefined) walkBranches('oneOf', schema.oneOf, (n) => n === 1, value, path, schemaPath, out)
}

/**
 * Validates a value against a schema.
 *
 * @param {object|boolean} schema JSON Schema using the supported keyword subset.
 * @param {*} value Parsed JSON value to check.
 * @returns {{path: string, keyword: string}[]} Errors in document order; empty when valid.
 * @throws {Error} When the schema uses a keyword outside the subset.
 */
export function validate(schema, value) {
  assertSupported(schema, '')
  const out = []
  walk(schema, value, '', '', out)
  return out
}
