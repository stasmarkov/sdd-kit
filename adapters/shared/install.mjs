// File-copy installer helpers shared by every host adapter: argument parsing, add-on selection, the dist
// layout, recorded paths, symlink containment, unmanaged-file handling and backups. Host-specific layout
// (where skills, agents and the runtime root go, which files are merged) stays in <host>/install.mjs; the
// install locations object (`loc`) carries it into these functions.
//
// loc: { base, config, skills, runtime, extraRoots?, outsidePrefix }
//   base           project directory, or the home directory with --user
//   config         the host's config directory
//   skills         where skill folders go
//   runtime        the kit's runtime root (holds installed.json and backups/)
//   extraRoots     further directories the kit writes single files into (for example a rules directory)
//   outsidePrefix  prefix of a recorded path that sits outside `base` (relative to `config`), such as `codex-home:`
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// <root>/src/adapters/shared in a checkout; <root>/adapters/shared in the dist tree, which keeps the
// plugins under plugins/ and the shared installer inputs under share/ (see install.sh resolve_sources).
export const BASE = path.resolve(HERE, '..', '..')
export const DIST_LAYOUT = fs.existsSync(path.join(BASE, 'plugins/sdd-kit/.claude-plugin/plugin.json')) && fs.existsSync(path.join(BASE, 'share'))
export const REPO = DIST_LAYOUT ? BASE : path.resolve(BASE, '..')
const CORE_PACKAGE = 'sdd-kit'

export class UsageError extends Error {}

export const read = (file) => fs.readFileSync(file, 'utf8')
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')
export const readJson = (file) => JSON.parse(read(file))
export const posix = (p) => p.split(path.sep).join('/')
export const listDirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [])

/** True when `abs` is `root` or sits below it. */
export const within = (root, abs) => abs === root || abs.startsWith(`${root}${path.sep}`)

