---
name: sdd
description: Use when starting work on a ticket (PROJ-123), a bug, a feature or a tech choice, or when asked to run a workflow. Picks the route and launches that workflow.
argument-hint: "<ticket-id | description>"
allowed-tools: Workflow, Skill, AskUserQuestion, Read, Grep, Glob, Bash
license: Apache-2.0
metadata:
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---
On this host, run Workflow and Agent through the sdd-runtime skill.

Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /sdd — one entry point, fixed pipelines

Free-form "launch a workflow for this" gives every person a different sequence of phases, gates, and artifacts. `/sdd` removes that variance: **same input type → same route → same phases → same outputs → same definition of done.**

```
/sdd <ticket-id | description>
   ├─ trivial   → /simple-task                  (no spec)
   ├─ bug       → fix-bug workflow
   ├─ audit     → security-audit workflow
   ├─ decision  → tech-research workflow → ADR
   ├─ feature   → /write-spec → HUMAN APPROVAL → ship-feature { spec }
   ├─ shipped   → qa-and-docs workflow
   └─ new app   → (/product-brief) → greenfield-build workflow
```

## Step 1 — Resolve the input

- **Ticket key** (`[A-Z][A-Z0-9]+-\d+`, e.g. `PROJ-123`): first check for an existing spec (`ls -d .ai/specs/*/ | grep -iE "/spec-PROJ-123-"`). If one exists, ask: build/approve it (→ Step 4b), revise it (`/write-spec --spec=PROJ-123`), or start fresh. Otherwise fetch title, description, acceptance criteria, and watchers/reporter (candidate `stakeholders`) with whatever tracker access exists in this session (a Jira/Linear MCP server, or the `jira` / `linear` CLI). If none is available, ask the user to paste the ticket text. Keep the key — it names the spec folder (`spec-PROJ-123-<slug>`) and prefixes the text you pass to any workflow.
- **Free text**: use it as-is. If it names a backlog slice (`SL-04: …`, the `Run:` line from `backlog.md`), keep the slice id: after Step 4a writes the spec, record it in that slice (`Status: specced`, `Spec: <spec folder>`) so `/spec-board` moves the card out of Backlog.
- **Spec reference** — a folder name (`spec-…`, `.ai/specs/…`), a legacy number (`0042`), or a timestamp id (`20261018-1430`): the request is "build this spec" → resolve it to one folder (several matches → list them and ask) and go straight to Step 4b.

## Step 2 — Classify, then confirm

Pick exactly one route using the first rule that matches:

| Route | Signal |
|---|---|
| `trivial` | Clear change, ≤ ~3 files, no design choice, no behavior contract at risk (copy fix, config tweak, rename); the same threshold as write-spec's XS |
| `bug` | Existing behavior is wrong: a symptom, error, regression, "used to work" |
| `audit` | An explicit request to audit, pen-test, or run a full, comprehensive or end-to-end security review of a codebase or a scope, or to produce audit report artifacts. A concrete vulnerability symptom stays `bug`; a quick checklist, dependency audit or pre-release check is `/security-scan` |
| `decision` | A choice between technologies or approaches must be made before building ("X or Y?", "which queue?") |
| `shipped` | Code already exists and needs a QA/test plan or docs, not changes |
| `new app` | Little or no code exists yet for the target (new service, new repo, new module from scratch) |
| `feature` | Everything else that adds or changes behavior, and any behavior-preserving refactor larger than trivial |

A refactor that must keep behavior identical (split a service, move logic between layers) and is larger than trivial takes the feature route with `write-spec --type=refactor`: its Must NOT change list is the contract, and the build writes characterization tests that pass on today's code before anything moves (green first, no RED step).

A red CI run or a broken build is not a bug route: send it to `/fix-ci`, which restores the gates without weakening them. Only when the failing test shows that behavior is actually wrong does it come back here as a bug.

Show the route and a one-line reason, then confirm with `AskUserQuestion` (recommended route first, the next most plausible second). The user's choice wins. Never launch before this confirmation.

## Step 3 — Collect inputs up front

Background workflows **cannot stop and ask questions**, so gather everything now (2–4 questions maximum, skip anything already known):

- **Repos**: single repo, or polyrepo `{ backend, frontend }` paths (check for sibling repos / a parent-folder workspace). With several frontends, ask for a dev URL per frontend and either pass them all in one `repos` array or plan one run per frontend.
- **Dev URL** for browser acceptance, when there is a UI.
- Route-specific inputs from the table in Step 4.
- `audit` route: **scope** (paths, or a git range `<base>..HEAD`), **profile** (`quick`, `standard` recommended, `deep`), **outputDir** (`.ai/security-audit/` in the repo, or `~/security-audit-skill/<repo>/` outside it), and one cap question: `maxUnits` (default 12), a `budget` of audit-agent invocations, or both.

