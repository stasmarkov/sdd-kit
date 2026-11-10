// Runs the kit's hook scripts on hosts that have no hooks.json to read. The hook list comes from the
// generated stacks.json (`hooks.core` and `hooks.addons.<plugin>`), the payload is normalized to the
// Claude shape, and the existing scripts run unchanged with CLAUDE_PROJECT_DIR set.
//
// Usage: node dispatch.mjs <event> [--hook <script>] [--host codex|cursor|claude]
//   The hook payload arrives as JSON on stdin. Exit 2 blocks, as in Claude; stderr carries the reason.
//   --registry <file> reads the hook list from another stacks.json and is for tests only.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { hasMarker, installedAddonPackages, installedRoot } from '../lib/locate.mjs'
import { isPatchCall, normalizeCodex } from './normalize-codex.mjs'
import { normalizeCursor } from './normalize-cursor.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GUARD_SCRIPT = 'block-dangerous.sh'
const FILE_TOOLS = new Set(['Write', 'Edit'])
// Other tools that change a file and name it in file_path (a Cursor tool keeps its own name, and Claude has two more).
const FILE_TOOL_NAMES = ['MultiEdit', 'NotebookEdit', 'Delete', 'StrReplace', 'EditNotebook']
// Hosts without a fail-closed setting rely on these: when one cannot run, the dispatcher blocks (AC-56).
export const GUARD_SCRIPTS = new Set([GUARD_SCRIPT, 'scan-secrets.sh', 'gate-guard.sh'])

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/**
 * Where the runtime keeps its data and scripts: an installed root holds `stacks.json` beside `hooks/`,
 * a source checkout keeps them in src/ and the repository root.
 *
 * @param {string} [hooksDir] directory of this file
 * @returns {{ addonInstalled: (name: string) => boolean, stacksJson: string, hostsFile: string, coreScripts: string, addonScripts: (name: string) => string }} locations
 */
export function locateRuntime(hooksDir = HERE) {
  const parent = path.dirname(hooksDir)
  if (installedRoot(hooksDir)) {
    // A file copy records its add-ons in installed.json. The plugin form has none, and an add-on is installed
    // when its package sits beside the core package (installedAddonPackages() resolves both cache layouts).
    const installedFile = path.join(parent, 'installed.json')
    let registry = {}
    try { registry = readJson(path.join(parent, 'stacks.json')) } catch { registry = {} }
    // Package names come from the registry (an add-on's agent plugin, the first-party plugin list); the
    // `<core>-<name>` form is the fallback for an add-on without a stack.
    const packageName = (name) => registry.entries?.[name]?.agent?.plugin
      || (registry.firstPartyPlugins || []).find((p) => p.endsWith(`-${name}`))
      || `sdd-kit-${name}`
    let packages = null
    const addonInstalled = (name) => {
      if (fs.existsSync(installedFile)) {
        try {
          const recorded = readJson(installedFile).addons
          if (Array.isArray(recorded) && !recorded.includes(name)) return false
        } catch {
          return false
        }
        return fs.existsSync(path.join(parent, 'addons', name, 'scripts'))
      }
      packages ||= installedAddonPackages(parent)
      return packages.has(packageName(name))
    }
    return {
      addonInstalled,
      stacksJson: path.join(parent, 'stacks.json'),
      hostsFile: path.join(parent, 'hosts.json'),
      coreScripts: path.join(parent, 'scripts'),
      addonScripts: (name) => path.join(parent, 'addons', name, 'scripts'),
    }
  }
  const repo = path.dirname(path.dirname(parent))
  return {
    addonInstalled: () => true,
    stacksJson: path.join(repo, 'src', 'workflows', 'lib', 'stacks.json'),
    hostsFile: path.join(parent, 'hosts.json'),
    coreScripts: path.join(repo, 'scripts'),
    addonScripts: (name) => path.join(repo, 'src', 'plugins', name, 'scripts'),
  }
}

/**
 * The nearest ancestor of `start` (itself included) that holds one of the markers. The search stops
 * after the first directory that is a git root, so a marker in a sibling or parent repo never counts.
 *
 * @param {string} start file or directory the event is about
 * @param {string[]} markers file names or `*` patterns
 * @returns {string|null} that directory, or null
 */
