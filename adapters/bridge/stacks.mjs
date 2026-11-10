// Overlay stack manifests: discovery, canonical hashes, trust state and the stack context a run records.
// Approval is never done here; it stays a human action through the stack-trust CLI. Hashing and rejection
// reuse the trust script's own functions, so the bridge and the stack-trust command always agree.
import fs from 'node:fs'
import path from 'node:path'
import { loadSkillScript } from './skill-script.mjs'
import { markersIn } from '../lib/locate.mjs'

const { COMMAND_FIELDS, canonicalJson, canonicalManifest, isFirstPartyAddonCopy, manifestHash, osHomeDir, pluginName, workflowRejection } = await loadSkillScript('stack-trust', 'trust-store.mjs')

// The manifest checks do not depend on where a manifest sits, and the trust script's source labels name only
// the canonical locations, so every host's manifest is checked under one neutral label.
const CHECK_SOURCE = 'plugin:overlay@inline'
export const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', '.ai', 'dist', 'build'])

export { canonicalJson, manifestHash, osHomeDir }

const entriesOf = (parsed) => (Array.isArray(parsed) ? parsed : [parsed]).filter((e) => e && typeof e === 'object')

function leafStrings(value, out) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => leafStrings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => leafStrings(v, out))
  return out
}

function listJson(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

/**
 * Reads the approved hashes from the host's trust store file under `<home>/<config dir>/sdd-kit/`.
 * An absent or unreadable store approves nothing.
 * @param {string} trustStoreDir host value, for example "<OS home>/.codex/sdd-kit"
 * @param {string} homeDir the OS home directory
 * @returns {Set<string>} approved sha256 values
 */
export function readTrustedHashes(trustStoreDir, homeDir) {
  const file = path.join(trustStoreDir.replace('<OS home>', homeDir), 'trusted-stacks.json')
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return new Set((Array.isArray(data.trusted) ? data.trusted : []).filter((t) => t && typeof t.sha256 === 'string').map((t) => t.sha256))
  } catch {
    return new Set()
  }
}

/**
 * Finds the overlay manifests in scope for a workspace: project stacks, project add-ons and user stacks.
 * A staged copy of a first-party manifest is left out. A manifest that does not parse or has no
 * named entry is reported as rejected with a fixed reason and is never trusted.
 *
 * @param {{ workspace: string, host: object, homeDir: string, firstParty: Record<string, object> }} opts scope
 * @returns {{ source: string, file: string, addonDir: string|null, addonName: string|null, keys: string[], commands: string[],
 *   sha256: string|null, trusted: boolean, rejected?: string }[]} overlays
 */
export function discoverOverlays({ workspace, host, homeDir, firstParty }) {
  const trusted = readTrustedHashes(host.trustStoreDir, homeDir)
  const out = []
  const add = (source, file, addonDir, addonName) => {
    let raw
    try {
      raw = fs.readFileSync(file, 'utf8')
    } catch {
      return
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      out.push({ source, file, addonDir, addonName, keys: [], commands: [], sha256: null, trusted: false, rejected: workflowRejection(raw, CHECK_SOURCE) })
      return
    }
    const entries = entriesOf(parsed)
    const copy = entries.length > 0 && entries.every((e) => firstParty[e.name] && canonicalJson(firstParty[e.name]) === canonicalManifest(e))
    if (copy) return
    const rejected = workflowRejection(raw, CHECK_SOURCE)
    if (rejected) {
      out.push({ source, file, addonDir, addonName, keys: [], commands: [], sha256: null, trusted: false, rejected })
      return
    }
    const sha256 = manifestHash(parsed)
    const commands = []
    for (const e of entries) for (const f of COMMAND_FIELDS) if (f in e) leafStrings(e[f], commands)
    out.push({ source, file, addonDir, addonName, keys: entries.map((e) => e.name), commands, sha256, trusted: trusted.has(sha256) })
  }
  for (const f of listJson(path.join(workspace, host.stacksDir))) add(`project:${host.stacksDir}/${path.basename(f)}`, f, null, null)
  const addonsBase = path.join(workspace, host.stackAddonsDir)
  let dirs = []
  try {
    dirs = fs.readdirSync(addonsBase).sort()
  } catch {
    // no project add-ons
  }
  for (const d of dirs) {
    const dir = path.join(addonsBase, d)
    if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    const name = pluginName(dir, d)
    if (isFirstPartyAddonCopy(name, path.join(dir, 'stack.json'))) continue
    add(`plugin:${name}@inline`, path.join(dir, 'stack.json'), dir, name)
  }
  for (const f of listJson(path.join(homeDir, host.configDir, 'stacks'))) add(`user:~/${host.configDir}/stacks/${path.basename(f)}`, f, null, null)
  return out
}

