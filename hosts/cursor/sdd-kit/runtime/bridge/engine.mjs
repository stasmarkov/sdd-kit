// Host-neutral workflow engine.
//
// It discovers workflows by `meta.name`, runs the shipped file in a node:vm context and turns every
// agent() call into a claimable job. It never awaits a job: a host claims jobs through the MCP server,
// runs them with its own subagents and submits the output. State is durable, so a restarted server
// replays the script and answers completed jobs from disk.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import crypto from 'node:crypto'
import { validate } from './schema.mjs'
import { DEFAULT_MAX_ACTIVE, LEASE_MS, MAX_ACTIVE_LIMIT } from './limits.mjs'
import { AgentCatalog } from './agents.mjs'
import { adapterRevision, discoverWorkflows, hashTree, loadHosts, locateRuntime, sha256 } from './runtime.mjs'
import { acquireLock, ensureRunDir, newRunId, pidAlive, readJson, writeJsonAtomic } from './state.mjs'
import { canonicalJson, describeContextChange, discoverOverlays, osHomeDir, stackContext } from './stacks.mjs'

export { LEASE_MS, MAX_ACTIVE_LIMIT }

const STATUS_LOG_TAIL = 20
// The most bytes and directory entries an artifact hash reads. A folder artifact skips dependency and git folders only:
// build output or .ai/ notes inside a report folder are part of the report.
const ARTIFACT_MAX_BYTES = 32 * 1024 * 1024
const ARTIFACT_MAX_ENTRIES = 20000
const ARTIFACT_SKIP = new Set(['node_modules', 'vendor', '.git'])
const MAX_LOGS = 500
const TIERS = new Set(['deep', 'standard', 'light'])
// The registry's BROWSER_PHASES: a job in one of these phases carries the host's browser guide.
const BROWSER_PHASES = new Set(['Reproduce', 'Acceptance', 'Visual'])
// Result fields that name the artifact a blocked run is re-reviewed against, in priority order. A workflow that
// return their report as text only offer their QA plan or backlog file instead.
// A result that carries reportPath at all (even null, when its report was not saved) answers with that field alone.
const ARTIFACT_FIELDS = ['reportPath', 'specFolder', 'adrPath', 'qaPlanPath', 'backlog.path']
const ACTIVE_RUN = new Set(['running', 'reviewing'])
const HELD = new Set(['claimed', 'expired'])
const OPEN = new Set(['queued', 'claimed', 'expired'])

export const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reason'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'CHANGES_REQUIRED', 'BLOCKED'] },
    reason: { type: 'string' },
  },
}

// Runs inside the workflow's context, so every value the script sees is built by its own realm.
const PRELUDE = `(function (host) {
  class DeterminismError extends Error {
    constructor(call) {
      super(call + ' is not allowed in a workflow: it breaks deterministic resume. Pass the value in through args or ask an agent for it.')
      this.name = 'DeterminismError'
    }
  }
  const deny = (call) => {
    const error = new DeterminismError(call)
    host.determinism(error.message)
    throw error
  }
  Math.random = () => deny('Math.random()')
  const DateStub = function Date() { return deny('new Date()') }
  DateStub.now = () => deny('Date.now()')
  globalThis.Date = DateStub
  globalThis.DeterminismError = DeterminismError
  globalThis.sddHost = host.host
  globalThis.args = host.args === undefined ? undefined : JSON.parse(host.args)
  globalThis.budget = { total: 0, remaining: () => 0 }
  globalThis.phase = (name) => host.phase(String(name))
  globalThis.log = (...parts) => host.log(parts.map(String).join(' '))
  globalThis.agent = async (prompt, opts) => JSON.parse(await host.agent(String(prompt), JSON.stringify(opts === undefined ? {} : opts)))
  globalThis.parallel = (thunks) => Promise.all(thunks.map((t) => (typeof t === 'function' ? t() : t)))
  globalThis.pipeline = (items, ...stages) =>
    Promise.all(items.map(async (item, index) => {
      let value = item
      for (const stage of stages) value = await stage(value, item, index)
      return value
    }))
})`

const settle = () => new Promise((resolve) => setImmediate(resolve))
const short = (hash) => String(hash).slice(0, 12)