export function markerRoot(start, markers) {
  if (!markers.length) return null
  let dir = start
  try {
    if (!fs.statSync(dir).isDirectory()) dir = path.dirname(dir)
  } catch {
    dir = path.dirname(dir)
  }
  for (;;) {
    if (hasMarker(dir, markers)) return dir
    if (fs.existsSync(path.join(dir, '.git'))) return null
    const up = path.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

const matcherHits = (matcher, subject) => !matcher || new RegExp(`^(?:${matcher})$`).test(subject)

/** The host's table entry, or null when the host is unknown or its entry lacks the event or tool maps. */
function hostEntry(host, hostsFile, registry) {
  let table = registry.hosts
  if (!table && fs.existsSync(hostsFile)) table = readJson(hostsFile).hosts
  const entry = table && Object.hasOwn(table, host) ? table[host] : null
  return entry && entry.hookEvents && entry.hookTools && Object.keys(entry.hookTools).length ? entry : null
}

function detectHost(payload, requested) {
  if (requested) return requested
  if (Array.isArray(payload.workspace_roots)) return 'cursor'
  return 'codex'
}

/** Hooks of one event that apply at `projectStart`: all core hooks plus add-ons whose markers match there. */
function selectHooks(registry, rt, event, subject, probeStart, hookFilter, viaRegistry) {
  const chosen = []
  const take = (entry, scriptsDir) => {
    if (entry.event !== event || !matcherHits(entry.matcher, subject)) return
    if (hookFilter && entry.script !== hookFilter) return
    if (entry.script !== path.basename(entry.script)) return
    chosen.push({ ...entry, file: path.join(scriptsDir, entry.script) })
  }
  const core = registry.hooks?.core || []
  const coreDir = viaRegistry && registry.scriptsDir ? registry.scriptsDir : rt.coreScripts
  core.forEach((e) => take(e, coreDir))
  for (const [name, addon] of Object.entries(registry.hooks?.addons || {})) {
    if (!viaRegistry && !rt.addonInstalled(name)) continue
    if (!markerRoot(probeStart, addon.markers || [])) continue
    const dir = viaRegistry && addon.scriptsDir ? addon.scriptsDir : rt.addonScripts(name)
    addon.hooks.forEach((e) => take(e, dir))
  }
  return chosen
}

/**
 * Runs one hook script through bash, so a lost exec bit cannot stop it.
 *
 * @returns {{ status: number, stdout: string, stderr: string, missing: boolean, failure: string|null }} `failure`
 *   names why the script could not run to completion (spawn error, timeout or signal), else null
 */
function runScript(hook, payload, projectDir, hostName) {
  if (!fs.existsSync(hook.file)) return { status: 1, stdout: '', stderr: '', missing: true, failure: null }
  const res = spawnSync('bash', [hook.file], {
    input: JSON.stringify(payload),
    cwd: fs.existsSync(projectDir) ? projectDir : undefined,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, SDD_HOST: hostName },
    encoding: 'utf8',
    timeout: (hook.timeout || 60) * 1000,
  })
  let failure = null
  if (res.error) failure = res.error.code === 'ETIMEDOUT' ? `timed out after ${hook.timeout || 60}s` : res.error.message
  else if (res.signal) failure = `was stopped by ${res.signal}`
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '', missing: false, failure }
}

/**
 * Starts an async hook the way Claude does, in the background: the host's tool call does not wait for it
 * and its exit code and output are dropped. No timeout is armed, because a parent-side timer would keep this
 * process alive until it fired. The payload reaches the script through an unlinked temp file.
 */
