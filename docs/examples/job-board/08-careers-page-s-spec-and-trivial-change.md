# 08 — Proportionality: an S spec for the careers page (HIRE-7) and a no-spec trivial change (HIRE-8)

Chapters 04 to 07 ran M specs: schema changes, several layers, both repos. Most tickets are
smaller than that, and the kit is built to scale down. This chapter takes two small tickets:

- **HIRE-7**, a public careers page per company. It is a real feature with acceptance criteria,
  but it touches only `web/` and needs no API change. `write-spec` sizes it **S**, so it gets the
  smallest spec there is: `spec-lite.md` plus `tasks.md`.
- **HIRE-8**, salary ranges on job cards. It is one component and has no design choice, so `/sdd`
  routes it as **trivial** and `/simple-task` makes the change with no spec at all.

It assumes the state at the end of [chapter 07](07-applications-and-deep-review.md): HIRE-3 to
HIRE-6 are merged in both repos, and the demo data loads with `php artisan migrate:fresh --seed`.

**Where to start Claude:** the workspace root, `~/work/hireboard`. Both tickets change only
`web/`, but the session reads the API to confirm that nothing needs to change there.

## Step 1 — HIRE-7: the spec sizes itself S

Alex creates the branch in `web/` only. HIRE-7 never touches `api/`, so there is no matching
branch there:

```bash
cd ~/work/hireboard
git -C web switch main && git -C web pull
git -C web switch -c feature/HIRE-7-company-careers-page
claude
```

Then he types `/sdd HIRE-7`. No tracker is connected, so `/sdd` asks for the ticket text and
Alex pastes it. Because the session runs from the workspace root, he adds in the same breath that
the spec belongs in `web/`, since the change starts and ends there. Neither `/sdd` nor
`write-spec` asks about the location, so it has to be said up front (see the friction note below).

```text
> /sdd HIRE-7

  (simulated, abridged)
  No spec matches spec-HIRE-7-* under .ai/specs/. No Jira/Linear tool is available in this
  session — paste the ticket text for HIRE-7.

> Public careers page per company at /companies/<slug> listing its open jobs and rating,
  linked from job detail. Put the spec in web/ — this change starts and ends there.

  Route: feature — adds a new public page; no existing behavior is wrong, no technology choice.
  ? Confirm the route
    ❯ feature (recommended)
      trivial
  → feature

  Repos: detected api/ (laravel) and web/ (nextjs) under the workspace root.
  ? Dev URL for browser acceptance?  → http://localhost:3000

  Skill("write-spec", "--ticket=HIRE-7 Public careers page per company at /companies/<slug>
  listing its open jobs and rating, linked from job detail. Spec folder goes in web/.ai/specs/")
```

`write-spec` sizes the work before investigating
([write-spec Step 1](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/write-spec/SKILL.md)). Its investigation is
what makes the size small. Everything the page needs is already shipped:

```text
  (simulated, abridged)
  Investigate
    api  GET /api/v1/companies/{slug}          ShowCompanyController (HIRE-1) — Company + open_jobs_count
    api  GET /api/v1/jobs?company=<slug>       SearchJobPostingsController (HIRE-1) — company filter exists
    api  GET /api/v1/companies/{slug}/reviews  ListCompanyReviewsController (HIRE-4) — meta.average_rating, meta.total
    web  lib/api/endpoints.ts: showCompany, searchJobs, listCompanyReviews already registered
    web  lib/api/jobs.ts getCompany(slug) → null on 404; lib/api/reviews.ts listCompanyReviews(slug, page)
    web  app/companies/[slug]/ has only reviews/ — no index page
    git  web: 4f1c2aa feat(reviews): company reviews page (HIRE-4) …

  Size: S — one area (web/), 2 tasks, no schema or public API change.
  Clarifying questions skipped: the ticket and the existing endpoints answer scope.

  Spec folder: web/.ai/specs/spec-HIRE-7-company-careers-page/
  Files: spec-lite.md, tasks.md
```

