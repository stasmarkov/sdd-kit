---
name: product-brief
description: Use when starting a new product with no product-brief.md, asking what to build first, or folding feedback into the backlog (--intake). Writes the brief, draft business rules and a sliced backlog.
argument-hint: "<idea> | --revise [path] | --intake <text | file>"
allowed-tools: Agent, Read, Write, Edit, Grep, Glob, AskUserQuestion
license: Apache-2.0
metadata:
  version: "1.0"
  subagents: "requirements-analyst, code-explorer"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---

# Product brief

The start of the lifecycle: an idea becomes a **brief** (what we build, for whom, under which rules) and a **backlog** (in which order, in slices `/sdd` can take one at a time). greenfield-build treats the brief as its constitution; `write-spec`, create-spec, and ship-feature find it (current folder or its parent), cite the BR ids a slice enforces in the spec (`brs:` frontmatter, `AC-n (BR-nn)`), and move the slice from `specced` to `shipped` in `backlog.md` as the spec is built. The rules here must therefore be stable and testable.

```
LOCATE → ELICIT (≤ 3 rounds) → WRITE BRIEF → SLICE + ORDER → CHECK → APPROVE ORDER → HAND OFF
                                     --intake: CLASSIFY → FOLD IN (approved order untouched)
```

## Usage

```bash
/product-brief "A small job board where companies get a careers page and reviews are moderated"
/product-brief --revise                          # revise ./product-brief.md
/product-brief --revise ../product-brief.md
/product-brief --intake "Users say search ignores remote jobs. What if employers could post jobs?"
/product-brief --intake docs/feedback/2026-10-sprint-review.md
```

Outputs, lowercase, side by side: `product-brief.md` and `backlog.md`. Templates: [assets/product-brief.template.md](assets/product-brief.template.md), [assets/backlog.template.md](assets/backlog.template.md). No code, no specs, no config files.

## Step 1 — Locate

| Situation | Where the files go |
|-----------|--------------------|
| Polyrepo workspace: the current folder holds sibling repos (`*/.git`, e.g. `api/` + `web/`) | the workspace root (current folder) |
| Inside one repo of such a workspace, and `../product-brief.md` exists | the parent folder |
| Single repo, or an empty folder for a new app | the current folder |

Then pick the mode:

