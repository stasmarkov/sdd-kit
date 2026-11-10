# 07 — Job applications with ship-feature, then /deep-review before merge (HIRE-6)

Previous: [06 — Build task by task and resume: candidate profiles with /execute-task](06-execute-task-candidate-profiles.md)

HIRE-6 is the first feature that moves personal data between two kinds of users. A candidate's
name, email, headline and cover letter go to an employer, and only to the right one. The build
follows the same feature pipeline as chapters 04 and 05: spec, human approval, then ship-feature.
This chapter compresses those parts and spends its time on what happens **after** ship-feature
reports `SHIP`. Alex Rivera gates the merge with `/deep-review`, a reviewer that never saw the
spec or the prompt. It finds a real bug. Alex fixes it with a small `/simple-task`, re-reviews,
and merges both repos in order.

Reference pages, so this chapter doesn't repeat them:

- [USAGE-EXAMPLES.md, section 1 "Feature from a ticket"](../../reference/usage-examples.md#1-feature-from-a-ticket) and [section 9 "Review before merge"](../../reference/usage-examples.md#9-review-before-merge)
- [`/sdd` route reference: ship-feature](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/references/ship-feature.md): args, phases, outputs, done-when
- [`deep-review` skill](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/deep-review/SKILL.md) and its [report template](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/deep-review/references/adversarial-review.md#report-template)

| | |
|---|---|
| Ticket | HIRE-6 "Candidates apply to open jobs with an optional cover letter; employers see applicants for their own jobs" |
| Route | `feature` → `write-spec` → approval → `ship-feature`, then `/deep-review` → `/simple-task` → `/deep-review --staged` |
| Spec | [`api/.ai/specs/spec-HIRE-6-job-applications/`](artifacts/api/.ai/specs/spec-HIRE-6-job-applications/spec-lite.md) (M, 5 tasks) |
| Branches | `feature/HIRE-6-job-applications` in `api/` and `web/` |
| Date | 2026-10-24 |
| Review report | [`api/.ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md`](artifacts/api/.ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md) |

> Command names below are bare (`/sdd`, `/deep-review`). In plugin mode they are namespaced
> (`/sdd-kit:sdd`, `/sdd-kit:deep-review`). See [chapter 01](01-workspace-and-install.md).

It assumes the state at the end of [chapter 06](06-execute-task-candidate-profiles.md): HIRE-3 to
HIRE-5 are merged in both repos, so candidates can register, sign in and save a profile at
`/profile`.

---

## 1. Spec and approval (compressed)

Branch both repos first. ship-feature writes into whatever is checked out.

```bash
cd ~/work/hireboard
for repo in api web; do
  git -C "$repo" switch main && git -C "$repo" pull
  git -C "$repo" switch -c feature/HIRE-6-job-applications
done
claude
```

```text
/sdd HIRE-6
```

No tracker is connected (F8), so `/sdd` finds no existing `spec-HIRE-6-*` folder and asks for the
ticket text. Alex pastes:

```text
HIRE-6: Job applications
Candidates apply to open jobs with an optional cover letter; employers see applicants for their own jobs.
```

`/sdd` proposes the `feature` route, Alex confirms, and it collects the inputs once: repos
`{ backend: "api", frontend: "web" }`, URL `http://localhost:3000`. `write-spec` never asks where
the spec folder goes (it creates `.ai/specs/<id>/` relative to the session directory), so Alex says
up front that the spec belongs in `api/`, because the API starts this change (see the friction
note in [chapter 08](08-careers-page-s-spec-and-trivial-change.md)). Then `/sdd` runs
`Skill("write-spec", "--ticket=HIRE-6 <ticket text>")`.

*Simulated session, abridged:*

```text
Size: M — schema change (job_applications) + 3 API endpoints + 3 pages, 5 tasks.
  Not L: BR-21 and BR-30..BR-33 already exist in docs/context/business-rules.md (validated
  with the product brief), and an api + web feature is the template's own M shape.
Investigated: web/app/jobs/[id]/page.tsx already links "Apply" to /jobs/[id]/apply (404 today);
  web/middleware.ts already matches /applications, /employer and /jobs/:id/apply;
  JobPostingRepositoryInterface::findById() returns postings in any status.

Spec folder: api/.ai/specs/spec-HIRE-6-job-applications/
Files: spec-lite.md, tasks.md (5 tasks)

Clarity gate (fresh-context reviewer, spec folder only): 3 raised
  Q1 Does the employer list include applications to closed postings?
  Q2 Can a candidate withdraw or edit an application?
  Q3 Does the employer see the candidate's email, or only the name?
```

Alex resolves them with Maya Chen in the same conversation:

| Question | Resolution |
|----------|------------|
| Q1 closed postings in the employer view | **Answered**: included. Closed postings stay visible to the owning employer (BR-33) |
| Q2 withdraw or edit | **Accepted assumption**: out of scope for v1 |
| Q3 email visible to the employer | **Answered**: name, email and headline, and nothing else from the profile (BR-21) |

The spec that comes out has eight acceptance criteria and two must-not-change items. Abridged from
[spec-lite.md](artifacts/api/.ai/specs/spec-HIRE-6-job-applications/spec-lite.md):

| ID | Criterion |
|----|-----------|
| AC-1 | A candidate with a profile applies to an open job and gets 201 |
| AC-2 | No profile gives 422 `profile_required` |
| AC-3 | A job that is not open gives 422 `job_not_open` |
| AC-4 | A duplicate gives 409 `already_applied`, **even under a race** |
| AC-5 | A non-candidate gets 403; an unknown job gets 404 `job_not_found` |
| AC-6 | `/me/applications` lists the candidate's own applications, newest first |
| AC-7 | `/employer/applications` covers the employer's own company only, closed jobs included, with candidate name, email and headline |
| AC-8 | Web: the apply flow redirects to `/applications` with a success banner (manual) |
| MNC-1 | `GET /api/v1/jobs/{id}` shape unchanged |
| MNC-2 | Guests can still view job detail |

Hold on to AC-4. The spec says "even under a race", the tests will say something weaker, and
neither ship-feature's reviewers nor Alex will notice until section 3.

`/sdd` summarizes scope, boundaries and criteria, and asks the approval question. Maya picks
**Approve and build**. `/sdd` writes the approval into the frontmatter:

```yaml
status: approved
approved_by: Maya Chen
approved_at: 2026-10-24T09:05:00Z
```

The status lifecycle and the "approval only counts in this conversation" rule (F7) work exactly as
in [chapter 04](04-feature-accounts-and-roles.md). [Chapter 05](05-feature-company-reviews-full-spec.md)
walks through every spec section in detail.

## 2. ship-feature builds both repos

`/sdd` shows the call before launching it:

```js
Workflow({ name: "ship-feature", args: {
  spec: "api/.ai/specs/spec-HIRE-6-job-applications",
  ticket: "HIRE-6",
  repos: { backend: "api", frontend: "web" },
  url: "http://localhost:3000"
} })
```

The session runs in the workspace root, so `spec` is the repo-relative path. The resolver accepts
"a full folder name or path". The bare id `spec-HIRE-6-job-applications` would be looked up in
`~/work/hireboard/.ai/specs/`, the untracked scratch folder, and fail (F2). Both dev servers are
running (`php artisan serve --port=8000`, `npm run dev`) so the Visual and Acceptance phases can
drive the browser.

*Simulated run, abridged (watch it with `/workflows`):*

```text
Detect      laravel → api (git, clean, feature/HIRE-6-job-applications)
            nextjs  → web (git, clean, feature/HIRE-6-job-applications)
Spec        loaded spec-HIRE-6-job-applications: 5 pending tasks; status approved → in-progress
Build       1 schema doc + migration + model + factory                 laravel-backend-dev  ✓
            2 submit endpoint + rules + tests (5 tests red → green)     laravel-backend-dev  ✓
            3 candidate/employer lists + policy + tests                 laravel-backend-dev  ✓
            4 /jobs/[id]/apply + ApplyForm + submitApplicationAction    nextjs-frontend-dev  ✓
            5 /applications + /employer/applications                    nextjs-frontend-dev  ✓
Gates       api  pint ✓  phpstan ✓  php artisan test ✓
            web  lint ✓  tsc ✓  npm test ✓  npm run build ✓ (routes added)
Converge    round 1: every AC and MNC has a test or manual step; no gap tasks appended
Visual      /jobs/[id]/apply, /applications, /employer/applications at 375/768/1280: no issues
Review      4 dimensions → 3 candidate findings → 0 survived the 3-vote refutation panel
Acceptance  journey re-walked at http://localhost:3000:
              new candidate without profile → apply → "Create your candidate profile before
                you apply." banner, link to /profile ✓
              after saving a profile → apply → redirect /applications?applied=1, banner ✓
              employer@acme.test → /employer/applications lists the applicant ✓
              AC-1..AC-8 ✓   MNC-1 ShowJobPostingTest unchanged ✓   MNC-2 guest /jobs/{id} ✓
Docs        api/docs/api/api-contracts.md: 3 endpoints, error codes
TestPlan    api/.ai/specs/spec-HIRE-6-job-applications/manual-test.md (5 steps);
            Traceability AC-8 / MNC-2 → manual-test.md#step-1..#step-3; status → done
Report      SHIP
```

What landed, by layer. Each file below is the complete end-of-walkthrough version.

**API** (`api/`):

- Schema first: [docs/schemas/job-applications.md](artifacts/api/docs/schemas/job-applications.md), then the
  [migration](artifacts/api/database/migrations/2026_10_24_090000_create_job_applications_table.php) with
  `UNIQUE (job_posting_id, candidate_id)`.
- [JobApplication](artifacts/api/app/Models/JobApplication.php) model with a `candidateProfile`
  relation that joins on `user_id = candidate_id`, because `User` has no relations to later models.
  Also the [factory](artifacts/api/database/factories/JobApplicationFactory.php).
- [SubmitApplicationDTO](artifacts/api/app/DTOs/SubmitApplicationDTO.php) (only `cover_letter`
  comes from the body), and [JobApplicationDTO](artifacts/api/app/DTOs/JobApplicationDTO.php) with
  two outputs: `toApiArray()` for the candidate and `toEmployerArray()` for the employer.
- [JobApplicationRepositoryInterface](artifacts/api/app/Contracts/JobApplicationRepositoryInterface.php) /
  [JobApplicationRepository](artifacts/api/app/Repositories/JobApplicationRepository.php), bound in
  `RepositoryServiceProvider::$bindings`.
- [JobApplicationService](artifacts/api/app/Services/JobApplicationService.php),
  [JobApplicationPolicy](artifacts/api/app/Policies/JobApplicationPolicy.php), three exceptions
  ([ProfileRequired](artifacts/api/app/Exceptions/ProfileRequiredException.php),
  [JobNotOpen](artifacts/api/app/Exceptions/JobNotOpenException.php),
  [AlreadyApplied](artifacts/api/app/Exceptions/AlreadyAppliedException.php)).
- Three invokable controllers ([Submit](artifacts/api/app/Http/Controllers/Applications/SubmitApplicationController.php),
  [ListMy](artifacts/api/app/Http/Controllers/Applications/ListMyApplicationsController.php),
  [ListEmployer](artifacts/api/app/Http/Controllers/Applications/ListEmployerApplicationsController.php))
  and their own route file [routes/api/v1/applications.php](artifacts/api/routes/api/v1/applications.php).
- Tests: [SubmitApplicationTest](artifacts/api/tests/Feature/Applications/SubmitApplicationTest.php),
  [ListMyApplicationsTest](artifacts/api/tests/Feature/Applications/ListMyApplicationsTest.php),
  [ListEmployerApplicationsTest](artifacts/api/tests/Feature/Applications/ListEmployerApplicationsTest.php).

The core rule order is in the service:

```php
$job = $this->jobPostings->findById($jobPostingId);

if ($job === null) {
    throw new JobPostingNotFoundException;
}

if (! $job->isOpen()) {
    throw new JobNotOpenException;
}

if (! $this->applications->hasCandidateProfile($candidateId)) {
    throw new ProfileRequiredException;
}

if ($this->applications->exists($jobPostingId, $candidateId)) {
    throw new AlreadyAppliedException;
}

return $this->applications->create($jobPostingId, $candidateId, $data->coverLetter);
```

`findById()` has no status filter on purpose. The apply flow has to *find* a closed posting so it
can answer `job_not_open` rather than 404. That choice comes back in
[chapter 09](09-bug-closed-jobs-fix-bug.md), where the public detail endpoint turns out to share
the unfiltered lookup.

**Web** (`web/`):

- [types/api/applications.ts](artifacts/web/types/api/applications.ts) mirrors both DTO outputs, and
  [lib/api/applications.ts](artifacts/web/lib/api/applications.ts) (`server-only`) holds the
  fetchers.
- Three registry entries are added to `web/lib/api/endpoints.ts` (owned by chapter 02, which holds
  the final registry):

  ```ts
  submitApplication: { method: 'POST', path: '/api/v1/jobs/{id}/applications' },
  listMyApplications: { method: 'GET', path: '/api/v1/me/applications' },
  listEmployerApplications: { method: 'GET', path: '/api/v1/employer/applications' },
  ```

- [/jobs/[id]/apply](artifacts/web/app/jobs/[id]/apply/page.tsx) with
  [ApplyForm](artifacts/web/components/apply-form.tsx) (`useActionState`) and
  [submitApplicationAction](artifacts/web/app/jobs/[id]/apply/actions.ts). The action maps
  `ApiError.code` to messages and turns `profile_required` into a banner with a `/profile` link.
- [/applications](artifacts/web/app/(account)/applications/page.tsx) and
  [/employer/applications](artifacts/web/app/(account)/employer/applications/page.tsx). Their
  middleware matchers and nav links already existed from HIRE-3.

The **Report** phase closes with:

*Simulated, abridged:*

```text
Recommendation: SHIP
  built 5/5 · convergeRounds 1 · remainingGaps 0 · gates green in api and web
  confirmedFindings 0 · acceptanceResolved true · docsUpdated api/docs/api/api-contracts.md
  manualTestPlan api/.ai/specs/spec-HIRE-6-job-applications/manual-test.md
```

Alex runs [manual-test.md](artifacts/api/.ai/specs/spec-HIRE-6-job-applications/manual-test.md)
steps 1-5 by hand (about ten minutes), then commits each repo separately:

```bash
git -C api add -A && git -C api commit -m "feat(applications): candidates apply, employers list applicants (HIRE-6)"
git -C web add -A && git -C web commit -m "feat(applications): apply flow and application pages (HIRE-6)"
```

ship-feature said `SHIP`, and its review panel confirmed nothing. Alex reviews it anyway, because
this feature hands personal data to a second party.

## 3. `/deep-review` before merge

### Start the session where the report belongs (F3)

`/deep-review` writes its report to `.ai/reviews/` **relative to the session's working
directory**. From the workspace root it would land in the untracked scratch folder. Alex wants
the report committed next to the fix, so he starts a new session inside `api/`, with `web/`
attached and its `CLAUDE.md` loaded ([docs/multi-repo.md](../../reference/multi-repo.md#configuration-traps)):

```bash
cd ~/work/hireboard/api
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../web
```

```text
/deep-review --spec=spec-HIRE-6-job-applications
```

The bare spec id works here because `--spec` reads `.ai/specs/{ID}/tasks.md` relative to the
session, which is now `api/` (F2 again, from the other side). The review scope is every file the
tasks list. [tasks.md](artifacts/api/.ai/specs/spec-HIRE-6-job-applications/tasks.md) names a
`Files:` line per task, and the `web/` paths in it resolve through `--add-dir ../web`, so the
review covers both repos.

### What the adversarial depth does differently

No `--depth` means `adversarial`, the default:

- **A different agent and a different tier.** The review is delegated to `adversarial-reviewer`.
  It runs on the `deep` tier, while ship-feature's Build phase wrote the code on the `standard`
  tier ([docs/effort-guidelines.md](../../reference/effort-guidelines.md#model-tier-selection)). The
  reviewer is never the session that wrote the code.
- **No original prompt.** It gets the code, `docs/context/business-rules.md`,
  `docs/architecture.md` and the gate results. It does not get the ticket, the spec's intent or
  ship-feature's report, so it judges what the code does, not what it was meant to do.
- **Skeptical persona with fixed criteria.** It assumes every file has bugs until proven
  otherwise and applies 13 fixed review criteria. Each CRITICAL or MAJOR finding is re-read
  against the cited lines before it is reported.
- **security-auditor joins automatically** because the scope touches authorization and personal
  data (candidate name, email, headline, cover letter). It runs in parallel and its findings are
  merged into the same report.

*Simulated output, abridged:*

```text
Deep Review: spec-HIRE-6-job-applications (adversarial)

Phase 1: Scope — 30 files from tasks.md (22 api, 8 ../web); business rules + architecture loaded
Phase 2: Tool verification
  PASS  PHPStan (level 5): 0 errors           PASS  tsc --noEmit: 0 errors
  PASS  php artisan test, npm test            PASS  coverage 91.8% (pcov)         
  PASS  Pint, ESLint                          PASS  security + debug pattern scans
Phase 3: adversarial-reviewer ∥ security-auditor (scope handles personal data)
Phase 4: 3 findings → 1 dropped after re-reading the cited lines
  MAJOR  F1 app/Repositories/JobApplicationRepository.php:31
         check-then-insert race: concurrent duplicate submit hits the unique index and
         returns 500 instead of 409 already_applied (BR-32)
  MINOR  F2 app/Http/Controllers/Applications/ListEmployerApplicationsController.php:23
         per_page not capped at 50 — bulk export of applicant PII (security-auditor)

VERDICT: CHANGES_REQUIRED
Report: .ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md
```

PHPStan runs at level 5 here only because `api/CLAUDE.md` carries a `deep-review:` block with
`phpstan-level: 5`, matching `phpstan.neon`. Without that block the adversarial depth runs level 9,
and every static-analysis failure it found would count as a MAJOR finding.

The full report is
[REVIEW-spec-HIRE-6-job-applications-20261024-161502.md](artifacts/api/.ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md).
It follows the kit's template: verdict, statistics, tool results (a gate that couldn't run is
`UNVERIFIED`, never a pass), findings with current and recommended code, positive observations,
and next steps.

### Why F1 is real

The service checks `exists()` and then inserts. A double click on **Send application**, or two
open tabs, sends two requests that can both pass `exists()` before either inserts. The unique
index stops the second row, which keeps the data correct, but the
`UniqueConstraintViolationException` is not a `BusinessRuleException`. It reaches the global
handler as a generic 500, and the form shows an error for an application that was in fact
stored.

The AC-4 test (`refuses a duplicate application`) seeds the first application with a factory
before posting, so it only ever exercises the pre-check. The spec said "even under a race", the
test proved something narrower, and the build's Converge and Review phases both read "AC-4 has a
test" as covered. The adversarial reviewer didn't know what AC-4 was meant to prove. It read the
code, saw two statements that are not atomic, and asked what happens between them.

## 4. Fix with `/simple-task`, then re-review

The fix is two files plus a test, with no design choice to make, so `/simple-task` fits. A spec
or a new ship-feature run would be overkill (see [chapter 08](08-careers-page-s-spec-and-trivial-change.md)
on proportionality). Same session, still in `api/`:

```text
/simple-task "HIRE-6 review F1: map the job_applications unique-constraint violation to already_applied and cover it with a test"
```

*Simulated, abridged:*

```text
Investigate: app/Repositories/JobApplicationRepository.php:31 (create), the review report,
  tests/Feature/Applications/SubmitApplicationTest.php. Complexity: 2 files + 1 test — under thresholds.

Implementation Plan
  ~ app/Repositories/JobApplicationRepository.php   catch UniqueConstraintViolationException → AlreadyAppliedException
  ~ tests/Feature/Applications/SubmitApplicationTest.php   new test, repository called twice
  ~ .ai/specs/spec-HIRE-6-job-applications/tasks.md   AC-4 Traceability row
Proceed? [Yes] [Modify] [Abort]
```

Alex picks **Modify** and adds "also clamp `per_page` to 1-50 in
`ListEmployerApplicationsController` (review F2)", so the minor finding is fixed in the same pass.
TDD order: the new test goes in first and fails with the raw `UniqueConstraintViolationException`.
Then the fix makes it pass.

```diff
--- a/app/Repositories/JobApplicationRepository.php
+++ b/app/Repositories/JobApplicationRepository.php
@@
 use App\DTOs\JobApplicationDTO;
+use App\Exceptions\AlreadyAppliedException;
 use App\Models\JobApplication;
 use Illuminate\Database\Eloquent\Builder;
+use Illuminate\Database\UniqueConstraintViolationException;
 use Illuminate\Pagination\LengthAwarePaginator;
@@
     public function create(string $jobPostingId, int $candidateId, ?string $coverLetter): JobApplicationDTO
     {
-        $application = JobApplication::query()->create([
-            'job_posting_id' => $jobPostingId,
-            'candidate_id' => $candidateId,
-            'cover_letter' => $coverLetter,
-        ]);
+        // The service checks for a duplicate first, but two concurrent submits can both pass
+        // that check. The unique index decides the race; the loser gets the same 409.
+        try {
+            $application = JobApplication::query()->create([
+                'job_posting_id' => $jobPostingId,
+                'candidate_id' => $candidateId,
+                'cover_letter' => $coverLetter,
+            ]);
+        } catch (UniqueConstraintViolationException) {
+            throw new AlreadyAppliedException;
+        }
```

```diff
--- a/app/Http/Controllers/Applications/ListEmployerApplicationsController.php
+++ b/app/Http/Controllers/Applications/ListEmployerApplicationsController.php
@@
-        $perPage = $request->integer('per_page', 20);
+        $perPage = min(max($request->integer('per_page', 20), 1), 50);
```

The new test calls the repository twice. That skips the service's `exists()` check, which is
exactly the state two racing requests are in:

```php
it('maps a concurrent duplicate insert to already_applied', function () {
    $candidate = applicantWithProfile();
    $job = JobPosting::factory()->open()->create();
    $repository = app(JobApplicationRepositoryInterface::class);

    $repository->create($job->id, $candidate->id, null);

    expect(fn () => $repository->create($job->id, $candidate->id, 'Second click.'))
        ->toThrow(AlreadyAppliedException::class);

    assertDatabaseCount('job_applications', 1);
});
```

F2 is not only a security note. AC-7, which Maya approved, says the employer list is paginated
with `per_page` 1-50 (BR-11), and the controller passed `per_page` through unclamped. The build
therefore missed an approved criterion, and both Converge ("every AC has a test") and the Review
panel called AC-7 covered because a test existed for its other clauses. The SDD loop checks that
each criterion has a test, not that the test asserts every clause. The adversarial pass caught it.

`ListEmployerApplicationsTest` gains a `?per_page=500` → `meta.per_page` 50 assertion, and the
AC-7 Traceability row names it. The AC-4 and AC-7 rows in [tasks.md](artifacts/api/.ai/specs/spec-HIRE-6-job-applications/tasks.md#traceability) now
name the added tests and say where they came from:

```diff
-| AC-4 | duplicate, 409 `already_applied`, also under a race | `...SubmitApplicationTest.php::refuses a duplicate application` | test | 2 |
+| AC-4 | duplicate, 409 `already_applied`, also under a race | `...SubmitApplicationTest.php::refuses a duplicate application` and `::maps a concurrent duplicate insert to already_applied` (the race test was added after /deep-review finding F1, 2026-10-24; see `.ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md`) | test | 2 |
-| AC-7 | employer sees own company only, closed included, name/email/headline | `tests/Feature/Applications/ListEmployerApplicationsTest.php::lists applications for the employer company only` and `::includes applications to closed jobs` | test | 3, 5 |
+| AC-7 | employer sees own company only, closed included, name/email/headline, per_page capped at 50 | `...ListEmployerApplicationsTest.php::lists applications for the employer company only` (now with a `?per_page=500` assertion, added after /deep-review finding F2, 2026-10-24) and `::includes applications to closed jobs` | test | 3, 5 |
```

`/simple-task` runs the api gates (all green) and writes its task log under `.ai/tasks/`. Alex
leaves that log out of the commit, because the review report and the Traceability row already
record why the change exists. Then he stages the fix and re-reviews only what changed:

```bash
git add app/Repositories/JobApplicationRepository.php \
        app/Http/Controllers/Applications/ListEmployerApplicationsController.php \
        tests/Feature/Applications/SubmitApplicationTest.php \
        tests/Feature/Applications/ListEmployerApplicationsTest.php \
        .ai/specs/spec-HIRE-6-job-applications/tasks.md \
        .ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md
```

```text
/deep-review --staged
```

*Simulated, abridged:*

```text
Deep Review: staged (adversarial) — 6 files
  Tool verification: PHPStan (level 5), Pint, php artisan test: PASS
  Security + debug pattern scans: clean
  adversarial-reviewer ∥ security-auditor (scope handles personal data): F1 and F2 confirmed fixed, no new findings
VERDICT: APPROVED
```

A MAJOR finding is only closed by a review that can confirm the fix, so this re-run stays at the
default adversarial depth. `--depth=quick` reports only what allows unauthorized access, loses data,
crashes the app or leaks secrets, which is too narrow to confirm a fix. It stays useful as a cheap
check on small changes with no open finding. The staged scope keeps the run to six files.

Alex commits:

```bash
git commit -m "fix(applications): return 409 already_applied on concurrent duplicate submit (HIRE-6)"
```

## 5. PR review per repo, then merge api first

Push both branches, then run the CI-style review once per repo. The `standard` depth is a
constructive checklist review of `base...branch`, and `--format=json` makes it machine-readable.
Unlike the adversarial pass, it *does* get the intent (the PR description or spec summary).

```bash
git -C ~/work/hireboard/api push -u origin feature/HIRE-6-job-applications
git -C ~/work/hireboard/web push -u origin feature/HIRE-6-job-applications
```

In the `api/` session:

```text
/deep-review --depth=standard --branch=feature/HIRE-6-job-applications --base=main --format=json
```

For `web/`, the diff has to come from the web repo's git, so run it there. Headless works the
same way as in CI ([standard-review reference](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/deep-review/references/standard-review.md#ci-integration)):

```bash
cd ~/work/hireboard/web
claude -p "/deep-review --depth=standard --branch=feature/HIRE-6-job-applications --base=main --format=json" > review.json
jq -e '.blocking' review.json && echo "blocking findings" || echo "no blocking findings"
```

*Simulated output, abridged, api first and then web:*

```json
{
  "branch": "feature/HIRE-6-job-applications",
  "base": "main",
  "depth": "standard",
  "summary": { "critical": 0, "major": 0, "minor": 0, "suggestions": 1 },
  "verdict": "approved",
  "findings": [
    {
      "severity": "suggestion",
      "category": "testing",
      "file": "tests/Feature/Applications/SubmitApplicationTest.php",
      "line": 23,
      "issue": "The 2000-character cover_letter limit has no test",
      "suggestion": "Add a 2001-character case expecting 422 validation_failed with errors.cover_letter"
    }
  ],
  "blocking": false
}
```

```json
{
  "branch": "feature/HIRE-6-job-applications",
  "base": "main",
  "depth": "standard",
  "summary": { "critical": 0, "major": 0, "minor": 0, "suggestions": 1 },
  "verdict": "approved",
  "findings": [
    {
      "severity": "suggestion",
      "category": "architecture",
      "file": "app/(account)/employer/applications/page.tsx",
      "line": 11,
      "issue": "dateFormat and firstValue are duplicated in the two application pages",
      "suggestion": "Extract them to lib/ when a third page needs them"
    }
  ],
  "blocking": false
}
```

`blocking` is `false` in both, so nothing stops the merge. The suggestions go to the backlog.
Then Alex opens one PR per repo, links them to each other, and merges `api` first:

```bash
cd ~/work/hireboard/api
gh pr create --base main --title "HIRE-6: job applications (api)" \
  --body "Spec: .ai/specs/spec-HIRE-6-job-applications (approved by Maya Chen). Deep review: .ai/reviews/REVIEW-spec-HIRE-6-job-applications-20261024-161502.md, F1 and F2 fixed, adversarial re-review APPROVED. Frontend PR: hireboard/web (same branch). Merge this one first."

cd ~/work/hireboard/web
gh pr create --base main --title "HIRE-6: job applications (web)" \
  --body "Backend PR: hireboard/api feature/HIRE-6-job-applications (merge first). Spec and review live in the api repo."
```

Merge order follows the workspace contract (`CLAUDE.md`, "Process"). The change is additive: new
endpoints, no changed shapes. Merging `api` first means the web pages never call an endpoint that
doesn't exist yet. The reverse order would ship an Apply button that answers 404. Once the api PR
is merged and its CI is green, merge the web PR.

> **`/deep-review` complements ship-feature's Review phase. It does not replace it.**
> ship-feature's panel reviews the build *with* the spec: four dimensions, and each finding has
> to survive a three-vote refutation. That makes it good at "does this match what we agreed?".
> `/deep-review` at the adversarial depth deliberately works *without* the spec or the prompt,
> so it catches what everyone who read the spec agreed not to look at. Here, everyone who read
> "even under a race" assumed the AC-4 test proved it. Use both for anything that touches auth,
> personal data or money. For the scenario-level summary, see
> [USAGE-EXAMPLES.md#9-review-before-merge](../../reference/usage-examples.md#9-review-before-merge).

## What you have now

- Candidates apply to open jobs at `/jobs/[id]/apply`, see their history at `/applications`, and
  are sent to `/profile` when they have none. Employers see their own company's applicants
  (closed postings included) at `/employer/applications`.
- `spec-HIRE-6-job-applications` is `done`. Its Traceability links all eight criteria and both
  must-not-change items to tests or manual steps, and AC-4 is now proven under a race.
- A committed `/deep-review` report in `api/.ai/reviews/` with one confirmed MAJOR finding, fixed
  through `/simple-task` and re-reviewed `APPROVED` at the adversarial depth.
- Two linked PRs, merged in order: `api` first, then `web`.

Next: [08 — Proportionality: an S spec for the careers page (HIRE-7) and a no-spec trivial change (HIRE-8)](08-careers-page-s-spec-and-trivial-change.md)
