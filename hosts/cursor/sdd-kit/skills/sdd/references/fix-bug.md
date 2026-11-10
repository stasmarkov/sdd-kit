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
| `models` | Per-run tier override. |

```
Workflow({ name: "fix-bug", args: { bug: "PROJ-123: …", ticket: "PROJ-123", mustNotChange: ["…"], repos: { backend: "../api", frontend: "../web" }, url: "http://localhost:3000" } })
```

## Phases

```
Detect          stack(s) + repo layout
Reproduce       run the failing path, capture the actual failure → cannot reproduce = NEEDS-INFO, stop
                slowness: the repro is a measured baseline + target (p95, query count, LCP)
RootCause       file:line + mechanism + Must-NOT-change list; 3-vote adversarial verify
RegressionTest  failing test (red for the right reason) + green guard test per MNC item; committed
Fix             minimal change; regression and guard tests are immutable
Gates           detected tooling per repo; auto-fix loop
Acceptance      re-walk the ORIGINAL report and every MNC behavior (diff-checked)
Report          verdict + manual test plan + Prevention (bug class and the guard that would catch it, proposed only) + Next
```

## Outputs

Root cause with evidence, the committed regression and guard tests, the fix, a manual test plan covering the original case and each MNC item, a Prevention section, and `{ recommendation, mustNotChange, acceptance, gatesPassed, changedFiles, performance, next }`.

## Done when

`FIXED`: regression test red → green, guard tests green, gates green, acceptance resolved (symptom gone, every MNC behavior identical, the performance target met for a slowness report), no WIP repo. Otherwise `NOT-RESOLVED` or `NEEDS-INFO`.

The report is saved to `.ai/reports/fix-<ticket or slug>-<YYYYMMDD-HHMM>.md` in the backend (or only) repo, and the result carries its `reportPath`. On `FIXED` it ends with `Next: /open-pr --report=<reportPath>` and, when it has a Prevention item, `/learn <item>`.
