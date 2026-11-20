# Route: feature → ship-feature

Builds one approved spec end-to-end. `/sdd` launches it only after the human approval gate (SKILL.md Step 4b).

## Args

| Arg | Meaning |
|-----|---------|
| `spec` | Spec reference: folder name (preferred), legacy number (`0042`), ticket key (`PROJ-123`), or timestamp id (`20261018-1430`). Ambiguous → the run stops and returns `candidates`. |
| `feature` | Free-text feature instead of a spec (runs Investigate + Spec itself; outside `/sdd` only). |
| `ticket` | Tracker key; names the spec folder in `feature` mode. |
| `repos` | `{ backend, frontend }` roots for a polyrepo project. |
| `url` | Dev-server URL for the Visual phase (otherwise ports 3000/5173/8000 are probed). |
| `allowDraft` | Build a `draft` spec anyway, and build past unchecked open questions or a clarity-gate stop (the questions are recorded in the spec). Default `false`. |
| `e2e` | Write and run a Playwright regression test for the journey. Default `true` when the frontend repo has a `playwright.config.*`. |
| `answers` | Owner answers to the questions a previous run returned: `{ <question id>: <answer> }`. Answered questions are not asked again. |
| `models` | Per-run tier override, e.g. `{ deep: "claude-opus-5-5" }`. |

