// The bridge's MCP tools: host-neutral descriptions and the input schema of each tool.
// The inputs are validated with schema.mjs before a handler runs. docs/workflow-bridge.md has the tool table.
import { MAX_ACTIVE_LIMIT } from './limits.mjs'

const RUN_ID_SCHEMA = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' }
const MAX_ACTIVE_SCHEMA = { type: 'integer', minimum: 1, maximum: MAX_ACTIVE_LIMIT }

const WORKFLOW_START_SCHEMA = {
  type: 'object',
  required: ['name', 'workspace'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    workspace: { type: 'string', pattern: '^/' },
    args: {},
    maxActive: MAX_ACTIVE_SCHEMA,
  },
}

const WORKFLOW_CLAIM_SCHEMA = {
  type: 'object',
  required: ['id', 'workerId'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    workerId: { type: 'string', minLength: 1 },
    jobId: { type: 'string', minLength: 1 },
  },
}

const WORKFLOW_SUBMIT_SCHEMA = {
  type: 'object',
  required: ['id', 'jobId', 'claim', 'output'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    jobId: { type: 'string', minLength: 1 },
    claim: { type: 'string', minLength: 1 },
    output: {},
  },
}

const WORKFLOW_STATUS_SCHEMA = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
  },
}

const WORKFLOW_RESUME_SCHEMA = {
  type: 'object',
  required: ['id', 'workspace'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    workspace: { type: 'string', pattern: '^/' },
  },
}

const WORKFLOW_RECONNECT_SCHEMA = {
  type: 'object',
  required: ['id', 'jobId', 'workerId'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    jobId: { type: 'string', minLength: 1 },
    workerId: { type: 'string', minLength: 1 },
    release: { type: 'boolean' },
  },
}

const WORKFLOW_STOP_SCHEMA = {
  type: 'object',
  required: ['id', 'reason'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    reason: { type: 'string' },
  },
}

const WORKFLOW_RETRY_REVIEW_SCHEMA = {
  type: 'object',
  required: ['id', 'correction'],
  additionalProperties: false,
  properties: {
    id: RUN_ID_SCHEMA,
    correction: { type: 'string', minLength: 1 },
  },
}

const AGENT_INSTRUCTIONS_SCHEMA = {
  type: 'object',
  required: ['name', 'workspace'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    workspace: { type: 'string', pattern: '^/' },
  },
}

const STACK_LIST_SCHEMA = {
  type: 'object',
  required: ['workspace'],
  additionalProperties: false,
  properties: {
    workspace: { type: 'string', pattern: '^/' },
  },
}

export const TOOLS = [
  {
    name: 'workflow_start',
    description: 'Start a run of an installed workflow by name. Returns the run status with the first queued jobs; it does not wait for any job. An unknown name is refused with the list of valid names.',
    inputSchema: WORKFLOW_START_SCHEMA,
    method: 'start',
  },
  {
    name: 'workflow_claim',
    description: 'Claim the next queued job of a run for a worker (or one named job). Returns the job packet with a claim token and a 30-minute lease, or { job: null, reason } when no job can be handed out. It never waits.',
    inputSchema: WORKFLOW_CLAIM_SCHEMA,
    method: 'claim',
  },
  {
    name: 'workflow_submit',
    description: 'Submit a worker\'s output for a claimed job with its claim token. Output that fails the job schema is rejected with the failing JSON Pointer and keyword, and the job stays claimed so the worker can resubmit. A worker that cannot produce valid output submits null for a work job: its agent() call then returns null, which the workflows treat as a failed step. A completion review job does not accept null.',
    inputSchema: WORKFLOW_SUBMIT_SCHEMA,
    method: 'submit',
  },
  {
    name: 'workflow_status',
    description: 'Report a run: its state, phase, jobs, logs, result and completion review. It answers at once, whatever the jobs are doing.',
    inputSchema: WORKFLOW_STATUS_SCHEMA,
    method: 'status',
  },
  {
    name: 'workflow_resume',
    description: 'Continue a stored run after the server restarted: completed jobs are answered from disk and the rest are queued. Refuses when the workflow file, the adapter revision or the stack context changed, and suggests workflow_start.',
    inputSchema: WORKFLOW_RESUME_SCHEMA,
    method: 'resume',
  },
  {
    name: 'workflow_reconnect',
    description: 'Renew the lease of a job held by a worker (at least every 10 minutes while it runs). With release set, an expired or abandoned job returns to the queue.',
    inputSchema: WORKFLOW_RECONNECT_SCHEMA,
    method: 'reconnect',
  },
  {
    name: 'workflow_stop',
    description: 'Stop a run. Its open jobs fail and no further job is queued.',
    inputSchema: WORKFLOW_STOP_SCHEMA,
    method: 'stop',
  },
  {
    name: 'workflow_retry_review',
    description: 'Re-run the completion review of a blocked run after its report was corrected. No implementation job runs again. Refused when the report is unchanged, missing or outside the workspace.',
    inputSchema: WORKFLOW_RETRY_REVIEW_SCHEMA,
    method: 'retryReview',
  },
  {
    name: 'agent_instructions',
    description: 'Return the role text, preload skill paths and rule paths that a job packet for the named agent carries. Refused for an unknown agent or one that belongs to an untrusted overlay add-on.',
    inputSchema: AGENT_INSTRUCTIONS_SCHEMA,
    method: 'agentInstructions',
  },
  {
    name: 'stack_list',
    description: 'List the overlay stack manifests in scope with their source, commands, sha256 and trust state. Read-only: approving a manifest is a human action in the stack-trust command.',
    inputSchema: STACK_LIST_SCHEMA,
    method: 'stackList',
  },
]