- `product-brief.md` **missing** and no `--intake` → new brief from the idea text.
- `product-brief.md` **missing** with `--intake` → see [Intake without a brief](#intake-without-a-brief).
- **Exists** and no flag given → ask with `AskUserQuestion`: *Revise the brief* / *Fold this in as intake* / *Separate product in another folder*. Never overwrite an existing brief.
- `--revise` → load the brief and backlog, go to [Revise](#revise---revise).
- `--intake` → go to [Intake](#intake---intake).

If code already exists (route definitions, controllers or handlers, UI pages, `.ai/specs/`), Grep it before slicing so the backlog never re-plans shipped work; matching specs fill the slice's `Spec:` field. Delegate to `code-explorer` only when that search spans several repos.

## Step 2 — Elicit (requirements-analyst, at most 3 rounds)

The analyst reasons; this session asks. Subagents cannot reach the user, so each round is:

1. Spawn `requirements-analyst` (`Agent`) with the idea, any intake material, the answers so far, and this instruction:

   > Score each brief section 1–5 for clarity: Problem, Users and roles, MVP scope, Non-goals, Business rules, Success metrics (5 = complete, 4 = minor gaps, 3 = several gaps, 2 = significant clarification needed, 1 = no actionable detail). Return the scores, the lowest-scoring gaps, and at most 4 questions that would raise them most, each with 2–4 concrete options and a recommended one. Ask about WHAT and WHY, never about implementation.

2. Ask the returned questions with `AskUserQuestion` (one batch, `multiSelect` only when several answers can apply).
3. Re-score with the answers.

**Stop** when Problem, Users and roles, and MVP scope all score ≥ 4 and nothing scores below 3, **or after three rounds**. Whatever is still unclear becomes an Open question in the brief, not a guess. A precise idea (all ≥ 4 on the first score) skips the questions.

Useful question themes: who pays or who loses if this fails; which role can do what; the one thing the MVP must prove; what is explicitly *not* in v1; which numbers decide success; hard constraints (auth, money, personal data, hosting).

## Step 3 — Write `product-brief.md`

Fill [assets/product-brief.template.md](assets/product-brief.template.md). Sections, in order: **Problem**, **Users and roles**, **MVP scope**, **Non-goals**, **Draft business rules**, **Success metrics**, **Open questions**.

Business rules are the part every later spec cites, so:

- **Numbered `BR-01`, `BR-02`, …** With more than one area, group by area in tens (`BR-01…09` accounts, `BR-10…19` postings) so related rules stay together and new ones slot in.
- **IDs are stable.** Never renumber. A dropped rule stays with *(retired: reason)*; a changed rule keeps its id and records the change source.
- **Testable.** One observable outcome per rule — who, what, and the visible result, including the HTTP status and error code when the API answer is already known (`422 profile_required`). "Fast", "secure", "user-friendly" are not rules; turn them into a number or move them to Success metrics.
- **Draft until a human validates.** Frontmatter `status: draft` and an `owner` who validates. Unvalidated rules are assumptions: a spec that cites one carries it as an unchecked `Assumption: BR-nn …` Open question, so it cannot be approved until the owner validates the rule or the user accepts the assumption. On validation set `status: validated`, `validated_by`, and `validated_at`. Once validated, the backend's `docs/context/business-rules.md` becomes canonical and keeps the same ids.
- **Rules, not design.** No table names, class names, or libraries. A stack constraint the owner insists on (e.g. "<framework> API + <framework> frontend", "SQLite for the MVP") goes under Problem → Constraints.

## Step 4 — Slice and order `backlog.md`

Fill [assets/backlog.template.md](assets/backlog.template.md).

### What a slice is

A **vertical slice** is one user-visible outcome through every layer it needs. For a typical web app that is a schema change and model, a service, an API endpoint, tests, and a UI page (the stack add-on's conventions skill says what each looks like). A layer on its own ("create all migrations", "build the design system") is not a slice.

Every MVP scope item maps to one or more slices. Each slice has a stable id (`SL-01`…), one-sentence **Outcome** (who can do what, observably), **Entry point** (the page or endpoint a user hits), **Size**, the **BRs** it enforces, **Depends on**, **Blocked by**, **Status**, **Spec**, **Source**, and ends with a one-line **Run:** `/sdd …` invocation.

### Size

Same yardstick as `write-spec`, so the slice size predicts the spec size:

| Size | Signals | Under /sdd |
|------|---------|-----------|
| XS | ≤ ~3 files, one obvious change, no new rule | trivial route, no spec |
| S | one area, 1–3 tasks, no schema or public API change | spec-lite + tasks |
| M | several layers, 4–7 tasks, or a schema/API change | full M spec |
| L | cross-cutting, 8+ tasks, or several new rules | L spec — first try to split it |

Anything larger than L is an epic: split it before it enters the backlog. Prefer S and M.

### Order

Order is position in the file; ids never change. Apply in sequence:

1. **Walking skeleton first.** `SL-01` is the thinnest end-to-end path that proves the stack, usually a public read path over seeded data with no auth. In a greenfield project its Run line goes to the new-app route (greenfield-build builds it).
2. **Data before behavior.** A slice that reads or changes entities another slice creates depends on that slice, unless the data is seeded.
3. **Identity before roles.** Registration and login come before any slice whose BRs restrict an action to a role.
4. **Name every blocker.** *Decision* (a technology choice: Run it as `/sdd "X or Y?"` first, then cite the ADR), *Knowledge* (an open question `Q-nn`), *External* (credentials, a third-party account, legal sign-off). A blocked slice can sit in the order but cannot be started.
5. **No cycles.** Two slices that depend on each other are one slice sliced wrong: merge or re-cut them.
6. **Tie-break** independent slices by value and risk: the riskiest or most valuable first.

Write the resulting **Build order** line at the top of the backlog, with independent slices grouped: `SL-01 → SL-02 → {SL-03, SL-04} → SL-05`.

### Run line

- Greenfield first slice: `/sdd "New app — <product>, first slice SL-01: <outcome>. <framework> API + <framework> frontend. Conventions from CLAUDE.md and product-brief.md."`
- Later slices: `/sdd "SL-05: <outcome> (BR-30, BR-31, BR-32). Rules in product-brief.md."`
- When the slice has a tracker ticket: `/sdd HIRE-5`, with the ticket key in the slice's `Ticket:` field.

## Step 5 — Check

Before showing anything, verify and fix:

- [ ] Every MVP scope item is covered by at least one slice; no slice is outside MVP scope or contradicts a Non-goal.
- [ ] Every BR is cited by at least one slice, or marked *(cross-cutting)* in the brief.
- [ ] Every BR id a slice cites exists and is not retired.
- [ ] Every `Depends on` id exists and appears earlier in the order; no cycles.
- [ ] Every `Q-nn` named in `Blocked by` exists under Open questions.
- [ ] No slice is larger than L; every slice ends in a `Run:` line.
- [ ] No code, class names, or table names in either file.

## Step 6 — Approve the order

Show the Build order line, each slice's id, outcome, size and blockers, and the open questions. Ask with `AskUserQuestion`: **Approve the order** / **Reorder or re-cut** / **Stop here (draft)**. On approval set every listed slice to `Status: approved`. The approved order is the contract that `--intake` and greenfield-build append to without disturbing.

## Revise (`--revise`)

1. Load `product-brief.md` and `backlog.md`; ask what changed (or take it from the argument).
2. Edit in place. Keep every id. A new rule takes the next free number in its area; a changed rule keeps its id and gets `Source: <why, when, who>`; a dropped rule is retired, not deleted.
3. Find slices citing changed or retired BRs:
   - `proposed` or `approved` → update the slice (outcome, size, BRs).
   - `specced` or `shipped` → the change is new work: add a slice, or point to `/write-spec --spec=<ref>` when the spec is not built yet.
4. Re-run the Step 5 checks. Changing a validated rule sets the brief back to `status: draft` until the owner re-validates.

## Intake (`--intake`)

Input is text or a file path (Read it). Split it into items, one distinct ask each, then classify every item:

| Class | Signals | Goes to |
|-------|---------|---------|
| **New slice** | "need", "want", "add", "what if", "could we", a capability not in the backlog | `backlog.md`, `Status: proposed`, `Source: intake <date or doc>` |
| **BR change** | contradicts, tightens, or adds a rule ("employers should also…", "only admins may…") | the brief, through the Revise steps above |
| **Bug** | "broken", "error", "wrong", "used to work" — existing behavior misbehaves | not a slice: logged with a `/sdd "<symptom>"` line for the bug route. If the code does not exist yet, it is a BR change or a question instead |
| **Question** | "how", "why", "should we", "is it possible" | the brief's Open questions as `Q-nn` |
| **Duplicate** | already covered by a slice or a BR | log only, with a link to the existing id |
| **Non-goal** | matches a listed Non-goal | log only; ask whether to revisit the non-goal |

Show the classification table and confirm with `AskUserQuestion` before writing. Then:

- **Approved slices are never reordered.** New slices go after the last approved slice, ordered among the proposed tail with the Step 4 rules, and always inside `## Slices`, before `## Intake log`.
- If a new slice must come *before* an approved one, do not move anything: flag it in the hand-off and let the user decide.
- Every item, whatever its class, gets one line in the backlog's **Intake log** (date, source, item, class, where it went).
- Feedback from users of a shipped product often carries urgency signals (production down, data loss, security). Put those first in the hand-off with their `/sdd` line instead of only logging them.

**Structured input** (a tracker export or a 1.x `.ai/kanban.json`): each card is one item, and its title plus description is the text to classify. Phrasing signals are often missing, so classify from the content and confirm in the table. Cards whose status or column is done, in progress, or review, or that already name a spec, are not intake: skip them and list them in the hand-off as "skipped: already started or finished".

### Intake without a brief

Intake folds into an existing brief and backlog. When `product-brief.md` does not exist (typical for a brownfield project, or a 1.x user moving from `/workflow:kanban`), ask with `AskUserQuestion`:

- **Write the brief first** (recommended) → run the new-brief flow (Steps 1-6) with the intake material as input, then stop. Nothing is lost: the material becomes MVP scope, rules, and open questions.
- **Backlog only** → create `backlog.md` from `assets/backlog.template.md` with `brief:` left empty, then classify as above with three changes: there is no approved order, so new slices are numbered from `SL-01` in the order the user confirms; a **BR change** becomes a `Q-nn` under a `## Open questions` section of `backlog.md` (no brief to revise); and a **Non-goal** cannot be matched, so those items are classified on their other signals. Step 5's BR checks are skipped, and the hand-off says that `/product-brief` should be run before the first slice is specced.

## Hand off

Report in this shape, nothing more:

```
Brief:    product-brief.md (draft, owner Maya Chen) — 14 BRs, 2 open questions
Backlog:  backlog.md — 7 slices (1 S, 5 M, 1 L), order approved
Order:    SL-01 → SL-02 → {SL-03, SL-04} → SL-05 → SL-06 → SL-07
Blocked:  SL-03 by decision "Sanctum SPA cookies or tokens?" (run it first)
Next:     have Maya Chen validate the draft rules, then
          /sdd "New app — Hireboard, first slice SL-01: …"
```

For `--intake`, replace the counts with the per-class tally and list any slice that should jump ahead of an approved one.

## Rules

- Planning docs only: `product-brief.md` and `backlog.md`. Never write code, specs, `CLAUDE.md`, or settings. Suggest a `## Product` pointer in the project or workspace `CLAUDE.md` so later sessions find the brief; the user adds it.
- Never invent requirements to fill a section. Unknown → Open question.
- Never renumber BRs or slices, and never reorder approved slices.
- One product per brief. A second product gets its own folder.
- Specs, approval, and building belong to `/sdd`. This skill ends at an ordered backlog.
