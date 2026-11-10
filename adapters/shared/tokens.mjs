// Claude-to-host text conversion shared by the Codex and Cursor builds and installers: the hosts.json `tokens`
// map (literal strings, longest match first), rule links in the host's `rulesFormat`, the per-form value of
// ${CLAUDE_PLUGIN_ROOT}, and the check that no Claude-only token survives the mapping.
import path from 'node:path'

/** Tokens that must not reach a host file unless the map replaces them or the allowlist names them. */
export const CLAUDE_TOKENS = [
  '.claude/',
  '.claude',
  'CLAUDE.md',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_SKILL_DIR',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_CONFIG_DIR',
  '/sdd-kit:',
  'sdd-kit:',
  'mcp__plugin_sdd-kit_',
]

// Both spellings of the plugin-root variable that the skills use.
const PLUGIN_ROOT_TOKENS = ['${CLAUDE_PLUGIN_ROOT}', '${CLAUDE_PLUGIN_ROOT:-.}']
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The bare directory name is matched only as a whole name, so `.claude-plugin`, `.claudeignore`, `~/.claude.json`
// (a word character, `-` or a `.extension` after it) and `docs.claude.com` (a word character, `-` or `.` before it)
// are not touched; a sentence that ends in `.claude.` still is.
const BARE_DIR = '.claude'
const BARE_DIR_START = '(?<![\\w.-])'
const BARE_DIR_END = '(?![\\w-]|\\.\\w)'
const keyPattern = (key) => (key === BARE_DIR ? `${BARE_DIR_START}${escapeRe(key)}${BARE_DIR_END}` : escapeRe(key))

/**
 * True when `line` holds `token`; the bare `.claude` token matches only as a whole path segment name.
 * @param {string} line one line of mapped text
 * @param {string} token an entry of CLAUDE_TOKENS
 * @returns {boolean} whether the token is present
 */
export function holdsToken(line, token) {
  return token === BARE_DIR ? new RegExp(keyPattern(token)).test(line) : line.includes(token)
}

/**
 * Replaces every key of the token map (and `${CLAUDE_PLUGIN_ROOT}` when a replacement is given) in one pass,
 * longest key first, so a replacement is never mapped again.
 * @param {string} text file text
 * @param {Record<string,string>} tokens the host's hosts.json `tokens`
 * @param {string|null} [pluginRoot] value for `${CLAUDE_PLUGIN_ROOT}`; null leaves the token in place
 * @returns {string} mapped text
 */
export function mapTokens(text, tokens, pluginRoot = null) {
  const table = { ...tokens }
  if (pluginRoot !== null) for (const t of PLUGIN_ROOT_TOKENS) table[t] = pluginRoot
  const keys = Object.keys(table).sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
  if (!keys.length) return text
  return text.replace(new RegExp(keys.map(keyPattern).join('|'), 'g'), (hit) => table[hit])
}

/**
 * Claude tokens left in a text, with the line each one is on.
 * @param {string} text mapped text
 * @param {string} file repo- or package-relative path, matched against allowlist `file` ("*" matches any)
 * @param {string} host host key
 * @param {{host: string, file: string, token: string}[]} allowlist token-allowlist.json entries
 * @returns {{line: number, token: string}[]} leftovers
 */
export function leftoverTokens(text, file, host, allowlist) {
  const allowed = new Set(allowlist.filter((a) => a.host === host && (a.file === '*' || a.file === file)).map((a) => a.token))
  const found = []
  text.split('\n').forEach((line, i) => {
    for (const token of CLAUDE_TOKENS) {
      if (holdsToken(line, token) && !allowed.has(token)) found.push({ line: i + 1, token })
    }
  })
  return found
}

/** `../../runtime`-style path from the directory of `file` to `target`, both relative to the package root. */
export function relativeTo(file, target) {
  const rel = path.posix.relative(path.posix.dirname(file), target)
  return rel || '.'
}

/**
 * Points rule-file links at the host's rule format: `<rulesDir>/<name>.md` becomes `<rulesDir>/<name>.<rulesFormat>`
 * (`*` and `<file>` placeholders included). A host whose rules stay Markdown, or that has no rules directory, keeps the text.
 * @param {string} text mapped text
 * @param {{ rulesDir?: string|null, rulesFormat?: string|null }} hostConfig the host's hosts.json entry
 * @returns {string} text with rule links in the host format
 * @example mapRuleLinks('see .cursor/rules/tests.md', { rulesDir: '.cursor/rules', rulesFormat: 'mdc' }) // 'see .cursor/rules/tests.mdc'
 */
export function mapRuleLinks(text, { rulesDir, rulesFormat } = {}) {
  if (!rulesDir || !rulesFormat || rulesFormat === 'md') return text
  return text.replace(new RegExp(`(${escapeRe(rulesDir)}/[\\w*<>-]+)\\.md\\b`, 'g'), `$1.${rulesFormat}`)
}

/**
 * Converts one text file for a host and reports what could not be mapped.
 * @param {{ text: string, file: string, host: string, hostConfig: {tokens: Record<string,string>},
 *   allowlist: object[], pluginRoot?: string|null, rootProblem?: string }} opts file is the path the
 *   message cites; pluginRoot is the value for `${CLAUDE_PLUGIN_ROOT}` (null when the file may not use it)
 * @returns {{ text: string, errors: string[] }} mapped text and `file:line message` problems
 */
export function convertText({ text, file, host, hostConfig, allowlist, pluginRoot = null, rootProblem = 'move the script into the core or drop the token' }) {
  const mapped = mapRuleLinks(mapTokens(text, hostConfig.tokens || {}, pluginRoot), hostConfig)
  const errors = leftoverTokens(mapped, file, host, allowlist).map(
    ({ line, token }) => `${file}:${line}: unmapped token ${token}${token === 'CLAUDE_PLUGIN_ROOT' ? `; ${rootProblem}` : `; add it to hosts.json tokens for ${host} or to src/adapters/token-allowlist.json`}`
  )
  return { text: mapped, errors }
}

/**
 * Frontmatter keys and body of a Markdown file. Understands quoted scalars, block scalars (`>-`, `|`)
 * and one level of nested keys under `metadata:`.
 * @param {string} text file text
 * @returns {{ meta: Record<string, any>, body: string, bodyOffset: number }} meta values are strings, `metadata` an object
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { meta: {}, body: text, bodyOffset: 0 }
  const meta = {}
  let key = null
  let block = false
  for (const line of m[1].split(/\r?\n/)) {
    const top = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (top) {
      key = top[1]
      const value = top[2].trim()
      block = /^[>|][-+]?$/.test(value)
      meta[key] = block || value === '' ? '' : value.replace(/^["']|["']$/g, '')
    } else if (key && /^[ \t]+/.test(line)) {
      if (block) {
        meta[key] = `${meta[key]} ${line.trim()}`.trim()
      } else if (key === 'metadata') {
        const nested = /^[ \t]+([\w-]+):\s*(.*)$/.exec(line)
        if (nested) {
          if (typeof meta.metadata !== 'object') meta.metadata = {}
          meta.metadata[nested[1]] = nested[2].trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  }
  return { meta, body: text.slice(m[0].length), bodyOffset: m[0].length }
}