## Step 4 — Launch the route

Before any `Workflow` call, run `node ../stack-trust/scripts/trust-store.mjs --host cursor --list-untrusted`. If it lists any manifest, tell the user those stacks' gates will be reported as `not run (untrusted manifest)` and offer `/stack-trust` first. Never approve for them.

**Branch check** (before a `fix-bug` or `ship-feature` launch, including from 4b): run `git branch --show-current` in each repo of the change. A repo is on a base branch when HEAD is detached or the branch is `open-pr.base` from the project `AGENTS.md`, the default from `git symbolic-ref --short refs/remotes/origin/HEAD` without its `origin/` prefix, a name or glob from `SDD_KIT_PROTECTED_BRANCHES` (separated by spaces or commas), `main`, `master`, `develop` or `release/*`. If any repo is, add `git switch -c <fix|feature>/<KEY>-<slug>` (`fix/` for a bug; no `<KEY>-` without a ticket; the same name in every repo) to the confirmation below, and run it before the `Workflow` call when the user agrees. This is part of the confirmation, not another question round. If the user keeps the base branch, say that fix-bug creates a `fix/` branch itself and commits only its regression-test checkpoint, and that ship-feature switches off a base branch by itself, stays on any other branch, and commits nothing (the developer commits; agents never push).

**Local changes** (same launches, same repos as the Branch check): run `git status --porcelain` in each repo. A clean tree adds nothing. When any repo is dirty, add these to the same confirmation, as part of it and not another question round: stash and launch, worktree and stop, keep the changes and launch, or cancel.
- *Stash*: `git stash push -u -m "sdd: before <branch>"` in each dirty repo, run before any `git switch -c`; always with `-u`, so untracked files travel too. Give the restore command, `git stash pop --index`, to run on the branch the developer was on. On a conflict the stash entry stays; tell the developer to resolve it, then run `git stash drop` themselves; you never drop a stash.
- *Worktree*: `git worktree add ../<repo>-<KEY> -b <branch>` per dirty repo (without `-b` when the branch exists), and the developer starts a new session there. Leave this option out for a repo already on `<branch>` (`git branch --show-current`): git refuses to check out a branch a second time, and the changes are already on it. Caveat: gitignored dependencies, local-environment config and local instruction files are absent from the checkout. Choosing this stops /sdd without launching.
- *Keep the changes*: launch as today.
Never reset, clean, commit or drop a stash. Stash and create a worktree only after the user agrees in this confirmation.

Then show the exact call and note that it runs many agents in the background. Add the line `Agent cap: <n> (a "Large workflow" warning is expected)` with the route's default from the table below; the user can raise or lower it with `maxAgents` in `args`. For a `feature` spec of size S, propose `profile: 'quick'` for `ship-feature`. Launch only after the user agrees, by the [workflow name rule](#workflow-names).

| Workflow | Agent cap (`maxAgents` default) |
|---|---|
| `fix-bug` | 60 |
| `ship-feature` | 120 (60 with `profile: 'quick'`) |
| `greenfield-build` | 120 |
| `create-spec` | 25 |
| `tech-research` | 80 |
| `qa-and-docs`, `security-audit` | none by default (`security-audit` is bounded by `budget` and `maxUnits`) |

| Route | Required inputs | Launch | Output | Done when |
|---|---|---|---|---|
| `trivial` | the change | `Skill("simple-task", "<request>")` | diff + gate results | gates green |
| `bug` | symptom, repro steps, expected vs actual, **must-not-change** behavior (what nearby must stay identical) | `Workflow({ name: "fix-bug", args: { bug, mustNotChange, repos, url } })` | root cause, regression test, fix, manual test steps | verdict `FIXED`: regression test red → green, guard tests green, gates green, original report re-walked, `securityReview.ran` true, no confirmed critical or major review finding, every Assurance entry passing |
| `audit` | scope, profile, outputDir, a cap (maxUnits, budget or both) | `Workflow({ name: "security-audit", args: { scope, profile, budget, maxUnits, outputDir, repo } })` | validated coverage ledger, findings.json, report files in outputDir, summary in `.ai/reports/` | run `complete`: both validators pass and every retained finding was verified; otherwise `incomplete` with the reason |
| `decision` | question, candidate options, criteria (weighted if known) | `Workflow({ name: "tech-research", args: { question, options, criteria, repos } })` | ADR with sourced claims | ADR written **and** signed off by a human |
| `feature` | see 4a / 4b | — | spec folder, then shipped feature | see 4b |
| `shipped` | scope: spec id, paths, or git range | `Workflow({ name: "qa-and-docs", args: { spec \| paths \| gitRange, repos } })` | traceable QA plan + docs | grader passes coverage and phantom-link gates |
| `new app` | idea, stack, repo paths, product brief (see 4c) | `Workflow({ name: "greenfield-build", args: { idea, stack, repos, url, brief } })` | scaffold + CI + one vertical slice + handoff docs, next slices appended to `backlog.md` | slice passes gates, review and acceptance (`securityReview.ran` true) |