/**
 * The stack context of a workspace: repo paths and stack keys from the markers in stacks.json, the
 * sha256 of every overlay manifest in scope and its trust state. Computed by the bridge itself, so it
 * does not depend on the Detect job.
 *
 * Repos named in the run's args.repos are scanned too, so a marker added to a repo outside the workspace
 * is seen on resume. Symlinks are resolved first, so two spellings of one repo are scanned once; a repo
 * inside the workspace is recorded by its path relative to the workspace, any other by its real absolute path.
 *
 * @param {{ workspace: string, host: object, homeDir: string, stacks: { entries: Record<string, { markers?: string[] }> }, argRepos?: string[] }} opts scope;
 *   argRepos holds repo paths from args, absolute or relative to the workspace
 * @returns {{ repos: { path: string, stacks: string[] }[], overlays: { source: string, sha256: string|null, trusted: boolean }[] }} context
 */
export function stackContext({ workspace, host, homeDir, stacks, argRepos = [] }) {
  const entries = stacks.entries || {}
  const candidates = ['.']
  try {
    for (const e of fs.readdirSync(workspace, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) candidates.push(e.name)
    }
  } catch {
    // an unreadable workspace has no repos
  }
  const repos = []
  const real = (p) => {
    try {
      return fs.realpathSync(p)
    } catch {
      return p
    }
  }
  const root = real(workspace)
  const scanned = new Set(candidates.map((rel) => real(path.resolve(workspace, rel))))
  // An arg repo inside the workspace is recorded relative to it, so a moved workspace still resumes.
  const label = (dir) => {
    const rel = path.relative(root, dir)
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : dir
  }
  const extra = [...new Set(argRepos.map((p) => real(path.resolve(workspace, p))))].filter((dir) => !scanned.has(dir)).sort()
  // Sorted by label, so the order does not depend on where the workspace sits.
  const outside = extra.map((dir) => [label(dir), dir]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const targets = [...candidates.sort().map((rel) => [rel, path.join(workspace, rel)]), ...outside]
  for (const [rel, dir] of targets) {
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    const keys = Object.entries(entries).filter(([, v]) => markersIn(dir, names, v.markers || []).length).map(([k]) => k).sort()
    if (keys.length) repos.push({ path: rel, stacks: keys })
  }
  const overlays = discoverOverlays({ workspace, host, homeDir, firstParty: entries })
    .map((o) => ({ source: o.source, sha256: o.sha256, trusted: o.trusted }))
    .sort((a, b) => a.source.localeCompare(b.source))
  return { repos, overlays }
}

/** Names what differs between two stack contexts, or returns null when they are equal. */
export function describeContextChange(before, after) {
  const changes = []
  if (JSON.stringify(before.repos) !== JSON.stringify(after.repos)) changes.push('the repos or stack markers found in the workspace')
  const a = new Map(before.overlays.map((o) => [o.source, o]))
  const b = new Map(after.overlays.map((o) => [o.source, o]))
  for (const [source, o] of b) {
    const prev = a.get(source)
    if (!prev) changes.push(`overlay manifest ${source} was added`)
    else if (prev.sha256 !== o.sha256) changes.push(`overlay manifest ${source} changed content`)
    else if (prev.trusted !== o.trusted) changes.push(`trust state of ${source} changed`)
  }
  for (const source of a.keys()) if (!b.has(source)) changes.push(`overlay manifest ${source} was removed`)
  return changes.length ? changes.join('; ') : null
}
