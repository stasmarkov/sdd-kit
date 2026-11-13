# Route: audit → security-audit

Coverage-led security audit of a scope: reconnaissance, a validated coverage ledger, hunting waves, independent verification, a validated `findings.json` and report files. A lead is confirmed only when two independent verifiers agree on static source evidence; anything that needs running the code stays `needs_validation`. A quick checklist is `/security-scan`.

## Args

| Arg | Meaning |
|-----|---------|
| `scope` | `{ paths: [...] }` (default the whole repo) or `{ gitRange: "<base>..HEAD" }` (`<base>...HEAD` diffs from the merge base); not both. |
| `profile` | `quick`, `standard` (default, recommended) or `deep`. |
| `budget` | Optional integer cap on audit-agent invocations. |
| `maxUnits` | Cap on hunted units: how many ledger units get a hunter in the whole run, 1 to the workflow limit (default 12). The ledger itself may hold more; the rest are deferred with `max_units_cap`. |
| `outputDir` | Run directory: `.ai/security-audit/` or `~/security-audit-skill/<repo>/`. Kept out of version control. |
| `repo` | Target repo path or role when several repos are detected. |
| `models` | Per-run tier override. |

Launch with the plugin name and fall back to the bare name on "not found" ([workflow name rule](../SKILL.md#workflow-names)).

```
Workflow({ name: "security-audit", args: { scope: { paths: ["app/Payments"] }, profile: "standard", maxUnits: 12, outputDir: ".ai/security-audit/", repo: "api" } })
```

## Phases

```
Detect        repo layout and target repo (gate commands recorded, never run)
Setup         git check, ignored run dir, revision stamp, pinned skill check, budget gate
Recon         product, principals, entry surfaces, local visibility
Plan          architecture summary and the coverage ledger, validated
Hunt          one hunter per ledger unit, in waves
Critic        fresh coverage critic after each wave and a final-clean pass
Validate      two verifier votes per candidate, a tie-breaker on disagreement
Findings      findings.json checked by both vendored validators, one repair
RecordVerify  a fresh agent checks every retained record (not in quick)
Report        REPORT.md, FINDINGS-DETAIL.md, NEEDS-VALIDATION.md and the committed summary
```

## Outputs

Run artifacts in `outputDir`, a target-neutral summary saved to `.ai/reports/`, and `{ reportPath, runDir, runStatus, incompleteReason, counts, coverage, next }`.

## Done when

`runStatus` is `complete`: the ledger and `findings.json` pass the validators and the retained records were verified. A run that stops on a cap or an unresolved check is `incomplete` with its `incompleteReason`; report that, do not call it done. The audit changes no target code.
