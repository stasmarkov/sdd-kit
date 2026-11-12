---
name: simple-task
description: Execute a small-to-medium task (bug fix, small feature, refactor, safe symbol rename, or research-only question) in a single context window — investigate, clarify if ambiguous, implement test-first, run the verification gates, and leave a resumable task log. Use when the change touches roughly three files or fewer (the same XS threshold as /sdd and write-spec) and needs no formal spec; escalates to /write-spec when complexity thresholds are exceeded.
argument-hint: "[task-description] | --continue=TASK-ID | --research-only | --rename | --no-tests | --force"
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion, WebFetch, WebSearch
metadata:
  mcp-tools: "context7"
  version: "2.1"
  subagents: "code-explorer, test-writer, code-quality, the repo's stack specialist (agent.name)"
  checkpoint_enabled: "true"
---

# /simple-task

Execute small-to-medium tasks in a single context window. Automatically handles investigation, implementation, and verification with smart routing.

See the routing guide in the `sdd` skill (`references/routing-guide.md`) for when to use this instead of `/sdd` or `/write-spec`.

---

## Usage

```bash
# Bug fix
/simple-task "Fix the 500 error when user submits empty form on /checkout"

# Small feature
/simple-task "Add created_at column to orders export CSV"

# Refactor
/simple-task "Extract email sending logic from UserController to EmailService"

# Research only (no implementation)
/simple-task "How should we implement rate limiting?" --research-only

# Symbol rename (Serena when available, otherwise a Grep-driven rename)
/simple-task --rename "OrderService to OrderProcessingService"

# Resume after context reset
/simple-task --continue=TASK-0042

# Force proceed despite complexity threshold
/simple-task "Add user authentication with 2FA" --force
```

---

## Workflow

The workflow adapts based on task clarity and complexity.

### Fast Path (clear task, < 3 files)

For unambiguous tasks like "fix null check in UserService line 42":

```
Investigate → Implement (TDD) → Verify → Summarize
```

Skip optimization, clarification, and plan confirmation. Go straight to work.

### Standard Path (needs investigation)

```
Investigate → Clarify (if ambiguous) → Plan & Confirm → Implement (TDD) → Verify → Summarize
```

### Research Path (--research-only)

```
Investigate → Compare approaches → Document findings
```

---

## Phase Details

### Investigate

Search the codebase for relevant files and prior work (`.ai/tasks/`, `.ai/specs/`), then assess complexity.

```bash
# Search for related code
grep/glob for keywords from task description

# Check earlier task logs and specs for related work
ls .ai/tasks/ .ai/specs/

# Fetch framework docs if needed (context7)
```

**Complexity check** — if task exceeds thresholds, suggest escalation:

| Metric | Threshold | Action if Exceeded |
|--------|-----------|-------------------|
| Files affected | 3 (a `--rename` may touch more: it is mechanical) | Suggest /write-spec |
| New files | 3 | Suggest /write-spec |
| Migrations | 1 | Suggest /write-spec |
| API endpoints | 2 | Suggest /write-spec |

Use `--force` to proceed anyway.

### Rename (`--rename "Old to New"`)

- **With Serena** (optional MCP server, when the session has it): use its symbol rename, which updates references by meaning rather than by text.
- **Without it** (the default): Grep every occurrence of the old name: class and file names, `use` imports, container bindings and config keys, route names, string references (`'App\\Services\\Old'`, Blade or dynamic imports), tests, and docs. Rename the file with `git mv`, edit each occurrence, then Grep again until the old name only appears where it should (changelog, migrations already run).
- Either way, run the full gates afterward: the types and lint gates catch most missed references, and the tests catch the rest.

### Clarify (conditional)

**Skip when**: Task is unambiguous, single file, obvious scope.
**Ask when**: Multiple valid approaches, unclear scope, key design decisions.

Ask 2-4 essential questions max. During implementation, pause and ask if blocked by unclear requirements.

### Plan & Confirm (standard path only)

```
Implementation Plan

Files to Modify:
  - path/to/file (modify)
  - path/to/new-file (create)

Approach:
  1. Step one
  2. Step two

Proceed? [Yes] [Modify] [Abort]
```

### Implement (TDD)

1. **RED**: Write failing tests
2. **GREEN**: Implement minimal code to pass
3. **REFACTOR**: Improve if beneficial

If blocked during implementation, pause and ask rather than guessing.

### Verify

Run the gates from the `verification-gates` skill.

### Summarize & Persist

**Task log** (for medium+ complexity): `.ai/tasks/TASK-{NNNN}-{slug}.md`
**Skip task log** for trivial fixes (single-file, < 10 lines changed).

```
Task Complete: TASK-{NNNN}

Summary: {what was done}

Files Changed ({N}):
  + new-file (new)
  ~ modified-file (modified)

Tests: {N} passing

Next Steps: {if any}
```

---

## Task Log Format

Location: `.ai/tasks/TASK-{NNNN}-{slug}.md`

```markdown
# TASK-{NNNN}: {Title}

## Quick Reference
- **Created**: {date}
- **Status**: completed
- **Files Modified**: {count}

## Task
{Original request}

## Implementation
| File | Action | Description |
|------|--------|-------------|
| path/to/file | created/modified | what was done |

## Verification
- [x] Tests passing
- [x] Code style (formatter)
- [x] Static analysis (types gate)
- [x] No debug statements

---
**Resumable**: /simple-task --continue=TASK-{NNNN}
```

---

## Resume

```bash
/simple-task --continue=TASK-0043
```

Reads `.ai/tasks/TASK-0043-*.md`, shows status and context, continues from last phase.

---

## Subagent Usage

| Phase | Subagent | When |
|-------|----------|------|
| Investigate | code-explorer | Broad codebase search needed |
| Implement | the repo's stack specialist: `agent.name` from its stack entry (the `verification-gates` recipe, including its trust and `extends` rules), tried bare and then, on Claude Code, as `<agent.plugin>:<agent.name>` | No specialist resolves: work directly and say once `specialist <name> not available; building in this session` |
| Implement | test-writer | TDD test creation |
| Verify | code-quality | Verification gates |

For single-file edits and quick lookups, work directly rather than delegating.

**Source Verification**: Follow the `source-verification` skill.