function runDetached(hook, payload, projectDir, hostName) {
  if (!fs.existsSync(hook.file)) return false
  const tmp = path.join(os.tmpdir(), `sdd-hook-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 })
  const fd = fs.openSync(tmp, 'r')
  fs.unlinkSync(tmp)
  try {
    const child = spawn('bash', [hook.file], {
      cwd: fs.existsSync(projectDir) ? projectDir : undefined,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, SDD_HOST: hostName },
      stdio: [fd, 'ignore', 'ignore'],
      detached: true,
    })
    child.on('error', () => {})
    child.unref()
  } finally {
    fs.closeSync(fd)
  }
  return true
}

/**
 * Handles one host hook event.
 *
 * @param {object} options
 * @param {string} options.event the host's event name (Cursor camelCase, or the Claude name)
 * @param {object} options.payload the host's JSON payload
 * @param {string} [options.host] codex, cursor or claude; detected from the payload when omitted
 * @param {string} [options.hook] run only this script name
 * @param {string} [options.registry] stacks.json to read instead of the shipped one (tests only)
 * @param {string} [options.hostsFile] hosts.json to read instead of the shipped one (tests only)
 * @param {(p: string) => boolean} [options.exists] file-exists probe for Cursor Write payloads
 * @returns {{ code: 0|2, stdout: string, stderr: string, ran: { script: string, file: string, tool: string }[] }} result;
 *   `ran` lists each script run with the Claude-shaped tool name it saw
 */
export function dispatch({ event, payload, host, hook, registry: registryFile, hostsFile, exists }) {
  const rt = locateRuntime()
  const registry = readJson(registryFile || rt.stacksJson)
  const hostName = detectHost(payload, host)
  const known = hostEntry(hostName, hostsFile || rt.hostsFile, registry)
  const entry = known || { hookEvents: {}, hookTools: {} }
  const result = { code: 0, stdout: '', stderr: '', ran: [] }
  if (!known) {
    // Without the host's tool names a patch or shell write could pass unguarded, so a tool call is refused.
    const toolEvent = /^pretooluse$/i.test(event)
    result.code = toolEvent ? 2 : 0
    result.stderr = `dispatch: no hook table for host "${hostName}". Fix: pass --host codex or --host cursor, and reinstall the kit if hosts.json or the stacks.json hosts section is missing.\n`
    return result
  }

  let claudeEvent = event
  let units
  if (hostName === 'cursor') {
    const n = normalizeCursor(payload, event, { hookEvents: entry.hookEvents, hookTools: entry.hookTools, exists })
    if (!n) return result
    claudeEvent = n.event
    units = [{ kind: 'call', payload: n.payload, projectDir: n.projectDir, filePath: n.filePath, searchStart: n.searchStart }]
  } else {
    units = normalizeCodex(payload, { hookTools: entry.hookTools })
    // A patch that yields no file operation would run no guard at all; refuse it rather than let it through.
    if (claudeEvent === 'PreToolUse' && isPatchCall(payload, entry.hookTools) && !units.length) {
      result.code = 2
      result.stderr += 'dispatch: the apply_patch payload has no file operation the guard can read. Fix: send the patch as text with "*** Add File:", "*** Update File:" or "*** Delete File:" headers.\n'
      return result
    }
  }

  const writeTools = new Set([...FILE_TOOLS, ...Object.entries(entry.hookTools).filter(([k]) => k !== 'Bash').map(([, v]) => v), ...FILE_TOOL_NAMES])
  for (const unit of units) {
    const subject = claudeEvent === 'SessionStart' ? unit.payload.source || '' : unit.payload.tool_name || ''
    const start = unit.filePath || unit.searchStart || unit.payload.cwd || unit.projectDir
    // A delete runs no Write or Edit hook; only the guard sees it, as the Bash command it would be.
    const guardOnly = unit.kind === 'delete'
    let hooks = selectHooks(registry, rt, claudeEvent, subject, start, guardOnly ? GUARD_SCRIPT : hook, Boolean(registryFile))
      .filter((h) => !guardOnly || h.script === GUARD_SCRIPT)
    // The guard's matcher is Bash, but it also refuses file writes to a trust store, so a write tool's PreToolUse
    // unit runs it when the selected hooks do not. A per-script invocation (--hook) leaves that to the host's own
    // guard entry, and a read tool never needs it.
    const writesFile = writeTools.has(unit.payload.tool_name) && typeof unit.payload.tool_input?.file_path === 'string'
    const guardWanted = !hook || hook === GUARD_SCRIPT
    if (hostName !== 'claude' && claudeEvent === 'PreToolUse' && writesFile && guardWanted && !hooks.some((h) => h.script === GUARD_SCRIPT)) {
      const coreDir = registryFile && registry.scriptsDir ? registry.scriptsDir : rt.coreScripts
      hooks = [...hooks, { script: GUARD_SCRIPT, file: path.join(coreDir, GUARD_SCRIPT) }]
    }
    for (const h of hooks) {
      const guard = GUARD_SCRIPTS.has(h.script)
      if (h.async && !guard) {
        result.ran.push({ script: h.script, file: h.file, tool: unit.payload.tool_name || '' })
        if (!runDetached(h, unit.payload, unit.projectDir, hostName)) {
          result.stderr += `dispatch: ${h.file} not found. Fix: reinstall the kit so its hook scripts are present and runnable.\n`
        }
        continue
      }
      const r = runScript(h, unit.payload, unit.projectDir, hostName)
      result.ran.push({ script: h.script, file: h.file, tool: unit.payload.tool_name || '' })
      if (r.missing || r.failure) {
        const why = r.missing ? 'not found' : `could not run (${r.failure})`
        result.stderr += `dispatch: ${h.file} ${why}. Fix: reinstall the kit so its hook scripts are present and runnable.\n`
        if (guard) result.code = 2
        continue
      }
      result.stdout += r.stdout
      if (r.status === 2 || (guard && r.status !== 0)) {
        result.code = 2
        result.stderr += r.stderr
        if (r.status !== 2) result.stderr += `dispatch: ${h.script} exited ${r.status}. A guard that fails blocks the call.\n`
      }
      else if (r.status !== 0) {
        result.stderr += `dispatch: ${h.script} exited ${r.status} and was skipped; only a guard blocks the call.\n`
      }
    }
    if (result.code === 2) break
  }
  return result
}

function main(argv) {
  const args = argv.slice(2)
  const opts = {}
  const rest = []
  for (let i = 0; i < args.length; i++) {
    if (['--hook', '--host', '--registry'].includes(args[i])) opts[args[i].slice(2)] = args[++i]
    else rest.push(args[i])
  }
  const raw = fs.readFileSync(0, 'utf8')
  const payload = raw.trim() ? JSON.parse(raw) : {}
  const event = rest[0] || payload.hook_event_name
  if (!event) {
    process.stderr.write('dispatch: no event. Fix: pass the event name as the first argument.\n')
    return 1
  }
  const res = dispatch({ event, payload, host: opts.host || process.env.SDD_HOST, hook: opts.hook, registry: opts.registry })
  process.stdout.write(res.stdout)
  process.stderr.write(res.stderr)
  return res.code
}

const invokedPath = () => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null
  } catch {
    return null
  }
}

// Importing this module (registrations.mjs does) never runs main, whatever argv holds.
if (import.meta.url === invokedPath()) {
  process.exitCode = main(process.argv)
}
