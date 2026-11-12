// Codex file-copy installer, run by `install.sh --host codex`.
//
// Usage: node install.mjs (--project | --user) [--stack=a,b|none] [--with=x,y|none] [--prune] [--dry-run] [--yes] [--uninstall]
//
// Writes skills to <base>/.agents/skills, agents to <config>/agents/*.toml and the runtime root to
// <config>/sdd-kit, merges hooks.json and a marker block in config.toml, and records everything in
// <config>/sdd-kit/installed.json so a later --uninstall removes only what the kit wrote (AC-25, AC-26, AC-52).
// <base> is the project directory, or the home directory with --user; <config> is <base>/.codex, or
// $CODEX_HOME (default ~/.codex) with --user.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCodex, hooksJson } from './build.mjs'
import { parseFrontmatter, mapTokens } from '../shared/tokens.mjs'
import {
  REPO, UsageError, read, readJson, posix, listDirs, shellQuote, walk, recordPath, checkRoots, resolveRecorded, checkWritable,
  checkTargets, applyFiles, kitTargets, claimSkills, claimFiles, discoverAddons, selectAddons, readInstalled, removeEmptyDirs,
  cleanupStop, backupTo, backupStamp, modifiedSince, createAgentsMd, runInstaller,
} from '../shared/install.mjs'

const BLOCK_START = '# >>> sdd-kit >>>'
const BLOCK_END = '# <<< sdd-kit <<<'
const CORE_PACKAGE = 'sdd-kit'

/** Target locations for the mode. */
function locations(mode, cwd) {
  const base = mode === 'user' ? os.homedir() : path.resolve(cwd)
  const config = mode === 'user' ? (process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(base, '.codex')) : path.join(base, '.codex')
  return { base, config, skills: path.join(base, '.agents', 'skills'), runtime: path.join(config, 'sdd-kit'), outsidePrefix: 'codex-home:' }
}

/** A TOML multi-line basic string for free text. */
const tomlText = (text) => `"""\n${text.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""`

/** `<name>.toml` contents for an agent source file (AC-25, D-36): name, description and developer_instructions only. */
function agentToml(text, tokens, fallbackName) {
  const { meta, body } = parseFrontmatter(text)
  return `name = ${JSON.stringify(meta.name || fallbackName)}\ndescription = ${JSON.stringify(mapTokens(meta.description || '', tokens))}\ndeveloper_instructions = ${tomlText(mapTokens(body.trim(), tokens))}\n`
}

/** The `# >>> sdd-kit >>>` block registering the bridge and Playwright. */
function configBlock(runtime, playwrightArgs, existing) {
  const lines = [BLOCK_START, '[mcp_servers.sdd-kit]', 'command = "node"', `args = [${JSON.stringify(posix(path.join(runtime, 'bridge/server.mjs')))}]`]
  if (!/^\[mcp_servers\.playwright\]/m.test(existing)) {
    lines.push('', '[mcp_servers.playwright]', 'command = "npx"', `args = [${playwrightArgs.map((a) => JSON.stringify(a)).join(', ')}]`)
  }
  lines.push(BLOCK_END)
  return lines.join('\n')
}

const blockRe = new RegExp(`\\n?${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`)

