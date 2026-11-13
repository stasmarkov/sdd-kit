# 10 — Shipped code: a traceable QA plan and docs for the public browse journey (HIRE-10)

**Route:** `shipped` → `qa-and-docs` workflow
**Date in the story:** 2026-11-03
**Session:** inside `web/`, with `api/` added
**Output:** [`web/docs/qa/qa-plan-2026-11-03.md`](artifacts/web/docs/qa/qa-plan-2026-11-03.md), [`web/docs/user/finding-jobs.md`](artifacts/web/docs/user/finding-jobs.md), [`web/docs/dev/browse-journey.md`](artifacts/web/docs/dev/browse-journey.md)

Each earlier chapter changed code. This one doesn't. The anonymous browse journey is already live, and QA wants one regression plan for it before the next release. The `shipped` route reads the code that exists, works out acceptance criteria, links every test case and doc claim to a real file, and then grades the result against the implementation.

## The situation

Four separate pipelines built the anonymous journey, and no spec covers all of it:

| Piece | Shipped by | Chapter | Existing test notes |
|-------|-----------|---------|---------------------|
| Job search and filters | greenfield-build (HIRE-1) | [02](02-greenfield-first-slice.md) | `api/docs/manual-test.md` (slice handoff) plus Pest and Vitest tests |
| Job detail | greenfield-build (HIRE-1) | [02](02-greenfield-first-slice.md) | same |
| Careers page | ship-feature, S spec (HIRE-7) | [08](08-careers-page-s-spec-and-trivial-change.md) | `web/.ai/specs/spec-HIRE-7-company-careers-page/manual-test.md` |
| Salary on job cards | /simple-task, no spec (HIRE-8) | [08](08-careers-page-s-spec-and-trivial-change.md) | none |
| Closed postings return 404 | fix-bug (HIRE-9) | [09](09-bug-closed-jobs-fix-bug.md) | `ClosedJobPostingVisibilityTest.php` plus the manual steps in the fix-bug report |

Running the pieces' test notes one after another doesn't give QA a regression plan. Salary display has no notes at all, and nothing says which business rule each check protects. Rerunning ship-feature isn't the answer either, because nothing needs to be built.

## Step 1 — Start in the repo that will own the plan

Single-file outputs from a workflow land relative to the session's working directory (kit friction F3). Without a spec, `qa-and-docs` writes its plan to `docs/qa/qa-plan-<date>.md`. If you start from the workspace root, the plan ends up in `~/work/hireboard/docs/qa/`. That folder has no git of its own, so the plan would never be committed.

QA works in the frontend, so the plan belongs in `web/`. Start there and add `api/` so the agents can read the backend code and its `CLAUDE.md` ([docs/multi-repo.md](../../reference/multi-repo.md)):

```bash
cd ~/work/hireboard/web
git switch main && git pull
git switch -c chore/HIRE-10-browse-journey-qa
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../api
```

## Step 2 — `/sdd` classifies the request as `shipped`

```
/sdd HIRE-10: QA plan and docs for the public job browsing journey
```

The input contains a ticket key, so `/sdd` first looks for an existing spec and then for a tracker. Neither exists (F8). Abridged session, simulated:

```
> ls -d .ai/specs/*/ | grep -iE "/spec-HIRE-10-"
  (no match)

No Jira/Linear tool in this session. Paste the HIRE-10 ticket text, or reply "use the line above".
```

Alex pastes the ticket:

```
HIRE-10: QA plan and docs for the public job browsing journey.
QA needs one regression plan for the anonymous flow before the release: search, filters,
job detail, company careers page, salary display, and closed postings returning not found.
Shipped across HIRE-1, HIRE-7, HIRE-8 and HIRE-9. Also write a user guide and a dev
overview. No code changes.
```

`/sdd` picks a route and asks Alex to confirm it (simulated):

```
Route: shipped — the code already exists and needs a QA plan and docs, not changes.

? Which route?
  ❯ shipped → qa-and-docs (Recommended)
    feature → write-spec → approval → ship-feature
```

Alex accepts. Background workflows can't stop to ask questions, so `/sdd` gathers the scope and the repos before it launches anything:

```
? Scope for qa-and-docs
    spec      — no single spec covers this journey
    gitRange  — one range can't span two repos with separate histories
  ❯ paths     — list the files of the journey in both repos
    feature name — "public job browsing" (search-based, may pull in reviews/auth code)

? Repos (detected sibling ../api with an artisan file)
  ❯ backend: ../api, frontend: .
```

