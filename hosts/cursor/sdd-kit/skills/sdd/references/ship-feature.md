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
| `allowDraft` | Build a `draft` spec anyway. Default `false` — draft specs are refused. |
| `e2e` | Write and run a Playwright regression test for the journey. Default `true` when the frontend repo has a `playwright.config.*`. |
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
Prepare      on a protected branch: switch to feature/<KEY>-<slug> per repo; approved → in-progress
Build        TDD per code task with the stack's specialist; ticks tasks.md
Gates        detected tooling per repo (+ contract-sync when split repos have it); auto-fix loop (max 3)
             scoped to the run's changed files; lint/format failures only in other files do not block;
             unreachable ≠ pass
Converge     audit code vs spec/tasks; APPEND gap tasks to tasks.md (never edits code); manual gaps
             become Manual: tasks
             └─ gaps → Build → Gates → Converge again; round-2 gaps are built once without a third
                audit; stop reason recorded
Visual       Chrome extension: theming, layout, responsive, contrast (UI changes only)
Review       4 dimensions; each finding needs 2 verifier votes, a tie-break only on a split
Fix          confirmed critical/major (and trivial minor) findings → stack agent → Gates → re-verify
             the fixed ones; max 2 rounds, stop reason recorded
Acceptance   re-walk the original scenario + every AC + every Must-NOT-change item;
             e2e/<spec>.spec.ts Playwright test for the journey, AC ids in test names, run and traced in tasks.md
Docs         update existing docs to shipped behavior (skipped if not shippable)
TestPlan     manual-test.md; fills manual rows in Traceability; status → done when shippable
Report       SHIP / FIX-FIRST / BLOCKED
```

## Outputs

- Code + tests in each repo; `tasks.md` ticked, gap tasks appended under `## Phase: Gaps (converge round N)`.
- `manual-test.md` in the spec folder; Traceability table filled.
- `e2e/<spec>.spec.ts` in the frontend repo when e2e is on.
- Result: `specId, specFolder, branches, built, failedTasks, awaitingOwner, resume, manualTasks, convergeRounds, converge, remainingGaps, gatesPassed, confirmedFindings, fix, recommendation, cost, acceptanceResolved, e2e, docsUpdated, manualTestPlan, next, reportPath, report`. `cost` holds agents (and tokens where a budget is set) per phase. The report is saved to `.ai/reports/ship-<spec>-<timestamp>.md` in the spec's repo.

## Done when

`SHIP`: every code task built, gates green (contract-sync included), Converge returned and found no gaps (or none left unbuilt), only minor findings left after Fix (a finding counts as fixed only when the re-verification votes refute it), acceptance resolved (journey + all AC and NFR + no MNC change; a pass that returns nothing is not), the e2e test passing when it ran, no WIP repo. The report ends with `Next: /open-pr --spec=<id> --report=<reportPath>`, so `/open-pr` reuses the gate results and verdict instead of re-running them. Anything less is `FIX-FIRST` / `BLOCKED` — surface the blockers and offer `/simple-task` or a re-run on the fixes.
