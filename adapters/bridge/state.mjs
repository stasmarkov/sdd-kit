// Durable run state: owner-only files, atomic writes and a per-run pid lock.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const RUNS_DIR = path.join('.ai', 'workflow-runs')

/** Creates `.ai/workflow-runs/` (0700) and, whenever it is missing, its `.gitignore` of `*`. */
export function ensureRunsRoot(workspace) {
  const root = path.join(workspace, RUNS_DIR)
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 })
    fs.chmodSync(root, 0o700)
  }
  const ignore = path.join(root, '.gitignore')
  if (!fs.existsSync(ignore)) writeFileAtomic(ignore, '*\n')
  return root
}

export function newRunId() {
  return crypto.randomUUID()
}

export function runDir(workspace, id) {
  return path.join(workspace, RUNS_DIR, id)
}

export function ensureRunDir(workspace, id) {
  ensureRunsRoot(workspace)
  const dir = runDir(workspace, id)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  fs.chmodSync(dir, 0o700)
  return dir
}

/** Writes through a temporary file and renames it, so a reader never sees half a file. */
export function writeFileAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' })
  fs.chmodSync(tmp, 0o600)
  fs.renameSync(tmp, file)
}

export function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

/**
 * Takes the run's pid lock. A lock whose process is gone is reclaimed under a recovery lock;
 * a lock held by another live process fails with a message naming it.
 * @param {string} dir run directory
 * @param {number} pid this process
 * @param {(pid: number) => boolean} [alive] liveness check
 */
export function acquireLock(dir, pid, alive = pidAlive) {
  const lock = path.join(dir, 'lock')
  const write = () => fs.writeFileSync(lock, String(pid), { mode: 0o600, flag: 'wx' })
  try {
    write()
    return
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
  let holder = readHolder(lock)
  if (holder === undefined) {
    // A lock created with 'wx' may not be written yet; give its owner a moment before treating it as stale.
    waitMs(LOCK_GRACE_MS)
    holder = readHolder(lock)
  }
  if (holder === pid) return
  if (holder !== undefined && alive(holder)) throw lockedError(holder)
  recover(dir, lock, pid, holder, write)
}

const LOCK_GRACE_MS = 50

const lockedError = (holder) => new Error(`Run is locked by pid ${holder}. Fix: stop that process, or wait for it to exit, then call workflow_resume again`)

function waitMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** The pid in a lock file, or undefined when the file is empty or unparsable. */
function readHolder(lock) {
  try {
    const n = Number.parseInt(fs.readFileSync(lock, 'utf8'), 10)
    return Number.isInteger(n) ? n : undefined
  } catch {
    return undefined
  }
}

/**
 * Replaces a stale lock under the recovery lock. The holder is read again once the recovery lock is
 * held: if another process already replaced the stale lock, this one gives up instead of deleting it.
 */
function recover(dir, lock, pid, seen, write) {
  const recovery = path.join(dir, 'lock.recover')
  try {
    fs.writeFileSync(recovery, String(pid), { mode: 0o600, flag: 'wx' })
  } catch {
    throw new Error('Another process is recovering this run lock. Fix: call workflow_resume again in a moment')
  }
  try {
    const current = readHolder(lock)
    if (current !== seen) {
      if (current === pid) return
      throw new Error('Another process took over this run lock while it was being recovered. Fix: call workflow_resume again in a moment')
    }
    fs.rmSync(lock, { force: true })
    write()
  } finally {
    fs.rmSync(recovery, { force: true })
  }
}