/** Adds or replaces the marker block. @returns {string} new file text */
function setBlock(text, block) {
  if (blockRe.test(text)) return text.replace(blockRe, (m) => `${m.startsWith('\n') ? '\n' : ''}${block}\n`)
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${block}\n`
}

/** Removes the marker block. @returns {string} remaining text */
const removeBlock = (text) => text.replace(blockRe, '\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')

/** Adds `entries` ({event, matcher?, handler}) to a hooks.json object next to what is there. */
function addHooks(json, entries) {
  json.hooks ||= {}
  for (const { event, matcher, handler } of entries) {
    const groups = (json.hooks[event] ||= [])
    let group = groups.find((g) => (g.matcher || '') === (matcher || ''))
    if (!group) {
      group = { ...(matcher ? { matcher } : {}), hooks: [] }
      groups.push(group)
    }
    group.hooks ||= []
    if (!group.hooks.some((h) => JSON.stringify(h) === JSON.stringify(handler))) group.hooks.push(handler)
  }
}

/** Removes exactly the recorded entries (compared by value) and empties that become empty. */
function removeHooks(json, entries) {
  for (const { event, matcher, handler } of entries) {
    const groups = json.hooks?.[event]
    if (!groups) continue
    for (const g of groups) {
      if ((g.matcher || '') === (matcher || '') && Array.isArray(g.hooks)) g.hooks = g.hooks.filter((h) => JSON.stringify(h) !== JSON.stringify(handler))
    }
    json.hooks[event] = groups.filter((g) => !Array.isArray(g.hooks) || g.hooks.length)
    if (!json.hooks[event].length) delete json.hooks[event]
  }
}

/**
 * Kit hook entries from a built hooks.json, with the runtime root made absolute. The path is single-quoted
 * as one shell word, so `$`, backticks, quotes and backslashes in a directory name stay literal.
 */
function hookEntries(builtHooks, runtime) {
  const entries = []
  const root = posix(runtime)
  const absolute = (command) => command
    .replace(/"\$\{PLUGIN_ROOT\}\/runtime([^"]*)"/g, (_, rest) => shellQuote(`${root}${rest}`))
    .split('${PLUGIN_ROOT}/runtime').join(shellQuote(root))
  for (const [event, groups] of Object.entries(builtHooks.hooks)) {
    for (const g of groups) {
      for (const h of g.hooks) {
        entries.push({ event, ...(g.matcher ? { matcher: g.matcher } : {}), handler: { ...h, command: absolute(h.command) } })
      }
    }
  }
  return entries
}

/**
 * Removes everything the kit recorded in installed.json (AC-52). Every entry is checked to sit under the
 * kit's own directories before anything is deleted; a file edited since the install is backed up first.
 * @param {{ base: string, runtime: string, config?: string, skills?: string }} loc install locations
 * @returns {string[]} log lines
 */
export function uninstall({ base, runtime, config = path.dirname(runtime), skills = path.join(base, '.agents', 'skills'), outsidePrefix = 'codex-home:' }) {
  const loc = { base, runtime, config, skills, outsidePrefix }
  const installed = readInstalled(runtime)
  if (!installed) throw new UsageError(`Nothing to uninstall: ${posix(path.join(runtime, 'installed.json'))} not found.`)
  checkRoots(loc)
  const targets = kitTargets(loc, installed, installed.files)
  const mergedRoots = [path.join(config, 'config.toml'), path.join(config, 'hooks.json')]
  const retry = 'run the uninstall again; nothing was removed'
  // Both merged files are read and checked before the first file is deleted, so a bad one stops a clean uninstall.
  const merged = (installed.merged || []).map((m) => {
    const abs = resolveRecorded(loc, m.path, [config])
    if (!mergedRoots.includes(abs)) throw new Error(`installed.json lists '${m.path}' as a merged file. Fix: only config.toml and hooks.json in ${posix(config)} are merged; delete ${posix(path.join(runtime, 'installed.json'))} if it was edited by hand.`)
    checkWritable(abs, [config], retry)
    if (!fs.existsSync(abs)) return { ...m, abs, missing: true }
    if (m.kind === 'config-block') {
      const text = read(abs)
      checkConfigMarkers(abs, text, retry)
      return { ...m, abs, text }
    }
    if (m.kind === 'hooks') return { ...m, abs, json: readHooksFile(abs, retry) }
    return { ...m, abs }
  })
  const stamp = backupStamp()
  const out = []
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
    const file = m.abs
    if (m.missing) continue
    if (m.kind === 'config-block') {
      const rest = removeBlock(m.text)
      if (m.created && !rest.trim()) fs.rmSync(file)
      else fs.writeFileSync(file, rest.endsWith('\n') || !rest ? rest : `${rest}\n`)
    } else if (m.kind === 'hooks') {
      const json = m.json || { hooks: {} }
      removeHooks(json, m.entries || [])
      const empty = !Object.keys(json.hooks || {}).length
      if (m.created && empty && Object.keys(json).every((k) => k === 'hooks' || k === 'description')) fs.rmSync(file)
      else fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
    }
    dirs.add(path.dirname(file))
  }
  fs.rmSync(path.join(runtime, 'installed.json'))
  dirs.add(runtime)
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) removeEmptyDirs(d, cleanupStop(loc, d))
  out.push(`Removed ${installed.files.length} files and the SDD Kit entries in hooks.json and config.toml. AGENTS.md and files the kit did not write were left in place.`)
  if (backedUp) out.push(`${backedUp} files edited since the install were copied to ${posix(path.join(runtime, 'backups', stamp))} first.`)
  if (notFiles.length) out.push(`Left in place because they are no longer regular files (a symlink or a directory): ${notFiles.join(', ')}. Remove them by hand if they are yours to remove.`)
  return out
}

/** Maps every file the install writes to its source path or generated text. */
function plan({ repo, opts, loc, addons, built, prev, log }) {
  const files = new Map()
  const put = (abs, source) => files.set(abs, { source })
  const putText = (abs, text) => files.set(abs, { text })
  const hostTokens = readJson(path.join(repo, 'src/adapters/hosts.json')).hosts.codex.tokens
  const pkgName = (a) => readJson(path.join(repo, 'src/plugins', a, '.claude-plugin/plugin.json')).name

  const skillSets = [[CORE_PACKAGE, null], ...addons.map((a) => [pkgName(a), a])]
  const skills = new Map()
  for (const [pkg] of skillSets) {
    const dir = path.join(built, 'hosts/codex', pkg, 'skills')
    for (const name of listDirs(dir)) skills.set(name, path.join(dir, name))
  }

  const { take, skipped, replaced } = claimSkills(skills, loc, prev, opts.prune)
  for (const [name, src] of take) for (const r of walk(src)) put(path.join(loc.skills, name, r), path.join(src, r))
  if (skipped.length) {
    log(`Warning: these directories in ${posix(loc.skills)} share a name with kit skills but were not installed by the kit (for example by Codex /import). Skipped: ${skipped.join(', ')}. Re-run with --prune to replace them (the old copies go to ${posix(path.join(loc.runtime, 'backups'))}).`)
  }

  const agentTargets = []
  const agentSources = [path.join(repo, 'src/agents'), ...addons.map((a) => path.join(repo, 'src/plugins', a, 'agents'))]
  for (const dir of agentSources) {
    for (const f of walk(dir).filter((r) => r.endsWith('.md') && !r.includes('/'))) {
      const target = path.join(loc.config, 'agents', `${f.slice(0, -3)}.toml`)
      putText(target, agentToml(read(path.join(dir, f)), hostTokens, f.slice(0, -3)))
      agentTargets.push(target)
    }
  }
  const unmanaged = claimFiles(files, agentTargets, loc, prev, opts.prune)
  if (unmanaged.skipped.length) {
    log(`Warning: these agent files share a name with kit agents but were not installed by the kit. Skipped: ${unmanaged.skipped.join(', ')}. Re-run with --prune to replace them (the old copies go to ${posix(path.join(loc.runtime, 'backups'))}).`)
  }

  const runtimeSrc = path.join(built, 'hosts/codex', CORE_PACKAGE, 'runtime')
  const excludedAgentsAndRules = new Set()
  const excludedAddons = new Set()
  for (const a of discoverAddons(repo).all.filter((x) => !addons.includes(x))) {
    excludedAddons.add(a)
    walk(path.join(repo, 'src/plugins', a, 'agents')).forEach((f) => excludedAgentsAndRules.add(`agents/${f}`))
    walk(path.join(repo, 'src/plugins', a, 'rules')).forEach((f) => excludedAgentsAndRules.add(`rules/${f}`))
  }
  for (const r of walk(runtimeSrc)) {
    if (excludedAgentsAndRules.has(r)) continue
    const m = /^addons\/([^/]+)\//.exec(r)
    if (m && excludedAddons.has(m[1])) continue
    put(path.join(loc.runtime, r), path.join(runtimeSrc, r))
  }
  return { files, replaced, skipped, replacedFiles: unmanaged.replaced }
}

/**
 * Checks the files the install merges into before anything is written, so a bad file aborts cleanly.
 * @param {string} configFile path of config.toml
 * @param {string} hooksFile path of hooks.json
 * @param {string} config the config directory both files must resolve inside
 * @returns {{ configText: string, configExisted: boolean, hooks: object|null }} parsed existing content
 * @throws {Error} with a Fix hint when either file is not a regular file, hooks.json is not a hooks object or config.toml has unbalanced kit markers
 */
function readMergeTargets(configFile, hooksFile, config) {
  const retry = 'run the installer again; nothing was written'
  checkWritable(configFile, [config], retry)
  checkWritable(hooksFile, [config], retry)
  const configExisted = fs.existsSync(configFile)
  const configText = configExisted ? read(configFile) : ''
  const starts = checkConfigMarkers(configFile, configText, retry)
  if (!starts && /^\[mcp_servers\.sdd-kit\]/m.test(configText)) {
    throw new Error(`${posix(configFile)} already defines [mcp_servers.sdd-kit] outside the kit block. Fix: rename or remove that table and run the installer again.`)
  }
  const hooks = fs.existsSync(hooksFile) ? readHooksFile(hooksFile, retry) : null
  return { configText, configExisted, hooks }
}

/**
 * Checks that config.toml holds at most one complete kit block.
 * @param {string} file path, for the message
 * @param {string} text file text
 * @param {string} retry what the Fix hint tells the user to do afterwards
 * @returns {number} the number of kit blocks (0 or 1)
 * @throws {Error} with a Fix hint when the markers are unbalanced
 */
function checkConfigMarkers(file, text, retry) {
  const starts = text.split(BLOCK_START).length - 1
  const ends = text.split(BLOCK_END).length - 1
  if (starts !== ends || starts > 1) {
    throw new Error(`${posix(file)} has an unbalanced '${BLOCK_START}' block. Fix: remove the stray marker lines (keep your own settings) and ${retry}.`)
  }
  return starts
}

/**
 * Reads a hooks.json and checks its whole shape: `{"hooks": {"<Event>": [{"matcher"?, "hooks"?: [...]}]}}`, where
 * every group is an object and its `hooks`, when present, is an array. The merge and the removal rely on that shape.
 * @param {string} file path of hooks.json
 * @param {string} retry what the Fix hint tells the user to do afterwards
 * @returns {object} the parsed file
 * @throws {Error} with a Fix hint when the file is not JSON or not that shape
 */
function readHooksFile(file, retry) {
  let hooks
  try { hooks = readJson(file) } catch (err) {
    throw new Error(`${posix(file)} is not valid JSON (${err.message}). Fix: repair or move the file and ${retry}.`)
  }
  const object = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
  const groupOk = (g) => object(g) && (g.hooks === undefined || Array.isArray(g.hooks))
  const ok = object(hooks) && (hooks.hooks === undefined || (object(hooks.hooks) && Object.values(hooks.hooks).every((groups) => Array.isArray(groups) && groups.every(groupOk))))
  if (!ok) throw new Error(`${posix(file)} does not hold a hooks object ({"hooks": {"<Event>": [{"matcher": "...", "hooks": [...]}]}}). Fix: repair or move the file and ${retry}.`)
  return hooks
}

/**
 * Installs or updates the kit.
 * @param {{ opts: object, cwd: string, repo?: string, log?: (line: string) => void }} args
 * @returns {{ written: number, removed: number, skipped: string[], addons: string[] }}
 */
export function install({ opts, cwd, repo = REPO, log = () => {} }) {
  const loc = locations(opts.mode, cwd)
  const found = discoverAddons(repo)
  const prev = readInstalled(loc.runtime)
  const addons = selectAddons(opts, found, prev, { repo, cwd, log })
  const stamp = backupStamp()

  const built = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-kit-codex-'))
  try {
    buildCodex({ outDir: built, repo, runtimeRoot: posix(loc.runtime) })
    const { files, replaced, skipped, replacedFiles } = plan({ repo, opts, loc, addons, built, prev, log })
    const rel = (abs) => recordPath(loc, abs)
    const abs = (rec) => resolveRecorded(loc, rec)
    checkRoots(loc)
    const newRels = new Set([...files.keys()].map(rel))
    newRels.forEach(abs)
    const stale = (prev?.files || []).filter((f) => !newRels.has(f) && f !== rel(path.join(loc.runtime, 'installed.json')))
    const keep = opts.prune ? [] : stale
    const toRemove = opts.prune ? stale : []
    const staleTargets = kitTargets(loc, prev || {}, toRemove)
    const configFile = path.join(loc.config, 'config.toml')
    const hooksFile = path.join(loc.config, 'hooks.json')
    checkTargets(files, loc, { replacedSkills: replaced, replacedFiles })
    const targets = readMergeTargets(configFile, hooksFile, loc.config)

    if (opts.dryRun) {
      const added = [...newRels].filter((f) => !fs.existsSync(abs(f)))
      const unmanaged = replaced.length + replacedFiles.length
      log(`Dry run: ${added.length} files would be added, ${newRels.size - added.length} updated, ${toRemove.length} removed${unmanaged ? `, ${unmanaged} unmanaged skill directories or agent files replaced` : ''}. Nothing written.`)
      return { written: 0, removed: 0, skipped, addons }
    }

    const { hashes, backedUp } = applyFiles({ loc, prev, stamp, files, keep, replacedSkills: replaced, replacedFiles, staleTargets })

    const merged = []
    const mcp = readJson(path.join(built, 'hosts/codex', CORE_PACKAGE, 'mcp.json'))

    const prevConfig = (prev?.merged || []).find((m) => m.kind === 'config-block')
    const block = configBlock(loc.runtime, mcp.mcpServers.playwright.args, targets.configText.replace(blockRe, ''))
    fs.mkdirSync(loc.config, { recursive: true })
    fs.writeFileSync(configFile, setBlock(targets.configText, block))
    merged.push({ kind: 'config-block', path: rel(configFile), created: prevConfig ? prevConfig.created : !targets.configExisted })

    const prevHooks = (prev?.merged || []).find((m) => m.kind === 'hooks')
    const json = targets.hooks || { description: 'SDD Kit lifecycle hooks', hooks: {} }
    if (prevHooks) removeHooks(json, prevHooks.entries)
    const entries = hookEntries(hooksJson(addons, repo), loc.runtime)
    addHooks(json, entries)
    fs.writeFileSync(hooksFile, `${JSON.stringify(json, null, 2)}\n`)
    merged.push({ kind: 'hooks', path: rel(hooksFile), created: prevHooks ? prevHooks.created : !targets.hooks, entries })

    const agentsMd = opts.mode === 'project' && createAgentsMd(repo, loc.base)

    const installedFile = path.join(loc.runtime, 'installed.json')
    const version = read(path.join(repo, 'VERSION')).trim()
    const all = [...newRels, ...keep].sort()
    fs.writeFileSync(installedFile, `${JSON.stringify({ host: 'codex', version, mode: opts.mode, addons, skillsDir: posix(loc.skills), files: all, hashes, merged }, null, 2)}\n`)
    log(`Installed SDD Kit v${version} for Codex into ${posix(loc.base)} (add-ons: ${addons.join(', ') || 'none'}).`)
    if (agentsMd) log('Created AGENTS.md from the template; fill in the project sections.')
    if (backedUp) log(`${backedUp} edited, replaced or pruned files were copied to ${posix(path.join(loc.runtime, 'backups', stamp))} first.`)
    log(`Hook and MCP commands use the absolute path ${posix(loc.runtime)}; if you move the project, re-run the installer.`)
    return { written: files.size, removed: toRemove.length, skipped, addons }
  } finally {
    fs.rmSync(built, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = await runInstaller(process.argv.slice(2), { label: 'Codex', locations, install, uninstall })
}
