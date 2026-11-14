# 09 — Bug: closed postings reachable by direct link, fixed with fix-bug (HIRE-9)

Previous: [08 — Proportionality: an S spec and a no-spec trivial change](08-careers-page-s-spec-and-trivial-change.md)

So far every change has started from a spec. This one starts from a defect, and the kit handles it differently: **no spec is written, because the pipeline itself is the spec.** You give `/sdd` the symptom, the repro steps, expected vs actual, and the behavior around the bug that must stay the same. The `fix-bug` workflow then reproduces the bug, verifies a root cause, commits a failing regression test plus a passing guard test for each must-not-change item, applies a minimal fix, runs the gates, and re-walks the original report in the browser.

Reference pages, so this chapter doesn't repeat them:

- [USAGE-EXAMPLES.md, section 2 "Bug"](../../reference/usage-examples.md#2-bug): the general flow
- [`/sdd` route reference: fix-bug](https://github.com/stasmarkov/sdd-kit/blob/v4.1.1/plugins/sdd-kit/skills/sdd/references/fix-bug.md): args, phases, outputs, done-when
- [`src/workflows/fix-bug.js`](https://github.com/stasmarkov/sdd-kit/blob/v4.1.1/plugins/sdd-kit/workflows/fix-bug.js): the workflow source

| | |
|---|---|
| Ticket | HIRE-9 "Closed job postings still open by direct link" |
| Route | `bug` → `fix-bug` workflow |
| Repos touched | `api/` only (the `web/` diff is empty) |
| Branch | `fix/HIRE-9-closed-job-visibility` (api) |
| Date | 2026-10-30 |
| Artifact | [`artifacts/api/tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php`](artifacts/api/tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php) |

> Command names below are bare (`/sdd`). In plugin mode they are namespaced (`/sdd-kit:sdd`). See [chapter 01](01-workspace-and-install.md).

---

## 1. The report

While preparing the HIRE-10 QA pass, Maya Chen files this ticket:

```text
HIRE-9: Closed job postings still open by direct link

Steps: as a guest, open /jobs/<id of "Legacy PHP Maintainer" at Acme Robotics>.
That posting has status closed (it is in the demo seed).
Expected: the not-found page (the API should answer 404 job_not_found).
Actual: the job detail renders with an Apply button. Signing in as a candidate
and applying then shows "This job is no longer accepting applications".
```

This breaks BR-10 ("Only `open` postings appear in search and detail. Draft and closed postings are never public"). The rule is already in `api/docs/context/business-rules.md`, so the fix only has to bring the code back in line with it. No rule is new.

Alex Rivera confirms it by hand before running anything. Start the API and get the id:

```bash
cd ~/work/hireboard/api
php artisan migrate:fresh --seed            # local only
php artisan tinker --execute="echo App\Models\JobPosting::where('title', 'Legacy PHP Maintainer')->value('id');"
# 9d5c1f0a-3b7e-4c2d-8a41-6f0e2b9c7d13
```

The fix-bug workflow commits its regression test into the repo it fixes, so create the branch **before** launching it:

```bash
git -C ~/work/hireboard/api switch main && git -C ~/work/hireboard/api pull
git -C ~/work/hireboard/api switch -c fix/HIRE-9-closed-job-visibility
```

`web/` gets no branch. If the fix later needs a frontend change, create the same branch name there (see [chapter 04](04-feature-accounts-and-roles.md) for the one-branch-name-per-ticket convention).

## 2. `/sdd` classifies it as a bug and collects the inputs

Start Claude in the workspace root so both repos are visible:

```bash
cd ~/work/hireboard
claude
```

```text
/sdd HIRE-9: closed job postings still open by direct link
```

No tracker is connected (no Jira or Linear tool, as in [chapter 04](04-feature-accounts-and-roles.md)), so `/sdd` first looks for an existing spec (`ls -d .ai/specs/*/ | grep -iE "/spec-HIRE-9-"`, which finds none) and then asks for the ticket text. Alex pastes the report from section 1.

*Simulated session, abridged:*

```text
Route: bug — existing behavior is wrong (a closed posting renders publicly,
contradicting BR-10). Not a feature: nothing new is being added.

? Which route?
  > bug → fix-bug workflow (Recommended)
    feature → write-spec → approval → ship-feature
```

Alex picks **bug**. The ticket already contains the symptom, the repro steps, and expected vs actual, so `/sdd` asks only about what it can't know yet. Background workflows can't stop to ask questions, so everything has to be collected now (2–4 questions at most):

```text
? What nearby behavior must stay identical after the fix?
  Suggestions from the code on this path:
  [x] GET /api/v1/jobs/{id} response shape for open postings
  [x] GET /api/v1/jobs results, ordering and pagination
  [x] Applying to a closed job still returns 422 job_not_open
  [x] Employers still see applications to their closed postings
  [ ] Other…

? Repos?  Found sibling repos api/ (laravel) and web/ (nextjs) under a
  workspace with no git → { backend: "api", frontend: "web" }   [confirm]

? Dev URL for the acceptance trace?  http://localhost:3000   [confirm]
```

The last two must-not-change items come from the HIRE-6 rules (BR-31 and BR-33). They matter because the fix touches the same lookup that the applications code uses.

Alex asks whether a quick spec would be a good idea "for the record". `/sdd` declines:

```text
No spec for bug routes (proportionality rule). The fix-bug report is the
record: root cause with file:line, the committed regression and guard tests,
the diff, gate results and a manual test plan.
```

## 3. The launch

`/sdd` shows the exact call and warns that it starts many agents in the background. Alex agrees.

```js
Workflow({
  name: "fix-bug",
  args: {
    bug: "HIRE-9: Closed job postings still open by direct link. Steps: as a guest open /jobs/<id of 'Legacy PHP Maintainer' at Acme Robotics, status closed>. Expected: the not-found page (API 404 job_not_found). Actual: the job detail renders with an Apply button, and applying shows 'This job is no longer accepting applications'.",
    mustNotChange: [
      "GET /api/v1/jobs/{id} response shape for open postings is unchanged",
      "GET /api/v1/jobs results, ordering and pagination are unchanged",
      "Applying to a closed job still returns 422 job_not_open",
      "Employers still see applications to their closed postings in GET /api/v1/employer/applications"
    ],
    repos: { backend: "api", frontend: "web" },
    url: "http://localhost:3000"
  }
})
```

```text
Route:     bug (confirmed)
Ticket:    HIRE-9 (no tracker — link-back skipped)
Launched:  fix-bug — runs in the background; watch with /workflows
Done when: verdict FIXED — regression test red → green, guard tests green,
           gates green, original report re-walked
```

Keep `php artisan serve --port=8000` (in `api/`) and `npm run dev` (in `web/`) running. The Reproduce and Acceptance phases use them.

## 4. The phases, with evidence

The phase list comes from `meta.phases` in `src/workflows/fix-bug.js`:

```text
Detect → Reproduce → RootCause → RegressionTest → Fix → Gates → Acceptance → Report
```

Each phase runs on a pinned model tier. Reproduce, RootCause, Acceptance and Report use the deep tier, and the rest use the standard tier (see [docs/effort-guidelines.md](../../reference/effort-guidelines.md)). All output below is **simulated and abridged**.

### Detect

```text
Detect: backend:laravel@api, frontend:nextjs@web (cross-repo)
```

Both repos are git work trees with commits, so the Detect phase raises no WIP warning. That matters: any repo warning forces the verdict to `NOT-RESOLVED`, even when the fix itself works. Gate commands come from the kit's STACKS registry: Pint, PHPStan and `php artisan test` for `api`, and `npm run lint`, `npx tsc --noEmit` and the test script for `web`. Each repo also gets a debug-statement scan.

### Reproduce

The agent runs the failing path instead of reasoning about it:

```bash
$ curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/api/v1/jobs/9d5c1f0a-3b7e-4c2d-8a41-6f0e2b9c7d13
200
$ curl -s localhost:8000/api/v1/jobs/9d5c1f0a-3b7e-4c2d-8a41-6f0e2b9c7d13 | jq '.data | {title, status}'
{ "title": "Legacy PHP Maintainer", "status": "closed" }
```

```text
Reproduce: reproduced — GET /api/v1/jobs/{closed id} returns 200 with status "closed";
           /jobs/{closed id} renders the detail page with an Apply link
entryPoints: GET /api/v1/jobs/{id}, http://localhost:3000/jobs/{id}
```

The response's own `"status": "closed"` field is the clearest evidence. The API knows the posting is closed and serves it anyway.

### RootCause (two-vote adversarial verify)

```text
mechanism: JobPostingService::findOpen() resolves the posting through
  JobPostingRepositoryInterface::findById(), which looks the row up by primary key
  with no status filter. Any existing id (open, closed or draft) comes back, so
  ShowJobPostingController never sees null and never throws JobPostingNotFoundException.
locations:
  - api/app/Services/JobPostingService.php   findOpen() calls findById()
  - api/app/Repositories/JobPostingRepository.php   findById(): whereKey($id), no status condition
fixApproach: add a status-filtered findOpenById() to the interface and repository and
  use it in findOpen(). Do not add a filter to findById(): JobApplicationService::submit()
  relies on it to load closed postings and answer 422 job_not_open (BR-31), and the
  employer listing loads closed postings too (BR-33).
mustNotChange (added): "Draft postings stay hidden from search"

RootCause: confirmed (2/2 votes)
Must NOT change: 5 behavior(s) guarded
```

Two verifier agents, one per lens (correctness and reproducibility), are told to **refute** the hypothesis against the actual code. Each defaults to "not real" unless the code proves it. Two yes votes confirm the hypothesis, and here both said yes; a third, tie-break vote runs only when they disagree or one returns nothing. The reproducibility voter also checked the obvious alternative culprit: `SearchJobPostingsController` uses `searchOpen()`, which does filter by status, so search was never affected.

Notice the extra must-not-change item. RootCause adds anything it finds on the same code path that you didn't list. The workflow merges your list and its additions and de-duplicates them. That gives five guarded behaviors:

| MNC | Behavior | Guard |
|---|---|---|
| MNC-1 | `GET /api/v1/jobs/{id}` shape for open postings unchanged | `ClosedJobPostingVisibilityTest` › 'still shows open postings with the same shape' |
| MNC-2 | `GET /api/v1/jobs` results, ordering, pagination unchanged | › 'still lists the same open postings' |
| MNC-3 | Applying to a closed job still returns 422 `job_not_open` | › 'still refuses applications to closed jobs' |
| MNC-4 | Employers still see applications to closed postings | › 'still shows closed-job applications to the owning employer' |
| MNC-5 | Draft postings stay hidden from search (found by RootCause) | existing `SearchJobPostingsTest` › 'lists only open postings newest first' |

The RegressionTest prompt says "find an existing test that pins it or write one". MNC-5 was already pinned by the chapter 02 search test, so the agent didn't write a duplicate.

### RegressionTest: red for the right reason, committed before the fix

The agent writes [`tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php`](artifacts/api/tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php): two regression tests and four guards. Excerpt:

```php
it('returns 404 job_not_found for a closed posting', function () {
    $closed = JobPosting::factory()
        ->closed()
        ->for(closedVisibilityCompany())
        ->create(['title' => 'Legacy PHP Maintainer']);

    getJson("/api/v1/jobs/{$closed->id}")
        ->assertNotFound()
        ->assertJson(['success' => false, 'status' => 404, 'code' => 'job_not_found'])
        ->assertJsonMissingPath('data');
});
```

The MNC-1 guard pins the exact key set of `data` and `data.company`, not just a few values, so a fix that quietly adds or drops a field would fail it. The MNC-3 guard gives the candidate a profile, so the request is a valid application in every way except the job status, and the test still pins `job_not_open` if someone reorders the checks in `submit()` to put `profile_required` first.

```text
$ php artisan test --filter=ClosedJobPostingVisibility

   FAIL  Tests\Feature\Jobs\ClosedJobPostingVisibilityTest
  ⨯ it returns 404 job_not_found for a closed posting
  ⨯ it returns 404 job_not_found for a draft posting
  ✓ it still shows open postings with the same shape
  ✓ it still lists the same open postings
  ✓ it still refuses applications to closed jobs
  ✓ it still shows closed-job applications to the owning employer

  Expected response status code [404] but received 200.

  Tests:    2 failed, 4 passed
```

Both failures are "expected 404, received 200", which is exactly the bug. A failure caused by a missing factory state or a 500 from setup would be red for the wrong reason, and the agent would have to fix the test before moving on. Then it commits a checkpoint:

```text
$ git -C api log --oneline -1
3f8a2c1 test: cover closed and draft job detail visibility
RegressionTest: red as expected
```

Why the chapter 02 suite missed this: `ShowJobPostingTest` covered an open posting and an unknown id, but not a closed one. Unknown id and closed posting reach the 404 through different code paths, and only the first one was tested.

### Fix: minimal, with immutable tests

The Fix agent receives the regression test path labelled *"DO NOT EDIT — it is the oracle"*, plus the five MNC behaviors whose guard tests are "equally immutable and must stay green". Its prompt forbids editing those tests or weakening any assertion. The whole change:

```diff
--- a/app/Contracts/JobPostingRepositoryInterface.php
+++ b/app/Contracts/JobPostingRepositoryInterface.php
     public function findById(string $id): ?JobPostingDTO;
+
+    public function findOpenById(string $id): ?JobPostingDTO;
--- a/app/Repositories/JobPostingRepository.php
+++ b/app/Repositories/JobPostingRepository.php
+    public function findOpenById(string $id): ?JobPostingDTO
+    {
+        $posting = JobPosting::query()->with('company')->whereKey($id)->where('status', JobPostingStatus::Open)->first();
+
+        return $posting ? JobPostingDTO::fromModel($posting) : null;
+    }
--- a/app/Services/JobPostingService.php
+++ b/app/Services/JobPostingService.php
     public function findOpen(string $id): JobPostingDTO
     {
-        $posting = $this->postings->findById($id);
+        $posting = $this->postings->findOpenById($id);
```

`findById()` keeps its current behavior on purpose. The MNC-3 and MNC-4 guards would catch anyone who "simplified" it by adding the status filter there. The chapter 02 artifacts (`artifacts/api/app/Contracts/JobPostingRepositoryInterface.php`, `artifacts/api/app/Repositories/JobPostingRepository.php`, `artifacts/api/app/Services/JobPostingService.php`) already contain this fixed code, because every artifact holds its end-of-walkthrough state. Use the chapter 02 files as the authoritative version of the method body. The diff above shows the shape of the change.

```text
Fix: regression test green — 4 file(s) touched
```

The four files are the three above plus the test file the RegressionTest phase committed. `changedFiles` lists both.

**Why the tests are immutable.** If the fixer could edit the test, the cheapest way to "go green" would be to change the test, for example by asserting 200 or deleting the draft case. The regression test is the only independent definition of "fixed", and the guard tests are the only definition of "nothing else broke". Both were committed *before* the fixer started, so any edit shows up in `git diff`. Nothing in the pipeline re-checks the test files after the fix: the Acceptance phase diffs the fix only for Must-NOT-change behavior. So run `git diff --stat -- tests/` yourself:

```bash
git -C ~/work/hireboard/api diff --stat -- tests/    # expect no output
```

Be clear about what this guarantee is: immutability comes from an instruction plus a committed checkpoint, not from a file lock. That's why the `git diff` check is worth the few seconds.

### Gates

```text
api   Pint            pass
api   PHPStan         pass
api   Pest/PHPUnit    pass   (full suite, including SearchJobPostingsTest for MNC-5)
api   Debug scan      pass
web   ESLint          pass
web   tsc             pass
web   tests           pass   (vitest run)
web   Debug scan      pass
```

Gates run in every detected repo, not just the one that changed. The web gates pass trivially here, since nothing in `web/` changed. If a gate fails, the workflow runs up to three auto-fix rounds. The fixer in those rounds may change code, but not gate config, the regression test, or the guards.

### Acceptance: the original report, re-walked

A passing test doesn't prove the user-facing symptom is gone, so the deep-tier acceptance agent walks the original journey against the running apps:

```text
Scenario: guest opens the closed "Legacy PHP Maintainer" posting by URL
  ✓ GET :8000/api/v1/jobs/9d5c1f0a-…  expected 404 job_not_found → got 404 job_not_found
  ✓ http://localhost:3000/jobs/9d5c1f0a-…  expected not-found page → app/not-found.tsx rendered, no Apply link
  ✓ http://localhost:3000/jobs  expected unchanged list → same 8 open postings, same order
  ✓ http://localhost:3000/jobs/<open id>  expected detail + Apply → unchanged
Unchanged:
  ✓ MNC-1 open posting shape      guard green; git diff touches no DTO/controller
  ✓ MNC-2 search results/order    guard green; searchOpen() not in the diff
  ✓ MNC-3 closed → job_not_open   guard green; JobApplicationService still uses findById()
  ✓ MNC-4 employer sees closed    guard green; listing query untouched
  ✓ MNC-5 drafts hidden in search SearchJobPostingsTest green
brokenLinks: none
Acceptance: RESOLVED
```

The web side needed no change. `app/jobs/[id]/page.tsx` (chapter 02) already calls `notFound()` when `getJob()` returns `null`, which it does on any 404. The frontend was correct all along and just never received a 404.

### Report: verdict and manual test plan

```markdown
## Summary
HIRE-9 — closed and draft job postings were served by GET /api/v1/jobs/{id}.

## Root cause
JobPostingService::findOpen (app/Services/JobPostingService.php) used the unfiltered
JobPostingRepositoryInterface::findById (app/Repositories/JobPostingRepository.php).
Confirmed by 2/2 verify votes.

## Regression test
tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php — 2 regression tests red → green,
committed in 3f8a2c1 before the fix.

## Must NOT change
MNC-1..MNC-4 (reporter) and MNC-5 (RootCause): each guard green, each behavior identical.

## Quality gates
api: Pint, PHPStan, Pest, debug scan — pass. web: ESLint, tsc, vitest, debug scan — pass.

## Manual test plan
Preconditions: `php artisan migrate:fresh --seed` (local), API on :8000, web on :3000.
1. Guest: open http://localhost:3000/jobs/<id of "Legacy PHP Maintainer"> → the not-found page, no Apply link.
2. Guest: `curl -s localhost:8000/api/v1/jobs/<same id>` → 404, "code": "job_not_found".
3. Guest: open http://localhost:3000/jobs → the same open postings as before, newest first; "Legacy PHP Maintainer" and the draft are absent. (MNC-2, MNC-5)
4. Guest: open any open posting from the list → detail with company link and Apply. (MNC-1)
5. Sign in as candidate@hireboard.test / password, then
   `POST /api/v1/jobs/<closed id>/applications` through the API with a token → 422 "job_not_open". (MNC-3)
6. Sign in as employer@acme.test / password → /employer/applications still lists applications
   to "Legacy PHP Maintainer" with job status closed (if the seed has none, create one in tinker first). (MNC-4)
Rollback: revert the fix commit; the regression tests go red again.

## Recommendation
FIXED
```

The report is part of the workflow's return value (`recommendation`, `mustNotChange`, `acceptance`, `gatesPassed`, `changedFiles`, `manualTestPlan`, `report`). It isn't written as a committed file. The test-plan agent *may* also save the plan into `api/docs/` or `api/.ai/` when those folders exist. Paste the report into the PR description.

## 5. The other two verdicts

`FIXED` is only one of three outcomes. The verdict logic sits at the end of `fix-bug.js`:

- **`NEEDS-INFO`**: Reproduce couldn't make the bug happen. Suppose Alex's local database had been seeded before the "Legacy PHP Maintainer" posting was added to `JobBoardSeeder`, so the reported id didn't exist. Reproduce would get 404 job_not_found for that id (correct behavior), find no closed posting to try, and set `reproduced: false`. The workflow then **stops right after Reproduce**. It doesn't guess a root cause, writes no test, and changes no code. The report would read roughly: *"Could not reproduce. Tried: GET /api/v1/jobs/<id> → 404 job_not_found; no posting with status closed exists in the local database. Needed: the exact posting id or URL from the reporter's environment, or confirmation that `php artisan migrate:fresh --seed` on current main is the intended data."* You supply that and launch again.
- **`NOT-RESOLVED`**: anything short of `FIXED` when the bug did reproduce. That covers a fix that can't turn the regression test green, gates still red after three auto-fix rounds, an acceptance walk that still shows the Apply button or breaks an MNC behavior, or an untracked/WIP repo warning from Detect. The report says which condition failed. Don't merge on `NOT-RESOLVED`.

## 6. Commit, PR (api only), merge

The RegressionTest phase committed the tests. The fix itself is in the working tree for you to review and commit:

```bash
cd ~/work/hireboard/api
git diff --stat
#  app/Contracts/JobPostingRepositoryInterface.php |  2 ++
#  app/Repositories/JobPostingRepository.php       |  7 +++++++
#  app/Services/JobPostingService.php              |  2 +-
git add app/Contracts/JobPostingRepositoryInterface.php app/Repositories/JobPostingRepository.php app/Services/JobPostingService.php
git commit -m "fix(jobs): only open postings resolve on job detail (HIRE-9)"
git push -u origin fix/HIRE-9-closed-job-visibility
gh pr create --base main --title "HIRE-9: closed job postings still open by direct link" \
  --body-file /tmp/hire-9-report.md      # the fix-bug report from section 4
```

Push the branch only after the fix commit. The test-only checkpoint is red on its own, and CI would flag it.

There is **no `web/` PR**. `git -C ~/work/hireboard/web status` is clean, because the frontend already turned a 404 into the not-found page. The one-PR-per-repo, api-first rule from chapter 04 applies only to repos that changed.

The diff is small and fully covered by guards, so the CI gates plus the report are enough review here. For a riskier fix, run `/deep-review` on the branch the same way as in [chapter 07](07-applications-and-deep-review.md).

---

## What you have now

- HIRE-9 fixed in `api/` only: `findOpen()` resolves through a status-filtered `findOpenById()`, while `findById()` still serves the applications code.
- A committed [`ClosedJobPostingVisibilityTest`](artifacts/api/tests/Feature/Jobs/ClosedJobPostingVisibilityTest.php) with two regression tests and one guard per must-not-change behavior, plus MNC-5 pinned by the existing search test.
- A `FIXED` report with a root cause at file:line confirmed 2/2, gate results per repo, a re-walk of the original report, and a manual test plan that covers the original case and every MNC item.
- No spec, by design: for a bug, the pipeline's report and tests are the record.

Next: [10 — Shipped code: a traceable QA plan and docs for the public browse journey (HIRE-10)](10-qa-and-docs-browse-journey.md)
