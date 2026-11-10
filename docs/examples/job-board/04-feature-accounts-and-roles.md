# 04 — First feature: accounts and roles via write-spec → approval → ship-feature (HIRE-3)

> **Date in the story:** 2026-10-21 · **Route:** `feature` → `write-spec` → approval → `ship-feature`
> **Ticket:** HIRE-3 · **Session:** started in the workspace root `~/work/hireboard`
> **Spec:** [`artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/spec-lite.md)

[Chapter 03](03-decision-spa-auth-adr.md) ended with ADR-0001 accepted: the API issues Sanctum
personal access tokens, and the Next.js server keeps them in the HttpOnly `hireboard_session` cookie.
Now HIRE-3 turns that decision into code. Candidates and employers can register, sign in, see a
dashboard and sign out. Employers get a company when they register. Guests can still browse jobs.

HIRE-3 is the first ticket that takes the full **feature** pipeline, and the pipeline's order is fixed:

```
/sdd HIRE-3 → feature (confirmed) → write-spec → human approval → ship-feature { spec } → PRs
```

You will run each step once. The commands and arguments shown are the real ones. Agent output is
abridged and marked *simulated*, because your run will word things differently.

> In plugin mode the entry point is namespaced: type `/sdd-kit:sdd` wherever this chapter shows `/sdd`
> (see [INSTALLATION.md](../../reference/installation.md)).

## Before you start

- ADR-0001 is `Accepted` in `api/docs/adr/0001-spa-auth.md`, and INV-05 and BR-04 are in context
  ([chapter 03](03-decision-spa-auth-adr.md)).
- Both dev servers are running, because the Visual phase drives a real browser:

  ```bash
  cd ~/work/hireboard/api && php artisan migrate:fresh --seed && php artisan serve --port=8000
  cd ~/work/hireboard/web && npm run dev            # second terminal
  ```

- The Visual phase drives the browser through the Playwright MCP server first, with the Claude in Chrome
  extension as the fallback. When neither is available, Visual logs "not run" and the rest of the
  pipeline continues.

## Step 1 — Branch both repos before anything else

ship-feature's Detect phase checks each repo with `git -C <path> rev-parse --is-inside-work-tree` and
`git -C <path> ls-files`. A repo without committed files is flagged as untracked WIP, and a run that
builds into a WIP repo can't end in `SHIP`. Both repos have commits from chapter 02, so they pass.
Create the feature branch in each repo now, so that every file the pipeline writes lands on it:

```bash
cd ~/work/hireboard
git -C api switch -c feature/HIRE-3-accounts-and-roles
git -C web switch -c feature/HIRE-3-accounts-and-roles
```

Use the same branch name in both repos ([docs/multi-repo.md, "Process"](../../reference/multi-repo.md#process)).
Never run git from the workspace root, because it has no `.git` on purpose.

## Step 2 — `/sdd HIRE-3`: route and inputs

Start Claude from the workspace root, so that both `api/CLAUDE.md` and `web/CLAUDE.md` load through
the root `CLAUDE.md` imports:

```bash
cd ~/work/hireboard && claude
```

```
/sdd HIRE-3
```

`/sdd` recognizes a ticket key and first looks for an existing spec (`ls -d .ai/specs/*/ | grep -iE
"/spec-HIRE-3-"`). There is none. No Jira or Linear tool is connected (kit friction **F8**), so it
asks for the ticket text instead of fetching it. Alex pastes what Maya wrote:

```
HIRE-3  Accounts and roles
Candidates and employers can register and sign in. An employer registers together with their
company (one company per employer). Admins are not self-service. After signing in, people land on
a dashboard that fits their role and can sign out. Use the approach from ADR-0001.
Guests must still be able to search and read jobs without an account.
Login should be rate limited.
```

*Simulated output, abridged:*

```
Route: feature — adds new behavior (registration, login, roles) across api/ and web/;
the auth approach is already decided in ADR-0001, so this is not a decision.

? Which route should HIRE-3 take?
  > feature (Recommended) — write-spec → your approval → ship-feature
    decision — only if the auth approach were still open (ADR-0001 settled it)
```

Alex confirms **feature**. `/sdd` then collects the inputs that the background workflow can't ask
for later (Step 3 of `src/skills/sdd/SKILL.md`):

```
? Repos: I see api/ (laravel, own git) and web/ (nextjs, own git) in this workspace.
  Use { backend: "api", frontend: "web" }?                    > Yes
? Dev URL for browser checks?                                 > http://localhost:3000
```

Because there is no tracker, `/sdd` also notes that it will skip the ticket link-back after approval
(Step 4b.5 needs a tracker tool).

## Step 3 — write-spec: size, investigate, clarify, create the folder

For the feature route, `/sdd` runs the spec writer interactively (Step 4a) with the ticket key and
the pasted text:

```
Skill("write-spec", "--ticket=HIRE-3 Accounts and roles. Candidates and employers can register and sign in. An employer registers together with their company (one company per employer). Admins are not self-service. ...")
```

`write-spec` runs `SIZE → INVESTIGATE → CLARIFY → CREATE FOLDER → DOCUMENT → CLARITY GATE → HAND OFF`
(`src/skills/write-spec/SKILL.md`).

**Size.** *Simulated:*

```
Type: feature · Size: M — schema change on users (role column) plus four new API endpoints and
three web pages; 5 tasks. Not L: no new business rules (BR-01..BR-04 are already recorded and
validated in api/docs/context/business-rules.md), and an api + web feature is the template's own
M shape. Files: spec-lite.md, tasks.md, manual-test.md (there is a UI journey); no decisions.md,
the three small decisions fit in spec-lite.md.
```

Two repos alone don't make a spec L (kit friction **F6**). The `L` row in the size table is about
cross-cutting work and *new* business rules. HIRE-3 only cites rules Maya has already validated.

**Investigate.** The skill searches before it asks. *Simulated summary:*

```
- Sanctum is installed (install:api): personal_access_tokens migration, auth:sanctum available.
- User has no role column, no HasApiTokens, no role helpers.
- ADR-0001 is Accepted: PATs named "web", 7-day expiry, HttpOnly cookie hireboard_session,
  logout revokes the current token.
- bootstrap/app.php already renders 401 unauthenticated and 429 too_many_requests envelopes.
- Public endpoints that must stay tokenless: GET /api/v1/jobs, /jobs/{id}, /companies/{slug}
  (routes/api/v1/jobs.php), and the /jobs page in web/.
- web/lib/api/client.ts already accepts a `token` option; no session code exists yet.
- git log: nothing auth-related shipped yet.
```

**Clarify.** The skill asks three questions, each grounded in what it found:

```
? Email verification before sign-in?
  > Out of scope for v1 (Recommended)     Required before applying     Required before sign-in
? Can anyone register as admin?
  > Never — admins are seeded only (BR-01)    Admins invite admins
? Session lifetime?
  > 7 days, per ADR-0001 and BR-04 (Recommended)    30 days    Until logout
```

Alex answers with Maya next to him: out of scope, never, 7 days.

**Create the folder.** The spec id is `spec-<TICKET>-<slug>`, and the folder is created with a plain
`mkdir` (no `-p`), so two parallel sessions can never both claim the same id. The skill's snippet
writes to `.ai/specs` **relative to the directory it runs in**. The workspace `CLAUDE.md` says specs
live in the repo that starts the change, so the skill runs the snippet inside `api/`. *Simulated:*

```bash
cd api && SLUG=accounts-and-roles && TICKET=HIRE-3
BASE="spec-${TICKET}-${SLUG}"; mkdir -p .ai/specs
DIR=".ai/specs/$BASE"; n=2
until mkdir "$DIR" 2>/dev/null; do DIR=".ai/specs/$BASE-$n"; n=$((n+1)); done
# → api/.ai/specs/spec-HIRE-3-accounts-and-roles
```

> **Check the path in the hand-off.** If it shows `.ai/specs/spec-HIRE-3-...` with no `api/` in front,
> the folder landed in the workspace root's scratch `.ai/`, which nobody commits. Move it before you
> approve: `mv .ai/specs/spec-HIRE-3-accounts-and-roles api/.ai/specs/`. The spec belongs to `api/`
> because the API change starts the feature, and it lists the `web/` tasks too. Don't copy it into
> `web/` ([docs/multi-repo.md, "Workflows and specs"](../../reference/multi-repo.md#workflows-and-specs)).

## Step 4 — The spec, condensed

[Chapter 05](05-feature-company-reviews-full-spec.md) walks through an M spec section by section.
Here are the parts of HIRE-3 that drive the build. The full file is
[`spec-lite.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/spec-lite.md).

Frontmatter as `write-spec` leaves it. `approved_*` stays empty, because only `/sdd` sets it:

```yaml
id: spec-HIRE-3-accounts-and-roles
title: Accounts and roles
type: feature
size: M
priority: P1
status: draft
ticket: HIRE-3
stakeholders: [Maya Chen]
approved_by:
approved_at:
created: 2026-10-21
stacks: [laravel, nextjs]
```

**Must NOT change.** These are the existing behaviors at risk. Every item maps to a guard:

- **MNC-1**: `GET /api/v1/jobs`, `GET /api/v1/jobs/{id}` and `GET /api/v1/companies/{slug}` stay
  public (no token needed) with unchanged response shapes.
- **MNC-2**: `/jobs` renders for guests without a redirect to `/login`.

**Acceptance criteria** (EARS, one observable outcome each; shortened here):

| ID | Criterion |
|----|-----------|
| AC-1 | WHEN a visitor registers as `candidate` THE SYSTEM SHALL respond 201 with `{user, token}` |
| AC-2 | WHEN a visitor registers as `employer` with `company_name` THE SYSTEM SHALL also create one company owned by them, slug suffixed `-2`, `-3` … while taken (BR-02) |
| AC-3 | IF the role is `admin` THEN THE SYSTEM SHALL respond 422 and create nothing (BR-01) |
| AC-4 | IF the email exists, compared case-insensitively, THEN THE SYSTEM SHALL respond 422 (BR-03) |
| AC-5 | WHEN credentials are valid THE SYSTEM SHALL respond 200 with a `web` token that expires in 7 days (BR-04) |
| AC-6 | IF the email is unknown or the password wrong THEN THE SYSTEM SHALL respond 422 `invalid_credentials` |
| AC-7 | WHEN a user logs out THE SYSTEM SHALL revoke that token only, respond 204, and `/me` with it SHALL return 401 |
| AC-8 | WHEN a signed-in user requests `/me` THE SYSTEM SHALL return exactly `{id, name, email, role}` |
| AC-9 | IF more than 6 register/login requests (one shared bucket per client) arrive within a minute THEN THE SYSTEM SHALL respond 429 |
| AC-10 | WHEN a user signs in on `/login` THE web app SHALL set the HttpOnly `hireboard_session` cookie and redirect to `/dashboard`; JS can't read the token (manual) |
| AC-11 | WHEN a guest opens `/dashboard` THE web app SHALL redirect to `/login?next=/dashboard` (manual) |

**Boundaries:**

- **Always**: a Pest feature test per API AC; service-repository + DTOs (INV-02); schema doc before
  the migration; auth routes added to `api-contracts.md` and `endpoints.ts` (INV-06).
- **Ask first**: changes to existing `users` columns; a new dependency; changing a public endpoint;
  touching `config/sanctum.php`.
- **Never**: hand the token to browser JavaScript or `localStorage` (INV-05); `NEXT_PUBLIC_` API URLs;
  admin self-registration; weakening an existing test.

[`tasks.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/tasks.md) splits the work into
five tasks. The pipeline picks the specialist from the stack tag in parentheses, and each task names
the criteria it covers:

```markdown
## Phase 1: Backend (api/)
- [ ] 1. Schema doc, role migration, UserRole, User and UserFactory (laravel)
  - Covers: scaffolding for AC-1..AC-8
- [ ] 2. Auth endpoints, AuthService, DTOs and tests (laravel)
  - Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, MNC-1
- [ ] 3. Demo accounts in DemoUserSeeder (laravel)
  - Covers: scaffolding (preconditions of manual-test.md)

## Phase 2: Frontend (web/)
- [ ] 4. Session helpers and auth fetchers (nextjs)
  - Covers: AC-10 (data layer)
- [ ] 5. Login and register pages, middleware, account layout and dashboard (nextjs)
  - Covers: AC-10, AC-11, MNC-2
```

The Traceability table gives every AC and MNC exactly one row. Each row points at a Pest test
(`file::description`) or a manual step (`manual-test.md#step-N`):

```markdown
| ID | Criterion (short) | Verified by | Kind | Task |
| AC-1 | candidate registers, 201 + token | `tests/Feature/Auth/RegisterTest.php::registers a candidate and returns a token` | test | 2 |
| AC-9 | login throttled to 6/min | `tests/Feature/Auth/LoginTest.php::throttles repeated login attempts` | test | — |
| AC-10 | HttpOnly cookie, redirect to /dashboard | `manual-test.md#step-2` | manual | 4, 5 |
| MNC-1 | public endpoints tokenless, shapes unchanged | `tests/Feature/Auth/PublicEndpointsGuardTest.php::keeps job search, job detail and company profile public` | test | 2 |
```

Look at the AC-9 row. It has a test name but no task: no task's `Covers:` line mentions AC-9. Nobody
notices yet. Step 6 shows where the pipeline catches it.

### The clarity gate: 4 raised, 4 resolved

Before the hand-off, `write-spec` gives the spec folder, and nothing else, to a **fresh-context**
agent. That agent can't see the conversation, so anything that was agreed but never written down
shows up as a question. *Simulated:*

```
Clarity gate (fresh context, read only api/.ai/specs/spec-HIRE-3-accounts-and-roles/):
1. "Email verification is out of scope" — can an unverified user still apply to jobs later?
2. AC-1 says "confirmed password" but gives no rule. Minimum length? Complexity?
3. AC-7 revokes "the token used for that request". Does that sign the user out on other devices?
4. DemoUserSeeder "employer owning Acme Robotics" — which account owns it?
```

Two of the four repeat topics from the clarifying round. The answers were in the conversation but
not yet in the spec text, which is exactly what this gate is for. Each item becomes an unchecked box
under **Open questions**, and the skill resolves them in one batched question:

```markdown
- [x] Q1: Is email verification required before a user can sign in or apply? — **Accepted assumption**:
  out of scope for v1. `email_verified_at` stays unused.
- [x] Q2: What is the password rule? — **Answered (Maya Chen)**: minimum 8 characters, confirmed. ...
- [x] Q3: How long does a session last, and does logout end all sessions? — **Answered**: 7 days per
  ADR-0001 and BR-04; logout revokes only the current token. ...
- [x] Q4: Which employer owns the seeded Acme Robotics company? — **Answered**: `employer@acme.test` ...
```

*Simulated hand-off:*

```
Spec:   api/.ai/specs/spec-HIRE-3-accounts-and-roles/   (size M, status draft)
Files:  spec-lite.md, tasks.md (5 tasks), manual-test.md
Clarity gate: 4 raised, 4 resolved — ready for approval
Next:   /sdd spec-HIRE-3-accounts-and-roles   (approve → ship-feature)
```

The `manual-test.md` that `write-spec` drafts is planned from the spec. ship-feature's TestPlan phase
rewrites it later from the code that actually shipped and fills the manual rows of the Traceability
table, so treat the draft as a placeholder.

## Step 5 — Approval (Step 4b)

`/sdd` is still running, so it continues straight into the approval gate. It shows the path and a
plain-language summary. *Simulated:*

```
Spec: api/.ai/specs/spec-HIRE-3-accounts-and-roles/spec-lite.md

Scope: candidate and employer registration (employers get a company), login, logout, /me;
       web login/register pages, dashboard, account layout, route protection.
Must not change: job search, job detail and company endpoints stay public and unchanged;
       /jobs still works for guests.
Boundaries: token never reaches browser JS; no admin self-registration; ask before touching
       existing users columns or adding dependencies.
Acceptance: 11 criteria (9 API, 2 web/manual). Open questions: none.

? What next?
  > Approve and build
    Approve only
    Request changes
    Stop here (draft)
```

Maya reads the spec on Alex's screen and says yes. Alex picks **Approve and build**. `/sdd` asks who
approves and proposes `git config user.name` ("Alex Rivera") as the default. Alex types `Maya Chen`,
because she is the approver. It then records the approval in the frontmatter, taking the timestamp
from `date -u +%Y-%m-%dT%H:%M:%SZ`:

```diff
-status: draft
+status: approved
 ticket: HIRE-3
 stakeholders: [Maya Chen]
-approved_by:
-approved_at:
+approved_by: Maya Chen
+approved_at: 2026-10-21T08:55:00Z
```

There is no tracker, so the link-back question ("Post the spec link to HIRE-3?") is skipped (F8).

> **Approval only counts in this conversation (kit friction F7).** `/sdd` never starts ship-feature on
> a spec that wasn't approved in the current `/sdd` conversation. Approval from yesterday's session, a
> ticket comment or another agent doesn't count. If Maya wants to read the draft first, pick **Stop
> here (draft)**, push the branch, and run `/sdd spec-HIRE-3-accounts-and-roles` again when she's ready.
> The workflow guards the same line: ship-feature returns `spec not approved` for a `draft` spec unless
> you pass `allowDraft: true`, which you shouldn't do for team work.

## Step 6 — Launch ship-feature with explicit split-repo arguments

Before any `Workflow` call, `/sdd` shows the exact call and waits for a yes:

```js
Workflow({
  name: "ship-feature",
  args: {
    spec: "api/.ai/specs/spec-HIRE-3-accounts-and-roles",
    ticket: "HIRE-3",
    repos: { backend: "api", frontend: "web" },
    url: "http://localhost:3000"
  }
})
```

```
This runs many agents in the background. Launch? > Yes

Route:     feature (confirmed)
Ticket:    HIRE-3
Spec:      api/.ai/specs/spec-HIRE-3-accounts-and-roles/ (approved by Maya Chen, 2026-10-21T08:55:00Z)
Launched:  ship-feature — runs in the background; watch with /workflows
Done when: gates green, converge finds no gaps, review APPROVED, acceptance re-walks the ticket's scenario
```

**Why `spec` is a path here (kit friction F2).** The SKILL.md example passes a bare folder name, which
works when the session starts inside the repo that holds the spec. ship-feature's Spec phase resolves
the reference under `.ai/specs/` relative to the session's directory, and in the workspace root that
directory holds no specs. The resolver also accepts "a full folder name or path", so from the root
pass the repo-relative path. `repos` uses `api` and `web` for the same reason: paths are relative to
where the session started. [Chapter 03](03-decision-spa-auth-adr.md) started inside `api/` and used
`"."` and `"../web"`.

The arguments are documented in
[references/ship-feature.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/references/ship-feature.md). The
`ticket` arg only names the folder in free-text `feature` mode. In spec mode it is ignored, which is
harmless. The key still shows up in the report because it is part of the spec id
`spec-HIRE-3-accounts-and-roles`.

### What the phases did

`src/workflows/ship-feature.js` declares 12 phases. In spec mode, **Investigate** is skipped because
the spec already holds the investigation. Each phase is pinned to a model tier: deep reasoning for
Spec, Converge, Visual, Review, Acceptance, Docs and Report; standard for Detect, Build, Gates, the
review verification votes and TestPlan ([docs/effort-guidelines.md](../../reference/effort-guidelines.md)). The log lines use the workflow's own
formats.

*Simulated progress log:*

```
Detect: backend:laravel@api, frontend:nextjs@web (cross-repo)
Loaded spec spec-HIRE-3-accounts-and-roles (api/.ai/specs/spec-HIRE-3-accounts-and-roles): 5 pending task(s)
Build: 5/5 task(s) implemented
Gates round 1: fixing 1 failing gate(s)
Converge round 1: 1 gap task(s) appended — rebuilding
Build: 6/6 task(s) implemented
Converge round 2: no gaps — implementation matches the spec.
Visual: 2 finding(s)
Review: 0 confirmed finding(s)
Acceptance: RESOLVED
Docs: 1 updated, 0 new
TestPlan: 7 step(s) → api/.ai/specs/spec-HIRE-3-accounts-and-roles/manual-test.md
```

**Detect.** Both repos are git work trees with committed files (`tracked: true`), so there are no WIP
warnings. Each repo gets its gate commands from the kit's STACKS registry: `./vendor/bin/pint --test`,
`./vendor/bin/phpstan analyse --no-progress` and `php artisan test` in `api/`, and `npm run lint`,
`npx tsc --noEmit` and `npm test` in `web/`.

**Spec.** The status was `approved` and tasks were pending, so the phase changes exactly one
frontmatter line: `status: in-progress`.

**Build.** The tasks run one at a time, each in its repo, with the specialist for its stack tag:
`laravel-backend-dev` for tasks 1-3 in `api/`, `nextjs-frontend-dev` for tasks 4-5 in `web/`. Every task
is TDD. For task 2 the Pest files in `tests/Feature/Auth/` were written first and run red. After each
task the builder ticks `- [ ] N.` and its Verify sub-item in `tasks.md`.

**Gates.** All gates run once per repo, in parallel. Round 1 had one failure: PHPStan flagged
`$request->user()` in `ShowCurrentUserController` as possibly null. The fix agent added the
`/** @var User $user */` narrowing, which is correct because `auth:sanctum` guarantees a user on that
route. The re-run was green in both repos.

**Converge.** This is where AC-9 resurfaces. The auditor checks every AC for an implementation and a
test, and doesn't touch code. Its only write is an append to `tasks.md`:

```markdown
## Phase: Gaps (converge round 1)

- [ ] 6. Throttle register and login (laravel)
  - Covers: AC-9
  - Reason: AC-9 has no implementation and no test; `routes/api/v1/auth.php` has no rate limit on `/register` or `/login`
  - [ ] **Verify**: `tests/Feature/Auth/LoginTest.php::throttles repeated login attempts` fails first, then passes with `throttle:6,1` on both routes (7th attempt → 429 `too_many_requests`); gates green
```

The pipeline loops: Build implements task 6 (failing throttle test, then `throttle:6,1` on both
routes), Gates re-run, and Converge round 2 finds nothing left. The clarity gate looks for ambiguity,
not for coverage, so the missing `Covers:` line got past it. Converge exists to catch exactly this
kind of gap. It runs at most 2 rounds, and anything still missing after that is left in `tasks.md`
for a human and blocks `SHIP`.

**Visual.** The phase runs only when UI files (`.tsx`, `.css`, ...) changed, which they did in `web/`.
Playwright opens `/login` and `/register` at about 375, 768 and 1440 px and checks layout and
contrast. *Simulated:*

```
- minor: /register at 375px — the two role radios wrap onto separate lines with no gap; readable.
- minor: /login — the focus outline on the inputs is the browser default and faint on the white card.
```

Neither finding blocks.

**Review.** Four dimensions (correctness, security, performance, design) each review the change.
Every finding then goes to three independent verifiers that try to refute it. A finding is confirmed
only when a majority of the votes that came back say it's real, and at least two do. *Simulated
summary:*

| Dimension | Finding raised | Votes real | Result |
|-----------|----------------|-----------:|--------|
| security | `next` on `/login` allows an open redirect | 0/3 | refuted: `safeNext()` resolves `next` against a fixed internal origin with the URL parser and falls back to `/dashboard` unless the origin is unchanged |
| security | token returned in the register/login JSON body | 0/3 | refuted: only the Next.js server receives it (ADR-0001); the browser never calls `:8000` |
| correctness | employer registration can leave a user without a company | 0/3 | refuted: `AuthService::register` wraps both inserts in `DB::transaction` |
| performance | login looks users up by email without an index | 0/3 | refuted: `users.email` has a unique index |
| design | register and login share one rate-limit bucket (`throttle:6,1` keys by domain + IP), so 6 failed registrations also block login for a minute | 0/3 | refuted: matches AC-9 as approved ("both routes deliberately share one bucket") |

Only `critical` findings block the Docs phase and `SHIP`. Nothing was confirmed here. The shared
bucket was a decision Maya approved in AC-9, so the verifiers refute it as a defect. A separate named
limiter can come later if support ever sees complaints.

**Acceptance.** This phase walks the original scenario hop by hop against the code, instead of
trusting the green tests. It adds one step per AC and per MNC. *Simulated, abridged:*

```
✓ /register (candidate) → registerAction → POST /api/v1/auth/register 201 → setSessionToken
  (httpOnly, sameSite lax, 7 days) → redirect /dashboard → (account)/layout requireUser() → GET /me 200
✓ /register (employer, "Acme Robotics") → company acme-robotics-2 owned by the new user
✓ guest /dashboard → middleware (no hireboard_session) → 307 /login?next=%2Fdashboard
✓ /login?next=/dashboard → loginAction → safeNext('/dashboard') → /dashboard
✓ MNC-1 GET /jobs, /jobs/{id}, /companies/{slug}: no auth middleware added; shapes identical
  to main (git diff of routes/api/v1/jobs.php and the DTOs: empty)
✓ MNC-2 /jobs: not in the middleware matcher; renders for guests
resolved = true
```

The cookie flags were checked in code. Checking them in a real browser, by confirming HttpOnly in
DevTools, is a human job, so TestPlan turns it into a manual step.

**Docs.** The phase updates existing docs only, and only when nothing blocks shipping. Here that is
`api/docs/api/api-contracts.md`, which gets an **Auth** section: the four endpoints, their bodies and
responses, and the `invalid_credentials` and `too_many_requests` codes. The four `endpoints.ts` entries
were already added by task 4, as the Always boundary requires (INV-06).

**TestPlan.** The phase writes
[`manual-test.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/manual-test.md) into the
spec folder, replacing the draft: 7 steps with exact URLs, commands and expected results, covering the
happy path and every AC or MNC without an automated test. It then fills the manual rows in the
Traceability table (AC-10 → `manual-test.md#step-2`, AC-11 → `#step-4`, MNC-2 → `#step-5`). The run
is shippable, so it also sets `status: done` in the frontmatter.

