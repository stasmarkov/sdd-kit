---
name: write-spec
description: Turn a ticket or request into a right-sized, execution-ready spec under .ai/specs/ — sizes the work first (XS gets no spec), investigates the codebase, asks clarifying questions, writes spec-lite.md + tasks.md with EARS/Given-When-Then acceptance criteria, a Must-NOT-change list, boundaries, and AC-to-test traceability, then runs a fresh-context clarity gate. Use when work needs planning before implementation, when /sdd routes a feature here, or to revise an existing spec. --background runs the create-spec research workflow instead.
argument-hint: "[description] | --ticket=PROJ-123 | --type=feature|bug|improvement|refactor | --priority=P0-P3 | --spec=<ref> (revise) | --background"
allowed-tools: Agent, Workflow, Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
metadata:
  mcp-tools: "context7"
  version: "4.0"
  subagents: "code-explorer, requirements-analyst"
  checkpoint_enabled: "true"
  last_verified: "2026-11-11"
  next_review: "2027-01-19"
---
On this host, run Workflow and Agent through the sdd-runtime skill.

Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# Write Spec

Turn unstructured input into a spec that is just big enough for the work, grounded in the codebase, and unambiguous to a reader who was not in the conversation.

```
SIZE → INVESTIGATE → CLARIFY → CREATE FOLDER → DOCUMENT → CLARITY GATE → HAND OFF
```

## Usage

```bash
/write-spec "Users can export order history as PDF"
/write-spec --ticket=PROJ-123 "Block refunds on top-up orders"
/write-spec "Checkout is slow on mobile" --type=bug
/write-spec "Split OrderService into pricing and fulfilment" --type=refactor
/write-spec --spec=PROJ-123 "Also cover partial refunds"     # revise an existing spec
/write-spec --background "Add 2FA to login"                  # create-spec workflow
```

## Step 1 — Size first (proportionality)

Classify type (feature / bug / improvement / refactor) and size before anything else. The size decides how much markdown is allowed.

| Size | Signals | Output |
|------|---------|--------|
| **XS** | ≤ ~3 files, one obvious change, no design choice, no behavior contract at risk | **No spec.** Recommend `/simple-task`, or `/sdd` (bug route) for a defect. Stop. |
| **S** | One area, 1–3 tasks, no schema or public API change | `spec-lite.md` + `tasks.md` only |
| **M** | Several files/layers, 4–7 tasks, or a schema/API change | S + `decisions.md` if real decisions were made + `manual-test.md` if there is a UI or user journey |
| **L** | Cross-cutting, multi-repo, 8+ tasks, or new business rules | M + `business-rules.md` (rules needing human validation flagged) + `references.md` (sourced research) — each only when it has content |

More than ~12 tasks → propose splitting into several specs. State the size and one-line reason; the user can override it.

**Refactor** (`--type=refactor`, behavior-preserving restructuring): size it the same way, but the contract is different. **Must NOT change is the primary contract** — list every observable behavior of the code being moved (responses, events, side effects, error codes, query results) as `MNC-n`; ACs are usually absent or limited to structural goals ("`OrderService` has no pricing logic"). Task 1 is always the characterization tests: guard tests that pin today's behavior for each MNC item and pass **before** any code moves, the same green-first pattern fix-bug uses for its must-not-change guard tests. There is no RED step for them: they describe behavior that already exists, and `/execute-task` and ship-feature read `type: refactor` and expect them green. Every later task keeps them green and never edits them. A refactor that changes behavior is a feature or a bug, not a refactor.

## Step 2 — Investigate

Search before asking: keywords from the input → related files, the patterns similar features use, what **already exists** for this request (check routes/components and `git log --oneline -20` so the spec never re-plans shipped work), and broken links in the user journey. Delegate to `code-explorer` only when the search spans many directories or repos.

**Product brief.** Look for `product-brief.md` in the current folder, then its parent (the workspace root of a polyrepo). When one exists, read it and the `backlog.md` next to it:

- Match the request to its slice (an `SL-nn` in the request, or the slice whose Outcome it is) and collect the BR ids it must enforce: the slice's `BRs` plus any other rule the request touches. Retired rules never count.
- Copy each rule's text into the spec where it drives behavior and cite the id in the AC that proves it (`AC-2 (BR-31): …`). Record the ids in the frontmatter (`slice`, `brs`).
- If the brief's frontmatter is `status: draft`, its rules are **assumptions**: add one unchecked Open question per cited rule (`Assumption: BR-31 is an unvalidated draft rule (owner Maya Chen)`). The clarity gate (Step 6) keeps the spec from approval until the owner validates them or the user accepts each one as an assumption.
- After writing the spec, set the slice's `Spec:` to the spec id and its `Status:` to `specced` in `backlog.md`. ship-feature and `/execute-task` set it to `shipped` when they mark the spec `done`.

