---
name: execute-task
description: Execute an approved spec's tasks one at a time with TDD, verification gates, AC-to-test traceability, and session state for cross-session resumption. Use when a spec exists under .ai/specs/ and the user wants to build it task by task (/execute-task --spec=PROJ-123), resume after a context reset, or re-verify a task.
argument-hint: "--spec=<folder | number | ticket key | timestamp id> | --continue | --task=[number] | --auto-continue | --verify-only"
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
metadata:
  mcp-tools: "context7"
  version: "2.2"
  subagents: "test-writer, code-quality, each repo's stack specialist (agent.name from the stack manifest)"
  checkpoint_enabled: "true"
  last_verified: "2026-11-11"
  next_review: "2027-02-11"
---

# Execute Task Command

Execute spec tasks one at a time with verification gates between each task. Maintains session state for cross-session resumption.

---

## Usage

```bash
# Execute next incomplete task from spec (any spec reference form works)
/execute-task --spec=PROJ-123
/execute-task --spec=spec-20261018-1430-order-pdf-export
/execute-task --spec=spec-PROJ-123-refund-guard

# Continue from where you left off (after context reset/new session)
/execute-task --spec=spec-PROJ-123-refund-guard --continue

# Execute specific task number
/execute-task --spec=spec-PROJ-123-refund-guard --task=3

# Run remaining tasks back-to-back, stopping on the first failure
/execute-task --spec=spec-PROJ-123-refund-guard --auto-continue

# Unattended: keep going until the spec is done (built-in /goal)
/goal every task in .ai/specs/spec-PROJ-123-refund-guard/tasks.md is checked and the verification gates pass

# Verify without executing
/execute-task --spec=spec-PROJ-123-refund-guard --verify-only

# List all specs and progress
/execute-task --list
```

---

<task_workflow>

## Workflow

```
Load State → Find Next Task → Load Context → Execute (TDD) → Verify → Update → Continue/Pause
```

### Step 1: Load or Create Session

**State file**: `.ai/session/<spec-folder>-state.json` (legacy `spec-{number}-state.json` files are still read)

```json
{
  "spec_id": "spec-PROJ-123-refund-guard",
  "spec_folder": "spec-PROJ-123-refund-guard",
  "current_task": 3,
  "total_tasks": 8,
  "completed_tasks": [1, 2],
  "last_updated": "2025-01-15T14:30:00Z",
  "resume_hint": "Completed PaymentIntentService, next is controller implementation",
  "repos": [
    { "path": ".", "key": "<stack key>", "role": "backend", "specialist": "<agent.name or none>" }
  ]
}
```

On `--continue`: read state, show resume summary, identify next task.

### Step 2: Resolve the Spec Folder

`--spec` accepts a full folder name, a legacy number (`0042`, `spec-0042`, `14`), a ticket key (`PROJ-123`), or a timestamp id (`20261018-1430`):

```bash
REF="${REF#.ai/specs/}"; REF="${REF%/}"; KEY="${REF#spec-}"
if [ -d ".ai/specs/$REF" ]; then echo ".ai/specs/$REF"
elif printf '%s' "$KEY" | grep -qE '^[0-9]+$'; then
  ls -d .ai/specs/*/ | grep -E "/(spec-)?0*$((10#$KEY))-"
else
  ls -d .ai/specs/*/ | grep -iE "/(spec-)?${KEY}-"
fi
```

Several matches (e.g. two specs for one ticket, or legacy duplicate numbers) → list them and ask which one. None → stop and suggest `/write-spec`.

**Approval check** — read `status` in the spec-lite.md frontmatter:
- `draft` → the spec has not been approved. Say so (and list unchecked Open questions); continue only if the user explicitly confirms, otherwise point to `/sdd <spec>`.
- `approved` → set it to `in-progress` before the first task.
- No frontmatter (legacy spec) → proceed.

Also read `type` from the frontmatter: `refactor` changes Step 5 (characterization tests go green first, no RED step).

### Step 3: Parse tasks.md

