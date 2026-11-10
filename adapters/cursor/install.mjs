// Cursor file-copy installer, run by `install.sh --host cursor`.
//
// Usage: node install.mjs (--project | --user) [--stack=a,b|none] [--with=x,y] [--prune] [--dry-run] [--yes] [--uninstall]
//
// Writes skills to <config>/skills, agents to <config>/agents/*.md, rules to <config>/rules/*.mdc and the
// runtime root to <config>/sdd-kit, merges hooks.json and mcp.json, and records everything in
// <config>/sdd-kit/installed.json so a later --uninstall removes only what the kit wrote (AC-27, AC-52).
// <config> is <project>/.cursor, or ~/.cursor with --user. Skills, agents and rules of the same name that the
// kit did not install are skipped (replaced after a backup with --prune), and nothing is written through a symlink.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  REPO, UsageError, read, readJson, posix, listDirs, shellQuote, walk, recordPath, checkRoots, resolveRecorded, checkWritable,
  checkTargets, applyFiles, kitTargets, claimSkills, claimFiles, discoverAddons, selectAddons, readInstalled, removeEmptyDirs,
  cleanupStop, backupTo, backupStamp, modifiedSince, createAgentsMd, runInstaller,
} from '../shared/install.mjs'
import { buildCursor, hooksJson, RUNTIME_PREFIX } from './build.mjs'

const CORE_PACKAGE = 'sdd-kit'
const PROJECT_VAR = 'CURSOR_PROJECT_DIR'
const MCP_OWN = ['sdd-kit', 'playwright']