**Project context (Golden Triangle).** Read the documented rules and structure the spec must respect: the files listed under "Always load" in the project's AGENTS.md or AGENTS.md, by default `docs/context/business-rules.md`, `docs/context/architecture.md` and `docs/api/api-contracts.md` (the same files the create-spec workflow reads).

- **Where**: look in the root of each repo the spec touches (`git rev-parse --show-toplevel`, plus any repo named in the request), then in the workspace root or parent, as for the brief. A repo's own copy wins for rules about that repo. List every file read in the spec's Context section.
- **How much**: read `business-rules.md` in full; in `architecture.md` and `api-contracts.md`, read only the sections for the area the request touches.
- **Citing**: copy each rule that drives behavior into the spec and cite it in the AC that proves it, by its BR id when it has one (`AC-3 (BR-12): …`), otherwise by file and heading (`AC-3 (business-rules.md#Rule: Refund window): …`). Never invent an id. `brs` keeps only the product-brief ids, as in the create-spec workflow; triangle rules are cited in the ACs and listed under Context.
- **Brief and rules disagree**: when `business-rules.md` and the brief hold the same id, the `business-rules.md` text wins, because it is the validated copy. If the two texts differ, add an unchecked Open question naming both sources.
- **Conflicts**: a request that contradicts a documented rule gets an unchecked Open question naming the rule (`Conflict: the request allows refunds after 30 days; BR-12 forbids them`). The spec never overrides a rule silently; the clarity gate holds approval until someone decides.
- **Unvalidated rules**: a cited rule that still carries the line `**Validation**: needs human validation` (written by `/write-docs`) is an assumption: add one unchecked Open question per such rule (`Assumption: BR-12 is unvalidated (generated by /write-docs)`), as for draft brief rules.
- **Architecture and API**: follow the layers and boundaries in `architecture.md` in Technical context > Approach. The contract shape in `api-contracts.md` of every endpoint the work touches becomes an `MNC-n` item unless the request changes it.
- **Missing files**: when none of them exists, say so once in the hand-off with the fix `/write-docs --type=all`, and carry on.
- **Background mode**: when `--background` follows, skip this read here and pass the rules already found in `answers`; the create-spec workflow reads the triangle itself.

## Step 3 — Clarify

Ask 2–4 `AskUserQuestion` questions grounded in what the investigation found (scope, access, edge cases; for bugs: frequency, repro, expected vs actual, **what must not change**). Skip when the input is already precise.

## Step 4 — Create the spec folder

Never compute "highest number + 1" — parallel sessions collide.

```bash
SLUG=refund-guard                            # lowercase-hyphenated, ≤ 40 chars
if [ -n "$TICKET" ]; then                    # tracker key, uppercase preserved: PROJ-123
  BASE="spec-${TICKET}-${SLUG}"
else
  BASE="spec-$(date +%Y%m%d-%H%M)-${SLUG}"
fi
mkdir -p .ai/specs
DIR=".ai/specs/$BASE"; n=2
until mkdir "$DIR" 2>/dev/null; do          # mkdir without -p fails if it exists → atomic
  DIR=".ai/specs/$BASE-$n"; n=$((n+1)); [ "$n" -gt 20 ] && { echo "cannot create $BASE"; exit 1; }
done
```

The spec id is the folder name (`spec-PROJ-123-refund-guard`, `spec-20261018-1430-order-pdf-export`).

### Resolving an existing spec (`--spec=<ref>`)

Accept any of: full folder name, numeric id of a legacy spec (`0042`, `spec-0042`, `14`), ticket key (`PROJ-123`), or timestamp id (`20261018-1430`).

```bash
REF="${REF#.ai/specs/}"; REF="${REF%/}"; KEY="${REF#spec-}"
if [ -d ".ai/specs/$REF" ]; then echo ".ai/specs/$REF"
elif printf '%s' "$KEY" | grep -qE '^[0-9]+$'; then
  ls -d .ai/specs/*/ | grep -E "/(spec-)?0*$((10#$KEY))-"
else
  ls -d .ai/specs/*/ | grep -iE "/(spec-)?${KEY}-"
fi
```

