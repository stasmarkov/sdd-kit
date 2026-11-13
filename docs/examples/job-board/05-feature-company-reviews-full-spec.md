# 05 — Anatomy of an M spec: company reviews with moderation (HIRE-4)

[Chapter 04](04-feature-accounts-and-roles.md) took HIRE-3 through the feature pipeline quickly.
This chapter slows down and shows a whole M-size spec, one section at a time. HIRE-4 is a good
example because it has everything an M spec can contain: a new table, six endpoints across three
roles, a public page, an admin page, behavior that must not move, and two real rule gaps that the
clarity gate catches before anyone writes code.

You will see:

- all seven steps of `write-spec` (size, investigate, clarify, create the folder, document,
  clarity gate, hand off), with the reasoning behind each one;
- why this is **M** and not L, even though it spans two repos;
- the full `spec-lite.md`, `tasks.md` and `decisions.md`, with commentary;
- the fresh-context clarity gate raising six questions, and each one either answered or
  accepted as an assumption;
- approval in `/sdd`, then `ship-feature` building it, including a review finding that the
  refutation panel throws out;
- a tour of the code that came out, and the two PRs.

It assumes the state at the end of [chapter 04](04-feature-accounts-and-roles.md): HIRE-3 is
merged in both repos, so roles, Sanctum tokens, the `hireboard_session` cookie, `requireUser()`
and the seeded `admin@hireboard.test` exist.

