# Hireboard: building a Laravel + Next.js app from scratch with SDD Kit

This is a worked example of SDD Kit v4.1.0 (the 4.x line) used on a real-sized project.
It starts from an empty folder and ends with a small job board, **Hireboard**, run by a team.
Every step goes through the kit's single front door, `/sdd`. Twelve chapters take eleven tickets
(`HIRE-1` to `HIRE-11`) through the route the kit picks for each one.

Hireboard, its people (Maya Chen, product owner; Alex Rivera, developer) and the timeline
(2026-10-19 to 2026-11-03) are fictional. Agent output in the chapters is **simulated**: it is
abridged and labelled as simulated. The commands, flags, workflow arguments and file paths are
the kit's real ones. The code under [`artifacts/`](artifacts/) is complete, and has been compiled
and tested (see [Artifacts](#artifacts)).

## What Hireboard is

A small job board with a Laravel 12 JSON API (repo `api/`) and a Next.js 15 App Router frontend
(repo `web/`). The two repos sit in a parent-folder workspace with no git of its own
([docs/multi-repo.md](../../reference/multi-repo.md)).

| Who | Can do |
|-----|--------|
| Visitor | Search open job postings by keyword, location, remote and employment type. Open a job and the company's careers page. Read approved company reviews. |
| Candidate | Register, keep a private profile, apply to open jobs (once per job), review a company (once per company). |
| Employer | Register together with their company and see the applications to that company's jobs. |
| Admin (seeded) | Approve or reject every review before it goes public. |

The browser never holds the API token. The Next.js server keeps it in an HttpOnly cookie and
calls the API for the browser. Chapter 03 makes that decision and records it as ADR-0001.

## Who this is for

- **Developers new to the kit** who want to see each `/sdd` route in context before using it on
  their own project. Read the chapters in order.
- **Developers already using the kit** who want the exact arguments for a situation they are in,
  such as split repos, resuming a spec, or a bug with behavior that must not change. Jump to the
  chapter in the [route map](#route-map).
- **Leads** setting up team practice. Read [chapter 11](11-running-it-as-a-team.md).

You should be comfortable with Laravel and Next.js. The walkthrough explains the kit, not the
frameworks.

## Prerequisites

The full list with a version check is in
[00 — Prerequisites](00-overview.md#prerequisites). In short:

- Claude Code, git and jq ([INSTALLATION.md#prerequisites](../../reference/installation.md#prerequisites))
- PHP 8.3 with Composer 2, and SQLite
- Node.js 20 or newer
- The kit installed in plugin mode, or in file-copy mode **after** chapter 02 has scaffolded the
  repos ([chapter 01](01-workspace-and-install.md) explains why)
- Optional: `gh` for opening the pull requests

If you have never run the kit, do [GETTING-STARTED.md](../../reference/getting-started.md)
first. For a one-paragraph version of each route, see
[USAGE-EXAMPLES.md](../../reference/usage-examples.md).

## Chapters

| # | Chapter | In one line |
|---|---------|-------------|
| 00 | [Overview and prerequisites](00-overview.md) | What you will build, the route map, toolchain check, how to read `artifacts/`. |
| 01 | [Workspace and kit install](01-workspace-and-install.md) | Create the git-less workspace, install the kit without touching the not-yet-existing repos, write the root `CLAUDE.md` and the product brief. |
| 02 | [New app: greenfield-build (HIRE-1)](02-greenfield-first-slice.md) | One workflow scaffolds both repos with CI and ships the first slice: search open jobs and open one. |
| 03 | [Decision: SPA auth ADR (HIRE-2)](03-decision-spa-auth-adr.md) | `tech-research` compares four auth options against weighted criteria and writes ADR-0001, which Maya signs off. |
| 04 | [Accounts and roles (HIRE-3)](04-feature-accounts-and-roles.md) | The feature pipeline end to end: `write-spec`, approval in `/sdd`, `ship-feature` with split-repo arguments, one PR per repo. |
| 05 | [Company reviews, the M spec in full (HIRE-4)](05-feature-company-reviews-full-spec.md) | Every spec section, the clarity gate resolving six questions, then ship-feature building it. |
| 06 | [Candidate profiles with /execute-task (HIRE-5)](06-execute-task-candidate-profiles.md) | Approve only, build task by task with TDD, stop for the day, resume with `--continue`. |
| 07 | [Job applications and /deep-review (HIRE-6)](07-applications-and-deep-review.md) | ship-feature, then an adversarial review before merge finds a race condition, which is fixed and re-reviewed. |
| 08 | [Careers page S spec and a trivial change (HIRE-7, HIRE-8)](08-careers-page-s-spec-and-trivial-change.md) | The kit scaling down: a web-only S spec, and a copy-sized change with no spec at all. |
| 09 | [Bug: closed jobs by direct link (HIRE-9)](09-bug-closed-jobs-fix-bug.md) | `fix-bug` with a `mustNotChange` list: reproduce, root cause, red regression test, guard tests, minimal fix. |
| 10 | [QA plan and docs for shipped code (HIRE-10)](10-qa-and-docs-browse-journey.md) | `qa-and-docs` over the browse journey, which grew across four tickets and no single spec covers. |
| 11 | [Running it as a team](11-running-it-as-a-team.md) | Contract-sync in CI, report-only routines, a project eval case, a pinned team marketplace, and HIRE-11 as an exercise. |

## Route map

`/sdd` sorts each request into one of the routes and launches exactly one pipeline
([sdd SKILL.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/skills/sdd/SKILL.md)). Each route appears at least once:

| `/sdd` route | Pipeline | Chapter(s) | Ticket(s) |
|--------------|----------|------------|-----------|
| new app | `greenfield-build` workflow | [02](02-greenfield-first-slice.md) | HIRE-1 |
| decision | `tech-research` workflow, then an ADR | [03](03-decision-spa-auth-adr.md) | HIRE-2 |
| feature | `/write-spec`, human approval, `ship-feature` workflow | [04](04-feature-accounts-and-roles.md), [05](05-feature-company-reviews-full-spec.md), [07](07-applications-and-deep-review.md), [08](08-careers-page-s-spec-and-trivial-change.md) | HIRE-3, HIRE-4, HIRE-6, HIRE-7 |
| feature (task by task) | `/write-spec`, "Approve only", `/execute-task` | [06](06-execute-task-candidate-profiles.md) | HIRE-5 |
| trivial | `/simple-task`, no spec | [08](08-careers-page-s-spec-and-trivial-change.md) (also the review fix in [07](07-applications-and-deep-review.md)) | HIRE-8 |
| bug | `fix-bug` workflow with `mustNotChange` | [09](09-bug-closed-jobs-fix-bug.md) | HIRE-9 |
| shipped | `qa-and-docs` workflow | [10](10-qa-and-docs-browse-journey.md) | HIRE-10 |

Other kit features and where they appear:

| Feature | Chapter(s) |
|---------|------------|
| Parent-folder workspace for split repos, `--add-dir` sessions, where outputs land | [01](01-workspace-and-install.md), [03](03-decision-spa-auth-adr.md), [06](06-execute-task-candidate-profiles.md), [10](10-qa-and-docs-browse-journey.md) |
| Plugin mode vs file-copy mode, copying project context by hand | [01](01-workspace-and-install.md), [02](02-greenfield-first-slice.md) |
| Workflow arguments for split repos (`repos`, `spec` as a repo-relative path, `url`) | [02](02-greenfield-first-slice.md), [04](04-feature-accounts-and-roles.md) |
| Spec sizing (S vs M), EARS acceptance criteria, Must NOT change, Boundaries, traceability | [04](04-feature-accounts-and-roles.md), [05](05-feature-company-reviews-full-spec.md), [08](08-careers-page-s-spec-and-trivial-change.md) |
| Clarity gate and approval recorded in spec frontmatter | [04](04-feature-accounts-and-roles.md), [05](05-feature-company-reviews-full-spec.md) |
| Converge round adding a gap task | [04](04-feature-accounts-and-roles.md) |
| Session state and resume with `/execute-task --continue`, `/progress` | [06](06-execute-task-candidate-profiles.md) |
| `/deep-review` before merge, re-review of the staged fix, PR review per branch | [07](07-applications-and-deep-review.md) |
| No tracker connected: pasted ticket text, link-back skipped | every ticket chapter |
| Contract-sync, routines (`/schedule`), evals, team marketplace | [11](11-running-it-as-a-team.md) |

For background, see [docs/multi-repo.md](../../reference/multi-repo.md),
docs/evals.md, [docs/team-marketplace.md](../../reference/team-marketplace.md) and
[docs/effort-guidelines.md](../../reference/effort-guidelines.md). The chapters link to these rather than
repeating them.

## Artifacts

Every file the walkthrough produces is in [`artifacts/`](artifacts/), laid out by destination:

| In this folder | In your workspace |
|----------------|-------------------|
| [`artifacts/workspace/`](artifacts/workspace/) | `~/work/hireboard/` (root `CLAUDE.md` and `product-brief.md`) |
| [`artifacts/api/`](artifacts/api/) | `~/work/hireboard/api/`, a fresh Laravel 12 app after the scaffold commands in chapter 02 |
| [`artifacts/web/`](artifacts/web/) | `~/work/hireboard/web/`, a fresh `create-next-app@15` app after the scaffold commands in chapter 02 |
| [`artifacts/kit-fork/`](artifacts/kit-fork/) | a fork of the SDD Kit repo (the eval case in chapter 11) |

What is in each repo folder:

- **Code.** Application code, migrations, factories, seeders and tests in `api/`. App Router
  pages, Server Actions, components, typed API client and types in `web/`. CI workflows in both.
- **Project context.** `CLAUDE.md` and `AGENTS.md` per repo, plus `api/docs/` (architecture,
  business rules, API contract, schema docs, ADR-0001).
- **Kit records.** Specs in `api/.ai/specs/` (HIRE-3 to HIRE-6) and `web/.ai/specs/` (HIRE-7),
  the `/execute-task` state and a verification report in `api/.ai/`, the `/deep-review` report
  in `api/.ai/reviews/`, and the QA plan and docs in `web/docs/`.

Three rules for reading them:

1. Each file belongs to the chapter that **first creates it**, and shows its
   **end-of-walkthrough** state. A later change to it appears in the later chapter as a diff
   (for example, the HIRE-8 salary format in `web/components/job-card.tsx`).
2. Files that grow with each feature (`web/lib/api/endpoints.ts`, `api/docs/api/api-contracts.md`,
   `api/docs/context/business-rules.md`, `api/bootstrap/app.php`, `RepositoryServiceProvider`,
   `CompanyRepository`, `DatabaseSeeder` and the workspace `CLAUDE.md`) already contain entries
   from later chapters.
3. `composer.json` and `package.json` are not included. Dependencies come from the scaffold
   commands in [chapter 02](02-greenfield-first-slice.md).

**Compiled and tested.** The full artifact set was dropped onto fresh scaffolds (Laravel
Framework 12.70 with Pest 3.8 on PHP 8.3, and Next.js 15.5) and both repos pass every kit gate:

| Repo | Gate | Result |
|------|------|--------|
| api | `./vendor/bin/pint --test` | pass |
| api | `./vendor/bin/phpstan analyse --no-progress` (level 5) | pass, no errors |
| api | `php artisan test` | pass, 57 tests |
| web | `npm run lint` | pass |
| web | `npx tsc --noEmit` | pass |
| web | `npm test` (Vitest) | pass, 3 tests |
| web | `npm run build` | pass, 14 routes |

To reproduce it, run the scaffold commands from chapter 02, copy `artifacts/api/` and
`artifacts/web/` over the two fresh apps, run `php artisan migrate:fresh --seed` in `api/`, and
run the gates above. The demo accounts all use the password `password`:
`candidate@hireboard.test`, `employer@acme.test` and `admin@hireboard.test`.

Start with [00 — Overview and prerequisites](00-overview.md).
