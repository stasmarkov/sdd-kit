# Usage Examples

What to type for each kind of work in SDD Kit, and what you get back.

See every route used on one project: the [Hireboard worked example](../examples/job-board/README.md).

Start with `/sdd` unless you already know you want a specific skill. It classifies the request, confirms the route with you, collects every input up front, and launches one fixed pipeline. The route tree itself is in the [README](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/README.md); this page shows each route in practice.

Skill names below are bare (`/sdd`, `/write-spec`). In plugin mode they are namespaced: `/sdd-kit:sdd`, `/sdd-kit-ops:deploy`. The full lists are in [skill index](skills.md) and [agent index](agents.md).

| Kind of work | Type | Runs |
|---|---|---|
| [Feature from a ticket](#1-feature-from-a-ticket) | `/sdd PROJ-123` | `/write-spec` → approval → `ship-feature` |
| [Bug](#2-bug) | `/sdd "<symptom>"` | `fix-bug` |
| [Technology decision](#3-technology-decision) | `/sdd "X or Y?"` | `tech-research` → ADR |
| [QA plan and docs for shipped code](#4-qa-plan-and-docs-for-shipped-code) | `/sdd "document <feature>"` | `qa-and-docs` |
| [New app](#5-new-app) | `/product-brief "<idea>"`, then `/sdd "new <app>"` | brief + backlog → `greenfield-build` |
| [Small change](#6-small-change) | `/simple-task "<change>"` | one context, no spec |
| [Plan, then build task by task](#7-plan-interactively-build-task-by-task) | `/write-spec`, `/execute-task` | interactive |
| [API and schema design](#8-api-and-schema-design) | `/design-api`, `/design-schema`, `/migrate-db` | interactive |
| [Review before merge, PR, and lessons](#9-review-before-merge) | `/deep-review` → `/open-pr` → `/learn` | verdict, linked PRs, a guard |
| [Security and dependencies](#10-security-and-dependencies) | `/security-scan`, `/upgrade-deps`, `security-audit` workflow | interactive; the audit runs in the background |
| [Split backend/frontend repos](#11-split-backend-and-frontend-repos) | `/sdd` or `Workflow({ ..., repos })` | any workflow |
| [Overnight codebase review](#12-overnight-headless-codebase-review) | `scripts/review/review.sh` | headless |
| [Deploy, incidents, UI design](#13-add-ons-ops-and-design) | `/deploy`, `/incident`, `/design-ui` | add-on plugins |
| [Recurring checks](#14-recurring-checks-with-routines) | `/schedule` | report-only routines in the cloud |
| [Red CI](#15-red-ci) | `/fix-ci <PR>` | restore the gates without weakening them |

---

## 1. Feature from a ticket

**When:** a ticket or request adds or changes behavior and is bigger than a quick edit.

**Type:**

```
/sdd PROJ-123
/sdd "Customers can cancel an order until it ships"
```

**What happens:**

- `/sdd` fetches the ticket (Jira/Linear MCP or CLI if available, otherwise asks you to paste it), checks for an existing `spec-PROJ-123-*` folder, and confirms the `feature` route.
- `/write-spec` sizes the work (XS gets no spec and goes to `/simple-task`), investigates, asks clarifying questions, and writes a `status: draft` spec. A fresh-context clarity gate records hidden assumptions as open questions.
- You resolve open questions, then choose **Approve and build**, **Approve only**, **Request changes**, or **Stop here**. Approval writes `approved_by` and `approved_at` into the spec frontmatter.
- On **Approve and build**, `ship-feature` runs in the background against the approved spec:
  `Detect → Investigate → Spec → Build → Gates → Converge → Visual → Review → Acceptance → Docs → TestPlan → Report`
- Converge audits code against the spec and rebuilds gaps (two rounds at most). Visual checks the UI at desktop and mobile widths with the built-in Playwright MCP server (headless) when you gave a dev URL, falls back to Claude in Chrome, and reports "not run" when no browser is available. Review is an adversarial panel with 3-vote verification.

**You get:**

- `.ai/specs/spec-PROJ-123-<slug>/` with `spec-lite.md`, `tasks.md` (ticked), and `manual-test.md` for a human to walk through.
- Code and tests in your repo(s), updated docs, and a ship report.
- Verdict: `SHIP` (every task built, gates green, no gaps left, no critical findings, acceptance resolved) or `FIX-FIRST` / `BLOCKED` with the blockers listed.

Watch the spec's status with `/spec-board` (or `npx github:stasmarkov/sdd-kit spec-board --serve` without Claude Code).

Spec format, sizes (XS/S/M/L), and acceptance-criteria style: [specification-system.md](specification-system.md).

## 2. Bug

**When:** existing behavior is wrong: an error, a regression, "this used to work".

**Type:**

```
/sdd "PROJ-456: refund button returns 500 for top-up orders"
```

**What happens:**

- `/sdd` confirms the `bug` route and asks for repro steps, expected vs actual, and **must-not-change** behavior (what nearby must stay identical). No spec is written; the pipeline is the spec.
- `fix-bug` runs in the background:
  `Detect → Reproduce → RootCause → RegressionTest → Fix → Gates → Acceptance → Report`
- The root-cause hypothesis is adversarially verified before any code changes.
- A failing regression test (red) and green guard tests for the must-not-change behavior are committed first; the fix is the minimal change that turns the regression test green without touching those tests.
- Acceptance re-walks the original report end-to-end.

**You get:** a report with root cause (file:line), the regression test path, the fix, gate results, and manual test steps.

Verdict:

- `FIXED`: regression test green, guards green, gates green, original symptom gone.
- `NOT-RESOLVED`: anything short of that.
- `NEEDS-INFO`: the bug could not be reproduced. The report says what information or access is missing.

## 3. Technology decision

**When:** a fork-in-the-road choice must be made before building (which queue, REST or tRPC, build or buy). Not for planning a known feature.

**Type:**

```
/sdd "Should order events go through Redis queues or SQS?"
```

**What happens:**

- `/sdd` confirms the `decision` route and collects the candidate options and criteria (weighted if you know them).
- `tech-research` runs in the background:
  `Detect → Frame → Research → Verify → Decide → Document → Report`
- Each option is researched in parallel against sourced web material and fit with your codebase.
- Every material claim is adversarially verified; unsourced claims are dropped.

**You get:** an ADR (status `Proposed`) in `docs/adr/`, or `.ai/decisions/` if there is no `docs/` folder, plus a report with the recommendation, confidence, runner-up, disagreement flags, and open questions. The decision is done once a human signs off on the ADR.

## 4. QA plan and docs for shipped code

**When:** code already exists (built with the kit or not) and needs a traceable test plan and documentation, not changes.

**Type:**

```
/sdd "QA plan and docs for spec-PROJ-123-order-cancel"
/sdd "Document the checkout flow"
```

**What happens:**

- `/sdd` confirms the `shipped` route and asks for a scope. One of:
  - a spec: `{ spec: "PROJ-123" }`
  - file globs: `{ paths: ["app/Domain/Orders/**", "src/app/orders/**"] }`
  - a git range: `{ gitRange: "v1.4.0..v1.5.0" }`
  - a feature name (plain string): `"checkout flow"`
- `qa-and-docs` runs in the background:
  `Detect → Index → Criteria → QAPlan → Docs → Grade → Report`
- Acceptance criteria come from the spec or are inferred from the code (the report marks inferred ones for human validation).
- Every test case and doc claim must link to real code. The grader flags phantom links and uncovered criteria.

**You get:** `qa-plan.md` in the spec folder (or `docs/qa/qa-plan-<date>.md`), new or updated user and dev docs, and a coverage matrix. Verdict: `PASS` or `CHANGES_REQUIRED`.

## 5. New app

**When:** little or no code exists yet for the target: a new service, repo, or module.

**Type:** start with the brief, then build its first slice:

```
/product-brief "Studio room booking: members book rooms by the hour, admins manage rooms and opening hours"
/sdd "New app — Studiobook, first slice SL-01: a member sees free slots for a room and books one"
```

**What happens:**

- `/product-brief` asks a few rounds of questions, then writes `product-brief.md` (problem, roles, MVP scope, non-goals, draft business rules `BR-01`…, success metrics, open questions) and `backlog.md` (dependency-ordered slices, each sized, citing its BR ids, and ending in a ready `/sdd` line). You approve the order. Each slice's `Run:` line is what you paste into `/sdd`; `/spec-board` shows the unspecced slices in its Backlog column.
- Skip the brief only for a throwaway prototype: `/sdd "New API + web app for booking studio rooms"` offers `/product-brief` first and lets you decline.
- `/sdd` confirms the `new app` route, passes `product-brief.md` as the constitution, and asks for the stack, repo paths, and dev URL.
- `greenfield-build` runs in the background:
  `Detect → Constitution → Architecture → Scaffold → Slice → Gates → Acceptance → Handoff → Report`
- It stops before writing anything if the target already holds a tracked codebase.
- Project conventions are loaded as a constitution; the architecture is checked against it.
- It scaffolds the repo and CI, then builds **one** vertical slice TDD-first.

**You get:** a scaffold with CI, one working slice, and handoff docs: `getting-started.md`, `architecture.md` (a lightweight ADR), and `manual-test.md`. The slice is marked `shipped` in `backlog.md` and the next slices are added to it. Verdict: `SHIP-SLICE`, `FIX-FIRST`, or `BLOCKED` (target was not empty). Build later slices with their `Run:` line (scenario 1). Feedback from a demo or sprint review goes back into the backlog with `/product-brief --intake "<notes>"`.

Supported stacks come from the registry in [src/workflows/lib/stacks.js](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/workflows/lib/stacks.js).

## 6. Small change

**When:** a clear change touching about five files or fewer, with no design choice and no behavior contract at risk. `/sdd` routes a request here as `trivial` only when it touches about three files; anything bigger gets a spec.

**Type:**

```
/simple-task "Add created_at column to the orders CSV export"
/simple-task --rename "OrderService to OrderProcessingService"
/simple-task "How should we rate-limit the public API?" --research-only
/simple-task --continue=TASK-0042
```

**What happens:**

- Investigates, implements, and verifies in a single context window. No spec.
- Suggests escalating to `/write-spec` when the change exceeds its complexity thresholds (`--force` to proceed anyway).

**You get:** the diff, gate results, and a task log in `.ai/tasks/TASK-<NNNN>-<slug>.md` that `--continue` resumes from.

## 7. Plan interactively, build task by task

**When:** you want to stay in the loop for each task instead of running `ship-feature` in the background.

**Type:**

```
/write-spec --ticket=PROJ-123 Customers can cancel an order until it ships
/write-spec --spec=PROJ-123                  # revise an existing spec
/write-spec --background <description>       # heavier research, runs the create-spec workflow

/execute-task --spec=PROJ-123                # next pending task
/execute-task --spec=PROJ-123 --continue     # resume after a context reset
/execute-task --spec=PROJ-123 --task=3       # a specific task
/execute-task --spec=PROJ-123 --verify-only  # re-run verification only
```

**What happens:**

- `/write-spec` produces the same draft spec as scenario 1. `--background` runs `create-spec` instead (`Detect → Classify → Research → Synthesize → Document → Clarify`): parallel codebase and web research, worth it for L-size or unfamiliar areas.
- Approve the spec through `/sdd spec-PROJ-123-<slug>` (or by editing its frontmatter yourself), then build.
- `/execute-task` runs one task at a time with TDD and verification gates, ticking `tasks.md` and saving state in `.ai/session/` so the next session picks up where you left off.

**You get:** the spec folder, per-task verification reports in `.ai/verification/<spec-folder>/`, and code built one reviewed step at a time. Watch progress with `/progress` or `/spec-board` (or `npx github:stasmarkov/sdd-kit spec-board --serve`). `--spec` accepts a folder name, ticket key, timestamp id, or legacy number.

## 8. API and schema design

**When:** you want a contract or data model reviewed before any code is written.

**Type:**

```
/design-api orders --openapi
/design-schema --entity=Order --migration
/migrate-db --create=orders
/migrate-db --status
```

**What happens:**

- `/design-api` designs resources, endpoints, request/response contracts, and the error format, with optional OpenAPI output.
- `/design-schema` designs entities, columns, relationships, indexes, and the migration strategy.
- `/migrate-db` updates the schema doc in `docs/schemas/` first, then generates and runs the migration. It is manual-only (it runs migrations, so it never triggers on its own).

**You get:** design documents you can review or attach to a spec, then a migration that matches the documented schema.

## 9. Review before merge

**When:** a task, spec, branch, or set of files is finished.

**Type:**

```
/deep-review --spec=PROJ-123                             # adversarial (default)
/deep-review --depth=standard                            # current branch vs main
/deep-review --depth=standard --branch=feature/PROJ-123-order-cancel --base=develop
/deep-review --depth=standard --focus=security
/deep-review --depth=standard --format=json              # CI-friendly
/deep-review --depth=quick --staged                      # fast critical-only pass
```

**What happens:**

- `adversarial` (the default): a skeptical reviewer on a different model tier that ignores the original prompt.
- `standard`: a structured checklist review with `--focus=security|performance|architecture|testing`.
- `quick`: critical issues only.
- security-auditor joins automatically when the scope touches auth, payments, or personal data.

**You get:** a review report with findings by severity. Verdict: `APPROVED`, `CHANGES_REQUIRED`, or `BLOCKED`.

**Then open the PRs:**

```
/open-pr --spec=PROJ-123 --report=.ai/reports/ship-spec-PROJ-123-order-cancel-20261019-1012.md
/open-pr --report=.ai/reports/fix-PROJ-130-20261019-1412.md      # bug fixed by fix-bug, no spec
```

- It checks the preconditions (spec status, gates newer than the last commit, review verdict, secrets in the diff), using the saved ship-feature or fix-bug report instead of re-running the gates when the report is fresh.
- It builds each PR body from the spec: every AC, MNC, and NFR mapped to its test, the manual test plan, and the ADR link. Then it shows the exact `git push` and `gh pr create` commands and runs them only after you confirm. In a polyrepo change the backend PR comes first, and the frontend PR links to it.

**Then turn the lesson into a guard:** when a review finding or a fix-bug report names a class of mistake, run `/learn` with it:

```
/learn "authorization checked in the UI but not in the Server Action (REVIEW-spec-PROJ-123, finding 2)"
```

`/learn` picks the cheapest guard that would have caught the whole class (an architecture test, a static rule, a path-scoped rules line, a CLAUDE.md entry, or a hook proposal), shows the diff, and writes it only on your approval.

## 10. Security and dependencies

**Type:**

```
/security-scan --quick
/security-scan --full
/upgrade-deps --audit-only
/upgrade-deps --patch
/upgrade-deps --major=<package>
```

**What happens:**

- `/security-scan` runs the stack's dependency audits, outdated and unused package checks, and code scans for injection, XSS, CSRF, and similar issues.
- `/upgrade-deps` (manual-only) reports outdated and vulnerable packages, then bumps in tiers (patch → minor → major) and runs the quality gates after each tier. Scope to one side with `--backend` or `--frontend`.

**You get:** a findings report, or upgraded lock files with gate results for each tier.

**Which security tool:**

- `security-scan` is the quick checklist: dependency audits, code patterns and an OWASP list.
- The `security-auditor` agent is a single-pass review of a scope; `/deep-review` spawns it.
- The `security-audit` workflow (`/sdd` audit route) is the deep, coverage-led audit. It never runs code and confirms a finding only on two agreeing static verifier votes, so leads that depend on runtime behaviour stay `needs_validation`.
- Claude Code's own security tools overlap with all three; use them alongside, not instead.

**Deep audit:** say "audit the security of `app/Payments`" to `/sdd`, or call the workflow directly:

```js
Workflow({ name: "security-audit", args: { scope: { paths: ["app/Payments"] }, profile: "standard", maxUnits: 12, outputDir: ".ai/security-audit/" } })
```

The run writes a validated coverage ledger, `findings.json` and report files to `outputDir`, plus a summary in `.ai/reports/`. It changes no target code. Its `next` section hands confirmed findings to `/sdd bug` (one defect) or `/write-spec` (a larger fix). On Codex, run it from a `workspace-write` session with network access off (`codex --sandbox workspace-write`), never `read-only`.

## 11. Split backend and frontend repos

**When:** the backend API and the frontend live in separate git repositories.

**Type:** open Claude Code in the parent folder that holds both repos and use `/sdd` as usual. It asks for the repo paths when it can't detect them. To launch directly:

```js
Workflow({
  name: "ship-feature",
  args: {
    feature: "PROJ-123: customers can cancel an order until it ships",
    repos: { backend: "be", frontend: "fe" },
    url: "http://localhost:3000"
  }
})
```

**What happens:** Detect identifies each repo's stack and gate commands, Build picks the specialist agent per repo, and Gates run per repo. The same `repos` argument works for `fix-bug`, `create-spec`, `qa-and-docs`, `tech-research`, and `greenfield-build`.

**You get:** the same outputs as the single-repo route, with per-repo gate results and a warning for any repo with untracked (WIP) files.

With several frontends, pass `repos` as an array with a distinct `url` per frontend. Each frontend gets its own browser pass, one after another (they share one browser), and Visual skips a frontend whose UI files did not change:

```js
Workflow({
  name: "ship-feature",
  args: {
    feature: "PROJ-123: customers can cancel an order until it ships",
    repos: [
      { path: "be", role: "backend" },
      { path: "fe", role: "frontend", url: "http://localhost:3000" },
      { path: "admin", role: "frontend", url: "http://localhost:3001" }
    ]
  }
})
```

Or run once per frontend with `{ repos: { backend: "be", frontend: "fe" }, url }`.

Layout, the parent-folder `CLAUDE.md`, contract rules, and merge order: [multi-repo.md](multi-repo.md).

## 12. Overnight headless codebase review

**When:** you want a full adversarially validated review of an existing codebase without sitting in a session.

The pipeline runs `claude -p` from a plain terminal (not from inside Claude Code). Setup, configuration, and phases: [scripts/review/README.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/scripts/review/README.md).

## 13. Add-ons: ops and design

These skills ship in optional add-on plugins, not in the core `sdd-kit` (as do stack skills, which `--stack` selects). Install the add-on first: `./install.sh --project --with=ops,design`, or enable `sdd-kit-ops` / `sdd-kit-design` in plugin mode ([plugin-mode.md](plugin-mode.md)).

**Ops (`sdd-kit-ops`):**

```
/deploy --staging --dry-run
/deploy --production            # manual-only; confirms before production
/rollback --production --steps=1
/feature-flag create order-cancel
/feature-flag rollout order-cancel
/health-check --quick
/incident --start
/incident --resolve
```

- `/deploy` runs pre-deploy gates (tests, lint, build), asks for confirmation on production, and verifies after.
- `/rollback` captures current state, picks the known-good target, and reverts code and migrations under maintenance mode.
- `/health-check` reports pass/warn/fail across the app, database, cache, queues, disk, and external services.
- `/incident` opens an incident record, triages by severity, investigates logs and recent deploys, and tracks resolution.

**Design (`sdd-kit-design`):**

```
/design-ui order-cancel
/design-ui --page=orders
```

`/design-ui` produces user flows, component hierarchy, state management, data fetching, and accessibility notes for a feature.

---

## 14. Recurring checks with routines

Drift is cheapest to catch on a schedule. Claude Code routines (`/schedule`) run an agent on a cron in the cloud; use them for read-only checks that report back rather than change code:

| Routine | Suggested schedule | Prompt |
|---|---|---|
| Doc drift | nightly | "Run /write-docs --audit, then compare docs/ and CLAUDE.md against the code changed in the last day; list stale statements with file:line. Don't edit." |
| Spec status reconciliation | weekly | "Run /progress --health; for every spec not marked done, check its tasks against the code and report specs whose status disagrees with reality." |
| Dependency audit | weekly | "Run /security-scan --dependencies; summarize outdated and vulnerable packages by risk." |

Routines run without you, so keep them report-only; act on findings through `/sdd`.

## 15. Red CI

**When:** a PR's checks are red, or a gate fails locally, and nothing says the product behavior is wrong.

**Type:**

```
/fix-ci 482                               # the PR's failing checks
/fix-ci --run=1234567890                  # one Actions run
/fix-ci local "<types gate command>"
```

**What happens:**

- It reads the failing job's log, reproduces the failure locally with CI's exact command, and classifies it (code, flaky test, tooling drift, environment, contract sync).
- It fixes the cause, never the gate. Baselines, `@ts-ignore`, skipped tests, `continue-on-error`, and lowered thresholds are blocked unless you approve a specific exception, which is listed under *Gate exceptions* in the report.
- It re-runs the failing gate and the full gate set, and checks its own diff for any weakening. It does not commit or push.
- A failing test that shows the product is actually wrong goes back to `/sdd` as a bug.

**You get:** the cause, the fix, the gate results, any approved gate exceptions, and a suggested conventional commit message. If the failure exposed a class of mistake, follow with `/learn`.

To run the frontend suites on their own: `/run-tests --frontend` or `/run-tests --e2e "AC-2:"` (browser journeys, one criterion).

## Running workflows directly

There are three ways to start a background workflow:

1. **`/sdd`** (preferred). It confirms the route, collects inputs, and never builds an unapproved spec.
2. **Plain English containing the word "workflow"**, e.g. "run the fix-bug workflow for the refund 500". Claude only launches a background workflow when you explicitly opt in like this.
3. **A direct call**, `Workflow({ name, args })`. Each workflow is also runnable as a skill: `/ship-feature`, `/fix-bug`, `/qa-and-docs`, `/tech-research`, `/greenfield-build`, `/create-spec`, `/security-audit` (the audit workflow opens in guidance mode on hosts where it is also a skill).

Watch running workflows with `/workflows`.

**On Codex and Cursor** there is no `Workflow` tool. The same workflow files run through the kit's bridge MCP server, and you start them through `/sdd` (`$sdd` on Codex). Behind that, the parent session calls the bridge tools with the same `args`:

```js
workflow_start({ name: "fix-bug", workspace, args: { bug: "PROJ-456: refund button returns 500 for top-up orders" } })
workflow_claim({ id, workerId })             // hand the job to a subagent
workflow_submit({ id, jobId, claim, output })
workflow_resume({ id, workspace })           // after a restart
```

The tool contract, run state and resume rules are in [workflow-bridge.md](workflow-bridge.md).

```js
// Build an approved spec. ship-feature refuses draft specs.
Workflow({ name: "ship-feature", args: { spec: "PROJ-123" } })

// A bare string is a feature DESCRIPTION: ship-feature writes its own spec first.
Workflow({ name: "ship-feature", args: "PROJ-123: customers can cancel an order until it ships" })

Workflow({ name: "fix-bug", args: {
  bug: "PROJ-456: refund button returns 500 for top-up orders",
  mustNotChange: ["Refunds for card orders still go through the gateway"],
  url: "http://localhost:8000"
} })

Workflow({ name: "tech-research", args: {
  question: "Redis queues or SQS for order events?",
  options: ["Redis", "SQS"],
  criteria: ["ops cost", "local dev parity"]
} })

Workflow({ name: "qa-and-docs", args: { gitRange: "v1.4.0..v1.5.0" } })
Workflow({ name: "greenfield-build", args: { idea: "Studio room booking", stack: "<stack-key>", repos: { backend: "api", frontend: "web" } } })
Workflow({ name: "create-spec", args: { description: "Order cancellation", ticket: "PROJ-123" } })
```

To build an existing spec, pass `{ spec: "<ref>" }` (folder name, ticket key, timestamp id, or legacy number). There is no `--spec` flag for workflows; `/ship-feature --spec=...` would be read as a feature description.

Every workflow accepts `args.models` to pin a model per tier (`deep`, `standard`, `light`) for one run. Which tier each phase uses, and when to override it, is in [effort-guidelines.md](effort-guidelines.md).
