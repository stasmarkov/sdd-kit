# Route: shipped → qa-and-docs

Traceable QA plan + user/dev docs for code that already exists, graded against the implementation.

## Args (one scope)

| Arg | Scope |
|-----|-------|
| `spec` | Code built for that spec (any spec reference form); its acceptance criteria become the trace anchors. |
| `paths` | Array of globs. |
| `gitRange` | `a..b` — files changed in the range. |
| string | Feature name, located by searching the codebase. |

Plus `repos` and `models` as in the other routes.

```
Workflow({ name: "qa-and-docs", args: { spec: "spec-PROJ-123-refund-guard" } })
Workflow({ name: "qa-and-docs", args: { gitRange: "HEAD~20..HEAD" } })
```

## Phases

```
Detect         stack(s) + scope
Index          files → methods/routes/components → features (bottom-up)
Criteria       spec ACs, or testable criteria inferred from code
QAPlan ∥ Docs  case → criterion → files  ∥  docs grounded in code
Grade          completeness / helpfulness / truthfulness; coverage + phantom-link gate
Report         coverage matrix + grade + artifact paths
```

## Outputs

`qa-plan.md` with a criterion → test coverage matrix and manual steps; created/updated docs (lowercase filenames); a grade listing phantom links and uncovered criteria.

## Done when

Grade passes: every criterion has a covering test case and no doc/test claim points at code that doesn't exist. The human reviews the draft before publishing.