/** `text` as one POSIX shell word. */
export const shellQuote = (text) => `'${text.replace(/'/g, `'\\''`)}'`

/** The lstat of `p` without following a leaf symlink, or null when nothing is there (a dangling symlink is something). */
export const entryAt = (p) => {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

/** Timestamp used for one run's backup folder. */
export const backupStamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

/**
 * Copies the dist tree into a checkout-shaped directory (src/, scripts/, .mcp.json, ...) so the build reads
 * its inputs the same way in both layouts. Presets are plugins that hold nothing but dependencies.
 * @param {string} dist dist tree root
 * @param {string} dest empty directory to fill
 */
export function stageDist(dist, dest) {
  const copy = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, dereference: true }) }
  const core = path.join(dist, 'plugins', CORE_PACKAGE)
  for (const d of ['skills', 'agents', 'workflows']) copy(path.join(core, d), path.join(dest, 'src', d))
  copy(path.join(core, 'scripts'), path.join(dest, 'scripts'))
  copy(path.join(core, '.mcp.json'), path.join(dest, '.mcp.json'))
  copy(path.join(core, '.claude-plugin'), path.join(dest, '.claude-plugin'))
  copy(path.join(dist, 'VERSION'), path.join(dest, 'VERSION'))
  copy(path.join(dist, 'share', 'templates'), path.join(dest, 'src', 'templates'))
  copy(path.join(dist, 'adapters'), path.join(dest, 'src', 'adapters'))
  for (const dir of listDirs(path.join(dist, 'plugins')).filter((n) => n.startsWith(`${CORE_PACKAGE}-`))) {
    const from = path.join(dist, 'plugins', dir)
    const manifest = readJson(path.join(from, '.claude-plugin/plugin.json'))
    const preset = Array.isArray(manifest.dependencies) && !fs.existsSync(path.join(from, 'stack.json')) && !['skills', 'agents'].some((d) => fs.existsSync(path.join(from, d)))
    copy(from, path.join(dest, 'src', preset ? 'presets' : 'plugins', dir.slice(CORE_PACKAGE.length + 1)))
  }
}

/** Every file below `dir` as paths relative to it, sorted. */
export function walk(dir, rel = '') {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => {
      const r = rel ? `${rel}/${e.name}` : e.name
      return e.isDirectory() ? walk(dir, r) : [r]
    })
}

/**
 * Parses the installer's own arguments.
 * @param {string[]} argv arguments after the script name
 * @returns {{ mode: string, stack: string[]|null, stackGiven: boolean, withList: string[], prune: boolean, dryRun: boolean, yes: boolean, uninstall: boolean }}
 * @throws {UsageError} for an unknown option or a missing value
 */
export function parseArgs(argv) {
  const o = { mode: '', stack: null, stackGiven: false, withList: [], prune: false, dryRun: false, yes: false, uninstall: false }
  const list = (v) => v.split(/[,\s]+/).filter(Boolean)
  for (const a of argv) {
    if (a === '--project') o.mode = 'project'
    else if (a === '--user') o.mode = 'user'
    else if (a.startsWith('--stack=')) { o.stackGiven = true; o.stack = list(a.slice(8)) }
    else if (a.startsWith('--with=')) o.withList = list(a.slice(7))
    else if (a === '--prune') o.prune = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--yes' || a === '-y') o.yes = true
    else if (a === '--uninstall') o.uninstall = true
    else throw new UsageError(`Unknown option: ${a}. Fix: use --project|--user, --stack=, --with=, --prune, --dry-run, --yes or --uninstall.`)
  }
  if (!o.mode) throw new UsageError('No install location. Fix: pass --project or --user.')
  return o
}

/** Recorded form of an absolute path: relative to the base when below it, else `loc.outsidePrefix` plus the path relative to the config directory. */
export function recordPath(loc, abs) {
  if (within(loc.base, abs)) return posix(path.relative(loc.base, abs))
  return `${loc.outsidePrefix}${posix(path.relative(loc.config, abs))}`
}

/** `p` with every symlink resolved; the part that does not exist yet is appended to its nearest existing ancestor. */
export function realOf(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    const up = path.dirname(p)
    return up === p ? p : path.join(realOf(up), path.basename(p))
  }
}

/** The directories the kit writes files into: skills, agents, the runtime root and any extra roots. */
export const kitRoots = (loc) => [loc.skills, path.join(loc.config, 'agents'), loc.runtime, ...(loc.extraRoots || [])]

/**
 * Refuses a project install whose kit directories lead out of the project through a symlink (a cloned repo can
 * ship `.agents`, `.codex` or `.cursor` as one), so nothing is written or removed outside it.
 * @param {object} loc install locations
 * @throws {Error} naming the directory and where it leads
 */
export function checkRoots(loc) {
  if (!within(loc.base, loc.config)) return
  const base = realOf(loc.base)
  for (const root of [loc.config, ...kitRoots(loc)]) {
    const real = realOf(root)
    if (!within(base, real)) {
      throw new Error(`${posix(root)} leads to ${posix(real)}, outside ${posix(loc.base)}, through a symlink. Fix: replace the symlink with a real directory (or remove it) and run the installer again; nothing was written or removed.`)
    }
  }
}

/**
 * Absolute path of a recorded entry, which must sit below the skills, agents or runtime root, also once every
 * symlink in its directory is resolved, so a symlinked folder cannot lead a write or a removal elsewhere.
 * @param {object} loc install locations
 * @param {string} rec recorded path
 * @param {string[]} [roots] directories the entry must sit below
 * @returns {string} absolute path
 * @throws {Error} naming the entry when it resolves anywhere else
 */
export function resolveRecorded(loc, rec, roots = kitRoots(loc)) {
  const abs = rec.startsWith(loc.outsidePrefix) ? path.resolve(loc.config, rec.slice(loc.outsidePrefix.length)) : path.resolve(loc.base, rec)
  const real = path.join(realOf(path.dirname(abs)), path.basename(abs))
  const inside = (r) => within(path.resolve(r), abs) && abs !== path.resolve(r) && within(realOf(r), real) && real !== realOf(r)
  if (!roots.some(inside)) {
    throw new Error(`'${rec}' (from installed.json or a symlink below the kit directories) is outside the directories the kit installs into. Fix: delete ${posix(path.join(loc.runtime, 'installed.json'))} if it was edited by hand, replace any symlinked kit directory with a real one, then remove the kit files manually.`)
  }
  return abs
}

/**
 * Refuses to write through anything but a regular file: a symlink (dangling or not), a directory or a socket at
 * `abs` stops the run before the first write, and so does a fully resolved path that leaves `roots`.
 * @param {string} abs file the installer is about to write or rewrite
 * @param {string[]} roots directories the resolved path must stay below
 * @param {string} retry what the Fix hint tells the user to do afterwards
 * @throws {Error} with a Fix hint naming the file
 */
export function checkWritable(abs, roots, retry) {
  const entry = entryAt(abs)
  if (entry && !entry.isFile()) {
    const kind = entry.isSymbolicLink() ? `a symlink to ${posix(fs.readlinkSync(abs))}` : entry.isDirectory() ? 'a directory' : 'not a regular file'
    throw new Error(`${posix(abs)} is ${kind}, and the installer only writes regular files. Fix: replace it with a regular file (or remove it) and ${retry}.`)
  }
  const real = realOf(abs)
  if (!roots.some((r) => within(realOf(r), real))) {
    throw new Error(`${posix(abs)} resolves to ${posix(real)}, outside the directories the kit installs into. Fix: replace the symlinked directory on that path with a real one and ${retry}.`)
  }
}

/**
 * Recorded kit files to remove, checked before anything is deleted: each must resolve inside the kit directories
 * and carry the sha256 the install recorded, so a hand-edited installed.json cannot name a file of the user's.
 * @param {object} loc install locations
 * @param {{ hashes?: Record<string, string> }} installed parsed installed.json
 * @param {string[]} recs recorded paths
 * @returns {{ rec: string, abs: string }[]} resolved targets
 * @throws {Error} with a Fix hint for the first entry that fails
 */
export function kitTargets(loc, installed, recs) {
  return recs.map((rec) => {
    const abs = resolveRecorded(loc, rec)
    if (typeof installed.hashes?.[rec] !== 'string') {
      throw new Error(`installed.json lists '${rec}' with no recorded sha256, so it cannot be told apart from a file of yours. Fix: remove that entry from ${posix(path.join(loc.runtime, 'installed.json'))} (delete the file by hand if the kit wrote it) and run the command again; nothing was removed.`)
    }
    return { rec, abs }
  })
}

/** True when `abs` is a regular file; a symlink, directory or missing entry is never unlinked. */
export const regularFile = (abs) => Boolean(entryAt(abs)?.isFile())

/**
 * Skill folders the install would write over although the kit did not install them (for example a host's own
 * import of a Claude setup). Without --prune they are skipped; with --prune they are replaced after a backup.
 * @param {Map<string, string>} skills skill name to its built source directory
 * @param {object} loc install locations
 * @param {{ files?: string[] }|null} prev previous installed.json
 * @param {boolean} prune whether --prune was given
 * @returns {{ take: [string, string][], skipped: string[], replaced: string[] }} skills to install, skipped and replaced names
 */
export function claimSkills(skills, loc, prev, prune) {
  const owned = new Set((prev?.files || []).map((f) => f.split('/').slice(0, 3).join('/')))
  const take = []
  const skipped = []
  const replaced = []
  for (const [name, src] of skills) {
    const dest = path.join(loc.skills, name)
    if (entryAt(dest) && !owned.has(recordPath(loc, dest))) {
      if (!prune) { skipped.push(name); continue }
      replaced.push(name)
    }
    take.push([name, src])
  }
  return { take, skipped, replaced }
}

/**
 * Single-file targets (agents, rules) that already exist but are not listed in the previous installed.json, so
 * they belong to the user. Without --prune they are dropped from `files` and left alone; with --prune they are
 * returned for a backup before the kit file replaces them. A symlink counts as present, dangling or not.
 * @param {Map<string, object>} files planned writes, keyed by absolute target; skipped targets are deleted from it
 * @param {string[]} targets the absolute targets to check
 * @param {object} loc install locations
 * @param {{ files?: string[] }|null} prev previous installed.json
 * @param {boolean} prune whether --prune was given
 * @returns {{ skipped: string[], replaced: string[] }} recorded paths of the files left alone and of those to replace
 */
export function claimFiles(files, targets, loc, prev, prune) {
  const owned = new Set(prev?.files || [])
  const skipped = []
  const replaced = []
  for (const abs of targets) {
    const rec = recordPath(loc, abs)
    if (!entryAt(abs) || owned.has(rec)) continue
    if (prune) replaced.push(rec)
    else { skipped.push(rec); files.delete(abs) }
  }
  return { skipped, replaced }
}

/**
 * Checks every planned write before the first one: each target must be absent or a regular file and resolve
 * inside the kit directories. Targets the run removes first (replaced skill folders, replaced unmanaged files)
 * are left out, because the removal handles them.
 * @param {Map<string, object>} files planned writes, keyed by absolute target
 * @param {object} loc install locations
 * @param {{ replacedSkills?: string[], replacedFiles?: string[] }} replaced skill names and recorded file paths replaced with --prune
 * @throws {Error} with a Fix hint for the first target that fails
 */
export function checkTargets(files, loc, { replacedSkills = [], replacedFiles = [] } = {}) {
  const retry = 'run the installer again; nothing was written'
  const dirs = replacedSkills.map((n) => path.join(loc.skills, n))
  const recs = new Set(replacedFiles)
  for (const target of files.keys()) {
    if (recs.has(recordPath(loc, target)) || dirs.some((d) => within(d, target))) continue
    checkWritable(target, kitRoots(loc), retry)
  }
}

/**
 * Applies a checked plan: backs up and removes replaced skill folders, replaced unmanaged files and pruned stale
 * kit files, then writes every planned file, backing up a kit file edited since the last install first.
 * @param {{ loc: object, prev: object|null, stamp: string, files: Map<string, {source?: string, text?: string}>,
 *   keep: string[], replacedSkills: string[], replacedFiles: string[], staleTargets: {rec: string, abs: string}[] }} plan
 * @returns {{ hashes: Record<string, string>, backedUp: number }} sha256 per recorded path and the number of backups made
 */
export function applyFiles({ loc, prev, stamp, files, keep, replacedSkills, replacedFiles, staleTargets }) {
  let backedUp = 0
  for (const name of replacedSkills) {
    const dest = path.join(loc.skills, name)
    backupTo(loc.runtime, stamp, dest, recordPath(loc, dest))
    backedUp += 1
    fs.rmSync(dest, { recursive: true, force: true })
  }
  for (const rec of replacedFiles) {
    const target = resolveRecorded(loc, rec)
    backupTo(loc.runtime, stamp, target, rec)
    backedUp += 1
    fs.rmSync(target, { force: true })
  }
  for (const { rec, abs } of staleTargets) {
    if (regularFile(abs)) { backupTo(loc.runtime, stamp, abs, rec); backedUp += 1; fs.rmSync(abs) }
    removeEmptyDirs(path.dirname(abs), cleanupStop(loc, abs))
  }
  const hashes = {}
  for (const f of keep) if (prev.hashes?.[f]) hashes[f] = prev.hashes[f]
  for (const [target, { source, text }] of files) {
    const rec = recordPath(loc, target)
    const data = source ? fs.readFileSync(source) : Buffer.from(text)
    hashes[rec] = sha256(data)
    if (prev && modifiedSince(prev, rec, target) && sha256(fs.readFileSync(target)) !== hashes[rec]) {
      backupTo(loc.runtime, stamp, target, rec)
      backedUp += 1
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data)
  }
  return { hashes, backedUp }
}

/** Add-on keys under src/plugins, split into stack add-ons (they ship a stack.json) and tool add-ons. */
export function discoverAddons(repo) {
  const root = path.join(repo, 'src/plugins')
  const stacks = []
  const tools = []
  for (const a of listDirs(root)) {
    if (!fs.existsSync(path.join(root, a, '.claude-plugin/plugin.json'))) continue
    ;(fs.existsSync(path.join(root, a, 'stack.json')) ? stacks : tools).push(a)
  }
  // The default selection is the starting-set preset's dependency list.
  const presetDir = path.join(repo, 'src/presets')
  const defaults = listDirs(presetDir).flatMap((p) => readJson(path.join(presetDir, p, '.claude-plugin/plugin.json')).dependencies || [])
    .map((d) => d.name.replace(/^sdd-kit-?/, '')).filter(Boolean)
  return { stacks, tools, all: [...stacks, ...tools], defaultStacks: stacks.filter((a) => defaults.includes(a)), defaultTools: tools.filter((a) => defaults.includes(a)) }
}

/** The add-ons to install, validated like the Claude installer: `--stack` names stack add-ons, `--with` any add-on. */
export function selectAddons(opts, found, previous) {
  const bad = opts.withList.find((a) => !found.all.includes(a))
  if (bad) throw new UsageError(`Unknown add-on '${bad}'. Available: ${found.all.join(' ')}`)
  let stacks
  if (opts.stackGiven) {
    const none = opts.stack.includes('none')
    if (none && opts.stack.length > 1) throw new UsageError(`'none' cannot be combined with other stacks. Fix: use --stack=none or --stack=<list>. Stacks: ${found.stacks.join(', ')}, none.`)
    const unknown = opts.stack.filter((s) => s !== 'none' && !found.stacks.includes(s))
    if (unknown.length) throw new UsageError(`Unknown stack '${unknown[0]}'. Stacks: ${found.stacks.join(', ')}, none.`)
    stacks = none ? [] : opts.stack
  } else if (previous) {
    stacks = previous.addons.filter((a) => found.stacks.includes(a))
  } else {
    stacks = found.defaultStacks
  }
  let tools
  if (previous) tools = previous.addons.filter((a) => found.tools.includes(a))
  else tools = opts.stackGiven ? [] : found.defaultTools
  const selected = new Set([...stacks, ...opts.withList])
  tools.forEach((a) => selected.add(a))
  if (previous && !opts.prune) previous.addons.forEach((a) => selected.add(a))
  if (previous && opts.prune && opts.withList.length) tools.forEach((a) => { if (!opts.withList.includes(a)) selected.delete(a) })
  return found.all.filter((a) => selected.has(a))
}

export function readInstalled(runtime) {
  const file = path.join(runtime, 'installed.json')
  return fs.existsSync(file) ? readJson(file) : null
}

/** True when `dir` is a real directory, not a symlink to one. */
const realDir = (dir) => Boolean(entryAt(dir)?.isDirectory())

export function removeEmptyDirs(start, stop) {
  let dir = start
  while (dir.startsWith(`${stop}${path.sep}`) && realDir(dir) && !fs.readdirSync(dir).length) {
    fs.rmdirSync(dir)
    dir = path.dirname(dir)
  }
}

/** Directory above which empty directories are kept: the base for paths below it, else the config directory. */
export const cleanupStop = (loc, abs) => (within(loc.base, abs) ? loc.base : loc.config)

/**
 * Copies a file or folder into `<runtime>/backups/<stamp>/`, under its recorded path. A symlink is copied as
 * the link itself, never as what it points to.
 */
export function backupTo(runtime, stamp, from, rec) {
  const to = path.join(runtime, 'backups', stamp, rec.replace(/^([\w-]+-home):/, '$1/'))
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true })
}

/** True when a file the kit wrote has been edited since: its hash differs from the recorded one. */
export function modifiedSince(installed, rec, abs) {
  const recorded = installed.hashes?.[rec]
  return Boolean(recorded) && regularFile(abs) && sha256(fs.readFileSync(abs)) !== recorded
}

/**
 * Creates AGENTS.md from the template in a project install when nothing sits at that path. A symlink there,
 * dangling or not, counts as present, so the template is never written through it.
 * @returns {boolean} whether the file was created
 */
export function createAgentsMd(repo, base) {
  const file = path.join(base, 'AGENTS.md')
  if (entryAt(file)) return false
  fs.copyFileSync(path.join(repo, 'src/templates/AGENTS.template.md'), file, fs.constants.COPYFILE_EXCL)
  return true
}

export async function confirm(question) {
  if (!process.stdin.isTTY) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((resolve) => rl.question(`${question} [Y/n] `, resolve))
  rl.close()
  return !/^n/i.test(answer.trim())
}

/**
 * The command-line entry both installers share: parses the arguments, asks once, and runs the uninstall, or
 * the install from the checkout or from a staged copy of the dist tree.
 * @param {string[]} argv arguments after the script name
 * @param {{ label: string, locations: (mode: string, cwd: string) => object, install: Function, uninstall: Function }} host
 *   label is the host name users see; install and uninstall are the host's own functions
 * @returns {Promise<number>} exit code: 0, 1 for a runtime failure, 2 for a usage error
 */
export async function runInstaller(argv, { label, locations, install, uninstall }) {
  const log = (line) => process.stdout.write(`${line}\n`)
  try {
    const opts = parseArgs(argv)
    const loc = locations(opts.mode, process.cwd())
    if (opts.uninstall) {
      if (!opts.dryRun && !opts.yes && !(await confirm(`Remove the SDD Kit files for ${label}?`))) return 0
      if (opts.dryRun) { log('Dry run: nothing removed.'); return 0 }
      uninstall(loc).forEach(log)
      return 0
    }
    if (!opts.dryRun && !opts.yes && !(await confirm(`Install the SDD Kit for ${label}?`))) { log('Cancelled.'); return 0 }
    if (DIST_LAYOUT) {
      const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-kit-dist-src-'))
      try {
        stageDist(BASE, staged)
        install({ opts, cwd: process.cwd(), repo: staged, log })
      } finally {
        fs.rmSync(staged, { recursive: true, force: true })
      }
    } else {
      install({ opts, cwd: process.cwd(), log })
    }
    return 0
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    return err instanceof UsageError ? 2 : 1
  }
}