**Report.** *Simulated, abridged:*

```
Recommendation: SHIP
Tasks: 6/6 (1 added by converge round 1). Remaining gaps: none.
Gates: api pint ✓ phpstan ✓ pest ✓ (10 new tests in tests/Feature/Auth) · web lint ✓ tsc ✓ vitest ✓
Visual: 2 minor. Review: 0 confirmed.
Acceptance: RESOLVED (journey + 11 AC + 2 MNC).
Docs: api/docs/api/api-contracts.md (Auth section).
Manual test plan: api/.ai/specs/spec-HIRE-3-accounts-and-roles/manual-test.md — run steps 1-7
with both dev servers up and fresh seed data.
```

`SHIP` requires all of this: every task built, gates green, no converge gap left, no critical finding,
acceptance resolved, and no WIP repo. Anything less comes back as `FIX-FIRST` or `BLOCKED`, with the
blockers listed and a suggested `/simple-task` or re-run.

## Step 7 — Reading the code the pipeline wrote

You should still read what the pipeline produced before you open a PR. These excerpts show how the
kit's conventions shaped the auth code. The full files are the artifacts linked below.

**`AuthService` never touches Eloquent.** Token issuing and revoking sit behind
`UserRepositoryInterface`, so the service works only with DTOs
([AuthService.php](artifacts/api/app/Services/AuthService.php),
[UserRepositoryInterface.php](artifacts/api/app/Contracts/UserRepositoryInterface.php)):