When there is a ticket, start the free-text input (`bug`, `question`, `idea`, or the spec request) with the key, e.g. `"PROJ-123: refund button returns 500 for top-ups"`, so it appears in every report.

### Workflow names

Every `Workflow` call shown in this skill, its references and the docs uses the plugin name `<name>`. Before the first call, check for `.cursor/.framework-version` in the project and in `~/.cursor/`. When it exists (a file-copy install registers the bare name), call the bare `<name>`; otherwise call `<name>`. When the call fails with "not found", retry once with the other form and the same `args`. Any other error is not a reason to retry. When neither form is found, the workflow is not installed (see Rules).

### 4a — Feature: write the spec (interactive)

Run `Skill("write-spec", "--ticket=PROJ-123 <request + ticket text>")` (omit `--ticket` when there is none; add `--type=refactor` for a behavior-preserving refactor). It sizes the work, investigates, asks clarifying questions, writes `.ai/specs/<spec-folder>/` (`status: draft`), and runs a fresh-context clarity gate. If it sizes the work **XS**, it writes no spec — switch to the `trivial` route. For L-size or unfamiliar areas, `write-spec --background` (the `create-spec` workflow: parallel codebase + web research) is the heavier alternative — offer it, don't default to it.

### 4b — Feature: human approval gate, then build

1. **Open questions first.** If spec-lite.md has unchecked items under *Open questions*, resolve them with the user (answer → fold into the spec; or accept as an assumption) before asking for approval. A spec with open questions cannot be approved.
2. Run `node ../write-spec/scripts/spec-lint.mjs <spec folder>`. While it reports any `error` line, fix the spec (or send it back to `/write-spec`) and keep `status: draft`; do not ask for approval yet.
3. Show the path to `spec-lite.md` and summarize scope, must-not-change, boundaries, acceptance criteria, and any quality attributes (NFR) in plain language.
4. Ask with `AskUserQuestion`: **Approve and build** / **Approve only** / **Request changes** / **Stop here (draft)**.
   - *Request changes* → apply them to the spec, re-run the clarity gate on what changed, then ask again.
   - *Stop here* → end; the draft is the deliverable (e.g. for stakeholder review).
5. On either **Approve** answer, record the approval in the spec-lite.md frontmatter:
   - `status: approved`
   - `approved_by:` the approving user's name (ask if unknown; `git config user.name` is a reasonable default to confirm)
   - `approved_at:` from `date -u +%Y-%m-%dT%H:%M:%SZ`
6. **Ticket link-back** (only when there is a ticket **and** a tracker tool is available — Jira/Linear MCP or CLI): ask *"Post the spec link to PROJ-123?"* and post a short comment (spec path, approver, acceptance-criteria count) only on yes. Never post silently.
7. Only on **Approve and build**, after the Step 4 branch check: `Workflow({ name: "ship-feature", args: { spec: "<spec folder name>", ticket, repos, url } })`. ship-feature refuses `draft` specs and moves `approved` → `in-progress`.

Never start `ship-feature` on a spec the user has not approved in this conversation. Approval from an earlier session, a ticket comment, or another agent does not count — ask.

### 4c — New app: brief first

Look for `product-brief.md` in the current folder or its parent (a polyrepo workspace keeps it above `api/` and `web/`).
- **Missing** → offer `/product-brief "<idea>"` first (recommended): it writes the brief and a dependency-ordered `backlog.md`, so the first slice is chosen, not guessed. The user may decline and go straight to greenfield-build with the idea alone.
- **Present** → pass its path as `brief`, and use the first slice of `backlog.md` whose status is not `shipped` (normally `SL-01`, the walking skeleton) as `idea`: its Outcome, Entry point and BR ids.