Alex picks `paths` and lists the journey's files. Paths resolve from the session's directory, so the backend globs start with `../api/`. Before any `Workflow` call, `/sdd` shows the exact call it will make:

```js
Workflow({ name: "qa-and-docs", args: {
  paths: [
    "app/jobs/page.tsx",
    "app/jobs/[id]/page.tsx",
    "app/companies/[slug]/page.tsx",
    "components/job-card.tsx",
    "components/job-filters.tsx",
    "lib/api/jobs.ts",
    "lib/search-params.ts",
    "../api/app/Http/Controllers/Jobs/**",
    "../api/app/Http/Controllers/Companies/**",
    "../api/app/Services/JobPostingService.php",
    "../api/app/Repositories/JobPostingRepository.php"
  ],
  repos: { backend: "../api", frontend: "." }
} })
```

```
This runs several agents in the background (Detect, Index ×2, Criteria, QAPlan ∥ Docs,
Grade, Report). Launch? (yes / no)
```

After Alex answers yes, the hand-off looks like this (simulated):

```
Route:    shipped (confirmed)
Ticket:   HIRE-10
Scope:    paths (7 web, 4 api)
Launched: qa-and-docs — runs in the background; watch with /workflows
Done when: grader passes the coverage and phantom-link gates; a human reviews before publishing
```