```php
public function register(RegisterUserDTO $data): AuthResultDTO
{
    return DB::transaction(function () use ($data): AuthResultDTO {
        $user = $this->users->create($data);

        if ($data->isEmployer() && $data->companyName !== null) {
            $this->companies->createForOwner($user->id, $data->companyName);
        }

        return new AuthResultDTO($user, $this->users->issueToken($user->id));
    });
}
```

The 7-day lifetime (BR-04) is set where the token is created, so `config/sanctum.php` stays untouched
([UserRepository.php](artifacts/api/app/Repositories/UserRepository.php)):

```php
return $user->createToken(self::TOKEN_NAME, ['*'], now()->addDays(self::TOKEN_LIFETIME_DAYS))->plainTextToken;
```

Logout revokes whatever token the request carried (`PersonalAccessToken::findToken($bearer)?->delete()`).
That has the same effect as the ADR's `currentAccessToken()->delete()`, without passing a model into
the service. Other devices stay signed in (AC-7).

**`RegisterUserDTO` carries BR-01 and BR-03 in its rules.** Emails are lowercased in
`prepareForPipeline()`, which laravel-data runs *before* validation. So `unique:users,email` sees
`casey@hireboard.test` even when the visitor typed `Casey@Hireboard.TEST` (AC-4).
([RegisterUserDTO.php](artifacts/api/app/DTOs/RegisterUserDTO.php)):