Check the gates first: run `node ${CLAUDE_SKILL_DIR}/../write-spec/scripts/spec-lint.mjs --gates <spec-folder>`. A gate is a task whose title after `N. ` starts with `Gate:`; only the owner checks it, and the first unchecked gate blocks every task after it. If the command still shows the literal `${CLAUDE_SKILL_DIR}`, never run it (no Bash command may hold a variable in braces); run the first copy that exists instead: `.claude/skills/write-spec/scripts/spec-lint.mjs` (project install), then `<config>/skills/write-spec/scripts/spec-lint.mjs` with the user config directory written out (`--user` install).

Trust only this output, one line each:
- `build: <N>. <title>` for each unchecked task before the first unchecked gate,
- then `awaiting owner: <gate title>` and exit 3, or `gates: clear` and exit 0.

The next task is the first `build:` line, never a gate; exit 0 with no `build:` line means no task remains. `--task=N`, `--continue` and `--auto-continue` select only from the `build:` lines too: when task N (or the task in the session state) is not one of them, refuse it and report `not buildable: task <N>`, adding `awaiting owner: <gate title>` when it is the gate or a task after it. On exit 3 with no `build:` line, stop before any task and report `awaiting owner: <gate title>`; with `--auto-continue`, stop after the last `build:` task the same way. Fail closed: when no copy exists, the exit code is anything other than 0 or 3, or the output has any other line, stop and report `gate check unavailable: <reason>` without building a task. Never check a gate yourself.

### Step 4: Resolve Repos & Load Context

**Repos and stacks.** Take the repos the task touches from the spec's tasks and boundaries; when they name none, use the "Repos and stack keys" rule of the `verification-gates` skill. Resolve each repo's stack entry once with that skill's recipe, including its trust and `extends` rules, and record `repos: [{path, key, role, specialist}]` in the session state (`role` from the entry's `role`, `specialist` from its `agent.name`, or `none`). On `--continue`, reuse the recorded `repos` unless the task touches a repo that is not in it; a state file without `repos` is resolved again.

**Context.** Classify the task to pick what to load:

| Task Type | Keywords | Context to Load |
|-----------|----------|-----------------|
| database | migration, schema, table | Schema docs |
| api | endpoint, route, handler | Endpoint patterns from the stack's conventions skill |
| service | service, business logic | Service patterns from the stack's conventions skill |
| test | test, testing | Test patterns |
| frontend | component, page, view | UI patterns from the stack's conventions skill |

Load only relevant context to minimize token usage.

### Step 5: Execute Task (TDD)

1. **RED**: Write failing tests first, named or tagged with the AC/MNC/NFR ids the task covers. An NFR is built against like an AC: an authorization NFR gets a test per role, a performance NFR a measured check against its target, an accessibility NFR an axe assertion
2. **GREEN**: Implement minimal code to pass
3. **REFACTOR**: Improve while keeping tests green

**`type: refactor` specs** follow the green-first pattern fix-bug uses for its guard tests:
- **Characterization task** (task 1, covering MNC ids): write tests that pin today's behavior, run them against the unchanged code, and require them to **pass**. A characterization test that fails has found that the code does not do what the MNC item says: stop and ask whether the spec or the code is right. Never change production code in this task.
- **Restructuring tasks**: no RED step. Move code with the characterization tests green before, during, and after; never edit them. A task with a structural AC (e.g. "`OrderService` has no pricing logic") may add an architecture test for it, which fails first as usual.

`test-writer` writes the RED tests with the manifest's unit and e2e tools.

For GREEN, delegate each touched repo to the agent its stack entry names in `agent.name`: try the bare name first, then, on Claude Code, `<agent.plugin>:<agent.name>` when `agent.plugin` is set. Only a first-party entry, a trusted overlay, or an extending overlay resolved by the `verification-gates` rule supplies the name. Key `other`, the name `general-purpose`, and a non-extending overlay that is rejected, untrusted or unchecked have no specialist. When there is no specialist or the name does not resolve, build in this session and say once `specialist <name> not available; building in this session`. A task that spans several repos is delegated per repo, one call each, in ascending `order` of their entries (so a backend role goes before a frontend one).

### Step 6: Verification Gates