/** Target locations for the mode: skills, agents and rules sit directly in the Cursor config directory. */
function locations(mode, cwd) {
  const base = mode === 'user' ? os.homedir() : path.resolve(cwd)
  const config = path.join(base, '.cursor')
  return {
    base,
    config,
    skills: path.join(config, 'skills'),
    runtime: path.join(config, 'sdd-kit'),
    extraRoots: [path.join(config, 'rules')],
    outsidePrefix: 'cursor-home:',
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * Reads a JSON file the install merges into and checks its shape.
 * @param {string} file path
 * @param {string} key top-level key that must hold an object when present (`hooks` or `mcpServers`)
 * @param {string} retry what the Fix hint tells the user to do afterwards
 * @returns {object|null} parsed content, or null when the file does not exist
 * @throws {Error} with a Fix hint when the file is not a regular file, not JSON or not that shape
 */
function readMerged(file, key, retry) {
  checkWritable(file, [path.dirname(file)], retry)
  if (!fs.existsSync(file)) return null
  let json
  try { json = readJson(file) } catch (err) {
    throw new Error(`${posix(file)} is not valid JSON (${err.message}). Fix: repair or move the file and ${retry}.`)
  }
  const ok = isObject(json) && (json[key] === undefined || isObject(json[key]))
  const groupsOk = key !== 'hooks' || !json.hooks || Object.values(json.hooks).every((list) => Array.isArray(list) && list.every(isObject))
  if (!ok || !groupsOk) {
    const shape = key === 'hooks' ? '{"version": 1, "hooks": {"<event>": [{"command": "..."}]}}' : '{"mcpServers": {"<name>": {...}}}'
    throw new Error(`${posix(file)} does not hold the expected object (${shape}). Fix: repair or move the file and ${retry}.`)
  }
  return json
}

/** Adds `entries` ({event, entry}) to a hooks.json object next to what is there. */
function addHooks(json, entries) {
  json.hooks ||= {}
  for (const { event, entry } of entries) {
    const list = (json.hooks[event] ||= [])
    if (!list.some((e) => same(e, entry))) list.push(entry)
  }
}

/** Removes exactly the recorded entries (compared by value) and the events that become empty. */
function removeHooks(json, entries) {
  for (const { event, entry } of entries) {
    const list = json.hooks?.[event]
    if (!list) continue
    json.hooks[event] = list.filter((e) => !same(e, entry))
    if (!json.hooks[event].length) delete json.hooks[event]
  }
}

/** Removes the recorded MCP servers whose definition is still the one the kit wrote. */
function removeServers(json, servers) {
  for (const [name, def] of Object.entries(servers || {})) {
    if (json.mcpServers && same(json.mcpServers[name], def)) delete json.mcpServers[name]
  }
}

/**
 * Hook entries of a built hooks.json with the runtime root made concrete: `$CURSOR_PROJECT_DIR/.cursor/sdd-kit`
 * for a project install, so the config moves with the repository, and the single-quoted absolute path for --user.
 */
function hookEntries(built, loc, mode) {
  const rewrite = (command) => command.replace(new RegExp(`node ${RUNTIME_PREFIX.replace('.', '\\.')}(/\\S+)`), (_, rest) => (
    mode === 'user' ? `node ${shellQuote(`${posix(loc.runtime)}${rest}`)}` : `node "$${PROJECT_VAR}/.cursor/sdd-kit${rest}"`
  ))
  const entries = []
  for (const [event, list] of Object.entries(built.hooks)) {
    for (const entry of list) entries.push({ event, entry: { ...entry, command: rewrite(entry.command) } })
  }
  return entries
}

/**
 * Whether a Claude settings file has a hook command that runs a kit hook script.
 * @param {string} file path of the settings.json
 * @param {string} repo kit root holding src/workflows/lib/stacks.json
 * @returns {boolean}
 */
function wiresKitHooks(file, repo) {
  let hooks
  let registry
  try {
    hooks = readJson(file).hooks
    registry = readJson(path.join(repo, 'src/workflows/lib/stacks.json')).hooks
  } catch { return false }
  const scripts = new Set((registry.core || []).map((h) => h.script))
  for (const addon of Object.values(registry.addons || {})) (addon.hooks || []).forEach((h) => scripts.add(h.script))
  const commands = Object.values(hooks || {}).flat().flatMap((group) => (group?.hooks || []).map((h) => String(h?.command || '')))
  return commands.some((c) => [...scripts].some((name) => c.includes(name)))
}

/**
 * Cases where Cursor would load the kit's skills twice (AC-28): a Claude file-copy install in the project or the
 * home directory, Claude Code plugin mode, kit hook scripts wired in the project's `.claude/settings.json`, or kit
 * skills already sitting in `.agents/skills`.
 * @param {{ base: string }} loc install locations
 * @param {string[]} kitSkills names of the skills this install writes
 * @param {string} home home directory
 * @param {string} repo kit root holding src/workflows/lib/stacks.json
 * @returns {string[]} warning lines
 */
export function doubleLoadWarnings(loc, kitSkills, home = os.homedir(), repo = REPO) {
  const warnings = []
  const fix = 'Fix: turn off Settings > Agents > Third-Party Imports in Cursor, or remove the duplicate'
  const claudeCopy = (dir) => fs.existsSync(path.join(dir, '.claude/.framework-manifest')) || fs.existsSync(path.join(dir, '.claude/skills/sdd/SKILL.md'))
  if (claudeCopy(loc.base)) {
    warnings.push(`Warning: ${posix(path.join(loc.base, '.claude'))} holds a Claude Code install of the kit, and Cursor imports .claude/skills, so every skill would load twice. ${fix} (${posix(path.join(loc.base, '.claude/skills'))}).`)
  }
  if (loc.base !== home && claudeCopy(home)) {
    warnings.push(`Warning: ${posix(path.join(home, '.claude'))} holds a Claude Code install of the kit, and Cursor imports ~/.claude/skills, so every skill would load twice. ${fix} (${posix(path.join(home, '.claude/skills'))}).`)
  }
  const settings = path.join(loc.base, '.claude/settings.json')
  if (!claudeCopy(loc.base) && fs.existsSync(settings) && wiresKitHooks(settings, repo)) {
    warnings.push(`Warning: ${posix(settings)} runs SDD Kit hook scripts, and Cursor imports Claude hooks, so every hook would run twice. ${fix} (the kit hooks in ${posix(settings)}).`)
  }
  const registry = path.join(home, '.claude/plugins/installed_plugins.json')
  if (fs.existsSync(registry)) {
    let plugins = {}
    try { plugins = readJson(registry).plugins || {} } catch { plugins = {} }
    const kit = Object.keys(plugins).filter((k) => /^sdd-kit(-[\w-]+)?@/.test(k))
    if (kit.length) {
      warnings.push(`Warning: Claude Code has the SDD Kit plugin installed (${kit.join(', ')} in ${posix(registry)}), and Cursor imports Claude plugins, so every skill would load twice. ${fix} plugin with \`claude plugin uninstall\`.`)
    }
  }
  const agentsSkills = path.join(loc.base, '.agents/skills')
  const dup = listDirs(agentsSkills).filter((n) => kitSkills.includes(n) && fs.existsSync(path.join(agentsSkills, n, 'SKILL.md')))
  if (dup.length) {
    warnings.push(`Warning: ${posix(agentsSkills)} holds kit skills (${dup.slice(0, 5).join(', ')}${dup.length > 5 ? ', ...' : ''}), and Cursor reads .agents/skills as well as .cursor/skills, so they would load twice. ${fix} (${posix(agentsSkills)}).`)
  }
  return warnings
}

/** Maps every file the install writes to its source path. */
function plan({ repo, opts, loc, addons, built, prev, log }) {
  const files = new Map()
  const put = (abs, source) => files.set(abs, { source })
  const pkgName = (a) => readJson(path.join(repo, 'src/plugins', a, '.claude-plugin/plugin.json')).name
  const pkgs = [CORE_PACKAGE, ...addons.map(pkgName)].map((n) => path.join(built, 'hosts/cursor', n))

  const skills = new Map()
  for (const dir of pkgs) for (const name of listDirs(path.join(dir, 'skills'))) skills.set(name, path.join(dir, 'skills', name))
  const backups = posix(path.join(loc.runtime, 'backups'))
  const { take, skipped, replaced } = claimSkills(skills, loc, prev, opts.prune)
  for (const [name, src] of take) for (const r of walk(src)) put(path.join(loc.skills, name, r), path.join(src, r))
  if (skipped.length) {
    log(`Warning: these directories in ${posix(loc.skills)} share a name with kit skills but were not installed by the kit. Skipped: ${skipped.join(', ')}. Re-run with --prune to replace them (the old copies go to ${backups}).`)
  }

  const single = []
  for (const dir of pkgs) {
    for (const kind of ['agents', 'rules']) {
      for (const f of walk(path.join(dir, kind))) {
        const target = path.join(loc.config, kind, f)
        put(target, path.join(dir, kind, f))
        single.push(target)
      }
    }
  }
  const unmanaged = claimFiles(files, single, loc, prev, opts.prune)
  if (unmanaged.skipped.length) {
    log(`Warning: these agent and rule files share a name with kit files but were not installed by the kit. Skipped: ${unmanaged.skipped.join(', ')}. Re-run with --prune to replace them (the old copies go to ${backups}).`)
  }

  const runtimeSrc = path.join(built, 'hosts/cursor', CORE_PACKAGE, 'runtime')
  const excluded = new Set()
  const excludedAddons = new Set()
  for (const a of discoverAddons(repo).all.filter((x) => !addons.includes(x))) {
    excludedAddons.add(a)
    walk(path.join(repo, 'src/plugins', a, 'agents')).forEach((f) => excluded.add(`agents/${f}`))
    walk(path.join(repo, 'src/plugins', a, 'rules')).forEach((f) => excluded.add(`rules/${f}`))
  }
  for (const r of walk(runtimeSrc)) {
    if (excluded.has(r)) continue
    const m = /^addons\/([^/]+)\//.exec(r)
    if (m && excludedAddons.has(m[1])) continue
    put(path.join(loc.runtime, r), path.join(runtimeSrc, r))
  }
  return { files, replaced, skipped, replacedFiles: unmanaged.replaced, skillNames: [...skills.keys()] }
}

/**
 * Removes everything the kit recorded in installed.json (AC-52). Every entry is checked to sit under the
 * kit's own directories before anything is deleted; a file edited since the install is backed up first.
 * @param {{ base: string, runtime: string, config?: string, skills?: string, extraRoots?: string[] }} loc install locations
 * @returns {string[]} log lines
 */
export function uninstall({ base, runtime, config = path.dirname(runtime), skills = path.join(config, 'skills'), extraRoots = [path.join(config, 'rules')], outsidePrefix = 'cursor-home:' }) {
  const loc = { base, runtime, config, skills, extraRoots, outsidePrefix }
  const installed = readInstalled(runtime)
  if (!installed) throw new UsageError(`Nothing to uninstall: ${posix(path.join(runtime, 'installed.json'))} not found.`)
  checkRoots(loc)
  const targets = kitTargets(loc, installed, installed.files)
  const mergedFiles = [path.join(config, 'mcp.json'), path.join(config, 'hooks.json')]
  const retry = 'run the uninstall again; nothing was removed'
  const merged = (installed.merged || []).map((m) => {
    const abs = resolveRecorded(loc, m.path, [config])
    if (!mergedFiles.includes(abs)) throw new Error(`installed.json lists '${m.path}' as a merged file. Fix: only hooks.json and mcp.json in ${posix(config)} are merged; delete ${posix(path.join(runtime, 'installed.json'))} if it was edited by hand.`)
    const json = readMerged(abs, m.kind === 'hooks' ? 'hooks' : 'mcpServers', retry)
    return json ? { ...m, abs, json } : { ...m, abs, missing: true }
  })
  const stamp = backupStamp()
  const dirs = new Set()
  const notFiles = []
  let backedUp = 0
  for (const { rec, abs } of targets) {
    let entry = null
    try { entry = fs.lstatSync(abs) } catch { continue }
    if (!entry.isFile()) { notFiles.push(rec); continue }
    if (modifiedSince(installed, rec, abs)) { backupTo(runtime, stamp, abs, rec); backedUp += 1 }
    fs.rmSync(abs)
    dirs.add(path.dirname(abs))
  }
  for (const m of merged) {
    if (m.missing) continue
    const json = m.json
    if (m.kind === 'hooks') {
      removeHooks(json, m.entries || [])
      if (!Object.keys(json.hooks || {}).length) delete json.hooks
    } else {
      removeServers(json, m.servers)
      if (json.mcpServers && !Object.keys(json.mcpServers).length) delete json.mcpServers
    }
    const onlyOurs = Object.keys(json).every((k) => k === 'version')
    if (m.created && onlyOurs) fs.rmSync(m.abs)
    else fs.writeFileSync(m.abs, `${JSON.stringify(json, null, 2)}\n`)
    dirs.add(path.dirname(m.abs))
  }
  fs.rmSync(path.join(runtime, 'installed.json'))
  dirs.add(runtime)
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) removeEmptyDirs(d, cleanupStop(loc, d))
  const out = [`Removed ${installed.files.length} files and the SDD Kit entries in hooks.json and mcp.json. AGENTS.md and files the kit did not write were left in place.`]
  if (backedUp) out.push(`${backedUp} files edited since the install were copied to ${posix(path.join(runtime, 'backups', stamp))} first.`)
  if (notFiles.length) out.push(`Left in place because they are no longer regular files (a symlink or a directory): ${notFiles.join(', ')}. Remove them by hand if they are yours to remove.`)
  return out
}

/**
 * Installs or updates the kit.
 * @param {{ opts: object, cwd: string, repo?: string, log?: (line: string) => void }} args
 * @returns {{ written: number, removed: number, skipped: string[], addons: string[], warnings: string[] }}
 */
export function install({ opts, cwd, repo = REPO, log = () => {} }) {
  const loc = locations(opts.mode, cwd)
  const found = discoverAddons(repo)
  const prev = readInstalled(loc.runtime)
  const addons = selectAddons(opts, found, prev)
  const stamp = backupStamp()

  const built = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-kit-cursor-'))
  try {
    buildCursor({ outDir: built, repo, runtimeRoot: posix(loc.runtime) })
    const { files, replaced, skipped, replacedFiles, skillNames } = plan({ repo, opts, loc, addons, built, prev, log })
    const rel = (abs) => recordPath(loc, abs)
    const abs = (rec) => resolveRecorded(loc, rec)
    checkRoots(loc)
    const newRels = new Set([...files.keys()].map(rel))
    newRels.forEach(abs)
    const stale = (prev?.files || []).filter((f) => !newRels.has(f) && f !== rel(path.join(loc.runtime, 'installed.json')))
    const keep = opts.prune ? [] : stale
    const toRemove = opts.prune ? stale : []
    const staleTargets = kitTargets(loc, prev || {}, toRemove)
    checkTargets(files, loc, { replacedSkills: replaced, replacedFiles })
    const hooksFile = path.join(loc.config, 'hooks.json')
    const mcpFile = path.join(loc.config, 'mcp.json')
    const retry = 'run the installer again; nothing was written'
    const existingHooks = readMerged(hooksFile, 'hooks', retry)
    const existingMcp = readMerged(mcpFile, 'mcpServers', retry)
    const prevMcp = (prev?.merged || []).find((m) => m.kind === 'mcp')
    if (existingMcp?.mcpServers && existingMcp.mcpServers['sdd-kit'] && !prevMcp?.servers?.['sdd-kit']) {
      throw new Error(`${posix(mcpFile)} already defines the sdd-kit server outside the kit. Fix: rename or remove that entry and run the installer again.`)
    }
    const warnings = doubleLoadWarnings(loc, skillNames, os.homedir(), repo)

    if (opts.dryRun) {
      const added = [...newRels].filter((f) => !fs.existsSync(abs(f)))
      const unmanaged = replaced.length + replacedFiles.length
      log(`Dry run: ${added.length} files would be added, ${newRels.size - added.length} updated, ${toRemove.length} removed${unmanaged ? `, ${unmanaged} unmanaged skill directories, agents or rules replaced` : ''}. Nothing written.`)
      warnings.forEach(log)
      return { written: 0, removed: 0, skipped, addons, warnings }
    }

    const { hashes, backedUp } = applyFiles({ loc, prev, stamp, files, keep, replacedSkills: replaced, replacedFiles, staleTargets })

    const merged = []
    fs.mkdirSync(loc.config, { recursive: true })

    const prevHooks = (prev?.merged || []).find((m) => m.kind === 'hooks')
    const hooks = existingHooks || { version: 1, hooks: {} }
    hooks.version ??= 1
    if (prevHooks) removeHooks(hooks, prevHooks.entries)
    const entries = hookEntries(hooksJson(addons, repo), loc, opts.mode)
    addHooks(hooks, entries)
    fs.writeFileSync(hooksFile, `${JSON.stringify(hooks, null, 2)}\n`)
    merged.push({ kind: 'hooks', path: rel(hooksFile), created: prevHooks ? prevHooks.created : !existingHooks, entries })

    const builtMcp = readJson(path.join(built, 'hosts/cursor', CORE_PACKAGE, 'mcp.json')).mcpServers
    const mcp = existingMcp || {}
    mcp.mcpServers ||= {}
    if (prevMcp) removeServers(mcp, prevMcp.servers)
    const servers = {
      'sdd-kit': { command: 'node', args: [posix(path.join(loc.runtime, 'bridge/server.mjs')), '--host', 'cursor'] },
    }
    if (!mcp.mcpServers.playwright) servers.playwright = builtMcp.playwright
    else warnings.push(`Warning: ${posix(mcpFile)} already defines a playwright server (${JSON.stringify(mcp.mcpServers.playwright)}), so the kit kept it. The kit pins ${JSON.stringify(builtMcp.playwright)} (see .mcp.json); copy that pin over your entry if you want the tested version.`)
    for (const name of MCP_OWN) if (servers[name]) mcp.mcpServers[name] = servers[name]
    fs.writeFileSync(mcpFile, `${JSON.stringify(mcp, null, 2)}\n`)
    merged.push({ kind: 'mcp', path: rel(mcpFile), created: prevMcp ? prevMcp.created : !existingMcp, servers })

    const agentsMd = opts.mode === 'project' && createAgentsMd(repo, loc.base)

    const version = read(path.join(repo, 'VERSION')).trim()
    const all = [...newRels, ...keep].sort()
    fs.writeFileSync(path.join(loc.runtime, 'installed.json'), `${JSON.stringify({ host: 'cursor', version, mode: opts.mode, addons, skillsDir: posix(loc.skills), files: all, hashes, merged }, null, 2)}\n`)
    log(`Installed SDD Kit v${version} for Cursor into ${posix(loc.base)} (add-ons: ${addons.join(', ') || 'none'}).`)
    if (agentsMd) log('Created AGENTS.md from the template; fill in the project sections.')
    if (backedUp) log(`${backedUp} edited, replaced or pruned files were copied to ${posix(path.join(loc.runtime, 'backups', stamp))} first.`)
    log(opts.mode === 'user'
      ? `Hook and MCP commands use the absolute path ${posix(loc.runtime)}; if you move the home directory, re-run the installer.`
      : `Hook commands use $${PROJECT_VAR}; the MCP bridge uses the absolute path ${posix(loc.runtime)}, so if you move the project, re-run the installer.`)
    warnings.forEach(log)
    return { written: files.size, removed: toRemove.length, skipped, addons, warnings }
  } finally {
    fs.rmSync(built, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = await runInstaller(process.argv.slice(2), { label: 'Cursor', locations, install, uninstall })
}