```php
'role' => ['required', 'string', Rule::in(UserRole::selfRegistrable())],
'company_name' => ['nullable', 'required_if:role,employer', 'string', 'min:2', 'max:120'],
```

**Slug suffixing lives in `CompanyRepository::createForOwner`** (BR-02). `Acme Robotics` becomes
`acme-robotics`, then `acme-robotics-2` while that slug is taken, and the unique index on
`companies.slug` is the final guard. `CompanyRepository.php` is a shared file that later chapters
extend, so its artifact is kept with
[chapter 02](02-greenfield-first-slice.md) ([CompanyRepository.php](artifacts/api/app/Repositories/CompanyRepository.php)).
HIRE-3 added this method:

```php
public function createForOwner(int $ownerId, string $name): CompanyDTO
```

**`lib/session.ts` owns the cookie.** The flags implement INV-05 and ADR-0001
([session.ts](artifacts/web/lib/session.ts)):

```ts
store.set(SESSION_COOKIE, token, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS, // 7 days, same as the token
});
```

`getCurrentUser()` is wrapped in React's `cache()`, so a layout and its page share one `/me` call per
request. It returns `null` on a 401, which happens when a cookie outlives its revoked or expired token.

**`loginAction` is a Server Action.** It maps API error codes to messages and keeps `redirect()`
outside the `try`, because `redirect()` works by throwing
([actions.ts](<artifacts/web/app/(auth)/actions.ts>)):

