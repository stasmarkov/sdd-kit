# Workflow bridge

Claude Code runs the kit's background workflows with its own `Workflow` tool. Hosts without that tool run the same unmodified workflow files through the bridge: a stdio MCP server (`src/adapters/bridge/server.mjs`) that turns every `agent()` call into a job the host hands to one of its own subagents.

The bridge never awaits a job. A host starts a run, claims jobs, runs each one in a subagent and submits the output; the script advances when the output is accepted.

## How a run works

1. `workflow_start` takes a workflow name from the installed workflows directory. Names come from `meta.name` in each file, so there is no list to maintain; any other name is refused with the valid ones.
2. The engine runs the shipped file in `node:vm` and hashes its exact bytes. `Date.now`, `Date` and `Math.random` throw `DeterminismError` naming the call, and the run fails with that message.
3. Each `agent()` call becomes a job. Its key is the sha256 of the JSON array `[prompt, options]` (option keys sorted) plus its occurrence, the nth call with that digest.
4. `workflow_claim` hands a queued job to a worker with a claim token and a 30-minute lease. `workflow_submit` validates the output against the job schema and resolves the `agent()` call.
5. When the script returns, a mandatory CompletionReview job asks the read-only `outcomes-grader` role for `{ verdict, reason }`. Only `PASS` completes the run.

Run state lives in `.ai/workflow-runs/<runId>/` (directories 0700, files 0600, atomic writes, a pid lock per run, and a `.gitignore` of `*`).

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `workflow_start` | `{ name, workspace (absolute), args?, maxActive? }` | run status |
| `workflow_claim` | `{ id, workerId, jobId? }` | job packet, or `{ job: null, reason: "none-queued" \| "max-active" }` |
| `workflow_submit` | `{ id, jobId, claim, output }` | run status |
| `workflow_status` | `{ id }` | run status |
| `workflow_resume` | `{ id, workspace }` | run status |
| `workflow_reconnect` | `{ id, jobId, workerId, release? }` | run status |
| `workflow_stop` | `{ id, reason }` | run status |
| `workflow_retry_review` | `{ id, correction }` | run status |
| `agent_instructions` | `{ name, workspace }` | `{ name, instructions, preloadSkillPaths, rulePaths }` |
| `stack_list` | `{ workspace }` | `{ manifests: [{ source, keys, commands, sha256, trusted, rejected? }] }` |

`workflow_submit` takes `output: null` for a work job, not a review job: the job completes and its `agent()` call resolves with null, so a script must handle a null answer. A review job needs an object that matches its schema.

`workflow_stop` on a run that is already `completed`, `failed` or `stopped` leaves it unchanged and returns its status.

The input schemas are in `src/adapters/bridge/tools.mjs` and are checked by `tools/test/fixtures/schema-validate/bridge-tools.json`. `maxActive` defaults to 3 and is at most 16; it bounds how many jobs are claimed at once.

The run status is `{ id, name, status, phase, jobs[{ id, status, phase, label, workerId }], result, error, logs, logsOmitted?, completionReview }`. Every call except `workflow_status` returns only the latest 20 log lines, and `logsOmitted` is the number of older lines left out; `workflow_status` returns the full log. Run states are `running`, `reviewing`, `completed`, `blocked`, `failed` and `stopped`; job states are `queued`, `claimed`, `expired`, `completed` and `failed`.

There is no tool that approves a stack manifest. `stack_list` is read-only; approval stays a human action in the stack-trust command with `--host <host>`.

## Job packets

```json
{
  "id": "<runId>", "jobId": "job-...", "claim": "<token>", "prompt": "...", "schema": {},
  "role": { "name": "code-explorer", "instructions": "...", "preloadSkillPaths": [], "rulePaths": [] },
  "tier": "standard", "effort": "medium", "readOnly": true, "browserGuide": "...", "workspace": "/abs/path"
}
```

- `role.instructions` is the full agent body. Agents resolve from the core agents, the first-party add-on agents and the overlay add-ons whose manifest is trusted; an unresolved specialist falls back to the default agent, with the single log line the runtime writes. Agents of an untrusted overlay add-on are never resolved and their text never reaches a packet.
- `rulePaths` lists the rules whose `paths` globs match a file named in the prompt or tracked in the repo, plus every rule without `paths`.
- `tier` and `effort` replace model names: the host picks its own model for the tier.
- `readOnly` is advisory text for the worker. Cursor maps it to a read-only subagent; Codex cannot enforce it.
- `browserGuide` is present for browser phases when the prompt does not already carry the host's guide. It names the host's Playwright tools, and the step is "not run" when they are missing, never a pass.

## Claims and leases

A claim token is random. The parent renews it with `workflow_reconnect` and the same `workerId` at least every 10 minutes while the subagent runs. A submission with the right token after the lease expired is still accepted, until the job is released. An expired lease moves the job to `expired`; it returns to the queue only when the parent calls `workflow_reconnect` with `release: true`. `workflow_stop` fails every open job, queued, claimed or expired, and nothing requeues them. The bridge never redispatches a claimed job by itself.

Output that fails the job schema is rejected with an error naming the JSON Pointer and keyword, and the job stays claimed under the same token. A wrong or stale token is rejected without changing the job. Submitting the exact output already accepted for a claim returns the current status.

## Resume

After the server restarts, `workflow_resume` replays the script, answers each completed job from disk and queues the rest. It refuses, naming what changed and suggesting `workflow_start`, when any of these differ from the values recorded at start:

- the sha256 of the shipped workflow file;
- the adapter revision: the kit version plus the sha256 over every `*.mjs` file under the installed `bridge/` folder and the shared `lib/` folder beside it;
- the stack context: repo paths and stack keys found from the markers in `stacks.json`, including the repos listed in `args.repos` (strings or `{ path }` values), so a stack marker added to one of them makes resume refuse, the sha256 of every overlay manifest in scope and each one's trust state. The bridge computes it itself, before and independent of the Detect job.

A lock held by another live pid makes `workflow_resume` fail with a message naming the pid; a lock whose pid is gone is reclaimed.

## Completion review

A blocked run (`CHANGES_REQUIRED` or `BLOCKED`) moves on only through `workflow_retry_review`. It needs a changed artifact: the artifact field of the result, inside the workspace or inside a repo given in `args.repos`. A repo outside the workspace counts only when it sits in a git checkout (its own or a monorepo's) that is not the home folder or `/`. A path that is the workspace, an `args.repos` root or any folder holding a `.git` entry names a whole repository and is refused, and so is a `node_modules`, `vendor` or `.git` folder. A folder artifact is hashed with those three folders skipped; build output and `.ai/` notes inside it count. A missing artifact, one over 32 MiB or 20000 entries, and one that is not a regular file or folder are each refused with their own message. The bridge compares the artifact's sha256 with the one recorded at review time, queues a new review with the correction note appended, keeps every earlier verdict and runs no implementation job again. The field depends on the workflow: `reportPath` for ship-feature and fix-bug (when it is present in the result, even null, no other field is tried), `specFolder` for create-spec, `adrPath` for tech-research, `qaPlanPath` for qa-and-docs and `backlog.path` for greenfield-build. An unchanged, missing or outside artifact is refused; start a new run instead.

## Limits

- `budget.total` and `budget.remaining()` report 0 on a bridge host, so budget branches in the workflows do not trigger.
- The script has no clock or randomness; pass dates and ids in through `args` or ask an agent.
- Claude Code does not use the bridge. Its generated prompts, schemas and verdicts are unchanged, and the host reaches the runtime only through the `sddHost` global that the bridge injects.
