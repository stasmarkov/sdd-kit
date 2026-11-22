# Route: bug → fix-bug

Reproduce → root-cause → failing regression test → minimal fix → gates → acceptance. No spec: the pipeline is the spec.

## Args

| Arg | Meaning |
|-----|---------|
| `bug` | Symptom with repro steps and expected vs actual. Prefix the ticket key: `"PROJ-123: refund button returns 500 for top-ups"`. |
| `ticket` | Tracker key (optional; taken from a `PROJ-123:` prefix on `bug` when omitted). Names the saved report. |
| `mustNotChange` | Array of existing behaviors that must stay identical (e.g. `["card refunds still need approval"]`). RootCause adds any it finds on the same code path. |
| `repos` | `{ backend, frontend }` for a polyrepo project. |
| `url` | Dev-server URL for the acceptance trace. |
| `answers` | Owner answers to the questions a previous run returned: `{ <question id>: <answer> }`. Answered questions are not asked again. |
| `models` | Per-run tier override. |

Launch with the plugin name and fall back to the bare name on "not found" ([workflow name rule](../SKILL.md#workflow-names)).

```
Workflow({ name: "sdd-kit:fix-bug", args: { bug: "PROJ-123: …", ticket: "PROJ-123", mustNotChange: ["…"], repos: { backend: "../api", frontend: "../web" }, url: "http://localhost:3000" } })
```

## Phases

```
Detect          stack(s) + repo layout
Base            base revision per repo and a gate baseline before any code is written; a gate failing the
                same way afterwards is `pre-existing` (no fix agent, no block), a new failure blocks
Reproduce       test-writer runs the failing path with the planned (wrapped) test commands, capture the actual
                failure; a scratch test is deleted, nothing committed, no non-test file changed (files left
                behind are logged); no test command: read the code and call what it can reach
                cannot reproduce = NEEDS-INFO, stop
                slowness: the repro is a measured baseline + target (p95, query count, LCP)
RootCause       file:line + mechanism + Must-NOT-change list; 2 adversarial votes, a tie-break only on a split
RegressionTest  failing test (red for the right reason) + green guard test per MNC item; committed as
                test(<area>): ... on a fix/<KEY>-<slug> branch it creates when HEAD is a base branch
                (/sdd offers the branch in its launch confirmation)
Fix             minimal change; regression and guard tests are immutable
Gates           detected tooling per repo; auto-fix loop
Review          the fix diff on correctness and security with two verify votes (plus a second security pass
                on risk areas); one fix round for confirmed critical/major findings, then gates and re-verify
Acceptance      re-walk the ORIGINAL report and every MNC behavior (diff-checked)
Docs            doc-impact list computed in script, owners mapped, affected docs updated, one grader pass; skipped as "no doc owns this" when none exists
Report          verdict + manual test plan (a `[BUG-1]` step plus one per MNC item, coverage checked in script) + Prevention (bug class and the guard that would catch it, proposed only) + Next
```

## Outputs

Root cause with evidence, the committed regression and guard tests, the fix, a manual test plan (written to `.ai/reports/test-plan-<slug>-<YYYYMMDD-HHMM>.md`, or the spec folder's `manual-test.md` when there is one) covering the original case and each MNC item, a Prevention section, and `{ recommendation, assurance, mustNotChange, acceptance, gatesPassed, changedFiles, securityReview, performance, next }`; `securityReview` is `{ ran, deep, findings }`.

Also returns `questions` and `assumptions` (empty lists when nothing is open; item shapes and the hand-off in [Step 5 of /sdd](../SKILL.md#step-5--hand-off)). A blocking question from Reproduce or RootCause ends the run before the regression test is written; relaunch with `answers`.

## Done when

`FIXED`: regression test red → green, guard tests green, gates green, no confirmed critical or major review finding, `securityReview.ran` true, acceptance resolved (symptom gone, every MNC behavior identical, the performance target met for a slowness report), no WIP repo. Otherwise `NOT-RESOLVED` or `NEEDS-INFO`. A host error (not signed in, no account access, or a credit or usage limit) ends the run with `ABORTED` and `abort: { kind, line, phase }`, where `line` is the Fix line, for example `host session not authenticated. Fix: sign in to the host again, then re-run the same workflow`; no report is written and changes made before the abort are uncommitted, so check `git status` before re-running. A root cause that two rounds of verification do not confirm stops the run with `NEEDS-INFO` before any test is written. The report's Assurance table lists every check and its status; `FIXED` needs each one to pass.

The report is saved to `.ai/reports/fix-<ticket or slug>-<YYYYMMDD-HHMM>.md` in the backend (or only) repo, and the result carries its `reportPath`. On `FIXED` it ends with `Next: /open-pr --report=<reportPath>` and, when it has a Prevention item, `/learn <item>`.
