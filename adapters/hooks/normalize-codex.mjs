// Turns a Codex apply_patch hook payload into the per-file, Claude-shaped payloads the shared hook
// scripts expect. Codex reports every file change as one apply_patch call, while the scripts (and the
// hook matchers) know Write, Edit and Bash.
import path from 'node:path'

// The patch tool when the caller passes no host table.
const DEFAULT_HOOK_TOOLS = { Write: 'apply_patch', Edit: 'apply_patch' }
/** True for the tool a host uses to write files as one patch, which is any Write or Edit tool that is not Claude's own. */
export const isPatchTool = (name, hookTools = DEFAULT_HOOK_TOOLS) =>
  Boolean(name) && name !== 'Write' && name !== 'Edit' && [hookTools.Write, hookTools.Edit].includes(name)
const SHELL_PATCH = /^\s*apply_patch\b/

/** The host table's tool names when they name a patch tool, else the default; an incomplete table never disables patch handling. */
const toolsOrDefault = (hookTools) => (hookTools && (hookTools.Write || hookTools.Edit) ? hookTools : DEFAULT_HOOK_TOOLS)

/**
 * True when a payload carries a patch: the host's patch tool, or a shell command that starts with `apply_patch`
 * (Codex reports a shell-invoked patch as Bash).
 */
export const isPatchCall = (payload, hookTools) =>
  isPatchTool(payload.tool_name, toolsOrDefault(hookTools))
  || (payload.tool_name === 'Bash' && typeof payload.tool_input?.command === 'string' && SHELL_PATCH.test(payload.tool_input.command))
const FILE_HEADER = /^\s*\*\*\* (Add File|Update File|Delete File): (.+)$/
const MOVE_HEADER = /^\s*\*\*\* Move to: (.+)$/

/**
 * Splits patch text into one operation per file.
 *
 * @param {string} text apply_patch text, `*** Begin Patch` to `*** End Patch`
 * @returns {{ kind: 'add'|'update'|'delete', path: string, moveTo?: string, oldString: string, newString: string }[]}
 *   Added files carry their content in `newString`; updates carry the hunks' removed and resulting lines.
 */
export function parsePatch(text) {
  const ops = []
  let current = null
  const oldLines = []
  const newLines = []
  const close = () => {
    if (!current) return
    current.oldString = oldLines.splice(0).join('\n')
    current.newString = newLines.splice(0).join('\n')
    ops.push(current)
    current = null
  }
  for (const line of String(text).split(/\r?\n/)) {
    const header = FILE_HEADER.exec(line)
    if (header) {
      close()
      const kind = { 'Add File': 'add', 'Update File': 'update', 'Delete File': 'delete' }[header[1]]
      current = { kind, path: header[2].trim() }
      continue
    }
    if (/^\s*\*\*\* (End|Begin) Patch/.test(line)) {
      close()
      continue
    }
    if (!current) continue
    const move = MOVE_HEADER.exec(line)
    if (move && current.kind === 'update') {
      current.moveTo = move[1].trim()
      continue
    }
    if (current.kind === 'add') {
      if (line.startsWith('+')) newLines.push(line.slice(1))
    } else if (current.kind === 'update') {
      if (line.startsWith('+')) newLines.push(line.slice(1))
      else if (line.startsWith('-')) oldLines.push(line.slice(1))
      else if (line.startsWith(' ')) {
        oldLines.push(line.slice(1))
        newLines.push(line.slice(1))
      }
    }
  }
  close()
  return ops
}

/** The patch text of an apply_patch payload, wherever the host put it. */
function patchText(toolInput) {
  if (typeof toolInput === 'string') return toolInput
  for (const key of ['command', 'input', 'patch']) {
    const value = toolInput?.[key]
    if (typeof value === 'string') return value
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return value.join('\n')
  }
  return ''
}

const resolveIn = (cwd, file) => (path.isAbsolute(file) ? file : path.resolve(cwd, file))

/**
 * Expands a Codex payload into the calls to dispatch.
 *
 * A payload for any other tool passes through unchanged. For apply_patch, each file yields one call:
 * Add File becomes a Write, Update File an Edit, and `Move to` a delete of the source plus a Write of
 * the destination. A delete yields a `delete` call whose Bash payload `rm -- <path>` lets the Bash
 * guard hooks judge whether the path is protected; it runs no Write or Edit hook.
 *
 * @param {object} payload Codex hook payload (`cwd`, `tool_name`, `tool_input`, ...)
 * @param {{ hookTools?: Record<string, string> }} [options] the host table entry; `hookTools.Write` and `hookTools.Edit`
 *   name the tool that carries a patch (`apply_patch`)
 * @returns {{ kind: 'call'|'delete', payload: object, projectDir: string, filePath?: string }[]} calls in patch order
 */
export function normalizeCodex(payload, { hookTools = DEFAULT_HOOK_TOOLS } = {}) {
  const cwd = payload.cwd || process.cwd()
  if (!isPatchCall(payload, hookTools)) return [{ kind: 'call', payload, projectDir: cwd }]
  const base = { ...payload }
  delete base.tool_input
  const units = []
  const write = (file, content) => units.push({
    kind: 'call',
    payload: { ...base, tool_name: 'Write', tool_input: { file_path: file, content } },
    projectDir: cwd,
    filePath: file,
  })
  const remove = (file) => units.push({
    kind: 'delete',
    payload: { ...base, tool_name: 'Bash', tool_input: { command: `rm -- '${file.replace(/'/g, "'\\''")}'` } },
    projectDir: cwd,
    filePath: file,
  })
  for (const op of parsePatch(patchText(payload.tool_input))) {
    const file = resolveIn(cwd, op.path)
    if (op.kind === 'add') write(file, op.newString)
    else if (op.kind === 'delete') remove(file)
    else if (op.moveTo) {
      remove(file)
      write(resolveIn(cwd, op.moveTo), op.newString)
    } else {
      units.push({
        kind: 'call',
        payload: { ...base, tool_name: 'Edit', tool_input: { file_path: file, old_string: op.oldString, new_string: op.newString } },
        projectDir: cwd,
        filePath: file,
      })
    }
  }
  return units
}
