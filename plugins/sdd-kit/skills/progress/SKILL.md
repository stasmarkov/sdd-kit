---
name: progress
description: Use when resuming work and asking where was I or what next. Shows per-spec task progress and the next task; --health adds a health snapshot.
argument-hint: "[--spec=<folder|ticket>] [--next] [--health] [--export=markdown|json]"
allowed-tools: Read, Grep, Glob, Bash
metadata:
  version: "3.0"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---

# /progress

Answers "where was I?" and "what next?" from data that already exists in the repo. It writes nothing. For the visual board of every spec, use `/spec-board`.

## Usage

```bash
/progress                                   # overview of every spec
/progress --spec=spec-PROJ-123-refund-guard # one spec in detail (folder, ticket key, or timestamp id)
/progress --spec=PROJ-123
/progress --next                            # recommend the next task
/progress --health                          # project health snapshot
/progress --export=markdown                 # weekly summary
```

## Data sources

Only these. If a source is missing, say so; never estimate.

| Source | What it gives |
|--------|---------------|
| `.ai/specs/*/spec-lite.md` frontmatter | `status` (draft, approved, in-progress, done), `priority` (P0-P3), `size`, `type`, `ticket`, `approved_by` |
| `.ai/specs/*/tasks.md` | top-level tasks `- [x] N. Title` / `- [ ] N. Title`; done/total |
| `.ai/session/<spec-folder>-state.json` | `current_task`, `completed_tasks`, `last_updated`, `resume_hint` (written by `/execute-task`) |
| `git log` | last commit touching each spec folder and the files it lists; recent commits on the current branch |
| `git branch --no-merged` | unfinished branches |

Legacy specs (no frontmatter) are listed with status inferred from their checkboxes and marked "legacy".

In a polyrepo workspace, read each repo's `.ai/specs` and `.ai/session` (for example `api/` and `web/`) and label every line with its repo. Commands you suggest must be run from that repo.

## Overview (default)

```
Progress

Spec                               Status       Pri  Tasks        Last activity
spec-PROJ-123-refund-guard         in-progress  P1   6/8  (75%)   2h ago (session)
spec-PROJ-130-profile-settings     approved     P2   0/6          1d ago (git)
spec-20261018-1430-order-export    draft        P2   0/5          3d ago (git)

Current focus: spec-PROJ-123-refund-guard, task 7
  "Completed RefundGuard service; next is the controller" (resume hint)
Resume: /execute-task --spec=spec-PROJ-123-refund-guard --continue
```

Sort: in-progress first, then approved, then draft, then done (done collapsed to a count unless `--export`). Within a status, by priority, then by last activity.

**Last activity** is the newest of the session file's `last_updated` and the last commit that touched the spec folder or a file listed in its tasks. Label which one it came from.

## Spec detail (`--spec=<ref>`)

Resolve the reference the way `/execute-task` does (full folder name, ticket key, or timestamp id; legacy numbers still work). Show:
- Frontmatter: status, priority, size, type, ticket, approved_by
- Each task with its checkbox state, its `Covers:` AC ids, and the files it names
- Session state: current task, completed tasks, resume hint
- Commits that touched the spec folder or its task files (`git log --oneline -- <paths>`)
- Warnings: status disagrees with the checkboxes (approved with checked tasks, done with open tasks), a draft with open questions

## Next task (`--next`)

Rank candidates with rules you can show, not weights:

1. A spec that is `in-progress` with a session: its next unchecked task. Finishing started work comes first.
2. Other `in-progress` specs: their first unchecked task.
3. `approved` specs, by priority (P0 before P3), then size (smaller first).
4. Drafts are never recommended for building; list ready drafts as "needs approval: `/sdd <folder>`".

Within a spec, the next task is the first unchecked top-level task whose dependencies (tasks it names as prerequisites) are checked.

```
Next: spec-PROJ-123-refund-guard, task 7 (Frontend integration)
  Why: in progress, resume point from the last session; P1
  Start: /execute-task --spec=spec-PROJ-123-refund-guard --continue

Then:
  2. spec-PROJ-130-profile-settings, task 1 (approved, P2, size S)
Needs approval:
  - spec-20261018-1430-order-export -> /sdd spec-20261018-1430-order-export
Unfinished branches: feature/PROJ-118-csv-import (no spec found)
```

## Health snapshot (`--health`)

A one-screen project snapshot. It runs the owning skills instead of copying their commands, so the commands stay in one place.

1. **Git**: current branch, ahead/behind its upstream, uncommitted files, last commit, unfinished branches.
2. **Repos**: find the repos the way the workflows' Detect phase does. Each repo's stack comes from its manifest `detect` rule. In a polyrepo workspace, check each repo, for example `api/` and `web/`.
3. **Per repo, delegate**:
   - Code quality: `/lint` (check mode, no fixes)
   - Tests: `/run-tests` (backend), `/run-tests --frontend`
   - Vulnerabilities, outdated and unused packages: `/security-scan --dependencies` (read-only)
4. **Specs**: the overview counts (in progress, approved, drafts awaiting approval).

```
Health: hireboard

Git     main, up to date, 2 uncommitted files, last commit 3h ago
        unfinished: feature/HIRE-14-saved-searches

api (backend)   lint PASS   tests 214/214 PASS   vulns 0   outdated 3 (0 major)
web (frontend)   lint WARN 3 tests 88/90 FAIL     vulns 1 low   outdated 5 (1 major)

Specs   1 in progress, 2 approved, 1 draft awaiting approval

Actions
  1. Fix 2 failing tests in web: /run-tests --frontend
  2. Review the major upgrade, then run /upgrade-deps --major=<package> yourself
```

A check whose tool is not installed shows "not run (tool missing)", never PASS. Each delegated skill reports its own details; this view keeps one line per check.

## Export (`--export`)

`markdown` writes the overview plus each in-progress spec's detail to stdout for a weekly summary. `json` prints `{ specs: [{ folder, repo, status, priority, tasks: { done, total }, currentTask, resumeHint, lastActivity }] }`.

Follow the `source-verification` skill: every number comes from the files and commands above, read in this session.
