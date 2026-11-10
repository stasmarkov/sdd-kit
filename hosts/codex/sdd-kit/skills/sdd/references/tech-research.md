# Route: decision → tech-research

Chooses between technologies or approaches and writes an ADR. For planning an already-chosen feature use `/write-spec`.

## Args

| Arg | Meaning |
|-----|---------|
| `question` | The decision, e.g. `"Queue driver for certificate jobs: Redis vs SQS vs database"`. |
| `options` | Candidate options (optional; Frame proposes them otherwise). |
| `criteria` | Decision drivers, weighted if known (must / should / nice). |
| `repos`, `models` | As in the other routes. |

```
Workflow({ name: "tech-research", args: { question: "PROJ-77: REST vs tRPC for the admin API", options: ["REST", "tRPC"], criteria: ["type safety", "ops cost"] } })
```

## Phases

```
Detect    stack(s) the decision must fit
Frame     weighted criteria + candidate options
Research  per-option sourced web research ∥ one codebase-fit pass
Verify    adversarially check each claim; drop unsourced/marketing claims
Decide    score, recommend + runner-up, surface verifier disagreement
Document  ADR under docs/adr/
Report    recommendation, confidence, dropped claims, open questions
```

## Outputs

An ADR (Context, Decision Drivers, Options, Decision, Consequences, Open Questions, Sources) and a report listing the claims that did **not** inform the decision.

## Done when

ADR written, every claim behind the recommendation sourced and verified, and a human has signed it off.