One match → use it. Several (two specs for one ticket, legacy duplicate numbers) → list them and ask which. None → say so and offer to create one.

## Step 5 — Document

Fill the templates — they define frontmatter, sections, and examples:

- `spec-lite.md` → [references/spec-lite.template.md](references/spec-lite.template.md)
- `tasks.md` → [references/tasks.template.md](references/tasks.template.md)

Non-negotiables:

- **Frontmatter**: `id, title, type, size, priority, status: draft, ticket, stakeholders, approved_by, approved_at, created, stacks`, plus `slice` and `brs` when a product brief governs the work. Leave `approved_*` empty — only `/sdd` sets them.
- **Acceptance criteria** in EARS (`WHEN … THE SYSTEM SHALL …`) or Given/When/Then, numbered `AC-n`, one observable outcome each.
- **Must NOT change** (`MNC-n`): existing behavior that must stay identical. Mandatory for bugs, improvements and refactors.
- **Quality attributes** (`NFR-n`, optional, M/L): authorization per role, p95 budget with its measured baseline, WCAG level, personal-data handling — each with a target and a test in the Traceability table. Add the section whenever one of these is at stake; skip it otherwise.
- **Rollout** (optional; required for L, migrations, and public API contract changes): the flag name or "none", the deploy order (backend before frontend, expand/contract for breaking changes), and the rollback path. With the ops add-on installed, name and document the flag with its `feature-flag` skill.
- **Boundaries**: Always / Ask first / Never.
- **Traceability** table in `tasks.md`: every AC, MNC and NFR maps to a test or a manual-test step, and every task lists `Covers:`.
- Verification gates list only tooling that exists in the project.

## Step 6 — Clarity gate

First run the deterministic lint and fix every blocker (`error` line) before spawning the reviewer; warnings are reported but do not block:

```bash
node "scripts/spec-lint.mjs" <spec-folder>
```

Spawn a **fresh-context** reviewer (`Agent`, general-purpose) and give it only the spec folder path — no conversation summary:

> Read only the files in `<spec-folder>`. Do not open any other file. List every hidden assumption, undefined term, ambiguous criterion, and question an implementer would have to guess at. Return a numbered list, or "none".

- Write each item into the spec's **Open questions** section as an unchecked box, next to any draft-rule assumptions from the product brief (Step 2).
- Resolve them with the user (`AskUserQuestion`, batched): **answer** → fold into the spec and check the box; **accept as assumption** → check the box with `Accepted assumption: …`.
- The spec is **ready for approval** only when every box is checked. Status stays `draft` — approval happens in `/sdd`.

## Step 7 — Hand off

```
Spec:   .ai/specs/spec-PROJ-123-refund-guard/   (size M, status draft)
Files:  spec-lite.md, tasks.md (5 tasks), manual-test.md
Context: business-rules.md (BR-12, #Rule: Refund window), architecture.md
         (or: none found; run /write-docs --type=all)
Clarity gate: 3 raised, 3 resolved — ready for approval
Next:   /sdd spec-PROJ-123-refund-guard   (approve → ship-feature)
        or /execute-task --spec=PROJ-123   (task by task)
```

## Background mode (`--background`)

Runs the `create-spec` workflow: Detect → Classify (size) → Research (codebase per repo ∥ sourced web ∥ docs) → Synthesize → Document → Clarify. Prefer it for L-size or unfamiliar areas; it cannot ask questions mid-run, so do Steps 1–3 here first and pass the answers in (Step 2 skips the Golden Triangle read in this case; the workflow reads it).

```
Workflow({ name: "create-spec", args: { description: "<refined request>", ticket: "PROJ-123", type: "feature", priority: "P1", answers: { … }, repos: { backend: "../api", frontend: "../web" } } })
```

It returns `{ specId, specFolder, size, files, taskCount, openQuestions, ready }` (or `{ size: "XS", recommendation }` with no spec). Present the folder, any `business-rules.md` items flagged for human validation, and the open questions — resolve those with the user as in Step 6 before handing to `/sdd` for approval. Model tiers: `docs/effort-guidelines.md` in the framework repo.

## Subagents

- `code-explorer` — broad codebase search (Step 2).
- `requirements-analyst` — L-size specs where filling the template needs domain reasoning.
- general-purpose (fresh context) — the clarity gate. Always a new agent, never the one that wrote the spec.

Work directly for S and most M specs. Source rules: the `source-verification` skill.
