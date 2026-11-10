// Turns Cursor hook payloads into the Claude-shaped payloads the shared hook scripts expect. The event
// names come from the host table (hosts.json hookEvents); a key `Event:Tool` routes one Claude event
// and tool to its own Cursor event, such as PreToolUse on Bash to beforeShellExecution.
import fs from 'node:fs'
import path from 'node:path'

/**
 * Inverts a hookEvents map into Cursor event name -> Claude event and optional tool.
 *
 * @param {Record<string, string|null>} hookEvents host table entry
 * @returns {Map<string, { event: string, tool?: string }>} lookup keyed by the host's event name
 */
export function cursorEventMap(hookEvents) {
  const map = new Map()
  for (const [key, name] of Object.entries(hookEvents)) {
    if (!name) continue
    const [event, tool] = key.split(':')
    map.set(name, tool ? { event, tool } : { event })
  }
  return map
}

const within = (root, file) => file === root || file.startsWith(root.endsWith(path.sep) ? root : root + path.sep)

/** The workspace root holding the file, else the first root, else the payload's own cwd. */
function workspaceRoot(payload, file) {
  const roots = Array.isArray(payload.workspace_roots) ? payload.workspace_roots : []
  if (file) {
    const holder = roots.find((r) => within(r, file))
    if (holder) return holder
  }
  return roots[0] || payload.cwd || process.cwd()
}

/**
 * Normalizes one Cursor payload.
 *
 * - an event routed to PreToolUse on Bash (beforeShellExecution): PreToolUse Bash with `tool_input.command`.
 * - preToolUse and postToolUse: Shell becomes Bash; Write becomes Edit when the file exists at that
 *   moment and Write otherwise; other tools keep their name.
 * - an event routed to PostToolUse on Write or Edit (afterFileEdit): PostToolUse Edit, `new_string` being the new text of the edits.
 * - Every other event keeps its payload.
 *
 * @param {object} payload Cursor hook payload
 * @param {string} eventName Cursor event name, from the payload or the command line
 * @param {{ hookEvents: Record<string, string|null>, hookTools?: Record<string, string>, exists?: (p: string) => boolean }} options
 *   host table entry and a file-exists probe (tests replace it)
 * @returns {{ event: string, payload: object, projectDir: string, filePath?: string, searchStart?: string }|null} null for an event with no Claude equivalent
 */
export function normalizeCursor(payload, eventName, { hookEvents, hookTools = {}, exists = fs.existsSync }) {
  const route = cursorEventMap(hookEvents).get(eventName)
  if (!route) return null
  const shellName = hookTools.Bash
  const writeName = hookTools.Write
  const out = { ...payload, hook_event_name: route.event }
  let file = payload.tool_input?.file_path || payload.file_path
  // The host table routes an event to one Claude tool (`PreToolUse:Bash`): a Bash route carries the shell
  // command, a PostToolUse Write or Edit route carries the edits of a finished file change.
  const shellEvent = route.tool === 'Bash'
  const editEvent = route.event === 'PostToolUse' && (route.tool === 'Write' || route.tool === 'Edit')
  if (shellEvent) {
    out.tool_name = 'Bash'
    out.tool_input = { command: payload.command }
    file = undefined
  } else if (editEvent) {
    const edits = Array.isArray(payload.edits) ? payload.edits : []
    out.tool_name = 'Edit'
    out.tool_input = { file_path: payload.file_path, new_string: edits.map((e) => e.new_string ?? '').join('\n') }
  } else if (payload.tool_name) {
    const projectDir = workspaceRoot(payload, file)
    const abs = file && (path.isAbsolute(file) ? file : path.resolve(projectDir, file))
    if (shellName && payload.tool_name === shellName) out.tool_name = 'Bash'
    else if (writeName && payload.tool_name === writeName) out.tool_name = abs && exists(abs) ? 'Edit' : 'Write'
  }
  // A shell event has no file: its root is the one holding the shell's own cwd, else the first root.
  const shellCwd = shellEvent ? payload.cwd : undefined
  const projectDir = workspaceRoot(payload, file || shellCwd)
  out.cwd = projectDir
  return {
    event: route.event,
    payload: out,
    projectDir,
    ...(file ? { filePath: file } : {}),
    // Where the shell runs, which may be a repo below the root; the add-on marker search starts there.
    ...(shellCwd ? { searchStart: shellCwd } : {}),
  }
}