```ts
try {
  const result = await login({ email: String(formData.get('email') ?? ''), password: String(formData.get('password') ?? '') });
  await setSessionToken(result.token);
} catch (error) {
  return toFormState(error, 'Sign-in failed. Please try again.');
}

redirect(safeNext(formData.get('next')));
```

**`middleware.ts` is the cheap gate, and `requireUser()` is the real one.** The middleware only checks
that the cookie exists. Its matcher already lists the account areas that later tickets fill in
(`/profile`, `/applications`, `/employer`, `/admin`, `/jobs/:id/apply`), so those chapters don't edit
it ([middleware.ts](artifacts/web/middleware.ts)). The `(account)` layout then validates the token and
picks the navigation by role ([layout.tsx](<artifacts/web/app/(account)/layout.tsx>)):

```tsx
export default async function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  // NAV[user.role]: candidate → Profile, Applications · employer → Applications · admin → Review queue
```

Role-specific pages call `requireUser(['candidate'])` and similar. A signed-in user with the wrong role
is sent to `/dashboard`, and a guest to `/login`.

## Step 8 — Run the manual test, commit, and open one PR per repo

Run the [manual test plan](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/manual-test.md)
yourself before you open the PRs. Step 2 is the one only a human can do: DevTools → Application →
Cookies shows `hireboard_session` with **HttpOnly** ticked, and `document.cookie` in the console doesn't
contain it.

