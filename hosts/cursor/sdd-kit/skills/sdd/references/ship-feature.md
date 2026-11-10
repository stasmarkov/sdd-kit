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

```
Workflow({ name: "ship-feature", args: { spec: "spec-PROJ-123-refund-guard", repos: { backend: "../api", frontend: "../web" }, url: "http://localhost:3000" } })
```

## Phases

```
Detect       stack(s) + repo layout; untracked/WIP repos flagged
Investigate  ┐ feature mode only: existing implementation, user journey, broken links, docs to update
Spec         ┘ spec mode: resolve + load tasks, AC, Must-NOT-change; approved → in-progress
Build        TDD per task with the stack's specialist; ticks tasks.md
Gates        detected tooling per repo (+ contract-sync when split repos have it); auto-fix loop (max 3); unreachable ≠ pass
Converge     audit code vs spec/tasks; APPEND gap tasks to tasks.md (never edits code)
             └─ gaps → Build → Gates → Converge again; max 2 rounds, leftovers logged
Visual       Chrome extension: theming, layout, responsive, contrast (UI changes only)
Review       4 dimensions; each finding survives a 3-vote refutation panel
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
- Result: `specId, specFolder, built, failedTasks, convergeRounds, remainingGaps, gatesPassed, confirmedFindings, acceptanceResolved, e2e, docsUpdated, manualTestPlan, next, reportPath, report`. The report is saved to `.ai/reports/ship-<spec>-<timestamp>.md` in the spec's repo.

## Done when

`SHIP`: every task built, gates green (contract-sync included), Converge found no gaps (or none left unbuilt), no critical finding, acceptance resolved (journey + all AC and NFR + no MNC change), the e2e test passing when it ran, no WIP repo. The report ends with `Next: /open-pr --spec=<id> --report=<reportPath>`, so `/open-pr` reuses the gate results and verdict instead of re-running them. Anything less is `FIX-FIRST` / `BLOCKED` — surface the blockers and offer `/simple-task` or a re-run on the fixes.