function hashPath(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    if (stat.size > ARTIFACT_MAX_BYTES) throw new Error(`${target} is larger than ${ARTIFACT_MAX_BYTES} bytes. Fix: point the artifact at a smaller report`)
    return sha256(fs.readFileSync(target))
  }
  if (!stat.isDirectory()) throw new Error(`${target} is not a regular file or folder. Fix: point the artifact at a report file or folder`)
  return hashTree(target, { skipDirs: ARTIFACT_SKIP, maxBytes: ARTIFACT_MAX_BYTES, maxEntries: ARTIFACT_MAX_ENTRIES })
}

// A target is inside a root only below it: a result naming the root itself would hash the whole repository.
const inside = (root, target) => {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const isFsRoot = (p) => path.dirname(p) === p

/** The nearest folder at or above `dir` that holds a `.git` entry, or null. */
function checkoutOf(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d
    if (path.dirname(d) === d) return null
  }
}

function realOrSelf(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

export class Engine {
  /**
   * @param {object} [opts] options
   * @param {ReturnType<typeof locateRuntime>} [opts.runtime] where workflows, agents and rules live
   * @param {string} [opts.host] host name from the host table
   * @param {string} [opts.homeDir] OS home directory holding the trust store
   * @param {() => number} [opts.clock] milliseconds since the epoch
   * @param {number} [opts.pid] this process id, for run locks
   * @param {(pid: number) => boolean} [opts.alive] liveness check for lock holders
   */
  constructor({ runtime = locateRuntime(), host = 'codex', homeDir, clock = () => Date.now(), pid = process.pid, alive = pidAlive } = {}) {
    this.runtime = runtime
    this.hosts = loadHosts(runtime)
    if (!Object.hasOwn(this.hosts, host)) throw new Error(`Unknown host "${host}". Fix: use one of ${Object.keys(this.hosts).join(', ')}`)
    this.hostName = host
    this.host = this.hosts[host]
    this.homeDir = homeDir || osHomeDir()
    this.clock = clock
    this.pid = pid
    this.alive = alive
    this.stacks = JSON.parse(fs.readFileSync(runtime.stacksJson, 'utf8'))
    this.runs = new Map()
  }

  /** @returns {string[]} workflow names found in the workflows directory */
  list() {
    return Object.keys(discoverWorkflows(this.runtime.workflowsDir)).sort()
  }

  #workspace(workspace) {
    if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) throw new Error('workspace must be an absolute path. Fix: pass the absolute path of the project folder')
    if (!fs.statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`workspace ${workspace} is not a directory. Fix: pass an existing project folder`)
    return realOrSelf(workspace)
  }

  #context(workspace, args) {
    const given = args && typeof args === 'object' && args.repos && typeof args.repos === 'object' ? Object.values(args.repos) : []
    const argRepos = given.map((r) => (typeof r === 'string' ? r : r && typeof r.path === 'string' ? r.path : null)).filter(Boolean)
    return stackContext({ workspace, host: this.host, homeDir: this.homeDir, stacks: this.stacks, argRepos })
  }

  #catalog(workspace) {
    const overlays = discoverOverlays({ workspace, host: this.host, homeDir: this.homeDir, firstParty: this.stacks.entries || {} })
    return new AgentCatalog({ runtime: this.runtime, host: this.host, workspace, firstPartyPlugins: this.stacks.firstPartyPlugins || [], overlays })
  }

  #run(id) {
    const run = this.runs.get(id)
    if (!run) throw new Error(`Unknown run ${id} in this server. Fix: call workflow_resume with the run id and workspace to continue it, or workflow_start to begin a new run`)
    this.#expireLeases(run)
    return run
  }

  #save(run) {
    run.state.updatedAt = this.clock()
    writeJsonAtomic(path.join(run.dir, 'state.json'), run.state)
  }

  #expireLeases(run) {
    let changed = false
    for (const job of Object.values(run.state.jobs)) {
      if (job.status === 'claimed' && job.claim && job.claim.leaseExpiresAt <= this.clock()) {
        job.status = 'expired'
        changed = true
      }
    }
    if (changed) this.#save(run)
  }

  /**
   * Starts a run of a discovered workflow and returns its status without awaiting any job.
   * @param {{ name: string, workspace: string, args?: unknown, maxActive?: number }} input start input
   * @returns {Promise<object>} run status
   */
  async start({ name, workspace, args, maxActive }) {
    const workflows = discoverWorkflows(this.runtime.workflowsDir)
    if (!Object.hasOwn(workflows, name)) {
      throw new Error(`Unknown workflow "${name}". Valid workflows: ${Object.keys(workflows).sort().join(', ')}`)
    }
    const ws = this.#workspace(workspace)
    const bytes = fs.readFileSync(workflows[name])
    const id = newRunId()
    const dir = ensureRunDir(ws, id)
    acquireLock(dir, this.pid, this.alive)
    const state = {
      version: 1,
      id,
      name,
      workspace: ws,
      args: args === undefined ? null : args,
      maxActive: Math.min(Math.max(Number.isInteger(maxActive) ? maxActive : DEFAULT_MAX_ACTIVE, 1), MAX_ACTIVE_LIMIT),
      status: 'running',
      phase: null,
      workflowSha256: sha256(bytes),
      adapterRevision: adapterRevision(this.runtime),
      stackContext: this.#context(ws, args),
      createdAt: this.clock(),
      updatedAt: this.clock(),
      logs: [],
      logCount: 0,
      result: null,
      error: null,
      jobs: {},
      order: [],
      reviews: [],
    }
    const run = this.#register(state, dir)
    this.#save(run)
    this.#execute(run, bytes.toString('utf8'), workflows[name])
    await settle()
    return this.#status(run)
  }

  #register(state, dir) {
    const run = { state, dir, mem: { pending: new Map(), occurrences: new Map(), dead: false, catalog: this.#catalog(state.workspace) } }
    this.runs.set(state.id, run)
    return run
  }

  #execute(run, source, file) {
    const { state, mem } = run
    mem.occurrences.clear()
    // A replay re-emits the log calls of the earlier execution; only calls past the recorded count are new.
    const recorded = Number.isInteger(state.logCount) ? state.logCount : state.logs.length
    let emitted = 0
    const host = {
      host: this.hostName,
      args: state.args === null ? undefined : JSON.stringify(state.args),
      phase: (name) => {
        if (mem.dead) return
        state.phase = name
        mem.catalog.invalidate()
        this.#save(run)
      },
      log: (message) => {
        if (mem.dead) return
        emitted++
        if (emitted <= recorded) return
        state.logCount = emitted
        state.logs.push(message)
        if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS)
        this.#save(run)
      },
      determinism: (message) => this.#fail(run, message),
      agent: (prompt, optsJson) => this.#agentCall(run, prompt, optsJson),
    }
    // The shipped bytes run as they are, apart from the module keyword on the meta literal and the async wrapper that lets a script `return`.
    const body = source.replace(/^export const meta = /m, 'const meta = ')
    const wrapped = `(async () => {\n${body}\n})().then((r) => JSON.stringify(r === undefined ? null : r))`
    const context = vm.createContext({})
    vm.runInContext(PRELUDE, context)(host)
    const promise = new vm.Script(wrapped, { filename: file }).runInContext(context, { timeout: 30000 })
    promise.then(
      (json) => this.#onReturn(run, JSON.parse(json)),
      (error) => this.#fail(run, (error && error.message) || String(error))
    )
  }

  #agentCall(run, prompt, optsJson) {
    const { state, mem } = run
    if (mem.dead) return new Promise(() => {})
    const opts = JSON.parse(optsJson)
    // An unresolvable agent type is rejected before anything is recorded; runAgent() then tries its next candidate.
    mem.catalog.resolve(opts.agentType)
    const digest = sha256(canonicalJson([prompt, opts]))
    const occurrence = mem.occurrences.get(digest) || 0
    mem.occurrences.set(digest, occurrence + 1)
    const id = `job-${sha256(`${digest}#${occurrence}`).slice(0, 16)}`
    let job = state.jobs[id]
    if (!job) {
      job = {
        id,
        kind: 'work',
        digest,
        occurrence,
        phase: typeof opts.phase === 'string' ? opts.phase : state.phase,
        label: typeof opts.label === 'string' ? opts.label : null,
        prompt,
        agentType: typeof opts.agentType === 'string' ? opts.agentType : null,
        schema: opts.schema && typeof opts.schema === 'object' ? opts.schema : null,
        tier: TIERS.has(opts.tier) ? opts.tier : 'standard',
        effort: typeof opts.effort === 'string' ? opts.effort : 'medium',
        readOnly: null,
        status: 'queued',
        workerId: null,
        claim: null,
        acceptedClaim: null,
        outputJson: null,
        error: null,
      }
      state.jobs[id] = job
      state.order.push(id)
      this.#save(run)
    }
    return new Promise((resolve) => {
      if (job.status === 'completed') resolve(job.outputJson)
      else mem.pending.set(id, resolve)
    })
  }

  #onReturn(run, result) {
    const { state, mem } = run
    if (mem.dead) return
    state.result = result
    state.status = 'reviewing'
    this.#startReview(run, 0, null)
  }

  #artifactOf(run) {
    const { result, workspace, args } = run.state
    if (!result || typeof result !== 'object') return null
    const fields = Object.hasOwn(result, 'reportPath') ? ['reportPath'] : ARTIFACT_FIELDS
    const raw = fields
      .map((f) => f.split('.').reduce((v, key) => (v && typeof v === 'object' ? v[key] : undefined), result))
      .find((v) => typeof v === 'string' && v)
    if (!raw) return null
    const roots = [realOrSelf(workspace)]
    // A home folder kept under git (dotfiles) or the filesystem root never makes an outside repo a valid root.
    const forbidden = new Set([this.homeDir, osHomeDir()].map(realOrSelf))
    const repos = args && typeof args === 'object' && args.repos && typeof args.repos === 'object' ? Object.values(args.repos) : []
    for (const r of repos) {
      const p = typeof r === 'string' ? r : r && typeof r.path === 'string' ? r.path : null
      if (!p) continue
      const root = realOrSelf(path.resolve(workspace, p))
      if (inside(roots[0], root)) {
        roots.push(root)
        continue
      }
      // A repo outside the workspace counts only inside a git checkout (its own, or a monorepo it is a package of),
      // so args cannot widen the roots to the home folder or /.
      const checkout = checkoutOf(root)
      if (checkout && !forbidden.has(root) && !forbidden.has(checkout) && !isFsRoot(root) && !isFsRoot(checkout)) roots.push(root)
    }
    const target = path.resolve(workspace, raw)
    const real = realOrSelf(target)
    // A target equal to a root, or holding its own .git, would hash a whole repository.
    if (roots.includes(real) || fs.existsSync(path.join(real, '.git'))) return { target, refused: 'repo' }
    const home = roots.find((root) => inside(root, real))
    if (!home) return { target, refused: 'outside' }
    const skipped = path.relative(home, real).split(path.sep).find((part) => ARTIFACT_SKIP.has(part))
    return { target, refused: skipped ? 'skipped' : null, skipped }
  }

  #artifactHash(run) {
    const artifact = this.#artifactOf(run)
    if (!artifact || artifact.refused) return null
    try {
      return hashPath(artifact.target)
    } catch {
      return null
    }
  }

  #startReview(run, n, correction) {
    const { state } = run
    const id = `review-${n}`
    if (!state.jobs[id]) {
      const result = JSON.stringify(state.result, null, 2) || 'null'
      const shown = result.length > 20000 ? `${result.slice(0, 20000)}\n... (truncated)` : result
      const prompt = [
        `Completion review of the "${state.name}" workflow run.`,
        'Check the reported outcome below against the files in the workspace and the execution evidence (run the checks you need). Do not trust the report text alone, and do not change any file.',
        'Answer PASS only when the outcome is real and complete. Answer CHANGES_REQUIRED when the work can be corrected, or BLOCKED when it cannot proceed. Give the reason in one or two sentences.',
        correction ? `Correction note from the user for this re-review:\n${correction}` : null,
        `Reported outcome (JSON):\n${shown}`,
      ].filter(Boolean).join('\n\n')
      state.jobs[id] = {
        id,
        kind: 'review',
        digest: null,
        occurrence: 0,
        phase: 'CompletionReview',
        label: `review:${n}`,
        prompt,
        agentType: 'outcomes-grader',
        schema: REVIEW_SCHEMA,
        tier: 'deep',
        effort: 'high',
        readOnly: true,
        status: 'queued',
        workerId: null,
        claim: null,
        acceptedClaim: null,
        outputJson: null,
        error: null,
      }
      state.order.push(id)
      state.reviews.push({ n, jobId: id, artifactSha256: this.#artifactHash(run), correction: correction || null, verdict: null, reason: null })
    }
    this.#save(run)
  }

  #fail(run, message) {
    const { state, mem } = run
    if (mem.dead) return
    mem.dead = true
    state.status = 'failed'
    state.error = message
    for (const job of Object.values(state.jobs)) if (OPEN.has(job.status)) job.status = 'failed'
    this.#save(run)
  }

  // `full` returns every log line (workflow_status); other calls carry the latest STATUS_LOG_TAIL lines.
  #status(run, full = false) {
    const { state } = run
    const omitted = full ? 0 : Math.max(state.logs.length - STATUS_LOG_TAIL, 0)
    const review = state.reviews.at(-1)
    return {
      id: state.id,
      name: state.name,
      status: state.status,
      phase: state.phase,
      jobs: state.order.map((jobId) => {
        const j = state.jobs[jobId]
        return { id: j.id, status: j.status, phase: j.phase, label: j.label, workerId: j.workerId }
      }),
      result: state.status === 'completed' ? state.result : null,
      error: state.error,
      logs: omitted ? state.logs.slice(-STATUS_LOG_TAIL) : state.logs,
      ...(omitted ? { logsOmitted: omitted } : {}),
      completionReview: review ? { jobId: review.jobId, n: review.n, verdict: review.verdict, reason: review.reason, status: state.jobs[review.jobId].status } : null,
    }
  }

  /** @returns {object} run status */
  status({ id }) {
    return this.#status(this.#run(id), true)
  }

  /**
   * Hands the next queued job (or a named queued job) to a worker with a 30-minute lease.
   * @returns {object} the job packet, or `{ job: null, reason }` when none can be handed out
   */
  claim({ id, workerId, jobId }) {
    const run = this.#run(id)
    const { state, mem } = run
    if (!ACTIVE_RUN.has(state.status)) return { job: null, reason: 'none-queued' }
    let job
    if (jobId) {
      job = state.jobs[jobId]
      if (!job) throw new Error(`Unknown job ${jobId} in run ${id}`)
      if (job.status !== 'queued') throw new Error(`Job ${jobId} is ${job.status}, not queued. Fix: claim a queued job, or call workflow_reconnect with release to requeue an expired one`)
    } else {
      job = state.order.map((k) => state.jobs[k]).find((j) => j.status === 'queued')
    }
    if (!job) return { job: null, reason: 'none-queued' }
    if (Object.values(state.jobs).filter((j) => HELD.has(j.status)).length >= state.maxActive) return { job: null, reason: 'max-active' }
    job.status = 'claimed'
    job.workerId = workerId
    job.claim = { token: crypto.randomBytes(24).toString('hex'), leaseExpiresAt: this.clock() + LEASE_MS }
    this.#save(run)
    let role
    try {
      role = mem.catalog.role(job.agentType, job.prompt)
    } catch {
      role = mem.catalog.role(undefined, job.prompt)
    }
    const guide = this.host.browserGuide
    const packet = {
      id,
      jobId: job.id,
      claim: job.claim.token,
      prompt: job.prompt,
      ...(job.schema ? { schema: job.schema } : {}),
      role: { name: role.name, instructions: role.instructions, preloadSkillPaths: role.preloadSkillPaths, rulePaths: role.rulePaths },
      tier: job.tier,
      effort: job.effort,
      readOnly: job.readOnly === null ? role.readOnly : job.readOnly,
      workspace: state.workspace,
    }
    if (guide && BROWSER_PHASES.has(job.phase) && !job.prompt.includes(guide)) packet.browserGuide = guide
    return packet
  }

  /**
   * Accepts a worker's output for a claimed job. Output that fails the job's schema is rejected with the
   * failing JSON Pointer and keyword, and the job stays claimed under the same token.
   * @returns {Promise<object>} run status
   */
  async submit({ id, jobId, claim, output }) {
    const run = this.#run(id)
    const { state, mem } = run
    const job = state.jobs[jobId]
    if (!job) throw new Error(`Unknown job ${jobId} in run ${id}`)
    const json = JSON.stringify(output === undefined ? null : output)
    if (job.status === 'completed') {
      if (job.acceptedClaim === claim && job.outputJson === json) return this.#status(run)
      throw new Error(`Job ${jobId} is already completed. Fix: call workflow_status for the run`)
    }
    if (!HELD.has(job.status) || !job.claim || job.claim.token !== claim) {
      throw new Error(`Claim token for job ${jobId} is wrong or stale. Fix: call workflow_claim or workflow_reconnect to get a current claim`)
    }
    // A work job may be answered with null: its agent() call then returns null, the failure value the workflows already handle.
    if (job.schema && !(output === null && job.kind === 'work')) {
      const errors = validate(job.schema, JSON.parse(json))
      if (errors.length) {
        const first = errors.slice(0, 5).map((e) => `${e.path || '/'} (${e.keyword})`).join(', ')
        throw new Error(`Output rejected by the job schema at ${first}. The job stays claimed under the same claim token: fix the output and call workflow_submit again`)
      }
    }
    job.status = 'completed'
    job.outputJson = json
    job.acceptedClaim = claim
    job.claim = null
    if (job.kind === 'review') this.#onReview(run, JSON.parse(json))
    this.#save(run)
    const resolve = mem.pending.get(job.id)
    if (resolve) {
      mem.pending.delete(job.id)
      resolve(json)
    }
    await settle()
    return this.#status(run)
  }

  #onReview(run, verdict) {
    const { state } = run
    const review = state.reviews.at(-1)
    review.verdict = verdict.verdict
    review.reason = verdict.reason
    state.status = verdict.verdict === 'PASS' ? 'completed' : 'blocked'
  }

  /** Renews a lease with the same worker id, or with `release` returns the job to the queue. */
  reconnect({ id, jobId, workerId, release }) {
    const run = this.#run(id)
    const job = run.state.jobs[jobId]
    if (!job) throw new Error(`Unknown job ${jobId} in run ${id}`)
    if (!HELD.has(job.status) || job.workerId !== workerId) {
      throw new Error(`Job ${jobId} is not held by worker ${workerId}. Fix: call workflow_status to see who holds it`)
    }
    if (release) {
      job.status = 'queued'
      job.workerId = null
      job.claim = null
    } else {
      job.status = 'claimed'
      job.claim.leaseExpiresAt = this.clock() + LEASE_MS
    }
    this.#save(run)
    return this.#status(run)
  }

  stop({ id, reason }) {
    const run = this.#run(id)
    const { state, mem } = run
    if (!ACTIVE_RUN.has(state.status) && state.status !== 'blocked') return this.#status(run)
    mem.dead = true
    state.status = 'stopped'
    state.error = reason || 'stopped'
    for (const job of Object.values(state.jobs)) if (OPEN.has(job.status)) job.status = 'failed'
    this.#save(run)
    return this.#status(run)
  }

  /**
   * Re-reviews a corrected report of a blocked run without re-running any implementation job.
   * @returns {object} run status
   */
  retryReview({ id, correction }) {
    const run = this.#run(id)
    const { state } = run
    if (state.status !== 'blocked') throw new Error(`Run ${id} is ${state.status}, not blocked. Fix: workflow_retry_review applies to a blocked run only`)
    const last = state.reviews.at(-1)
    const artifact = this.#artifactOf(run)
    const refusal = 'Fix: start a new run with workflow_start'
    if (!artifact) throw new Error(`Run ${id} reports no artifact path (reportPath, specFolder, adrPath, qaPlanPath or backlog.path, depending on the workflow) to re-review. ${refusal}`)
    if (artifact.refused === 'repo') throw new Error(`The artifact ${artifact.target} names a whole repository, not a report. Fix: point the result's artifact field at the report file, or start a new run with workflow_start`)
    if (artifact.refused === 'skipped') throw new Error(`The artifact ${artifact.target} lies in a ${artifact.skipped} folder, which is never hashed. Fix: point the result's artifact field at the report file, or start a new run with workflow_start`)
    if (artifact.refused) throw new Error(`The artifact ${artifact.target} lies outside the workspace and the repos given in args. ${refusal}`)
    let sha
    try {
      sha = hashPath(artifact.target)
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') throw new Error(`The artifact ${artifact.target} is missing. ${refusal}`)
      if (e.code) throw new Error(`The artifact ${artifact.target} cannot be read (${e.code}). Fix: make the report readable, or start a new run with workflow_start`)
      // The size, entry-count and file-type errors are the kit's own and carry their own fix.
      throw e
    }
    if (sha === last.artifactSha256) throw new Error(`The artifact ${artifact.target} has not changed since the failed review. Fix: correct the report first, or start a new run with workflow_start`)
    state.status = 'reviewing'
    this.#startReview(run, last.n + 1, correction)
    return this.#status(run)
  }

  /**
   * Replays a run after a server restart: completed jobs answer from disk, the rest are queued.
   * It refuses when the workflow file, the adapter revision or the stack context changed since the run started.
   * @returns {Promise<object>} run status
   */
  async resume({ id, workspace }) {
    const ws = this.#workspace(workspace)
    if (this.runs.has(id)) return this.#status(this.#run(id))
    const dir = path.join(ws, '.ai', 'workflow-runs', id)
    let state
    try {
      state = readJson(path.join(dir, 'state.json'))
    } catch {
      throw new Error(`No run ${id} in ${ws}. Fix: check the run id and the workspace, or call workflow_start`)
    }
    const refuse = (what) => new Error(`Cannot resume run ${id}: ${what}. Fix: call workflow_start to begin a new run`)
    if (!state || typeof state !== 'object' || state.version !== 1) throw refuse('its state file is not a run state this server wrote')
    if (state.id !== id) throw refuse(`its state file belongs to run ${state.id}`)
    if (state.workspace !== ws) throw refuse(`its state file belongs to the workspace ${state.workspace}`)
    if (!state.jobs || typeof state.jobs !== 'object' || !Array.isArray(state.order) || !Array.isArray(state.logs) || !Array.isArray(state.reviews)) {
      throw refuse('its state file is incomplete')
    }
    for (const jobId of state.order) {
      const job = state.jobs[jobId]
      const ok = job && job.id === jobId && typeof job.prompt === 'string' && typeof job.status === 'string'
        && (job.kind === 'work' ? jobId === `job-${sha256(`${job.digest}#${job.occurrence}`).slice(0, 16)}` : job.kind === 'review')
      if (!ok) throw refuse(`job ${jobId} in its state file is not valid`)
      if (job.status === 'completed') {
        let valid = typeof job.outputJson === 'string'
        try {
          if (valid && job.schema && !(job.kind === 'work' && job.outputJson === 'null')) valid = validate(job.schema, JSON.parse(job.outputJson)).length === 0
        } catch {
          valid = false
        }
        if (!valid) throw refuse(`job ${jobId} holds output that does not satisfy its schema`)
      }
    }
    const workflows = discoverWorkflows(this.runtime.workflowsDir)
    if (!Object.hasOwn(workflows, state.name)) throw refuse(`the workflow ${state.name} is no longer installed`)
    const bytes = fs.readFileSync(workflows[state.name])
    if (sha256(bytes) !== state.workflowSha256) throw refuse(`the workflow file changed (recorded ${short(state.workflowSha256)}, now ${short(sha256(bytes))})`)
    const revision = adapterRevision(this.runtime)
    if (revision !== state.adapterRevision) throw refuse(`the adapter revision changed (recorded ${state.adapterRevision}, now ${revision})`)
    const change = describeContextChange(state.stackContext, this.#context(ws, state.args))
    if (change) throw refuse(`the stack context changed: ${change}`)
    acquireLock(dir, this.pid, this.alive)
    const run = this.#register(state, dir)
    if (state.status === 'running') this.#execute(run, bytes.toString('utf8'), workflows[state.name])
    await settle()
    return this.#status(run)
  }

  /** The role text, preload skill paths and rule paths a job packet for this agent would carry. */
  agentInstructions({ name, workspace }) {
    const ws = this.#workspace(workspace)
    const catalog = this.#catalog(ws)
    const role = catalog.role(name)
    return { name: role.name, instructions: role.instructions, preloadSkillPaths: role.preloadSkillPaths, rulePaths: role.rulePaths }
  }

  /** Read-only view of the overlay manifests in scope; approval is never offered here. */
  stackList({ workspace }) {
    const ws = this.#workspace(workspace)
    const overlays = discoverOverlays({ workspace: ws, host: this.host, homeDir: this.homeDir, firstParty: this.stacks.entries || {} })
    return {
      manifests: overlays.map((o) => ({
        source: o.source,
        keys: o.keys,
        commands: o.commands,
        sha256: o.sha256,
        trusted: o.trusted,
        ...(o.rejected ? { rejected: o.rejected } : {}),
      })),
    }
  }
}