Launch with the plugin name and fall back to the bare name on "not found" ([workflow name rule](../SKILL.md#workflow-names)).

```
Workflow({ name: "ship-feature", args: { spec: "spec-PROJ-123-refund-guard", repos: { backend: "../api", frontend: "../web" }, url: "http://localhost:3000" } })
```

## Phases

```
Detect       stack(s) + repo layout; untracked/WIP repos flagged
Investigate  ┐ feature mode only: existing implementation, user journey, broken links, docs to update
Spec         ┘ spec mode: resolve + load task lines (tasks.md + tasks-archive.md), AC, Must-NOT-change;
               Manual: tasks go to the test plan, an open Gate: task stops the run as awaiting owner
Rules        load the business-rule set (spec `brs`, `business-rules.md`, project rules file); none → no rules step effect
Prepare      on a protected branch: switch to feature/<KEY>-<slug> per repo; approved → in-progress
Build        TDD per code task with the stack's specialist; ticks tasks.md
             bug/improvement specs with Must NOT change items: guard tests first, green on unchanged code (red stops the run)
Base         per repo: the base revision (`tracked: false` repos skip it) and the files already dirty; the gates run once before any code is written as the baseline
Gates        detected tooling per repo (+ contract-sync when split repos have it, + a dependency-audit gate when the manifest declares one); auto-fix loop (max 3)
             a gate that failed the same way in the baseline is `pre-existing`: no fix agent, no block; a new failure blocks
             scoped to the run's changed files; lint/format failures only in other files do not block;
             unreachable ≠ pass
Converge     audit code vs spec/tasks; APPEND gap tasks to tasks.md (never edits code); manual gaps
             become Manual: tasks
             └─ gaps → Build → Gates → Converge again; round-2 gaps are built once without a third
                audit; stop reason recorded
Visual       Chrome extension: theming, layout, responsive, contrast (UI changes only)
Review       5 dimensions (the fifth, `tests`, reviews the run's tests and drops a finding without a file and line), plus `business-rules` when the rule set is non-empty (one verdict per rule); each finding needs 2 verifier votes, a tie-break only on a split
             security: the `security-auditor` agent with the manifest's skills; a second, independent pass (`security:deep`) when the diff touches a risk area (auth, routes, migrations, uploads, payments, dependency manifests, env or CI config), else skipped with the reason
Fix          confirmed critical/major (and trivial minor) findings → stack agent → Gates → re-verify
             the fixed ones; max 2 rounds, stop reason recorded
Integrity    test-integrity check: a deleted test file, a modified one no built task names, or an added skip/focus marker from the manifest fails
Second review one review of the files changed after Review (Fix rounds, the E2E test), correctness and security, plus tests when a late file is a test file; runs once, starts no Fix round
Acceptance   re-walk the original scenario + every AC + every Must-NOT-change item;
             e2e/<spec>.spec.ts Playwright test for the journey, AC ids in test names, run and traced in tasks.md
Docs         doc-impact list computed in script, owners mapped by a read-only agent; existing docs updated to shipped behavior (skipped if not shippable); one grader pass, a phantom link goes back once, one that remains fails `docs`
TestPlan     manual-test.md in the spec folder: Preconditions, Test data, Steps, Must NOT change checks, Rollback; every step tagged with its AC, MNC or NFR id, coverage checked in script
Close        spec status → done and backlog slice → shipped, only when shippable, no owner gate and no `Manual:` task open; fills Traceability "Verified by"; writes the Deviations section into spec-lite.md
Report       SHIP / FIX-FIRST / BLOCKED
```

## Outputs

- Code + tests in each repo; `tasks.md` ticked, gap tasks appended under `## Phase: Gaps (converge round N)`.
- `manual-test.md` in the spec folder (TestPlan); Traceability table filled and `status: done` set by Close, which returns `close: { statusSet, sliceSet, tracedRows }`.
- `e2e/<spec>.spec.ts` in the frontend repo when e2e is on.
- Result: `specId, specFolder, branches, built, failedTasks, awaitingOwner, resume, manualTasks, convergeRounds, converge, remainingGaps, gatesPassed, confirmedFindings, unverifiedFindings, fix, recommendation, assurance, securityReview, cost, acceptanceResolved, e2e, docsUpdated, manualTestPlan, close, next, reportPath, report`. `cost` holds agents (and tokens where a budget is set) per phase. The report is saved to `.ai/reports/ship-<spec>-<timestamp>.md` in the spec's repo.

Also returns `questions` and `assumptions` (empty lists when nothing is open; item shapes and the hand-off in [Step 5 of /sdd](../SKILL.md#step-5--hand-off)). Build assumptions come back by task id (`source: build:t<id>`). A blocking question from Investigate or Spec, or a guard test that fails on the unchanged code (`Q-guard-1`), ends the run before any task is built; relaunch with `answers`.

## Stops before Build

- Only `approved` and `in-progress` specs build. A `draft` spec stops the run with `error: 'spec not approved'`; any other non-buildable status (`done`, unknown) stops it with `error: 'spec status not buildable'`. `allowDraft: true` builds drafts only.
- A `{ spec }` run also stops on unchecked open questions in the spec with `error: 'spec has open questions'`, returning them as `openQuestions`, unless `allowDraft: true`.
- A run without `{ spec }` persists its spec as `draft`, then runs a fresh-context clarity gate. It stops as `draft` when the gate raises a question, the investigation returned open questions, or a brief rule is unvalidated (or the gate did not run). The questions are written under Open questions in the spec; approve and re-run with `{ spec }`, or pass `allowDraft: true` to build anyway.
- `unverifiedFindings` lists review findings whose verifier votes neither confirmed nor refuted them. A critical or major one blocks `SHIP` (FIX-FIRST); an unverified minor is listed and does not block.

## Done when

`SHIP`: every code task built, gates green (contract-sync included), Converge returned and found no gaps (or none left unbuilt), only minor findings left after Fix (a finding counts as fixed only when the re-verification votes refute it), acceptance resolved (journey + all AC and NFR + no MNC change; a pass that returns nothing is not), the e2e test passing when it ran, no WIP repo. The report ends with `Next: /open-pr --spec=<id> --report=<reportPath>`, so `/open-pr` reuses the gate results and verdict instead of re-running them. The report carries an Assurance table, one row per check (stack-trust, build, gates, converge, review, `review:<dimension>`, visual, fix, acceptance, e2e, repo-warnings) and the ledger entries security-review, `security:deep`, test-integrity and second-review; `securityReview.ran` must be true (`{ ran, deep: ran|skipped|unavailable, findings }`); a `pre-existing` gate failure does not block, a `test-integrity` or `second-review` failure does; a check that failed or could not run lowers the verdict, so a skipped phase is never read as a pass. Anything less is `FIX-FIRST` / `BLOCKED` — surface the blockers and offer `/simple-task` or a re-run on the fixes.