Commit in each repo separately. The spec folder is committed with `api/`, because that's where it
lives:

```bash
cd ~/work/hireboard
git -C api add -A
git -C api commit -m "feat(auth): accounts and roles with Sanctum tokens (HIRE-3)"
git -C web add -A
git -C web commit -m "feat(auth): login, registration and account area (HIRE-3)"
git -C api push -u origin feature/HIRE-3-accounts-and-roles
git -C web push -u origin feature/HIRE-3-accounts-and-roles
```

Open the API PR first, then the web PR that links to it, then link back:

```bash
(cd api && gh pr create --base main --title "feat(auth): accounts and roles (HIRE-3)" \
  --body "Spec: .ai/specs/spec-HIRE-3-accounts-and-roles (approved by Maya Chen). Merge before hireboard/web#1.")
# → https://github.com/hireboard/api/pull/1

(cd web && gh pr create --base main --title "feat(auth): login, registration and account area (HIRE-3)" \
  --body "Needs hireboard/api#1 merged first. Spec: api/.ai/specs/spec-HIRE-3-accounts-and-roles. Manual test: steps 1-7.")
# → https://github.com/hireboard/web/pull/1

(cd api && gh pr comment 1 --body "Frontend counterpart: hireboard/web#1")
```

**Merge `api` first.** The change is additive: new routes, a new column with a default, and no change
to existing response shapes (MNC-1). A deployed API with HIRE-3 still serves the old web build. The
reverse isn't true, because a new web build calling `/api/v1/auth/login` on an old API gets a 404. For
a change that breaks the contract, use expand/contract instead
([docs/multi-repo.md, "Process"](../../reference/multi-repo.md#process)).

For the general shape of this route on a single repo, see
[USAGE-EXAMPLES.md, "1. Feature from a ticket"](../../reference/usage-examples.md#1-feature-from-a-ticket)
and ["11. Split backend and frontend repos"](../../reference/usage-examples.md#11-split-backend-and-frontend-repos).

## Frictions you met in this chapter

| | What happened | What to do |
|---|---|---|
| F2 | ship-feature resolves `spec` under `./.ai/specs` of the session directory | From the workspace root pass `spec: "api/.ai/specs/spec-HIRE-3-accounts-and-roles"`, or start the session inside `api/` |
| F6 | Two repos looked like an L spec | Size by rules and task count. Already-validated rules aren't new rules, so HIRE-3 is M |
| F7 | Approval must happen in the running `/sdd` conversation | Pick **Stop here (draft)** for asynchronous review, then re-run `/sdd <spec>` with the approver present |
| F8 | No tracker connected | Paste the ticket text when `/sdd` asks. The link-back step is skipped |

## Artifacts from this chapter

- Spec: [`spec-lite.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/spec-lite.md),
  [`tasks.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/tasks.md),
  [`manual-test.md`](artifacts/api/.ai/specs/spec-HIRE-3-accounts-and-roles/manual-test.md)
- API schema and data: [`docs/schemas/users.md`](artifacts/api/docs/schemas/users.md),
  [migration](artifacts/api/database/migrations/2026_10_21_090000_add_role_to_users_table.php),
  [`UserRole`](artifacts/api/app/Enums/UserRole.php), [`User`](artifacts/api/app/Models/User.php),
  [`UserFactory`](artifacts/api/database/factories/UserFactory.php),
  [`DemoUserSeeder`](artifacts/api/database/seeders/DemoUserSeeder.php)
- API code: [DTOs](artifacts/api/app/DTOs/RegisterUserDTO.php) (`RegisterUserDTO`, `LoginDTO`,
  `UserDTO`, `AuthResultDTO`), [`UserRepository`](artifacts/api/app/Repositories/UserRepository.php),
  [`AuthService`](artifacts/api/app/Services/AuthService.php),
  [`InvalidCredentialsException`](artifacts/api/app/Exceptions/InvalidCredentialsException.php),
  controllers in [`app/Http/Controllers/Auth/`](artifacts/api/app/Http/Controllers/Auth/RegisterController.php),
  [`routes/api/v1/auth.php`](artifacts/api/routes/api/v1/auth.php)
- API tests: [`RegisterTest`](artifacts/api/tests/Feature/Auth/RegisterTest.php),
  [`LoginTest`](artifacts/api/tests/Feature/Auth/LoginTest.php),
  [`LogoutTest`](artifacts/api/tests/Feature/Auth/LogoutTest.php),
  [`PublicEndpointsGuardTest`](artifacts/api/tests/Feature/Auth/PublicEndpointsGuardTest.php)
- Web: [`types/api/auth.ts`](artifacts/web/types/api/auth.ts), [`lib/api/auth.ts`](artifacts/web/lib/api/auth.ts),
  [`lib/session.ts`](artifacts/web/lib/session.ts), [`middleware.ts`](artifacts/web/middleware.ts),
  [`/login`](<artifacts/web/app/(auth)/login/page.tsx>), [`/register`](<artifacts/web/app/(auth)/register/page.tsx>),
  [auth actions](<artifacts/web/app/(auth)/actions.ts>), [`LoginForm`](artifacts/web/components/login-form.tsx),
  [`RegisterForm`](artifacts/web/components/register-form.tsx),
  [account layout](<artifacts/web/app/(account)/layout.tsx>), [`/dashboard`](<artifacts/web/app/(account)/dashboard/page.tsx>),
  [`logoutAction`](<artifacts/web/app/(account)/actions.ts>)

## What you have now

- Candidates and employers can register, sign in and sign out. Employers own a company from the
  moment they register. Admins exist only through `DemoUserSeeder`.
- A Sanctum token that only the Next.js server holds, in the HttpOnly `hireboard_session` cookie. It
  expires after 7 days, and logout revokes it.
- The building blocks every later ticket reuses: `User::isCandidate()` / `isEmployer()` / `isAdmin()` for
  policies, factory role states for tests, `requireUser(roles)` and the `(account)` layout for pages,
  and a middleware matcher that already covers their routes.
- A spec in `status: done` whose Traceability table maps all 11 ACs and both MNCs to a passing test or a
  manual step, plus two merged PRs (api first).

Next: [05 — Anatomy of an M spec: company reviews with moderation (HIRE-4)](05-feature-company-reviews-full-spec.md)
