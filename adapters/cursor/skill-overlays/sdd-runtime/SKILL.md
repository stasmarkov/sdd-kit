---
name: sdd-runtime
description: "How to run the kit's background workflows and specialist agents on this host through the sdd-kit MCP bridge. Use when a skill says to run a workflow (ship-feature, fix-bug, create-spec, tech-research, qa-and-docs, greenfield-build, security-audit) or to delegate to an agent, when a workflow job needs a worker, or when a run must be resumed, stopped or reviewed."
user-invocable: false
metadata:
  version: "1.0"
---

# sdd-runtime

This host has no built-in background workflow runner. The kit supplies one through the `sdd-kit` MCP server (the bridge): it runs the workflow script, queues its jobs, and hands each job to you as a packet. You do the jobs; the bridge keeps the state, checks the output against each job's schema and decides what runs next.

## Running a workflow

1. Call `workflow_start` with `name` (the workflow's name, for example `ship-feature`), `workspace` (the absolute path of the project) and `args` (what the skill collected: a description, a spec reference, repos). An unknown name is refused with the valid names.
2. Call `workflow_claim` with the run `id` and a `workerId` of your choosing. It returns a job packet, or `{ job: null, reason }`. With `none-queued`, call `workflow_status` and look at the run state; with `max-active`, finish a held job first.
3. Do the job. The packet carries `prompt`, `role`, `schema`, `readOnly`, `workspace` and sometimes `browserGuide`. Use a subagent for the job when the host offers one (the kit's agents are installed as `.cursor/agents/<name>.md`), and give it the whole packet: it must read the agent file named at the top of `role.instructions` first, then follow the prompt. Keep work inside `workspace`. When `readOnly` is true, change no file.
4. Call `workflow_submit` with `id`, `jobId`, the packet's `claim` token and `output` shaped as `schema` says (plain text when there is no schema). A rejected output names the failing JSON Pointer; fix it and submit again. If you cannot produce valid output for a work job, submit `null`: the workflow treats it as a failed step. A completion review job does not accept `null`.
5. Repeat from step 2 until `workflow_status` shows `done`, `failed` or `blocked`. A job lease lasts 30 minutes: renew it with `workflow_reconnect` at least every 10 minutes while a long job runs. Run independent jobs in parallel only up to the run's `maxActive`.
6. Report the run's `result` to the user, with the report path when the workflow wrote one.

`workflow_resume` continues a stored run after the server restarted and refuses when the workflow file, the bridge or the stack context changed (start a new run then). `workflow_stop` fails the open jobs of a run. `workflow_retry_review` re-runs the completion review of a blocked run once its report is corrected.

A run that ends `blocked` by its completion review is not done: show the findings, fix the report or the code, and use `workflow_retry_review`.

## Running an agent

An agent call in a skill names a role, for example `code-explorer`. Call `agent_instructions` with the name and `workspace` to get the role text, the skill files to read first and the rule files that apply. Then do the work yourself, or hand it to the subagent of the same name in `.cursor/agents/`, and return only what the skill asks for. The role file is the shared agent Markdown file; read it before acting on the role.

## Approvals

Overlay stack manifests (stacks a project declares itself) run their gate commands only after a human approved the exact manifest. `stack_list` shows each manifest and its trust state, read-only. The bridge has no tool that records an approval, and you must not record one for the user. When `stack_list` shows an untrusted manifest, tell the user to run the `stack-trust` skill (`/stack-trust`), which shows the commands and asks. Then start the run again.

## Browser steps

Use the tools of the `playwright` MCP server (names start with `mcp__playwright__`). When the packet has a `browserGuide`, follow it. If the server is not available, report the browser check as not run; never report it as passed.
