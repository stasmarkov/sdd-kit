// Locates what the bridge needs at run time. Every install form carries the same
// runtime root, and a source checkout maps each entry onto its src/ folder, so the
// bridge never hardcodes where a workflow, agent or rule lives.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { installedAddonPackages, installedRoot } from '../lib/locate.mjs'

const BRIDGE_DIR = path.dirname(fileURLToPath(import.meta.url))

const listDirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/**
 * The skill directories an installed runtime root ships. A file copy records the absolute directory in installed.json.
 * The plugin form keeps the core skills beside the runtime (`<package>/skills`) and each installed add-on's skills in
 * its sibling package, as installedAddonPackages() resolves it.
 * @param {string} root installed runtime root
 * @returns {string[]} existing skill directories
 */
function installedSkillDirs(root) {
  const installedFile = path.join(root, 'installed.json')
  if (fs.existsSync(installedFile)) {
    try {
      const dir = readJson(installedFile).skillsDir
      return typeof dir === 'string' && fs.existsSync(dir) ? [dir] : []
    } catch {
      return []
    }
  }
  const dirs = [path.join(path.dirname(root), 'skills'), ...[...installedAddonPackages(root).values()].map((d) => path.join(d, 'skills'))]
  return dirs.filter((d) => fs.existsSync(d))
}

/**
 * Finds the workflows, agents, rules, stack data and version for a bridge directory.
 *
 * An installed runtime root holds `stacks.json` beside `bridge/` (and `workflows/`, `agents/`, `rules/`, `VERSION`).
 * A source checkout keeps them in `src/` and the repository root.
 *
 * @param {string} [bridgeDir] directory holding this file's siblings
 * @returns {{ kind: string, bridgeDir: string, workflowsDir: string, agentDirs: string[], ruleDirs: string[],
 *   skillDirs: string[], stacksJson: string, versionFile: string, hostsFile: string, libDir: string }} locations
 */
export function locateRuntime(bridgeDir = BRIDGE_DIR) {
  const parent = path.dirname(bridgeDir)
  if (installedRoot(bridgeDir)) {
    return {
      kind: 'installed',
      bridgeDir,
      workflowsDir: path.join(parent, 'workflows'),
      agentDirs: [path.join(parent, 'agents')],
      ruleDirs: [path.join(parent, 'rules')],
      skillDirs: installedSkillDirs(parent),
      stacksJson: path.join(parent, 'stacks.json'),
      versionFile: path.join(parent, 'VERSION'),
      hostsFile: path.join(parent, 'hosts.json'),
      libDir: path.join(parent, 'lib'),
    }
  }
  const src = path.dirname(parent)
  const plugins = listDirs(path.join(src, 'plugins')).map((d) => path.join(src, 'plugins', d))
  return {
    kind: 'source',
    bridgeDir,
    workflowsDir: path.join(src, 'workflows'),
    agentDirs: [path.join(src, 'agents'), ...plugins.map((p) => path.join(p, 'agents'))],
    ruleDirs: [path.join(src, 'templates', 'rules'), ...plugins.map((p) => path.join(p, 'rules'))],
    skillDirs: [path.join(src, 'skills'), ...plugins.map((p) => path.join(p, 'skills'))],
    stacksJson: path.join(src, 'workflows', 'lib', 'stacks.json'),
    versionFile: path.join(path.dirname(src), 'VERSION'),
    hostsFile: path.join(parent, 'hosts.json'),
    libDir: path.join(parent, 'lib'),
  }
}

/**
 * The sha256 over the files under a directory: sorted relative paths and their bytes. Only regular files
 * and real directories count; a symlink, device or FIFO is skipped, so the walk never blocks or reads without end.
 * @param {string} root directory to hash
 * @param {{ include?: (name: string) => boolean, skipDirs?: Set<string>, maxBytes?: number, maxEntries?: number }} [opts]
 *   `include` filters file names, `skipDirs` names directories that are not entered, `maxBytes` caps the bytes read
 *   and `maxEntries` caps the directory entries visited
 * @returns {string} hex digest
 * @throws {Error} when the files add up to more than `maxBytes` or the walk visits more than `maxEntries`
 */
export function hashTree(root, { include = () => true, skipDirs = new Set(), maxBytes = Infinity, maxEntries = Infinity } = {}) {
  const files = []
  let total = 0
  let visited = 0
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++visited > maxEntries) throw new Error(`${root} holds more than ${maxEntries} entries to hash. Fix: point the artifact at a report file or a small folder`)
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) walk(path.join(dir, e.name), `${rel}${e.name}/`)
      } else if (e.isFile() && include(e.name)) {
        total += fs.lstatSync(path.join(dir, e.name)).size
        if (total > maxBytes) throw new Error(`${root} holds more than ${maxBytes} bytes to hash. Fix: point the artifact at a report file or a small folder`)
        files.push(`${rel}${e.name}`)
      }
    }
  }
  walk(root, '')
  const hash = crypto.createHash('sha256')
  for (const rel of files.sort()) {
    hash.update(rel).update('\0').update(fs.readFileSync(path.join(root, rel))).update('\0')
  }
  return hash.digest('hex')
}

/**
 * The sha256 over every `*.mjs` file under the bridge directory: sorted relative paths and their bytes.
 * @param {string} bridgeDir bridge directory
 * @returns {string} hex digest
 */
export const bridgeHash = (bridgeDir) => hashTree(bridgeDir, { include: (name) => name.endsWith('.mjs') })

/**
 * The kit version plus the hashes of the installed bridge/ and lib/ files; resume refuses when any of them changes.
 * @param {ReturnType<typeof locateRuntime>} runtime locations
 * @returns {string} adapter revision
 */
export function adapterRevision(runtime) {
  let version = 'unknown'
  try {
    version = fs.readFileSync(runtime.versionFile, 'utf8').trim()
  } catch {
    // an unversioned tree still gets a stable revision from its bridge files
  }
  // The bridge imports the shared helpers in lib/, so a change there is an adapter change too.
  const libDir = runtime.libDir || path.join(path.dirname(runtime.bridgeDir), 'lib')
  const lib = fs.existsSync(libDir) ? bridgeHash(libDir) : 'none'
  return `${version}+${bridgeHash(runtime.bridgeDir)}+${lib}`
}

/**
 * Reads the host table: the stacks.json `hosts` section of an install, or the host data file of a source tree.
 * @param {ReturnType<typeof locateRuntime>} runtime locations
 * @returns {Record<string, object>} host name to host values
 */
export function loadHosts(runtime) {
  for (const read of [() => JSON.parse(fs.readFileSync(runtime.hostsFile, 'utf8')).hosts, () => JSON.parse(fs.readFileSync(runtime.stacksJson, 'utf8')).hosts]) {
    try {
      const hosts = read()
      if (hosts && typeof hosts === 'object') return hosts
    } catch {
      // try the next source
    }
  }
  throw new Error('No host table found. Fix: reinstall the kit so hosts.json or the stacks.json hosts section is present')
}

/** Lists workflow files with the name each declares in `meta.name`; nothing is hardcoded. */
export function discoverWorkflows(workflowsDir) {
  const found = {}
  let names = []
  try {
    names = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.js')).sort()
  } catch {
    return found
  }
  for (const file of names) {
    const full = path.join(workflowsDir, file)
    const text = fs.readFileSync(full, 'utf8')
    const start = text.indexOf('export const meta = {')
    if (start === -1) continue
    const m = /^ {2}name: '([^']+)'/m.exec(text.slice(start, text.indexOf('\n}\n', start)))
    if (m) found[m[1]] = full
  }
  return found
}
