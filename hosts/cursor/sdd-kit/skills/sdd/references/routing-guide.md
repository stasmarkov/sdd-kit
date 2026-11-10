# Routing Guide

**Default entry point: `/sdd <ticket-id | description>`.** It classifies the request, confirms the route, and launches a fixed pipeline. Use the skills below directly only when you deliberately want one step.

## Decision tree

```
A product idea with no brief or backlog yet?       → /product-brief   (--intake for feedback on an existing backlog)
Clear change, ≤ ~3 files, no design choice?        → /simple-task
CI is red or the build is broken?                  → /fix-ci   (a test showing wrong behavior → /sdd bug route)
Existing behavior is broken?                       → /sdd (bug route → fix-bug)
A spec already exists for this work?               → /execute-task --spec=<ref>   (task by task)
                                                     /sdd <ref>                   (approve → ship-feature)
Needs planning before building?                    → /write-spec   (--background for L-size research)
Choosing between technologies/approaches?          → /sdd (decision route → tech-research)
API / schema / UI design question?                 → /design-api | /design-schema | /design-ui (design plugin)
Open research or "why does this happen?"           → /investigate
Code is written and needs review?                  → /deep-review   (--depth=standard for PR review)
Need test results or coverage?                     → /run-tests
Code is reviewed and ready to merge?               → /open-pr --spec=<ref>
```

## Common scenarios

| Scenario | Skill |
|----------|-------|
| New product idea, no brief yet | `/product-brief "<idea>"` |
| Feedback or feature requests for the backlog | `/product-brief --intake` |
| Ticket to deliver | `/sdd PROJ-123` |
| Small change (copy, config, rename) | `/simple-task` |
| Bug with a repro | `/sdd` → fix-bug |
| Plan a feature (no build yet) | `/write-spec` |
| Revise a spec | `/write-spec --spec=<ref>` |
| Build an approved spec step by step | `/execute-task --spec=<ref>` |
| Resume after a context reset | `/execute-task --spec=<ref> --continue` or `/simple-task --continue=TASK-ID` |
| Keep going until the spec is green | `/goal every task in .ai/specs/<spec>/tasks.md is checked and gates pass` |
| Pre-merge check | `/deep-review --staged` |
| Red CI or broken build | `/fix-ci` |
| Open the pull request | `/open-pr --spec=<ref>` (fix-bug: `--report=<path>`) |
| Make a mistake impossible to repeat | `/learn <what went wrong>` |
| Grade an artifact against a rubric | `/grade --domain=api --target=<path>` |
| Lint only | `/lint` |
| Scaffold CRUD | `/generate --crud=<Entity>` |
| Database change | `/migrate-db` |
| QA plan / docs for shipped code | `/sdd` → qa-and-docs |
| Where was I, what next, project health | `/progress`, `/progress --next`, `/progress --health` |
| Board of all specs and backlog slices | `/spec-board` |

Spec references accept a folder name, legacy number (`0042`), ticket key (`PROJ-123`), or timestamp id (`20261018-1430`).

## Beyond the routes

The rest of the lifecycle, in order. Each row points at a component that already exists.

| Stage | When | Use |
|-------|------|-----|
| Discover | An idea, user feedback, or "what should we build first?" | `/product-brief` (brief + sliced backlog); `--intake` folds feedback into an existing backlog |
| Spec | Work needs planning | `/write-spec`; `--type=refactor` for behavior-preserving changes (must-not-change first, characterization tests before any edit) |
| Design | An API, schema, or architecture question before building | `/design-api`, `/design-schema`, the `api-architect` agent; a technology fork goes to the decision route (`/sdd "X or Y?"` → ADR) |
| Build | An approved spec, scaffolding, a database change | `/execute-task --spec=<ref>`, `/generate`, `/migrate-db` |
| Verify | Tests, lint, red CI, split repos drifting apart | `/run-tests` (`--frontend` for the frontend suite, `--e2e` for browser journeys), `/lint`, `/fix-ci`, contract-sync for a backend + frontend in separate repos (the backend add-on's `contractSync.template`: `.cursor/sdd-kit/templates/<addon>/contract-sync/` in a file-copy install, `templates/contract-sync/` in the add-on root in plugin mode) |
| Performance | A slow endpoint or page | Measure a baseline and set a target first; then the `performance-tester` agent (backend) or the stack add-on's profiler skill (frontend, Core Web Vitals and bundles) |
| Cleanup | Dead code, unused classes or exports | the `code-quality` agent in cleanup mode (reports with evidence), then `/sdd` (trivial) or `/write-spec --type=refactor` for the removal |
| Security and dependencies | Before a release, after adding packages or auth code | `/security-scan`, `/upgrade-deps` (`--audit-only` to report); a full, coverage-led audit with verified findings is `/sdd` → security-audit (comparison: USAGE-EXAMPLES section 10) |
| Review and PR | Code is done | `/deep-review`, then `/open-pr --spec=<ref>` |
| Release | Cutting a version | `/changelog --release <version>` (readiness, semver, CHANGELOG, tag), then `/deploy` from the ops add-on |
| Operate | Production is degraded | ops add-on `/health-check`, `/incident`; the root-cause fix goes to `/sdd` (bug route), a recurring class to `/learn` |
| Learn | A mistake should never recur | `/learn` (a test, static rule, path rule, or documented invariant) |
| Visibility | Status across specs | `/spec-board` (board, including backlog slices), `/progress` (where was I, next task, `--health`) |
| Docs | Docs from code, imported docs, drift | `/write-docs` (generate), `--import <file\|url>`, `--audit`; `/sync-obsidian` for verified content |
| Brownfield onboarding | Taking over an existing codebase | the headless review pipeline in `scripts/review/README.md`, then `/write-docs --type=all`. Ignore its `knowledge-graph-entities.js` output: the knowledge graph was retired in 2.0 and nothing reads it |
