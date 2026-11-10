# backlog.md template

Copy everything inside the fenced block into `backlog.md`, next to `product-brief.md`. Replace the example content and delete the `<!-- -->` guidance once filled.

`backlog.md` is read by tools as well as people (spec-board's BACKLOG column, greenfield-build's Report appending its next slices), so keep its shape:

- One `### SL-nn · <title>` heading per slice under `## Slices`, in build order. Ids are stable; position is the order.
- Each slice is a bullet list of `- **Field:** value` lines in the order shown, ending with `- **Run:**`.
- `Status` is one of `proposed | approved | specced | shipped`. `specced` and `shipped` slices name their spec folder in `Spec:` (`greenfield-build` for a shipped first slice built without a spec); otherwise `Spec:` is `—`, including an approved first slice greenfield-build could not finish, so it stays in spec-board's Backlog column.
- `Depends on` (slice ids) and `BRs` are comma-separated ids, or `none`. `Blocked by` is a comma-separated list of `Q-nn` ids, `decision "<question>"` (or the ADR once written), and `external: <what>`, or `none`.
- `Ticket:` is optional; omit the line when there is no tracker key.
- New slices go at the end of the `## Slices` section, **before** `## Intake log` (spec-board stops reading slices at the next `## ` heading, so a slice appended at the end of the file disappears from the board). New Intake log rows go at the end of that table. Approved slices are never reordered.

---

```markdown
---
product: Hireboard
brief: product-brief.md
---

# Hireboard backlog

Build order: SL-01 → {SL-02, SL-03} → {SL-04, SL-05} → SL-06

## Slices

### SL-01 · Visitor searches open jobs

- **Outcome:** A visitor filters open postings by keyword, location, remote and employment type, and opens a job detail page that shows the hiring company.
- **Entry point:** `/jobs` in web → `GET /api/v1/jobs`
- **Size:** M
- **BRs:** BR-10, BR-11
- **Depends on:** none
- **Blocked by:** none
- **Status:** shipped
- **Spec:** greenfield-build
- **Source:** brief
- **Run:** `/sdd "New app — Hireboard, first slice SL-01: a visitor searches open job postings by keyword, location, remote and employment type and opens a job detail page showing the company. Seeded data, no auth. <framework> API + <framework> frontend. Conventions from AGENTS.md and product-brief.md."`

### SL-02 · Company careers page

- **Outcome:** A visitor opens a company's public careers page and sees its details and open jobs.
- **Entry point:** `/companies/[slug]` in web → `GET /api/v1/companies/{slug}`
- **Size:** S
- **BRs:** BR-10
- **Depends on:** SL-01
- **Blocked by:** none
- **Status:** approved
- **Spec:** —
- **Source:** brief
- **Run:** `/sdd "SL-02: a visitor opens a company's public careers page with its details and open jobs (BR-10). Rules in product-brief.md."`

### SL-03 · Candidate and employer accounts

- **Outcome:** A candidate or an employer registers, logs in, and logs out; employer registration creates their company.
- **Entry point:** `/register`, `/login` in web → `POST /api/v1/auth/*`
- **Size:** M
- **BRs:** BR-01, BR-02
- **Depends on:** SL-01
- **Blocked by:** decision "Sanctum SPA cookie auth or API tokens?", Q-02
- **Ticket:** HIRE-3
- **Status:** approved
- **Spec:** —
- **Source:** brief
- **Run:** `/sdd HIRE-3`

### SL-04 · Candidate applies to an open posting

- **Outcome:** A signed-in candidate applies to an open posting once and sees it in their applications.
- **Entry point:** "Apply" on `/jobs/[id]` → `POST /api/v1/jobs/{id}/applications`
- **Size:** M
- **BRs:** BR-30, BR-31
- **Depends on:** SL-01, SL-03
- **Blocked by:** none
- **Status:** proposed
- **Spec:** —
- **Source:** intake 2026-10-21 sprint review
- **Run:** `/sdd "SL-04: a signed-in candidate applies to an open posting once and sees it in their applications (BR-30, BR-31). Rules in product-brief.md."`

### SL-05 · Moderated company reviews

- **Outcome:** A signed-in candidate reviews a company; an admin approves or rejects it; only approved reviews, without the candidate's identity, appear on the careers page and in its rating.
- **Entry point:** "Write a review" on `/companies/[slug]` → `POST /api/v1/companies/{slug}/reviews`; `/admin/reviews` in web → `PATCH /api/v1/admin/reviews/{id}`
- **Size:** M
- **BRs:** BR-40, BR-41, BR-42
- **Depends on:** SL-02, SL-03
- **Blocked by:** Q-01
- **Status:** proposed
- **Spec:** —
- **Source:** revise 2026-10-21 (Maya Chen)
- **Run:** `/sdd "SL-05: candidates review companies, admins approve or reject each review, and only approved reviews without the candidate's identity show on the careers page and in its rating (BR-40, BR-41, BR-42). Rules in product-brief.md."`

### SL-06 · Employer sees applications

- **Outcome:** A signed-in employer sees the applications to their own company's postings, and nobody else's.
- **Entry point:** `/employer/applications` in web → `GET /api/v1/employer/applications`
- **Size:** S
- **BRs:** BR-33
- **Depends on:** SL-04
- **Blocked by:** none
- **Status:** proposed
- **Spec:** —
- **Source:** revise 2026-10-21 (Maya Chen)
- **Run:** `/sdd "SL-06: a signed-in employer sees the applications to their own company's postings and no other company's (BR-33). Rules in product-brief.md."`

## Intake log

<!-- One line per intake item, whatever its class. Newest last. -->

| Date | Source | Item | Class | Went to |
|------|--------|------|-------|---------|
| 2026-10-21 | sprint review | "Candidates want to apply without leaving the job page" | New slice | SL-04 |
| 2026-10-21 | sprint review | "Search shows closed jobs" | Bug | `/sdd "Job search lists closed postings; expected only open ones (BR-10)"` |
| 2026-10-21 | sprint review | "Can employers message candidates?" | Non-goal | kept as non-goal (Maya Chen) |
| 2026-10-21 | sprint review | "Should reviews need a prior application?" | Question | Q-01 |
```