**Where to start Claude:** the workspace root, `~/work/hireboard`, as in chapter 04. The spec
lives in `api/` because the API starts the change
([docs/multi-repo.md](../../reference/multi-repo.md#workflows-and-specs)).

## Step 0 — Branches and the ticket

The date is 2026-10-22. Alex Rivera creates the same branch in both repos, then starts Claude at
the root:

```bash
cd ~/work/hireboard
git -C api switch main && git -C api pull
git -C web switch main && git -C web pull
git -C api switch -c feature/HIRE-4-company-reviews && git -C web switch -c feature/HIRE-4-company-reviews
claude
```

There is no tracker connected, so `/sdd` cannot fetch HIRE-4 and asks for the text
([sdd SKILL.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/sdd/SKILL.md), Step 1):

```text
> /sdd HIRE-4

  (simulated, abridged)
  No spec matches spec-HIRE-4-* under .ai/specs/. No Jira/Linear tool is available in this
  session — paste the ticket text for HIRE-4.

> Candidates can rate and review companies; reviews are moderated; one review per candidate
  per company

  Route: feature — adds new behavior; nothing existing is broken and no technology choice is open.
  ? Confirm the route
    ❯ feature (recommended)
      decision
  → feature

  Repos: api/ (laravel) and web/ (nextjs) under the workspace root.
  Dev URL for browser acceptance? → http://localhost:3000

  Skill("write-spec", "--ticket=HIRE-4 Candidates can rate and review companies; reviews are
  moderated; one review per candidate per company")
```

`/sdd` offered `decision` as the second choice because "moderated" could hide a build-or-buy
question about a moderation service. It doesn't here: an admin queue is a feature.

Alex tells the session the spec belongs in `api/`. `write-spec` creates `.ai/specs/` relative to
the working directory, so from the root it would land in the untracked `~/work/hireboard/.ai/`.
Chapter 04 covers this friction. In Step 4 below the folder-creation loop runs inside `api/`.

## Step 1 — Size first

`write-spec` classifies type and size before it reads any code
([write-spec Step 1](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/write-spec/SKILL.md)). The size decides how much
markdown the spec gets:

```text
  (simulated)
  Type: feature
  Size: M — schema + API change, ~7 tasks (4 api, 3 web). Files: spec-lite.md, tasks.md,
        decisions.md if decisions are made, manual-test.md (there is a UI journey).
  Override? (S / M / L) → keep M
```

| Size | What HIRE-4 would get | Why it does or doesn't fit |
|------|-----------------------|----------------------------|
| XS | no spec, `/simple-task` | No. A table and six endpoints is not "one obvious change". |
| S | spec-lite + tasks | No. S rules out schema and public API changes. |
| **M** | S + decisions.md + manual-test.md | Yes. Schema + API change, 4-7 tasks, a UI journey. |
| L | M + business-rules.md + references.md | No (see the callout). |

> **Kit friction F6: two repos do not make it L.** The L row of the sizing table lists
> "multi-repo". Read literally, every api + web feature in this workspace would be L. The
> write-spec template's own example settles it: its M spec has `stacks: [laravel, nextjs]`
> ([spec-lite.template.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/write-spec/references/spec-lite.template.md)).
> An api + web feature is the normal M shape. The other L signal is "new business rules", and it
> doesn't apply either. BR-40 to BR-43 (one review per company, pending until moderated, only
> approved reviews public, the average rule) were written and validated with Maya Chen in
> chapter 02's [business-rules.md](artifacts/api/docs/context/business-rules.md). The spec cites
> those IDs. It does not need its own `business-rules.md`. The clarity gate will surface one
> genuinely new rule (BR-44), and that is still not enough to make it L: one rule, recorded in
> the existing file, doesn't need a separate artifact.

## Step 2 — Investigate

The next step is to search before asking. `write-spec` reads what HIRE-4 touches and checks what
already exists, so the spec doesn't re-plan shipped work:

```text
  (simulated, abridged)
  Investigate
    api  app/Contracts/CompanyRepositoryInterface.php   findBySlug(): ?CompanyDTO — reuse for slug → id
    api  app/Services/CompanyService.php                findBySlug() throws CompanyNotFoundException
    api  app/DTOs/CompanyDTO.php::toApiArray()          {id, slug, name, website, location,
                                                         description, open_jobs_count}
         → GET /api/v1/companies/{slug} is consumed by web getCompany(); adding fields is a
           contract change → candidate Must-NOT-change item
    api  app/Enums/UserRole.php, User::isCandidate()/isAdmin()   (HIRE-3)
    api  app/Policies/                                  does not exist yet. Convention (laravel-12
                                                         skill): one policy per model, auto-discovered,
                                                         $this->authorize() in invokable controllers
    api  bootstrap/app.php                              BusinessRuleException → INV-01 error envelope;
                                                         403 → code "forbidden"
    api  docs/context/business-rules.md                 BR-40..BR-43 cover reviews; none implemented
    web  lib/api/endpoints.ts                           no review entries
    web  app/(account)/layout.tsx                       admin nav links to /admin/reviews → 404 today
    git  api: 9b2e4d1 feat(auth): accounts and roles (HIRE-3) …   web: 51c0a7e feat(auth): … (HIRE-3)
         git grep -i review: only the nav link and business-rules.md
```

Three findings shape the spec:

1. **The company show payload is a contract.** `getCompany()` in `web/lib/api/jobs.ts` mirrors it
   field for field. Putting `average_rating` there is the obvious design, and it would change a
   payload other code relies on. That becomes MNC-1 and decision D1.
2. **The slug lookup already exists.** The reviews service reuses `CompanyRepositoryInterface::findBySlug()`
   and throws the existing `CompanyNotFoundException`. It doesn't need its own company query.
3. **There is a broken link waiting for this feature.** The admin "Review queue" link from
   chapter 04 points at a page that doesn't exist. Task 7 fixes it, and the journey check in
   Acceptance confirms it.

## Step 3 — Clarify

`write-spec` asks 2-4 questions grounded in what it found, and skips anything the ticket and
business rules already answer. BR-40 to BR-43 cover roles, uniqueness, visibility and the
average. Two real gaps are left (the clarity gate in Step 6 confirms them later):

```text
  (simulated)
  ? Rating scale?
    ❯ 1-5 whole stars (recommended — matches StarRating-style UIs, BR-43 averages to 1 decimal)
      1-10
      thumbs up/down
  → 1-5 whole stars

  ? Length limits for title and body?
    ❯ title 5-120, body 20-2000 (recommended — title fits company_reviews.title string(120))
      title 3-80, body 50-5000
      Other
  → title 5-120, body 20-2000
```

Both answers end up in AC-1 and AC-4.

## Step 4 — Create the folder atomically

The spec id is `spec-<TICKET>-<slug>`, and the folder is created with `mkdir` **without** `-p`
in a loop ([write-spec Step 4](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/write-spec/SKILL.md)). Here it runs
inside `api/`:

```bash
cd api
TICKET=HIRE-4
SLUG=company-reviews
BASE="spec-${TICKET}-${SLUG}"
mkdir -p .ai/specs
DIR=".ai/specs/$BASE"; n=2
until mkdir "$DIR" 2>/dev/null; do          # mkdir without -p fails if it exists → atomic
  DIR=".ai/specs/$BASE-$n"; n=$((n+1)); [ "$n" -gt 20 ] && { echo "cannot create $BASE"; exit 1; }
done
echo "$DIR"
# .ai/specs/spec-HIRE-4-company-reviews
```

Why not "highest number + 1"? Two sessions that each read the folder list at the same moment
would both pick the same number, and one spec would overwrite the other. `mkdir` either creates
the folder or fails, so the loop can't collide. The second spec for the same ticket simply
becomes `spec-HIRE-4-company-reviews-2`. Ticket keys also make the id meaningful: `/sdd HIRE-4`,
`--spec=HIRE-4` and `spec-HIRE-4-company-reviews` all resolve to this folder when the session
runs inside `api/`. This chapter runs from the workspace root, whose `./.ai/specs` holds no specs,
so from there you pass ship-feature the repo-relative path `api/.ai/specs/spec-HIRE-4-company-reviews` (F2).
`/execute-task` and `/deep-review --spec` don't take that path; run them from a session inside `api/`.

## Step 5 — The spec, section by section

The finished files are in the artifacts:
[spec-lite.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/spec-lite.md),
[tasks.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/tasks.md),
[decisions.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/decisions.md) and
[manual-test.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/manual-test.md). They show
the end-of-walkthrough state: approved, built and `done`. Below, each section appears the way
`write-spec` first wrote it, with commentary. Where the clarity gate changed something, the
change is shown in Step 6.

### Frontmatter

```yaml
---
id: spec-HIRE-4-company-reviews
title: Company reviews with moderation
type: feature
size: M
priority: P2
status: draft
ticket: HIRE-4
stakeholders: [Maya Chen]
approved_by:
approved_at:
created: 2026-10-22
stacks: [laravel, nextjs]
---
```

- `id` equals the folder name. Tools resolve the spec by it.
- `status: draft` and empty `approved_*` fields. `write-spec` never fills them. Only `/sdd`
  does, when a human approves in the same conversation (Step 7).
- `stakeholders` comes from the ticket's reporter or watchers. With no tracker, Alex names Maya.
- `stacks` lists both registry keys. It documents the scope. ship-feature does not read it: it
  picks `laravel-backend-dev` for tasks 1-4 and `nextjs-frontend-dev` for tasks 5-7 from each
  task's `(laravel)` or `(nextjs)` tag in `tasks.md`.

### Summary and Context

```markdown
## Summary
Candidates rate and review companies, and an admin moderates every review before anyone else
sees it. Job seekers get employer ratings they can trust: one review per candidate per company,
no anonymous drive-by posts, and nothing public until a human has read it. The work adds one
table, six API endpoints, a public reviews page and an admin moderation queue.

## Context
- **Problem**: HIRE-4 ("Candidates can rate and review companies; reviews are moderated; one
  review per candidate per company"). Hireboard shows companies but gives job seekers no signal
  about what working there is like. The rules were agreed with Maya Chen at the start
  (BR-40..BR-43 in `docs/context/business-rules.md`) and have not been implemented yet.
- **User impact**: visitors see an average rating and approved reviews per company. Candidates
  can share their experience without exposing their identity. Admins keep abusive or identifying
  content off the site.
```

Context quotes the ticket and points to the rule IDs instead of restating the rules. When a rule
changes, the spec doesn't drift from `business-rules.md`.

### Scope

```markdown
## Scope
### In scope
- `company_reviews` table, `ReviewStatus` enum, `CompanyReview` model and factory (schema doc first).
- API: submit a review, read your own review, public list with average rating, admin queue,
  approve, reject.
- Web: `/companies/[slug]/reviews` (public list, `ReviewForm` for candidates, status card when
  the candidate already has a review) and `/admin/reviews` (moderation queue).
- Contract docs: `docs/api/api-contracts.md` and `web/lib/api/endpoints.ts`.
### Out of scope
- Editing, deleting or resubmitting a review after submission or after a decision.
- Employer replies to reviews.
- Moderation by employers, or any employer view of reviews beyond the public list.
- Rating fields on `GET /api/v1/companies/{slug}` (see MNC-1 and decisions.md D1).
- Notifications to the candidate when a review is decided.
```

Out of scope does real work here. "Employer replies" and "moderation by employers" are the first
two follow-up requests any job board gets. Writing them down stops the build agent from adding
an employer branch to the policy "while it's there".

### Must NOT change

```markdown
## Must NOT change
- **MNC-1**: The `GET /api/v1/companies/{slug}` response shape is unchanged (no review fields are added).
- **MNC-2**: `GET /api/v1/jobs` and the `/jobs` page are unchanged.
- **MNC-3**: The `GET /api/v1/auth/me` shape and role semantics are unchanged.
```

For a feature, MNC lists existing behavior on the paths the change touches. Each item needs a
guard in the Traceability table. MNC-1 came straight from the investigation. MNC-3 is there
because the policy reads roles, and it would be easy to "improve" `UserRole` along the way.
ship-feature passes these items to every Build agent ("keep identical; do not edit their guard
tests") and re-checks them in Acceptance.

### Acceptance criteria

This is the first draft. Step 6 shows how the clarity gate tightened AC-6 and AC-7.

```markdown
## Acceptance criteria
- **AC-1**: WHEN an authenticated candidate submits a review (rating 1-5, title 5-120 chars,
  body 20-2000 chars) for an existing company THE SYSTEM SHALL store it with status pending and
  respond 201 with status "pending".
- **AC-2**: IF the candidate already has a review for that company in any status THEN THE SYSTEM
  SHALL respond 409 with code review_already_exists.
- **AC-3**: IF the authenticated user is an employer or admin THEN THE SYSTEM SHALL respond 403
  to a review submission.
- **AC-4**: IF rating, title or body is invalid THEN THE SYSTEM SHALL respond 422 with field errors.
- **AC-5**: WHEN a guest submits a review THE SYSTEM SHALL respond 401.
- **AC-6**: WHEN anyone requests a company's reviews THE SYSTEM SHALL return only approved
  reviews, newest first, paginated, anonymously.
- **AC-7**: THE SYSTEM SHALL return the company's average rating with the list.
- **AC-8**: WHEN an admin approves a pending review THE SYSTEM SHALL set status approved,
  moderated_by and moderated_at, and the review SHALL appear in the public list.
- **AC-9**: WHEN an admin rejects a pending review with a 5-255 char reason THE SYSTEM SHALL set
  status rejected and store the reason. The review SHALL never appear publicly, and the candidate
  SHALL see status and reason via /reviews/mine.
- **AC-10**: IF the review is not pending THEN approve and reject SHALL respond 409
  review_already_moderated. IF the user is not an admin THEN they SHALL respond 403.
- **AC-11**: WHEN a signed-in candidate without a review opens /companies/{slug}/reviews THE page
  SHALL show ReviewForm, and after submitting it SHALL show "Thanks - your review is awaiting
  moderation." With an existing review, the page SHALL show its status instead of the form
  (manual-test.md#step-3, #step-4).
```

The EARS patterns map to kinds of behavior:

- `WHEN <trigger> THE SYSTEM SHALL` for events (AC-1, AC-5, AC-6, AC-8, AC-9, AC-11);
- `IF <condition> THEN THE SYSTEM SHALL` for unwanted cases and refusals (AC-2, AC-3, AC-4, AC-10);
- a bare `THE SYSTEM SHALL` for something that is always true (AC-7).

Most criteria have one observable outcome: a status code, an error code, a stored value or text
on the page. That is what lets an AC map to a named Pest test in the Traceability table. Four
criteria here are deliberately compound: AC-8 (stored fields and public visibility), AC-9
(stored, never public, visible to the owner), AC-10 (409 for a decided review, 403 for a
non-admin) and AC-11 (form, confirmation, status card). The price is visible in the table: AC-9
and AC-10 need two tests each. If you prefer one outcome per row, split them (AC-10a, AC-10b). AC-11 is the only criterion a Pest test can't observe, so it names its manual steps
directly.

### Boundaries

```markdown
## Boundaries
- **Always**: a Pest feature test per AC; service-repository with DTOs (INV-02); update
  `docs/api/api-contracts.md` and `web/lib/api/endpoints.ts` (INV-06); responses in the INV-01
  envelope; error codes from the contract list.
- **Ask first**: any change to the `companies` or `users` tables; a new dependency; any change to
  the company show payload.
- **Never**: expose candidate identity publicly; weaken or delete existing tests; touch auth flows
  (registration, login, tokens, middleware).
```

- **Always**: what the implementer does without asking.
- **Ask first**: changes that need a human decision before they happen.
- **Never**: hard lines.

"Touch auth flows" is a Never because HIRE-3 just shipped them, and an agent wiring up
`/reviews/mine` might "fix" the session helper on the way.

How much of this reaches a background build? ship-feature's Spec phase extracts the approach and
conventions from spec-lite and gives them to every Build agent, together with the Must-NOT-change
list. Boundaries are not a separate field in that hand-off, and a background run can't stop to
ask anyway. Boundaries mainly guide the human who approves the spec, anyone running
`/execute-task` (which reads the spec files directly), and the reviewer of the PR. So anything
the build itself must not cross should also be an MNC item or a task's **Verify** line. HIRE-4
does this for its riskiest line: "any change to the company show payload" is both Ask first and
MNC-1, so the Build agents see it and Acceptance checks it.

### Technical context, decisions, dependencies

The [Technical context](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/spec-lite.md#technical-context)
section lists the related code from Step 2, what is **already implemented** (company lookup,
roles, the seeded admin, the nav link and middleware matcher), and the approach: one output DTO
with three serializers, so candidate identity can only leak through a deliberate method choice.
Dependencies: requires `spec-HIRE-3-accounts-and-roles`.

M specs move decisions out of spec-lite into `decisions.md`. Each decision records the
alternative that was rejected:

```markdown
## D1 — The rating summary goes in the reviews list meta, not on company show
- Decision: GET /api/v1/companies/{slug}/reviews returns meta.average_rating …
- Alternative: add average_rating and review_count to the Company payload.
- Why: the company show payload is a published contract … MNC-1 freezes it.

## D2 — Moderation state is a status column on company_reviews
- Alternative: a separate review_moderations table …
- Revisit when: reviews become editable or resubmittable.

## D3 — Unique index plus a service pre-check for one review per company
- Why: the pre-check gives the common case a clear domain error … The index is still the
  guarantee. CompanyReviewRepository::create() also maps a UniqueConstraintViolationException …
```

(Abridged. The full text is in
[decisions.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/decisions.md).)

### tasks.md

The [full tasks.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/tasks.md) has seven tasks.
Backend comes first because the frontend consumes it. Each task has a `Covers:` line and a final
**Verify** sub-item. Task 2 in the draft looked like this:

```markdown
- [ ] 2. Submit and "mine" endpoints (laravel)
  - Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-9 (mine)
  - [ ] 2.1 Failing tests in `tests/Feature/Reviews/SubmitCompanyReviewTest.php`
  - [ ] 2.2 `SubmitCompanyReviewDTO` (rules), `CompanyReviewRepositoryInterface` + repository,
    `CompanyReviewService::submit()` / `findMine()`, `CompanyReviewPolicy::create()`,
    `ReviewAlreadyExistsException`, `ReviewNotFoundException`, binding in `RepositoryServiceProvider`
  - [ ] 2.3 `SubmitCompanyReviewController`, `ShowMyCompanyReviewController`, `routes/api/v1/reviews.php`
  - [ ] 2.4 **Verify**: SubmitCompanyReviewTest green; gates green
```

| # | Task | Stack | Covers |
|---|------|-------|--------|
| 1 | Schema doc, migration, enum, model, factory | laravel | scaffolding |
| 2 | Submit and "mine" endpoints | laravel | AC-1..AC-5, AC-9 (mine) |
| 3 | Public list and average rating | laravel | AC-6, AC-7, MNC-1 |
| 4 | Moderation endpoints and policy | laravel | AC-8..AC-10 |
| 5 | Web types, fetchers and the reviews list | nextjs | AC-6, AC-7 |
| 6 | ReviewForm and submitReviewAction with error mapping | nextjs | AC-1..AC-4, AC-11 |
| 7 | /admin/reviews moderation page | nextjs | AC-8, AC-9 |

The line format `- [ ] N. Title (stack)` matters: both ship-feature and `/execute-task` parse it
to find the next task, and ship-feature picks the specialist agent from the stack tag.

The Traceability table is what makes the spec checkable. Every AC and MNC gets exactly one row,
and "Verified by" names a real test (`file::description`) or a manual step:

```markdown
| ID | Criterion (short) | Verified by | Kind | Task |
|----|-------------------|-------------|------|------|
| AC-1 | candidate review stored as pending, 201 | `tests/Feature/Reviews/SubmitCompanyReviewTest.php::stores a pending review for a candidate` | test | 2, 6 |
| AC-2 | second review in any status → 409 review_already_exists | `…SubmitCompanyReviewTest.php::rejects a second review from the same candidate` | test | 2, 6 |
| AC-3 | employer or admin submit → 403 | `…SubmitCompanyReviewTest.php::forbids employers and admins from reviewing` | test | 2, 6 |
| AC-4 | invalid rating/title/body → 422 field errors | `…SubmitCompanyReviewTest.php::validates rating, title and body` | test | 2, 6 |
| AC-5 | guest submit → 401 | `…SubmitCompanyReviewTest.php::requires authentication` | test | 2 |
| AC-6 | approved only, newest first, anonymous author | `…ListCompanyReviewsTest.php::lists only approved reviews newest first without author identity` | test | 3, 5 |
| AC-7 | average of approved, half-up 1 decimal, null when none | `…ListCompanyReviewsTest.php::reports the average of approved ratings only` | test | 3, 5 |
| AC-8 | approve sets status, moderator, time; review becomes public | `…ModerateReviewTest.php::approves a pending review` | test | 4, 7 |
| AC-9 | reject stores reason; never public; candidate sees it | `…ModerateReviewTest.php::rejects a pending review with a reason`, `…SubmitCompanyReviewTest.php::shows the candidate their own review status` | test | 2, 4, 7 |
| AC-10 | not pending → 409; non-admin → 403 | `…ModerateReviewTest.php::refuses to moderate a review twice`, `…::forbids non-admins from moderating` | test | 4 |
| AC-11 | form, confirmation, status card | `manual-test.md#step-3`, `manual-test.md#step-4` | manual | 6 |
| MNC-1 | company show payload unchanged | `…ListCompanyReviewsTest.php::leaves the company profile response unchanged`, `manual-test.md#step-8` | test + manual | 3 |
| MNC-2 | job search API and /jobs unchanged | `tests/Feature/Jobs/SearchJobPostingsTest.php` (unchanged, green), `manual-test.md#step-9` | test + manual | — |
| MNC-3 | /auth/me shape and roles unchanged | `tests/Feature/Auth/LoginTest.php::returns the current user` (unchanged, green) | test | — |
```

Two details are worth copying:

- **MNC-2 and MNC-3 are guarded by tests that already exist.** The guard is "this existing test
  stays unchanged and green", and the Boundaries forbid editing it. No new test is needed to
  prove that nothing moved.
- **The manual steps point at a drafted `manual-test.md`.** `write-spec` drafts the file with the
  `#step-N` anchors the Traceability table cites, and ship-feature's TestPlan phase later
  rewrites it from the shipped code and fills any remaining manual cells.

The verification gates list only commands that exist in each repo. These are the kit's STACKS
registry entries for `laravel` and `nextjs`, plus `npm run build` because the spec adds routes:

```markdown
- backend (`api/`, laravel): `./vendor/bin/pint --test`, `./vendor/bin/phpstan analyse --no-progress`, `php artisan test`
- frontend (`web/`, nextjs): `npm run lint`, `npx tsc --noEmit`, `npm test`, plus `npm run build` (this spec adds routes)
```

## Step 6 — The clarity gate

The author of a spec is the worst person to judge whether it is clear. `write-spec` spawns a
**new** general-purpose agent and gives it nothing but the folder path. It gets no conversation
summary and no ticket text
([write-spec Step 6](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/write-spec/SKILL.md)):

```text
Agent (general-purpose, fresh context):
  Read only the files in `api/.ai/specs/spec-HIRE-4-company-reviews`. Do not open any other
  file. List every hidden assumption, undefined term, ambiguous criterion, and question an
  implementer would have to guess at. Return a numbered list, or "none".
```

It comes back with six items (simulated). Only items 1 and 2 are real gaps. Items 3 to 6 are
already settled by rules Maya validated on 2026-10-19 (BR-42, BR-43, BR-01). The spec cites those
rules by ID without restating them, and the gate may read nothing outside the folder, so it
cannot see the answers and raises them anyway:

```text
1. Out of scope says no editing or resubmitting "after submission or after a decision", but
   AC-2 is the only thing that enforces it. Is a rejected review final, or may the candidate
   try again? An implementer could reasonably add a "resubmit" path.
2. Must the candidate have applied to (or worked at) the company? "Candidates can review
   companies" doesn't say, and the answer changes the policy.
3. AC-6 says "anonymously". Does that mean no name, no id, or a placeholder author? Can admins
   see who wrote it? Moderation is hard without knowing the author.
4. AC-7 "average rating": rounded how, to how many decimals? What is returned when there are
   no reviews (0, null, omitted)?
5. Do pending or rejected reviews count toward the average or the list total?
6. Who are the admins and how are they created? Nothing in this folder defines an admin.
```

Each item goes into **Open questions** as an unchecked box. This is the "before" state:

```markdown
## Open questions
- [ ] Q1: Can a candidate edit or resubmit a review after it is rejected?
- [ ] Q2: Must the candidate have applied to the company before reviewing it?
- [ ] Q3: What does "anonymous" mean for the public list and for admins?
- [ ] Q4: How is the average rounded, and what is shown with no reviews?
- [ ] Q5: Do pending or rejected reviews count toward the average or the total?
- [ ] Q6: Who creates admin accounts?
```

`write-spec` resolves them with Maya at Alex's screen, in one batched `AskUserQuestion`. Each
item can be resolved in one of two ways:

- **Answer**: fold the answer into the spec (an AC, Scope, or Out of scope) and check the box.
- **Accept as assumption**: check the box with `Accepted assumption: …`. The spec proceeds on a
  stated default that a reviewer can still challenge.

```text
  (simulated)
  ? Q1 Resubmit after rejection?        → Accept assumption: no — moderation is final in v1
  ? Q2 Must have applied first?         → No, not for v1
  ? Q3 "Anonymous" means?               → Answer: "Verified candidate" publicly, name for admins (BR-42)
  ? Q4 Rounding / empty case?           → Answer: 1 decimal half-up, null when empty (BR-43)
  ? Q5 Pending counts toward average?   → Answer: no, approved only (BR-43)
  ? Q6 Who creates admins?              → Accept assumption: seeded only (BR-01)
```

Q3 to Q5 had no effect on the rules, but the criteria they point at were vague, so folding the
answers in, with the rule IDs cited in the answer text, makes AC-6 and AC-7 precise:

```diff
-- **AC-6**: WHEN anyone requests a company's reviews THE SYSTEM SHALL return only approved
-  reviews, newest first, paginated, anonymously.
-- **AC-7**: THE SYSTEM SHALL return the company's average rating with the list.
+- **AC-6**: WHEN anyone requests a company's reviews THE SYSTEM SHALL return only approved
+  reviews, newest first, paginated, with author "Verified candidate" and no candidate id or name.
+- **AC-7**: THE SYSTEM SHALL return meta.average_rating as the mean of approved ratings rounded
+  half-up to 1 decimal, or null when there are none.
```

Q2 adds a line to Out of scope ("Requiring an application to the company before reviewing"). The
"after" block, with every box checked:

```markdown
## Open questions
- [x] Q1: Can a candidate edit or resubmit a review after it is rejected? — **Accepted
  assumption**: no. Moderation is final in v1, and the one-review rule (AC-2) applies whatever the
  status. Recorded as BR-44 in `docs/context/business-rules.md`.
- [x] Q2: Must the candidate have applied to the company before reviewing it? — **Answered**
  (Maya Chen): no, not for v1. Any candidate may review any company. Added to Out of scope.
- [x] Q3: What does "anonymous" mean for the public list and for admins? — **Answered** (Maya
  Chen): the public author is always "Verified candidate", with no candidate id or name (BR-42).
  Admins see `candidate_name` in the queue. Folded into AC-6.
- [x] Q4: How is the average rounded, and what is shown with no reviews? — **Answered** (Maya
  Chen): one decimal, half-up, and null when there are no approved reviews (BR-43). Folded into
  AC-7.
- [x] Q5: Do pending or rejected reviews count toward the average or the total? — **Answered**
  (Maya Chen): no, approved only (BR-43). Folded into AC-6 and AC-7.
- [x] Q6: Who creates admin accounts? — **Accepted assumption**: admins are seeded only
  (`DemoUserSeeder`), never self-registered (BR-01). No admin management UI in this spec.
```

Q1 is the interesting one. Maya accepted it as an assumption, but it is a new business rule:
"moderation is final". It belongs in the canonical rule list, not only in this spec. `write-spec`
only writes inside the spec folder, so the spec records the intent ("Recorded as BR-44") and
never touches the project's canonical `docs/context/business-rules.md`. (The L-size
`business-rules.md` is a different file, inside the spec folder.) In spec mode ship-feature skips
Investigate, so nothing tells the Docs phase to add the rule. After Maya accepts the assumption,
Alex adds BR-44 to [business-rules.md](artifacts/api/docs/context/business-rules.md) himself, and
checks after the build that the Docs phase didn't write a conflicting entry. The rule is visible in the code too: `CompanyReviewService::decide()` refuses
anything that isn't pending.

Be honest about what the gate bought here. Q1 and Q2 were real catches: Q1 produced a new rule
(BR-44) and Q2 a new Out of scope line. Q3 to Q6 cost one line each because the rules already
existed. They show the other side of citing rule IDs: a reader limited to the spec folder cannot
see the rule text, so restate the essentials in the criterion, as AC-6 and AC-7 now do.

## Step 7 — Hand off, then approve in /sdd

`write-spec` ends with its hand-off block
([write-spec Step 7](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/write-spec/SKILL.md)):

```text
Spec:   api/.ai/specs/spec-HIRE-4-company-reviews/   (size M, status draft)
Files:  spec-lite.md, tasks.md (7 tasks), decisions.md, manual-test.md (draft)
Clarity gate: 6 raised, 6 resolved — ready for approval
Next:   /sdd spec-HIRE-4-company-reviews   (approve → ship-feature)
        or /execute-task --spec=HIRE-4   (task by task, from a session started inside api/,
        because /execute-task resolves only against ./.ai/specs)
```

`manual-test.md` is a draft with the `#step-N` anchors the spec cites. ship-feature's TestPlan
phase rewrites it from the shipped code.

Control returns to `/sdd` at Step 4b
([sdd SKILL.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/sdd/SKILL.md)). It first checks Open questions: all
six are checked, so approval can be asked for. It summarizes in plain language and asks:

```text
  (simulated)
  Spec: api/.ai/specs/spec-HIRE-4-company-reviews/spec-lite.md
  Scope: candidates submit one review per company; admins approve/reject; public list of approved
         reviews with an average; web pages /companies/<slug>/reviews and /admin/reviews.
  Must NOT change: company show payload; job search; /auth/me.
  Boundaries: ask before touching companies/users tables, adding a dependency, or changing the
              company payload. Never expose candidate identity or touch auth flows.
  Acceptance: 11 criteria (10 covered by Pest tests, 1 by manual steps).

  ? Approve this spec?
    ❯ Approve and build
      Approve only
      Request changes
      Stop here (draft)
  → Approve and build

  Approver name? (git config user.name = "Alex Rivera")  → Maya Chen
```

`/sdd` writes the approval into the frontmatter, taking the timestamp from
`date -u +%Y-%m-%dT%H:%M:%SZ`:

```diff
-status: draft
+status: approved
-approved_by:
-approved_at:
+approved_by: Maya Chen
+approved_at: 2026-10-22T09:40:00Z
```

> **Kit friction F7: approval has to happen here.** `/sdd` only counts an approval given in the
> current conversation. A thumbs-up in chat yesterday or a comment on the ticket doesn't count.
> ship-feature checks the frontmatter and refuses a `draft` spec unless `allowDraft: true` is
> passed. That escape hatch exists for spikes, not for skipping Maya.

There is no tracker, so the link-back question (Step 4b.5) is skipped (friction F8). `/sdd` shows
the call and waits for a yes:

```js
Workflow({
  name: "ship-feature",
  args: {
    spec: "api/.ai/specs/spec-HIRE-4-company-reviews",
    ticket: "HIRE-4",
    repos: { backend: "api", frontend: "web" },
    url: "http://localhost:3000"
  }
})
```

`spec` is the repo-relative folder path because the session runs from the root. The resolver
looks in `./.ai/specs` and accepts "a full folder name or path" (friction F2, explained in
chapter 04). Before saying yes, Alex starts both dev servers. The Visual phase needs a reachable
URL, and the seeded data makes the review pages meaningful:

```bash
(cd api && php artisan migrate:fresh --seed && php artisan serve --port=8000)   # terminal 1
(cd web && npm run dev)                                                         # terminal 2
```

The `/sdd` hand-off:

```text
Route:    feature (confirmed)
Ticket:   HIRE-4
Spec:     api/.ai/specs/spec-HIRE-4-company-reviews/ (approved by Maya Chen, 2026-10-22T09:40:00Z)
Launched: ship-feature — runs in the background; watch with /workflows
Done when: gates green, converge finds no gaps, review APPROVED, acceptance re-walks the ticket's scenario
```

## Step 8 — ship-feature builds it

The phases are described in the
[ship-feature reference](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/sdd/references/ship-feature.md). In spec
mode, Investigate and Spec-writing are skipped: the spec *is* the investigation. This is the run
as `/workflows` shows it (simulated, abridged):

```text
  Detect       api (laravel, tracked, feature/HIRE-4-company-reviews)
               web (nextjs, tracked, feature/HIRE-4-company-reviews)
  Spec         loaded spec-HIRE-4-company-reviews: 7 pending tasks, 11 AC, 3 MNC
  Prepare      backend and frontend stay on "feature/HIRE-4-company-reviews"
               spec-HIRE-4-company-reviews status approved → in-progress
  Build        task 1 (laravel-backend-dev)  schema doc, migration, ReviewStatus, CompanyReview,
                                             Company::reviews(), CompanyReviewFactory ✓
               task 2 (laravel-backend-dev)  6 tests red → green; submit + mine ✓
               task 3 (laravel-backend-dev)  3 tests red → green; list + average ✓
               task 4 (laravel-backend-dev)  4 tests red → green; queue, approve, reject;
                                             api-contracts.md ✓
               task 5 (nextjs-frontend-dev)  types, 6 registry entries, lib/api/reviews.ts, list page ✓
               task 6 (nextjs-frontend-dev)  ReviewForm, submitReviewAction, status card ✓
               task 7 (nextjs-frontend-dev)  /admin/reviews + actions ✓
  Gates        api: pint --test ✓  phpstan ✓  php artisan test ✓ (13 new, all passing)
               web: npm run lint ✓  npx tsc --noEmit ✓  npm test ✓
  Converge     round 1: AC-1..AC-11 and MNC-1..MNC-3 covered; every task's Verify met — no gaps
  Visual       /companies/acme-robotics/reviews and /admin/reviews at 375/768/1440:
               form labels, error states, contrast OK
  Review       4 dimensions → 3 candidate findings → 0 confirmed (see below)
  Fix          stopped (clean) after 0 round(s); fixed none; remaining none
  Acceptance   journey + 11 AC + 3 MNC → RESOLVED (see below)
  Docs         api/docs/api/api-contracts.md (error codes table)
  TestPlan     api/.ai/specs/spec-HIRE-4-company-reviews/manual-test.md (10 steps);
               Traceability manual cells filled; status → done
  Report       SHIP
```

Task 1 also changes a file chapter 02 owns, the `Company` model. The artifact
[Company.php](artifacts/api/app/Models/Company.php) already contains the result:

```diff
+    /**
+     * @return HasMany<CompanyReview, $this>
+     */
+    public function reviews(): HasMany
+    {
+        return $this->hasMany(CompanyReview::class);
+    }
```

The other accumulating files grow the same way: one binding line in
[RepositoryServiceProvider.php](artifacts/api/app/Providers/RepositoryServiceProvider.php), six
entries in [endpoints.ts](artifacts/web/lib/api/endpoints.ts) (task 5), and six rows in
[api-contracts.md](artifacts/api/docs/api/api-contracts.md) (task 4, whose Verify item names the
contract doc).

The Gates line shows only the registry commands. The spec adds routes, so the `npm run build` its
boundaries ask for is a Verify item for the Build agent or a manual step, as in chapter 08.

### Converge: nothing to append

Converge audits code against the spec and never edits code. It reads every changed file and its
tests and checks three things: each AC is implemented *and* tested, each MNC has a guard, and
each task's Verify line holds. When it finds gaps, it appends them to `tasks.md` under
`## Phase: Gaps (converge round 1)` and loops back to Build. HIRE-3 got one gap task in chapter
04. HIRE-4 gets none, mostly because the clarity gate already removed the ambiguity a gap usually
comes from.

### Review: a finding the panel refutes

Four reviewers (correctness, security, performance, design) read the diff on the deep tier. Every
finding then goes to two verifiers on the standard tier, one per lens: correctness and
reproducibility. Each tries to refute it. When they disagree, or one returns nothing, a third
verifier weighs the severity and breaks the tie. A finding is confirmed only when two votes say
it is real. One correctness finding shows why
the panel exists:

```text
  (simulated)
  review:correctness  "averageRating() may include pending reviews"
                      app/Services/CompanyReviewService.php:70
                      approvedRatingTotals() is called with only a company id; if the repository
                      filters by company alone, pending ratings leak into the average (BR-43).
  verify:correctness    real=false  CompanyReviewRepository::approvedRatingTotals() filters
                                    status = approved (line 76) before count/sum.
  verify:reproducibility real=false ListCompanyReviewsTest "reports the average of approved
                                    ratings only" seeds a pending 1 and a rejected 1 next to
                                    4,4,4,5 and asserts 4.3; it passes.
  → refuted (0/2, no tie-break needed) — dismissed
```

The reviewer read the service and stopped one layer too early. The verifiers opened the
repository and the test that pins the behavior. Without the panel, Alex would have spent time on
a non-issue. The other two candidates were refuted the same way: a missing index for the admin
queue (the queue is small, and `(company_id, status)` serves the public reads) and "policy not
registered" (policies are auto-discovered by model name).

### Acceptance: the journey and every MNC

Acceptance doesn't trust green tests. It traces the scenario hop by hop through the real code
and adds one step per AC and one per MNC:

```text
  (simulated, abridged)
  AC-11  /companies/acme-robotics/reviews (candidate, no review)
           page.tsx → getCurrentUser() role candidate → getMyCompanyReview() → 404 review_not_found
           → null → <ReviewForm> rendered                                                    ok
         submit → submitReviewAction → POST /api/v1/companies/acme-robotics/reviews → 201
           → state success → "Thanks - your review is awaiting moderation."                  ok
         reload → getMyCompanyReview() → 200 status pending → status card, no form           ok
  nav    /admin/reviews (admin) — target existed as a broken link before this branch → page renders ok
  MNC-1  git diff main -- app/DTOs/CompanyDTO.php app/Services/CompanyService.php
           app/Http/Controllers/Companies → empty; GET /api/v1/companies/acme-robotics keys
           before/after: id, slug, name, website, location, description, open_jobs_count     ok
  MNC-2  routes/api/v1/jobs.php, JobPostingService, app/jobs/** unchanged since main;
           SearchJobPostingsTest unchanged and green                                         ok
  MNC-3  app/Enums/UserRole.php, ShowCurrentUserController unchanged; LoginTest
           "returns the current user" green                                                  ok
  resolved: true
```

The browser walk itself happened in the Visual phase (Playwright, with Claude in Chrome as the fallback), and the human version is
[manual-test.md](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/manual-test.md) steps 3 and
4. Acceptance is the check that the page, the action and the API actually connect.

### TestPlan and status

TestPlan writes `manual-test.md` with real values: the seeded accounts, the exact review text,
a `curl … | jq '.data | keys'` for MNC-1, and a rollback note. It then fills the manual cells in
the Traceability table and sets `status: done`. The status moved through the full lifecycle:
`draft` (write-spec), `approved` (/sdd), `in-progress` (ship-feature Spec phase), `done`
(TestPlan, only because the run is shippable).

Alex runs steps 3, 4, 6 and 7 himself before opening PRs. A SHIP verdict means the pipeline is
satisfied, not that a human has looked at the page.

## Step 9 — Code tour

The full code is in the artifacts. These are the parts worth reading.

### Submit: policy, pre-check, pending

The controller authorizes before it validates, so an employer gets 403 (AC-3) even with an
invalid body
([SubmitCompanyReviewController.php](artifacts/api/app/Http/Controllers/Reviews/SubmitCompanyReviewController.php)):

```php
$this->authorize('create', CompanyReview::class);

$data = SubmitCompanyReviewDTO::validateAndCreate($request->all());

$review = $this->reviews->submit($slug, (int) $request->user()->id, $data);

return $this->resource($review->toOwnerArray(), 'Review submitted for moderation', 201);
```

The service resolves the slug through the existing company repository, pre-checks uniqueness,
and lets the repository store the review as pending
([CompanyReviewService.php](artifacts/api/app/Services/CompanyReviewService.php)):

```php
public function submit(string $companySlug, int $candidateId, SubmitCompanyReviewDTO $data): CompanyReviewDTO
{
    $companyId = $this->companyId($companySlug);

    // One review per candidate per company in any status, so a rejected
    // review cannot be replaced by a new submission (BR-40, BR-44).
    if ($this->reviews->existsForCandidate($companyId, $candidateId)) {
        throw new ReviewAlreadyExistsException;
    }

    return $this->reviews->create($companyId, $candidateId, $data);
}
```

`ReviewAlreadyExistsException` extends chapter 02's `BusinessRuleException`, so
`bootstrap/app.php` renders it as `{success:false, status:409, code:"review_already_exists"}`
with no controller code. The repository also catches `UniqueConstraintViolationException`
(decision D3), so a double-click race answers 409 and not 500. Keep that line in mind for
[chapter 07](07-applications-and-deep-review.md).

### One DTO, three audiences

[CompanyReviewDTO.php](artifacts/api/app/DTOs/CompanyReviewDTO.php) carries the candidate's name
internally and exposes it from exactly one method:

```php
public function toApiArray(): array          // public: author is always "Verified candidate"
{
    return ['id' => …, 'rating' => …, 'title' => …, 'body' => …,
            'author' => self::PUBLIC_AUTHOR, 'created_at' => $this->createdAt];
}

public function toOwnerArray(): array        // the author: + status, rejection_reason
public function toModerationArray(): array   // admins: + status, company {slug, name}, candidate_name
```

`JsonResponseTrait::paginated()` calls `toApiArray()` on list items by default, so the public
list is safe without anyone remembering to be careful. The admin queue opts in explicitly with
`->through(fn (CompanyReviewDTO $review) => $review->toModerationArray())`. The test for AC-6
asserts the exact key set and that the candidate's name appears nowhere in the response body.

### The average, from approved rows only

The repository returns integer totals for approved reviews. The service applies BR-43:

```php
['count' => $count, 'sum' => $sum] = $this->reviews->approvedRatingTotals($this->companyId($companySlug));

if ($count === 0) {
    return null;
}

$tenths = intdiv(20 * $sum + $count, 2 * $count);

return $tenths / 10.0;
```

Half-up rounding on integers avoids float surprises: 4, 4, 4, 5 averages 4.25 and becomes 4.3,
exactly what the test asserts. `round(AVG(rating), 1)` in SQL would depend on the database's
rounding and float representation.

### ReviewForm and error-code mapping

[review-form.tsx](artifacts/web/components/review-form.tsx) is a small client component built on
`useActionState`. The Server Action is bound to the slug:

```tsx
const [state, formAction, pending] = useActionState(submitReviewAction.bind(null, slug), initialState);

if (state.status === 'success') {
  return <p role="status" …>{state.message}</p>;   // "Thanks - your review is awaiting moderation."
}
```

[actions.ts](artifacts/web/app/companies/[slug]/reviews/actions.ts) turns API error codes into
form state. Field errors come from `validation_failed`, and domain codes become one inline
message:

```ts
const ERROR_MESSAGES: Record<string, string> = {
  review_already_exists: 'You have already reviewed this company.',
  forbidden: 'Only candidates can review companies.',
  company_not_found: 'This company no longer exists.',
};
…
if (error.code === 'validation_failed') {
  return { status: 'error', message: 'Please fix the highlighted fields.', fieldErrors: toFieldErrors(error.errors) };
}
return { status: 'error', message: ERROR_MESSAGES[error.code] ?? 'Your review could not be submitted. Please try again.', fieldErrors: {} };
```

The action deliberately does **not** call `revalidatePath`. Revalidating would re-render the
page, replace the form with the status card, and the confirmation AC-11 requires would vanish.
The next visit shows the status card (manual step 4). The token never reaches the browser: the
action runs on the Next.js server, and `lib/api/reviews.ts` reads it from the HttpOnly cookie
(INV-05).

### Moderation actions

[admin/reviews/actions.ts](artifacts/web/app/(account)/admin/reviews/actions.ts) uses plain form
actions, with no client component:

```ts
export async function approveReviewAction(id: string): Promise<void> {
  await requireUser(['admin']);

  try {
    await approveReview(id);
  } catch (error) {
    errorRedirect(error);          // ApiError → /admin/reviews?error=<code>
  }

  revalidatePath(QUEUE_PATH);
  redirect(QUEUE_PATH);
}
```

`revalidatePath('/admin/reviews')` drops the decided review from the queue, and the redirect to
the bare URL clears any earlier `?error=` banner. When two admins decide the same review, the
second one sees "Another admin already moderated that review." On the API side,
`CompanyReviewRepository::moderate()` updates `WHERE status = 'pending'`, so the losing request
changes nothing and gets 409 `review_already_moderated` (AC-10).

## Step 10 — PRs, api first

ship-feature doesn't commit. Alex reviews the diffs, runs the manual steps, and commits each
repo on its own branch:

```bash
git -C api add -A && git -C api commit -m "feat(reviews): company reviews with moderation (HIRE-4)"
git -C web add -A && git -C web commit -m "feat(reviews): reviews page and admin moderation queue (HIRE-4)"
git -C api push -u origin feature/HIRE-4-company-reviews
git -C web push -u origin feature/HIRE-4-company-reviews

(cd api && gh pr create --base main --title "HIRE-4: company reviews with moderation (API)" \
  --body "Spec: .ai/specs/spec-HIRE-4-company-reviews (approved by Maya Chen). Merge before hireboard/web#<n>.")
(cd web && gh pr create --base main --title "HIRE-4: company reviews with moderation (web)" \
  --body "Requires hireboard/api#<n> (six new endpoints). Spec lives in the api repo.")
```

The spec folder, including the ticked `tasks.md` and `manual-test.md`, is committed with the
API PR. It lives in the repo that starts the change and is not copied into `web/`.
The API merges first, because the change is additive. The web PR merges once both CIs are green
([docs/multi-repo.md, Process](../../reference/multi-repo.md#process)). HIRE-6 adds
`/deep-review` before merge for code that handles personal data. That is chapter 07.

## What you have now

- An approved, `done` M spec in
  [api/.ai/specs/spec-HIRE-4-company-reviews/](artifacts/api/.ai/specs/spec-HIRE-4-company-reviews/spec-lite.md)
  with 11 EARS criteria, 3 Must-NOT-change items, three decisions, and a Traceability table where
  every row points at a passing Pest test or a manual step.
- Company reviews in both repos: one review per candidate per company, admin moderation that is
  final (BR-44, now in `business-rules.md`), a public list with an average from approved reviews
  only, and an admin queue at `/admin/reviews`.
- A working model of what each `write-spec` step and each ship-feature phase contributes, and the
  clarity gate as the place where ambiguity gets resolved before any code is written.

Next: [06 — Build task by task and resume: candidate profiles with /execute-task](06-execute-task-candidate-profiles.md)
