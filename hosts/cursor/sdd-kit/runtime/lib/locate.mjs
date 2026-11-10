// Helpers the bridge and the hook dispatcher share (adapters/lib, so neither depends on the other): where an installed runtime root is,
// which add-on packages sit beside it, and how an add-on's stack markers are matched against a directory.
import fs from 'node:fs'
import path from 'node:path'

/**
 * The installed runtime root above a `bridge/` or `hooks/` directory: the parent that holds `stacks.json`.
 * @param {string} dir the `bridge/` or `hooks/` directory
 * @returns {string|null} the runtime root, or null in a source checkout
 */
export function installedRoot(dir) {
  const parent = path.dirname(dir)
  return fs.existsSync(path.join(parent, 'stacks.json')) ? parent : null
}

const VERSION_DIR = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

const listDirs = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  } catch {
    return []
  }
}

/**
 * Orders two version folder names by semver precedence: numeric parts first, then a release above its pre-releases.
 * @param {string} a version folder name such as `1.10.0` or `v2.0.0-rc.1`
 * @param {string} b version folder name
 * @returns {number} negative when `a` is older, positive when newer, 0 when equal
 */
export function compareVersions(a, b) {
  const pa = VERSION_DIR.exec(a)
  const pb = VERSION_DIR.exec(b)
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d) return d
  }
  if (pa[4] === pb[4]) return 0
  if (pa[4] === undefined) return 1
  if (pb[4] === undefined) return -1
  return pa[4] < pb[4] ? -1 : 1
}

/**
 * The add-on packages installed beside the core package of a plugin-form runtime root, one directory per package.
 *
 * Two layouts hold the packages. A build output keeps them side by side (`<dir>/sdd-kit/runtime` next to
 * `<dir>/sdd-kit-laravel`). A host plugin cache adds a version folder (`<cache>/sdd-kit/1.2.0/runtime` next to
 * `<cache>/sdd-kit-laravel/1.2.0`); the runtime root's parent is then a version name, and each add-on package
 * contributes only its highest semver version folder, so stale cached versions are never read. A package with
 * no version folder counts as itself. Only `<core>-*` directories are add-on packages.
 *
 * @param {string} root the installed runtime root (holds `stacks.json`)
 * @returns {Map<string, string>} package name (`sdd-kit-laravel`) to the directory that holds its files, sorted by name
 * @example
 *   installedAddonPackages('/c/sdd-kit/1.10.0/runtime') // Map { 'sdd-kit-laravel' => '/c/sdd-kit-laravel/1.10.0' }
 */
export function installedAddonPackages(root) {
  const pkg = path.dirname(root)
  const coreDir = VERSION_DIR.test(path.basename(pkg)) ? path.dirname(pkg) : pkg
  const base = path.dirname(coreDir)
  const prefix = `${path.basename(coreDir)}-`
  const found = new Map()
  for (const name of listDirs(base).filter((n) => n.startsWith(prefix))) {
    const dir = path.join(base, name)
    const versions = listDirs(dir).filter((v) => VERSION_DIR.test(v)).sort(compareVersions)
    found.set(name, versions.length ? path.join(dir, versions[versions.length - 1]) : dir)
  }
  return found
}

/** Turns a marker into a regular expression for one directory entry name: `*` and `?` stay inside one name. */
export function markerRegex(marker) {
  return new RegExp(`^${marker.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`)
}

/**
 * The markers that are present in a directory. A marker with a `/` is a relative path that must exist;
 * any other marker is matched against the directory's entry names.
 * @param {string} dir directory to check
 * @param {string[]} names the directory's entry names
 * @param {string[]} markers file names, `*` patterns or relative paths
 * @returns {string[]} the markers found
 */
export function markersIn(dir, names, markers) {
  return markers.filter((m) => (m.includes('/') ? fs.existsSync(path.join(dir, m)) : names.some((n) => markerRegex(m).test(n))))
}

/** True when `dir` holds at least one of the markers; an unreadable directory holds none. */
export function hasMarker(dir, markers) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return false
  }
  return markersIn(dir, names, markers).length > 0
}