Delegate the gates to the `code-quality` agent: one verification step, one agent. It runs every gate from `skills/verification-gates/SKILL.md` that applies to the repos the task touched (tests included), auto-fixes only formatter-class issues, and returns pass/fail per gate with condensed failure analysis. If the `code-quality` agent is not installed, run the same `verification-gates` set in this session and report it in the same per-gate format; never skip the step.

Save verification report to `.ai/verification/<spec-folder>/task-{n}-{timestamp}.md` (timestamp from `date +%Y%m%d-%H%M`).

### Step 7: Update State

**On success:**
- Mark task complete in `tasks.md` (`- [ ]` → `- [x]`)
- In the tasks.md **Traceability** table, set "Verified by" for the AC/MNC/NFR ids this task covers to the real test (`file::test name`)
- Update session state JSON
- Update `resume_hint` with context for next session

**On failure:**
- Keep task incomplete
- Log failure in state
- Stop execution

### Step 8: Continue or Pause

```
No remaining tasks → every Traceability row verified? gates green? → set status: done (and the backlog slice to shipped, below) → "ALL TASKS COMPLETE" → Next: /deep-review --spec=<spec-folder>, then /open-pr --spec=<spec-folder>
--auto-continue    → Execute next task; stop on the first failed gate
Default            → Pause, show next task info
```

**Backlog slice.** When spec-lite.md has a `slice:` (a product-brief backlog slice), find the `backlog.md` next to `product-brief.md` (the repo root or its parent) and set that slice's `Status:` to `shipped` in the same step that sets the spec to `done`. Change nothing else in the backlog.

`--auto-continue` stays inside one session and stops on failure. For "keep working until the whole spec is green", don't build a retry loop here — set a goal with the built-in `/goal` (e.g. `/goal every task in .ai/specs/<spec>/tasks.md is checked and the verification gates pass`) and run `/execute-task --spec=<ref> --continue`; Claude keeps going until the condition holds.

</task_workflow>

---

## Resume After Context Reset

When running with `--continue`:

```
Resuming Spec: Payment Intent System
Progress: 2/8 tasks complete (25%)
Last activity: 4 hours ago
Last completed: Task 2 (Service Layer)
Resume hint: "Completed PaymentIntentService, next is controller"

Next Task: Task 3 - API Controller Implementation

Ready to continue? [Yes] [Show task details] [Start over]
```

---

<subagent_guidance>

## Subagent Usage

| Task Type | Subagent | Purpose |
|-----------|----------|---------|
| Tests | test-writer | Write failing tests (RED phase); characterization tests that pass on today's code for `type: refactor` |
| Implementation | each repo's stack specialist (agent.name) | GREEN phase, one call per repo |
| Verification | code-quality | Run every applicable gate, tests included, and report per gate |

Use subagents when tasks can run in parallel or require isolated context. For simple single-file tasks, work directly.

</subagent_guidance>

## Output Format

```
Execute Task: Spec {ID} - {Name}
Progress: {bar} {completed}/{total} ({percent}%)

Current Task: {N}. {Description}

RED Phase: {test files created, test count}
GREEN Phase: {implementation files, tests passing}
REFACTOR Phase: {changes if any}

Verification Gates: {pass/fail for each}

Task {N} COMPLETE
Session state saved.
Next: Task {N+1} - {description}
```

After the last task: `ALL TASKS COMPLETE` and `Next: /deep-review --spec=<spec-folder>`, then `/open-pr --spec=<spec-folder>`.

---

## Error Recovery

### Verification Failed
```bash
# Check report, fix issues, re-run specific task
/execute-task --spec=spec-PROJ-123-refund-guard --task=3
```

### Context Lost Mid-Task
```bash
# Session state tracks progress
/execute-task --spec=spec-PROJ-123-refund-guard --continue
```

### Corrupted State
```bash
# Delete state, re-detect from tasks.md checkboxes
rm .ai/session/<spec-folder>-state.json
/execute-task --spec=spec-PROJ-123-refund-guard
```

---

**Source Verification**: Follow rules in `skills/source-verification/SKILL.md`

**Version**: 2.0
**Stage**: Execution