> **Kit friction: where the spec folder lands.** `write-spec` creates `.ai/specs/<id>/` relative
> to the session's working directory and never asks where. From the workspace root that would be
> `~/work/hireboard/.ai/specs/`, the untracked scratch folder. So Alex told the session up front
> that the spec belongs in `web/` (chapter 05 does the same for `api/`), and the folder-creation
> step ran inside `web/`. The rule comes from
> [docs/multi-repo.md](../../reference/multi-repo.md#workflows-and-specs): *the spec lives in the repo that
> starts the change*. The HIRE-3 to HIRE-6 specs live in `api/` because the API starts them. This
> one lives in `web/`. If you would rather not rely on the instruction, start the session in `web/`
> with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../api` instead, and pass
> the repos as `{ backend: "../api", frontend: "." }`.

### What an S spec contains

The whole spec is [spec-lite.md](artifacts/web/.ai/specs/spec-HIRE-7-company-careers-page/spec-lite.md)
and [tasks.md](artifacts/web/.ai/specs/spec-HIRE-7-company-careers-page/tasks.md).
`write-spec` does not create `decisions.md`, and no Decisions section is written: the template
marks it *(when needed)* and nothing here needed deciding. `manual-test.md` comes later from
ship-feature's TestPlan phase, not from `write-spec`. Compare that with HIRE-4 in
[chapter 05](05-feature-company-reviews-full-spec.md), which needed decisions, business rules
and seven tasks.

The frontmatter declares one stack:

```yaml
id: spec-HIRE-7-company-careers-page
size: S
status: draft
ticket: HIRE-7
stacks: [nextjs]
```

The Must NOT change list is short. Both items matter, though: the first makes the "web only"
promise checkable.

```markdown
## Must NOT change
- **MNC-1**: No change in `api/`. `git -C api diff --stat main` is empty after the build.
- **MNC-2**: The `/jobs` page (filters, results, ordering, empty state) is unchanged.
```

There are three EARS acceptance criteria (abridged):

```markdown
- **AC-1**: WHEN anyone opens `/companies/<slug>` for an existing company THE SYSTEM SHALL show
  its name, location, website and description, and list its open jobs from
  `GET /api/v1/jobs?company=<slug>`.
- **AC-2**: IF the slug does not match a company THEN THE SYSTEM SHALL render the app's not-found page
  with `noindex` meta and an HTTP 404 status. The page awaits `getCompany()` and calls
  `notFound()` before anything streams, so the route has no `loading.tsx`.
- **AC-3**: WHEN the careers page renders THE SYSTEM SHALL show the average rating and the number
  of approved reviews from the `listCompanyReviews` meta … with a link to `/companies/<slug>/reviews`.
  Job detail SHALL link the company name to `/companies/<slug>`.
```

`tasks.md` has two tasks, each with its `Covers:` line:

```markdown
- [ ] 1. Careers page (nextjs)
  - Covers: AC-1, AC-2
- [ ] 2. Rating summary and job-detail company link (nextjs)
  - Covers: AC-3, MNC-2
```

The web repo has no component test harness. Vitest covers `lib/**/*.test.ts` only, and this
spec adds no logic under `lib/`. So the Traceability table points mostly at manual-test steps,
backed by `npx tsc --noEmit` for the data shapes. That is honest for a page that only composes
existing fetchers. The table does not pretend there is a unit test. The gates listed are the
web ones only. The template rule is to "never paste Laravel commands into a Next.js-only repo":

```markdown
## Verification gates
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build` (this spec adds a route)
```

### Clarity gate: one question

A fresh-context reviewer reads only the spec folder (write-spec Step 6). For an S spec it finds
very little:

```text
  (simulated)
  Clarity gate — 1 raised
    1. AC-3 says "show the average rating". What is shown when a company has no approved
       reviews (average_rating is null)? A blank, "0.0", or hide the section?

  ? Q1: rating display with no reviews
    ❯ "No reviews yet", still linking to the reviews page
      Hide the rating section
      Accept as assumption
  → "No reviews yet", still linking to the reviews page   (Maya Chen, relayed by Alex)

  Clarity gate: 1 raised, 1 resolved — ready for approval
```

The answer goes into the spec and the box is checked:

```markdown
## Open questions
- [x] Q1: What does the rating summary show for a company with no approved reviews? —
  **Answered** (Maya Chen): the text "No reviews yet", still linking to the reviews page so the
  first candidate can write one.
```

## Step 2 — Approve and build with ship-feature

The approval has to come from the same `/sdd` conversation (chapter 04 explains why). Maya
reviews the spec on Alex's screen, and `/sdd` asks:

```text
  (simulated)
  Spec: web/.ai/specs/spec-HIRE-7-company-careers-page/spec-lite.md
  Scope: new public page /companies/<slug> (profile, open jobs, rating summary); job detail links to it.
  Must NOT change: nothing in api/; /jobs page unchanged.
  Boundaries: ask before any api/ change, new dependency or new endpoint.
  Acceptance: 3 criteria (page content, not-found page for unknown slug, rating summary + links).

  ? Approve this spec?
    ❯ Approve and build
      Approve only
      Request changes
      Stop here (draft)
  → Approve and build

  Approver name? (git config user.name = "Alex Rivera")  → Maya Chen
```

`/sdd` records the approval in the frontmatter. It stamps `approved_at` from `date -u`:

```diff
-status: draft
+status: approved
-approved_by:
-approved_at:
+approved_by: Maya Chen
+approved_at: 2026-10-28T10:15:00Z
```

There is no tracker, so the link-back question is skipped. `/sdd` then shows the call and waits
for a yes:

```js
Workflow({
  name: "ship-feature",
  args: {
    spec: "web/.ai/specs/spec-HIRE-7-company-careers-page",
    ticket: "HIRE-7",
    repos: { backend: "api", frontend: "web" },
    url: "http://localhost:3000"
  }
})
```

- **`spec`** is the repo-relative path, because the session runs from the workspace root and
  the resolver looks in `./.ai/specs`. Chapter 04 shows the same pattern for `api/` specs.
- **`repos` lists both repos.** The API is not changed, but Detect, Acceptance and Review need it
  as read-only context: they confirm that `?company=` and `meta.average_rating` exist and that
  nothing in `api/` moved.

The phases are the same as for an M spec
([ship-feature reference](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/references/ship-feature.md)). They
are just shorter:

```text
  (simulated, abridged — /workflows)
  Detect       api (laravel, tracked), web (nextjs, tracked, branch feature/HIRE-7-company-careers-page)
  Spec         loaded spec-HIRE-7-company-careers-page: 2 pending tasks; approved → in-progress
  Build        task 1 (nextjs-frontend-dev) app/companies/[slug]/page.tsx ✓
               task 2 (nextjs-frontend-dev) rating summary; app/jobs/[id]/page.tsx company link ✓
  Gates        web: npm run lint ✓  npx tsc --noEmit ✓  npm test ✓ (3 passed)
               api: pint --test ✓  phpstan ✓  php artisan test ✓  (no changes)
  Converge     round 1: AC-1..AC-3 and MNC-1..MNC-2 covered — no gaps
  Visual       /companies/acme-robotics at 375/768/1280: layout, contrast OK
  Review       4 dimensions, 1 candidate finding → refuted 3/3 (see below)
  Acceptance   job detail → company name → /companies/acme-robotics ✓
               /companies/no-such-company → not-found page (HTTP 200, streamed after the skeleton) ✓
               MNC-1: `git -C api diff --stat main` → (empty) ✓
               MNC-2: /jobs and /jobs?remote=1 render as before ✓
  Docs         no existing doc covers company pages — skipped
  TestPlan     web/.ai/specs/spec-HIRE-7-company-careers-page/manual-test.md (7 steps);
               Traceability manual rows filled; status → done
  Report       SHIP
```

The Review finding that did not survive is worth seeing, because it is the subtle part of this
page:

```text
  (simulated)
  Candidate: "Promise.all rejects when listCompanyReviews throws for an unknown slug, so AC-2
  would show the error boundary instead of not-found."
  Refuted 3/3: loadReviewSummary() catches ApiError with status 404 and returns null;
  getCompany() returns null on 404; notFound() runs before any render, and a malformed slug is stopped by SLUG_PATTERN first. Verified against
  app/companies/[slug]/page.tsx:34-60 and manual-test.md#step-2.
```

TestPlan writes [manual-test.md](artifacts/web/.ai/specs/spec-HIRE-7-company-careers-page/manual-test.md).
Step 6 covers MNC-1, and it is the same check Acceptance ran:

```bash
git -C api status --short
git -C api diff --stat main
# both print nothing
```

Two honest notes about running ship-feature on an S spec:

- **It is still the full pipeline.** An S spec skips nothing: Converge, Visual, a 3-vote review
  panel and Acceptance all run. For a two-task web change that is a lot of background agents.
  Two cheaper options from earlier chapters work just as well here: "Approve only" followed by
  a session started inside `web/` (`cd web && CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../api`)
  running `/execute-task --spec=HIRE-7` (chapter 06), or building the two tasks yourself. Alex picks ship-feature because Acceptance gives him a browser re-walk
  and the MNC-1 check for free.
- **Gates run what the stack registry lists.** For `nextjs` that is lint, tsc and the test script.
  `npm run build` is not in the registry. `web/CLAUDE.md` requires a build when routing changes,
  so Alex runs it himself before pushing:

```bash
cd ~/work/hireboard/web
npm run build
# ✓ Compiled successfully
# Route (app)                       Size   First Load JS
# ├ ƒ /companies/[slug]             …
# ├ ƒ /companies/[slug]/reviews     …
```

`ƒ` (dynamic) is expected. The page reads `params` and fetches with `cache: 'no-store'`, so
nothing is fetched at build time.

He commits in `web/` only and opens one PR. There is no API PR and no merge order to worry about:

```bash
git -C web add 'app/companies/[slug]' 'app/jobs/[id]/page.tsx' \
  .ai/specs/spec-HIRE-7-company-careers-page
git -C web commit -m "feat(companies): public careers page (HIRE-7)"
git -C web push -u origin feature/HIRE-7-company-careers-page
(cd web && gh pr create --base main --title "HIRE-7: company careers page" \
  --body "Spec: .ai/specs/spec-HIRE-7-company-careers-page (S, approved by Maya Chen). Web only — api/ unchanged (MNC-1).")
```

## Step 3 — The code

The page is [app/companies/[slug]/page.tsx](artifacts/web/app/companies/%5Bslug%5D/page.tsx).
It deliberately has no `loading.tsx`: a loading boundary starts streaming a 200 response before
`notFound()` runs, so an unknown slug would never return 404. It is a
Server Component that makes three calls through the existing fetchers in parallel:

```tsx
export default async function CompanyPage({ params }: CompanyPageProps) {
  const { slug } = await params;

  if (!SLUG_PATTERN.test(slug)) {
    notFound();
  }

  const [company, jobs, reviews] = await Promise.all([
    getCompany(slug),
    searchJobs({ company: slug }),
    loadReviewSummary(slug),
  ]);

  if (!company) {
    notFound();
  }

  const averageRating = reviews?.meta.average_rating ?? null;
  const reviewCount = reviews?.meta.total ?? 0;
  // …
```

Four details, each tied to the spec:

- **`params` is a Promise** (Next.js 15), so it is awaited before use.
- **`SLUG_PATTERN` guards the fetches.** The pattern (`/^[a-z0-9-]{1,80}$/`) matches what the
  API accepts for the `company` filter. A slug outside it can never exist, and passing it to
  `searchJobs({ company: slug })` would make the API answer 422 and land on the error boundary
  instead of the not-found page, so the page calls `notFound()` before any request.
- **`loadReviewSummary` catches only a 404.** For an unknown slug the reviews endpoint answers
  `404 company_not_found` at the same time as `getCompany` returns `null`. Without the catch,
  `Promise.all` would reject and AC-2 would show the error boundary. Any other error still
  surfaces.
- **The rating summary** prints `averageRating.toFixed(1)` with "out of 5 · N reviews", or "No
  reviews yet" (clarity gate Q1). It always links to `/companies/<slug>/reviews`. The API already
  rounds half-up to one decimal (BR-43). The page only formats the number.

Task 2 also touched job detail. The company link is already in the chapter 02 artifact
[app/jobs/[id]/page.tsx](artifacts/web/app/jobs/%5Bid%5D/page.tsx), which holds the
end-of-walkthrough state. This is the change HIRE-7 made (excerpt; the artifact is authoritative):

```diff
 import Link from 'next/link';
 import { notFound } from 'next/navigation';
 …
       <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
       <p className="text-lg">
-        {job.company.name}
+        <Link href={`/companies/${job.company.slug}`} className="font-medium text-blue-700 hover:underline">
+          {job.company.name}
+        </Link>
       </p>
```

`job.company.slug` was in the `JobPosting` shape from HIRE-1, so no type or API change was
needed. The investigation confirmed this before sizing the spec S.

## Step 4 — HIRE-8: trivial, no spec

The next ticket is copy-sized. Alex merges HIRE-7, then starts from `main` in `web/`:

```bash
git -C web switch main && git -C web pull
git -C web switch -c chore/HIRE-8-salary-range
```

He passes the ticket text inline, so `/sdd` does not need to ask for it:

```text
> /sdd HIRE-8: job cards show the salary range as "€60,000 – €80,000 a year"; hide it when there is no salary

  (simulated)
  Route: trivial — one component (components/job-card.tsx), no design choice, no behavior
  contract at risk (the API already returns salary {min, max, currency}).
  ? Confirm the route
    ❯ trivial (recommended)
      feature
  → trivial

  Skill("simple-task", "HIRE-8: job cards show the salary range as '€60,000 – €80,000 a year'
  using Intl.NumberFormat with the posting currency; hide it when salary is null --no-tests")
```

Alex asked for `--no-tests` on purpose. `/simple-task` is test-first by default (RED, then GREEN),
and the flag is its explicit opt-out. The reason is that the web repo has no component test
environment: Vitest covers `lib/**/*.test.ts` in a node environment, and the change is
presentational. The cost is real. `formatSalary` has three branches of pure logic that nothing
tests. Moving it to `lib/format-salary.ts` with a Vitest case would be the stricter alternative;
chapter 10's QA plan lists the missing coverage.

The `trivial` signal in [/sdd Step 2](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/SKILL.md) is "≤ ~5 files,
no design choice, no behavior contract at risk". This is the same line `write-spec` draws as
**XS**: "≤ ~3 files, one obvious change … **No spec.** Recommend `/simple-task`". Had Alex
routed it as a feature, `write-spec` would have sized it XS and sent it back to this route.
`/sdd` never creates a spec for trivial work.

`/simple-task` takes its fast path (clear task, fewer than 3 files):

```text
  (simulated, abridged)
  Investigate
    components/job-card.tsx renders title, company, location, remote badge, employment type
    types/api/jobs.ts: salary: { min: number | null; max: number | null; currency: string } | null
    Complexity: 1 file, 0 new files, 0 migrations, 0 endpoints — under every threshold
  Implement
    formatSalary(salary) in job-card.tsx: Intl.NumberFormat('en', { style: 'currency',
    currency: salary.currency, maximumFractionDigits: 0 }); range "min – max a year",
    "From …" / "Up to …" when one bound is missing; no badge when salary is null
    Test-first: skipped (--no-tests). No component test environment; verified by tsc,
    lint and the dev server instead.
  Verify
    npm run lint ✓   npx tsc --noEmit ✓   npm test ✓ (3 passed)   no console.log / debugger
  Task log: .ai/tasks/TASK-0001-salary-range-on-job-cards.md (diff is over 10 lines)

  Files Changed (1):
    ~ components/job-card.tsx (modified)
```

The diff it reports is below (excerpt). The chapter 02 artifact
[components/job-card.tsx](artifacts/web/components/job-card.tsx) already contains the final
version, so read that file for the exact code:

```diff
 import Link from 'next/link';
 import { EMPLOYMENT_TYPE_LABELS } from '@/lib/search-params';
-import type { JobPosting } from '@/types/api/jobs';
+import type { JobPosting, Salary } from '@/types/api/jobs';
+
+/** "€60,000 – €80,000 a year"; one-sided ranges read "From …" / "Up to …". */
+function formatSalary(salary: Salary): string {
+  const money = new Intl.NumberFormat('en', {
+    style: 'currency',
+    currency: salary.currency,
+    maximumFractionDigits: 0,
+  });
+
+  if (salary.min !== null && salary.max !== null) {
+    return `${money.format(salary.min)} – ${money.format(salary.max)} a year`;
+  }
+  if (salary.min !== null) {
+    return `From ${money.format(salary.min)} a year`;
+  }
+  return `Up to ${money.format(salary.max ?? 0)} a year`;
+}

 export function JobCard({ job }: { job: JobPosting }) {
   return (
     <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300">
       …
       <ul className="mt-3 flex flex-wrap gap-2 text-xs text-gray-700">
         {job.remote && <li className="rounded-full bg-green-100 px-2.5 py-0.5 text-green-800">Remote</li>}
         <li className="rounded-full bg-gray-100 px-2.5 py-0.5">{EMPLOYMENT_TYPE_LABELS[job.employment_type]}</li>
+        {job.salary && <li className="rounded-full bg-gray-100 px-2.5 py-0.5">{formatSalary(job.salary)}</li>}
       </ul>
     </article>
   );
 }
```

`maximumFractionDigits: 0` matches INV-07 and BR-12: salaries are whole annual units, so the
card shows "€60,000", not "€60,000.00". The currency comes from the posting rather than being
hard-coded to EUR, which keeps any non-EUR posting correct.

The task log lands at `.ai/tasks/TASK-0001-salary-range-on-job-cards.md` relative to the session
directory, here the untracked workspace scratch folder. The skill only skips the log for
single-file changes under 10 lines, and this diff is longer, so the log is written. Alex checks
http://localhost:3000/jobs by eye, then commits and opens the PR:

```bash
git -C web add components/job-card.tsx
git -C web commit -m "chore(jobs): show salary range on job cards (HIRE-8)"
git -C web push -u origin chore/HIRE-8-salary-range
(cd web && gh pr create --base main --title "HIRE-8: salary range on job cards" \
  --body "Trivial route via /sdd → /simple-task. One file; lint, tsc and vitest green.")
```

The careers page reuses `JobCard`, so HIRE-8 shows up there too with no extra work.

## Step 5 — Choosing the size

| Size | Signals | What you get | In this walkthrough |
|------|---------|--------------|---------------------|
| **XS** | ≤ ~3 files, obvious change, no contract at risk | No spec. `/simple-task` (via the `/sdd` trivial route) | HIRE-8 |
| **S** | One area, 1–3 tasks, no schema or public API change | `spec-lite.md` + `tasks.md` | HIRE-7 |
| **M** | Several layers, 4–7 tasks, or a schema/API change | S + `decisions.md` when real decisions were made + `manual-test.md` when there is a UI | HIRE-3 to HIRE-6 |
| **L** | Cross-cutting, multi-repo, 8+ tasks, or new business rules | M + `business-rules.md` + `references.md`, each only when it has content | none (chapter 05 explains why HIRE-4 is not L) |

HIRE-7 still ended up with a `manual-test.md`. ship-feature's TestPlan phase writes one for
every spec it builds, whatever the size. The size limits what `write-spec` produces up front,
not what the build pipeline records.

The canonical table is [Sizing (proportionality)](../../reference/specification-system.md#sizing-proportionality)
in the specification system. The one-paragraph version of the trivial path is
[USAGE-EXAMPLES.md#6-small-change](../../reference/usage-examples.md#6-small-change).

## What you have now

- A public careers page at `/companies/<slug>` with open jobs, a rating summary, and a link from
  job detail. It was built from an approved S spec in `web/.ai/specs/` that is now `done`, and
  `api/` was not touched.
- Job cards that show salary ranges, changed through the trivial route with no spec, using
  `--no-tests` knowingly.
- Two web PRs (`feature/HIRE-7-company-careers-page`, `chore/HIRE-8-salary-range`), each green
  on lint, tsc and vitest, plus `npm run build` for the new route.

Next: [09 — Bug: closed postings reachable by direct link, fixed with fix-bug](09-bug-closed-jobs-fix-bug.md)
