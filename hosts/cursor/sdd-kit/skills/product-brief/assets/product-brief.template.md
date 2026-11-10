# product-brief.md template

Copy everything inside the fenced block into `product-brief.md` at the workspace or repo root. Replace the example content (a small job board, abridged) with the real product and delete the `<!-- -->` guidance once filled. Keep the seven section headings exactly as written: specs, greenfield-build, and `/product-brief --revise` look for them.

---

```markdown
---
product: Hireboard
owner: Maya Chen                  # the person who validates the draft rules
status: draft                     # draft | validated
validated_by:                     # set when the owner confirms the rules
validated_at:
stacks: [<stack-key>, <stack-key>]
---

# Hireboard product brief

## Problem

<!-- Two short paragraphs: who has the problem today and what it costs them; what this
     product does about it. Evidence beats adjectives (interviews, support tickets, numbers). -->

Small companies hire a few people a year. Big job boards bury them, charge per posting, and
flood them with low-effort applications. Candidates can't tell a good employer from a bad one
before applying.

Hireboard is a focused job board: open postings are easy to search, every company has a
careers page, and company reviews are moderated so ratings can be trusted.

**Constraints:** <!-- only the ones the owner insists on; omit the line when there are none -->
<Framework> API in `api/`, <framework> frontend in `web/`. SQLite for the MVP.

## Users and roles

<!-- One row per role. "Can" lists capabilities, which become slices and role BRs. -->

| Role | Who | Can |
|------|-----|-----|
| Visitor | anyone, not signed in | search open postings, open a posting, view a careers page |
| `candidate` | job seeker, self-registered | everything a visitor can, plus keep a private profile and apply |
| `employer` | hiring manager, registers with their company | everything a visitor can, plus see applications to their company's postings |
| `admin` | staff, seeded only | approve or reject company reviews |

## MVP scope

<!-- Numbered capabilities, one line each. Every item maps to one or more slices in backlog.md. -->

1. **Job search.** Keyword, location, remote, and employment-type filters over open postings.
2. **Careers pages.** A public page per company with its open jobs and approved-review rating.
3. **Accounts.** Candidate and employer registration, login, logout.
4. **Applications.** A candidate applies to an open posting; both sides see their applications.
5. **Moderated reviews.** Candidates review companies; admins approve each review before it is public.

## Non-goals

<!-- What v1 deliberately does not do. Intake items that match one are logged, not added. -->

- Payments and paid postings.
- Messaging between candidates and employers.
- Email notifications of any kind.

## Draft business rules

<!-- Stable ids: specs and tests cite them. Never renumber.
     Group by area in tens when there is more than one area (0x, 1x, 2x …).
     One observable outcome per rule, with HTTP status and error code when known.
     Rules that apply everywhere are marked (cross-cutting).
     Later changes keep the id and add "Source: <why, when, who>".
     Dropped rules stay, marked (retired: reason). -->

IDs are stable. These rules are assumptions until Maya Chen validates them; the validated set
moves to `api/docs/context/business-rules.md` with the same ids.

### Accounts

- **BR-01** Self-registration roles are `candidate` or `employer`. Requesting `admin` returns 422.
- **BR-02** Emails are unique, compared and stored lowercase. *(cross-cutting)*

### Job postings

- **BR-10** Only `open` postings appear in search and detail. Draft and closed postings return
  404 `job_not_found`.
- **BR-11** Search returns the newest published first. `per_page` is 1–50, default 20.

### Applications

- **BR-30** Only open postings accept applications (422 `job_not_open`).
- **BR-31** One application per candidate per posting (409 `already_applied`), also under a
  concurrent duplicate submit.
- ~~**BR-32**~~ *(retired: CV uploads moved to non-goals, 2026-10-21, Maya Chen)*
- **BR-33** An employer sees applications only to their own company's postings. Another
  company's application returns 404 `application_not_found`.

### Reviews

- **BR-40** A review is public only after an admin approves it. Pending and rejected reviews
  never appear on a careers page or in its rating.
- **BR-41** Only `admin` approves or rejects reviews. Every other role gets 403.
- **BR-42** A public review never shows the candidate's name, email, or profile link.

## Success metrics

<!-- Measurable, with a target and how it will be observed. -->

| Metric | Target | Measured by |
|--------|--------|-------------|
| Time for a visitor to open a relevant posting | under 1 minute | moderated usability test, 5 users |
| Registration to submitted application | one sitting, under 10 minutes | analytics funnel |
| Unmoderated reviews or candidate identities shown publicly | zero | acceptance tests on BR-40 and BR-42, monthly audit |

## Open questions

<!-- Unchecked until answered. Answer → fold into the section above and check the box.
     Name who decides and which BR or slice waits on it. -->

- [ ] **Q-01** Must a candidate have applied to a company before reviewing it? Proposed: no for v1.
  Decides: Maya Chen. Blocks: SL-05.
- [ ] **Q-02** API token lifetime: is 7 days right? Decides: the SPA auth decision. Blocks: SL-03.
```
