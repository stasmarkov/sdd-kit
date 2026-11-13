# Route: new app → greenfield-build

From an empty target to one shippable vertical slice. Later features go through the `feature` route.

## Args

| Arg | Meaning |
|-----|---------|
| `idea` | What the app/service does and what the first slice must prove. With a brief: the first backlog slice that is not shipped (Outcome, Entry point, BR ids). |
| `brief` | Path to `product-brief.md` from `/product-brief`. Read as the constitution; `backlog.md` next to it receives the next slices. |
| `stack` | a stack key from an installed stack add-on, or `other` |
| `repos` | `{ backend, frontend }` for split repos. |
| `url` | Dev-server URL for acceptance. |
| `force` | Allow scaffolding into a directory with tracked files (default refuses). |
| `models` | Per-run tier override. |

No `product-brief.md` yet? Offer `/product-brief` first (SKILL.md Step 4c). Ask before launching: stack, single vs split repos, the first slice, hard constraints (auth, data store, hosting). Have the user approve the architecture direction.

Launch with the plugin name and fall back to the bare name on "not found" ([workflow name rule](../SKILL.md#workflow-names)).

```
Workflow({ name: "sdd-kit:greenfield-build", args: { idea: "SL-01: …", stack: "<stack-key>", repos: { backend: "./api", frontend: "./web" }, url: "http://localhost:3000", brief: "product-brief.md" } })
```

## Phases

```
Detect        confirm the target is empty (tracked tree → BLOCKED unless force)
Constitution  product brief (scope, BR ids) + CLAUDE.md + skills as governing principles
Architecture  api-architect: stack, layout, data model, first slice; 3-vote verify against the constitution
Scaffold      framework skeleton with working gate tooling (the manifest's gates: format, lint, types,
              test, build, and e2e when there is a UI journey), contract-sync for split repos;
              a gate that cannot run stops here (FIX-FIRST); then CI on devops-engineer; committed checkpoints
Slice         one vertical slice, TDD, backend before frontend
Gates         scaffold builds, slice passes tooling; auto-fix loop
Acceptance    trace the slice's user journey end-to-end
Handoff       getting-started.md, architecture.md (ADR), manual-test.md
Report        next slices appended to backlog.md (created if missing); SHIP-SLICE / FIX-FIRST / BLOCKED
```

## Outputs

A committed scaffold with working gates and CI, one working slice, the three handoff docs, and `backlog.md` with the built slice marked shipped and the next slices appended, each with its `/sdd` Run line (visible in `/spec-board`'s Backlog column).

## Done when

`SHIP-SLICE`: the slice passes gates and acceptance.

`FIX-FIRST` at Scaffold (a gate that applies to the skeleton cannot run; gates the scaffold deliberately skips, such as Playwright with no UI journey, do not count): the result carries `architecture`, `firstSlice`, and `next`. Do not re-run greenfield-build, even with `force`: it would re-decide the architecture and scaffold over the committed skeleton. Fix the tooling, then build the first slice with the `ship-feature` call in `next` (or `/sdd` with the same description, which routes it as a feature now that code exists).