The phases, the args table and the done-definition for this route are in [references/qa-and-docs.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/sdd/references/qa-and-docs.md). [USAGE-EXAMPLES §4](../../reference/usage-examples.md#4-qa-plan-and-docs-for-shipped-code) shows the same route with other kinds of scope.

## Step 3 — What the phases do

```
Detect         stack(s) + repo layout
Index          files → methods/routes/components → features (bottom-up), one agent per repo
Criteria       spec ACs, or criteria inferred from code
QAPlan ∥ Docs  case → criterion → files  ∥  docs grounded in code
Grade          completeness / helpfulness / truthfulness; coverage + phantom-link gate
Report         coverage matrix + grade + artifact paths
```

Workflow log, abridged and simulated. The line formats match the `log()` calls in `src/workflows/qa-and-docs.js`:

```
[Detect]   Detect: frontend:nextjs, backend:laravel (cross-repo)
[Index]    Index: 5 feature(s), 38 element(s)
[Criteria] Criteria: 9 (inferred), 9 need validation
[QAPlan]   QAPlan: 23 case(s) → docs/qa/qa-plan-2026-11-03.md | Docs: 0 updated, 2 new
[Grade]    Grade: PASS (T:95)
```

**Detect** probes both roots, matches the `laravel` and `nextjs` entries in the stack registry, and checks with `git ls-files` that both repos are tracked. That check produces no WIP warnings here. Two roots set `crossRepo`, so **Index** runs one code-explorer per repo in parallel.

**Index** works bottom-up. It reads leaf functions before their callers, which means repository and service methods first, then controllers, then `lib/api/jobs.ts` and `lib/search-params.ts`, and finally the pages. It clusters the results into five features: *job search with filters*, *job detail*, *closed/draft posting visibility*, *company careers page* and *salary display*. Each feature lists its files and its entry points (`/jobs`, `/jobs/[id]`, `/companies/[slug]`, `GET /api/v1/jobs`, …).

**Criteria** has no spec to read, so it infers testable statements from what the code does and sets `inferred: true` on each one. The prompt forbids inventing requirements that the code doesn't support. That is why salary validation (`salary_min <= salary_max`, BR-12) is not a criterion: nothing in scope writes salaries. Through the `--add-dir` session the agent also reads `api/docs/context/business-rules.md` and anchors each criterion to the rule it protects, BR-10, BR-11 or BR-12. In the report, every inferred criterion appears under *needs validation*, with Maya Chen named as the validator:

| ID | Inferred criterion (abridged) | Anchor |
|----|-------------------------------|--------|
| AC-1 | Search returns only open postings, newest first | BR-10, BR-11 |
| AC-2 | `q`, `location`, `remote`, `employment_type`, `company` narrow and combine | BR-11 |
| AC-3 | `per_page` default 20, capped at 50, INV-01 `meta` | BR-11 |
| AC-4 | The `/jobs` URL is the filter state | BR-11 |
| AC-5 | Detail shows an open posting and links its company | BR-10 |
| AC-6 | Unknown, closed or draft id → 404 `job_not_found`, not-found page | BR-10 |
| AC-7 | Careers page shows the profile and open postings; unknown slug → not-found | BR-10 |
| AC-8 | Careers page shows average rating + count, links to reviews | BR-42, BR-43 |
| AC-9 | Job card shows `€60,000 – €80,000 a year`; nothing when salary is null | BR-12 |

**QAPlan and Docs run in parallel.** Both consume the criteria, and neither needs the other's output. The QA writer produces at least one case per criterion, with `coversCriterion`, `contributingFiles` and copy-paste steps that use real values. Because no spec was given, it writes the plan to `docs/qa/qa-plan-$(date +%Y-%m-%d).md`. The docs writer looks for existing docs to update first. `web/` has none for this area, so it creates two. It lists `api/docs/api/api-contracts.md` as *skipped* because the API contract is already accurate.

**Grade** is a strict verifier (the `outcomes-grader` agent, deep tier). It reads the code again instead of trusting the artifacts. It scores completeness, helpfulness and truthfulness from 0 to 100. Its verdict is `CHANGES_REQUIRED` if there is any phantom link, any uncovered criterion, or truthfulness below 80. Otherwise it is `PASS`.

## Step 4 — The artifacts

### The QA plan: criterion → case → files

[`web/docs/qa/qa-plan-2026-11-03.md`](artifacts/web/docs/qa/qa-plan-2026-11-03.md) starts with setup commands that use the demo seed, including `tinker` one-liners that print the ids of the closed and draft postings. Then come the criteria table and the coverage matrix:

```markdown
| Criterion | Covered | Automated cases | Manual cases | Contributing files |
|-----------|---------|-----------------|--------------|--------------------|
| AC-1 | yes | QA-01, QA-02 | QA-M01 | `SearchJobPostingsController`, `JobPostingService::search`, … |
| AC-6 | yes | QA-11, QA-12, QA-13, QA-14 | QA-M04 | `JobPostingService::findOpen`, `JobPostingRepository::findOpenById`, … |
| AC-9 | yes | none | QA-M07 | `components/job-card.tsx` |
```

The 16 automated cases name existing tests by their exact description and link to the test file:

- `SearchJobPostingsTest.php`: AC-1 to AC-3
- `search-params.test.ts`: AC-4
- `ShowJobPostingTest.php` and `ShowCompanyTest.php`: AC-5 to AC-7
- the HIRE-9 `ClosedJobPostingVisibilityTest.php`: AC-6, plus the guard cases for AC-1 and AC-5

The 7 manual cases cover what no test checks today: the filter form and the URL, the careers page and its rating summary, salary formatting, and the not-found page for closed and draft links. QA-M04 is the original HIRE-9 report, re-walked:

```markdown
| 1 | Open `http://localhost:3000/jobs/CLOSED_ID`. | The not-found page. No job detail and no Apply button. |
| 2 | `curl -s http://localhost:8000/api/v1/jobs/CLOSED_ID` | HTTP 404 with `{"success":false,…,"code":"job_not_found"}`. |
```

The plan also names its own gaps. AC-8 and AC-9 are covered only by manual cases, and the salary formatter is suggested as a future Vitest case.

### The user guide

[`web/docs/user/finding-jobs.md`](artifacts/web/docs/user/finding-jobs.md) is for job seekers, not developers. It covers searching, the four filters, bookmarkable searches, reading salaries, why a saved link to a closed job shows *not found*, and what the careers page shows. Every sentence describes behavior that exists in the indexed code.

### The dev overview

[`web/docs/dev/browse-journey.md`](artifacts/web/docs/dev/browse-journey.md) follows each request from page to database:

```
app/jobs/page.tsx → parseJobFilters → searchJobs (lib/api/jobs.ts)
  → apiFetch(endpoints.searchJobs) → GET /api/v1/jobs
  → SearchJobPostingsController → JobPostingService::search
  → JobPostingRepositoryInterface::searchOpen → JobPostingRepository
```

The doc also covers the rule each layer enforces. It explains why the repository has two lookups (`findOpenById` for public reads, the unfiltered `findById` for applications) and records that the HIRE-9 bug was the first one being used where the second belonged. It ends with recipes for adding a search filter or a payload field, each listing the gates to run.

## Step 5 — Grade PASS, and what the phantom-link gate catches

The Report phase output, abridged and simulated:

```markdown
## Summary
QA plan and docs for the public browse journey across web/ and api/. 23 test cases
(16 automated, 7 manual) cover all 9 criteria. Grade: PASS.

## Acceptance criteria
Source: inferred. All 9 need human validation (product owner: Maya Chen).
Open questions: AND-combination of filters (AC-2); per_page capped rather than 422 (AC-3);
display of single-bound salaries (AC-9).

## Coverage matrix
AC-1, AC-2, AC-4..AC-7: automated + manual; AC-3: automated only; AC-8, AC-9: manual only (no automated test exists).

## QA plan location
docs/qa/qa-plan-2026-11-03.md

## Documentation
New: docs/user/finding-jobs.md, docs/dev/browse-journey.md
Skipped: ../api/docs/api/api-contracts.md (already accurate for these endpoints)
Docs writer notes: dropped one draft claim, "results can be sorted by salary": no sort
parameter exists in JobSearchDTO, SearchJobPostingsController or searchOpen.

## Grade
completeness 92 · helpfulness 88 · truthfulness 95 · phantom links: none · uncovered: none

## Recommendation
PASS: ready for human review. AI output is a strong draft; the human is the final gate.
```

The *notes* line shows the trace rule at work. While drafting the user guide, the docs writer added "results can be sorted by salary", a plausible sentence for a job board. It is told to trace every claim to a code element, and this claim had none. There is no `sort` property in `JobSearchDTO` and no `orderBy` other than `published_at` in `searchOpen`, so the writer dropped it. Had the claim survived into the doc, the grader would have listed it under `phantomLinks` and returned `CHANGES_REQUIRED`.

The workflow has no automatic fix-and-regrade loop. On `CHANGES_REQUIRED`, you fix the listed items, or the code, and run the same `Workflow` call again. A missing feature found this way belongs on the product backlog, not in the docs.

## Step 6 — Human review, commit, PR

Grade `PASS` means the artifacts are ready for human review. It does not mean they are approved. Alex sends the criteria table and its three open questions to Maya Chen. She confirms all nine criteria and answers the questions:

- **AC-2:** AND is intended. Keyword search should not match company names in v1.
- **AC-3:** capping is fine.
- **AC-9:** the `From …` / `Up to …` wording is approved as shipped. She notes that the HIRE-8 ticket only asked for the two-bound range, so the one-sided wording was a small product decision the trivial change should have asked about. Alex records that in the criteria table. Whether employers can enter one-sided salaries is a separate question, and it goes into HIRE-11, where they enter salaries.

Alex updates the criteria table's *Validate* column, runs QA-M04 and QA-M07 by hand against a fresh seed, and commits in `web/`:

```bash
cd ~/work/hireboard/web
git add docs/qa/qa-plan-2026-11-03.md docs/user/finding-jobs.md docs/dev/browse-journey.md
git commit -m "docs: QA plan, user guide and dev overview for the public browse journey (HIRE-10)"
git push -u origin chore/HIRE-10-browse-journey-qa
gh pr create --base main --title "HIRE-10: QA plan and docs for the public browse journey" \
  --body "Traceable QA plan (9 inferred criteria, validated by Maya Chen; 23 cases) plus user and dev docs. qa-and-docs grade: PASS. No code changes."
```

Nothing changed in `api/`, so there is only one PR.

## Variations

- **One spec covers the scope.** From the same `web/` session, `Workflow({ name: "qa-and-docs", args: { spec: "HIRE-7", repos: { backend: "../api", frontend: "." } } })` uses the spec's acceptance criteria verbatim (`source: spec`, nothing to validate) and writes `qa-plan.md` *inside the spec folder* instead of `docs/qa/`. With a spec as scope, the plan stays with the spec it was traced from.
- **Started from the workspace root.** The workflow still runs, but `docs/qa/qa-plan-<date>.md` lands in `~/work/hireboard/docs/qa/`, which no repo tracks. Move the file into a repo, or start inside the owning repo as in Step 1.
- **A single repo with one release window.** `{ gitRange: "v1.4.0..v1.5.0" }` scopes the run to what changed in that range. Use `paths` when the journey spans repos.

## What you have now

- A committed regression plan in `web/docs/qa/qa-plan-2026-11-03.md`. Each of its 23 cases traces to a criterion that Maya Chen has validated, and to the files it exercises.
- An end-user guide and a developer overview for the browse journey. Both were graded against the code, and neither contains a phantom claim.
- A list of follow-ups that came from the run: automate AC-8 and AC-9, and decide in HIRE-11 whether employers may enter single-bound salaries (the display wording is already approved).

Next: [11 — Running Hireboard as a team: contract-sync, routines, evals, pinned versions](11-running-it-as-a-team.md)