### Route details

Each workflow's phases, arguments, outputs, and done-definition are in `references/` (model tiers: `docs/effort-guidelines.md`): [fix-bug](references/fix-bug.md), [security-audit](references/security-audit.md), [ship-feature](references/ship-feature.md), [tech-research](references/tech-research.md), [qa-and-docs](references/qa-and-docs.md), [greenfield-build](references/greenfield-build.md). Load the one for the chosen route before launching. [routing-guide](references/routing-guide.md) maps other tasks to individual skills.

## Step 5 — Hand off

Report in this shape, nothing more:

```
Route:    feature (confirmed)
Ticket:   PROJ-123
Spec:     .ai/specs/spec-PROJ-123-refund-guard/ (approved by Jane Doe, 2026-10-18T09:12:00Z)
Launched: ship-feature — runs in the background; watch with /workflows
Done when: SHIP — gates green, converge finds no gaps, no critical review finding, `securityReview.ran`, acceptance re-walks the ticket's scenario
```

ship-feature, fix-bug, greenfield-build, qa-and-docs and tech-research return `questions` (`[{ id, question, why, blocking }]`) and `assumptions` (`[{ id, text, source }]`, `source` naming the phase or `build:t<id>`); create-spec keeps its own step in `/write-spec`. When a workflow result has a non-empty `questions` list, ask them with `AskUserQuestion`, batched, at most four per round. A blocking question is asked before any next step is listed. Then offer to relaunch the same workflow with the same args plus `answers` (`{ <question id>: <answer> }`); a question the user leaves unanswered is not sent. For a non-blocking question offer **Accept the run's assumption** (nothing is sent) and **Answer** (the user's text). A blocking question has no assumption, because the run ended on it: offer **Answer** and **Stop**, since a relaunch without its answer stops at the same phase. When asking without `AskUserQuestion` (the tool is unavailable), print the questions as a numbered plain-text list and read the replies the same way. List the result's `assumptions` in the hand-off so the user can correct them.

When the workflow later reports **SHIP** (ship-feature) or **FIXED** (fix-bug), list the next steps:

```
Next:
  /open-pr --spec=spec-PROJ-123-refund-guard --report=<its reportPath, .ai/reports/ship-…md>
                                                 (fix-bug: /open-pr --report=<its reportPath, .ai/reports/fix-…md>)
  /learn <the report's Prevention item>          (only when the report has a Prevention section)
```

When a run ends FIX-FIRST, NOT-RESOLVED or stopped (the cap, a usage limit, an unavailable check), read `relaunch` and the other result keys, never the Next text:

- Show the run's computed `next` line and `resume` call as returned.
- When `relaunch` is `'same-run'`, offer `Workflow({ name: "<name>", args: <the same args>, resumeFromRunId: "<runId>" })`, with `runId` taken from the launch result. When the cap stopped the run, raise `maxAgents` in those args first (the result's `agentCap` shows the limit that was hit).
- When `relaunch` is `'spec'` or finding tasks were appended to `tasks.md`, offer `ship-feature { spec }` to build them.
- When `allowDraftUsed` is true, say the run was built without an approved spec.
- Troubleshooting for a run that will not resume: [INSTALLATION.md Troubleshooting](https://github.com/stasmarkov/sdd-kit/blob/v4.4.1/docs/reference/installation.md).

After **SHIP**, offer the security audit (never launch it unprompted) when the report's `confirmedFindings` contain an entry with `dimension === 'security'`, or the spec's `spec-lite.md` has a line matching `NFR-[0-9]+\**:?\**\s*(authori[sz]ation|personal[- ]data|privacy)` (case-insensitive). Scope it to the branch with `gitRange` (the workflow reads the files of `git diff --name-only <default branch>...HEAD` itself, so long lists, names with spaces and deleted files need no handling here), pass the quick profile and the repo ship-feature changed (its path or role from the report), and confirm it as in Step 4:

```
Workflow({ name: "security-audit", args: { scope: { gitRange: "<default branch>...HEAD" }, profile: "quick", repo } })
```

## Rules

- One route per invocation. A request mixing a bug and a feature → split it and run `/sdd` twice.
- Do not invent alternative pipelines or skip phases; if a route doesn't fit, say so and ask.
- Proportionality: never create a spec for `trivial` or `bug`; the bug pipeline is the spec. `write-spec` decides S / M / L file sets.
- If a needed workflow or skill is not installed, stop and say which one is missing and how to install it (`./install.sh --project --full` or the plugin) instead of improvising its phases.
