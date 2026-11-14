# 00 — Hireboard from scratch: overview and prerequisites

This walkthrough builds a small job board called **Hireboard** from an empty folder to a
team-ready product. It uses SDD Kit v4.1.1 (the 4.x line) for every step. Each chapter is
one real ticket, taken through the `/sdd` route the kit picks for it. Read the chapters in order
to follow the story, or jump to the one that matches the route you are about to use.

Hireboard, the people involved, and every session transcript are fictional. Agent output in
the chapters is **simulated**: it is abridged and marked as such. The code and documents under
[`artifacts/`](artifacts/) are complete files you can drop onto fresh scaffolds.

## The product

Visitors search open job postings by keyword, location, remote and employment type, and open a
company's careers page. Candidates register, keep a private profile, apply to open jobs, and
review companies (one review per company). An admin moderates every review before it goes
public. Employers register together with their company and see the applications to their jobs.

The product owner is **Maya Chen**. She approves specs and the ADR. The developer is **Alex
Rivera**, who runs the Claude Code sessions. Ticket keys use the `HIRE` prefix. No tracker is
connected, so ticket text is pasted into `/sdd`. The timeline runs from 2026-10-19 to 2026-11-03.

## The shape of the system

Two git repos sit side by side in a parent-folder workspace that has no git of its own. This is
the layout from [docs/multi-repo.md](../../reference/multi-repo.md), with real repo names in place of
`be/` and `fe/`.

```
~/work/hireboard/              no .git; start Claude here for cross-repo work
├── CLAUDE.md                  workspace contract: @api/CLAUDE.md, @web/CLAUDE.md, routing, process
├── product-brief.md           input to greenfield-build
├── .ai/                       local scratch (anything written while a session runs here)
├── api/                       Laravel 12 JSON API     git@github.com:hireboard/api.git
└── web/                       Next.js 15 App Router   git@github.com:hireboard/web.git
```

At runtime the browser only talks to Next.js. The Next.js server holds the Sanctum token in an
HttpOnly cookie and calls the API with it (the "backend for frontend" pattern, decided in
chapter 03 as ADR-0001):

```
 Browser                      Next.js server (web/)                 Laravel API (api/)
 localhost:3000               localhost:3000                        localhost:8000
┌──────────────┐  request +  ┌────────────────────────────┐ Bearer ┌──────────────────────┐
│ pages, forms │ ──────────▶ │ Server Components,         │ ─────▶ │ /api/v1/*            │
│ no token in  │   cookie    │ Server Actions             │ token  │ Sanctum PATs ('web', │
│ JavaScript   │ ◀────────── │ lib/api/client.ts reads    │ ◀───── │ 7-day expiry)        │
└──────────────┘    HTML     │ cookie hireboard_session   │  JSON  │ SQLite               │
                             └────────────────────────────┘        └──────────────────────┘
```

- The API serves `/api/v1` with a `{ success, status, message, data }` envelope. It uses invokable
  controllers, services, DTOs (Spatie Laravel Data) and repositories behind interfaces.
- Next.js reads `API_BASE_URL=http://localhost:8000` from `web/.env.local`. That variable is
  server-only, never `NEXT_PUBLIC_`. The browser never calls `:8000`, so no CORS config is
  needed.
- `http://localhost:3000` is the `url` argument passed to every workflow for browser acceptance.

## Route map

`/sdd` is the single front door ([src/skills/sdd/SKILL.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.1/plugins/sdd-kit/skills/sdd/SKILL.md)).
It sorts each request into one of the routes, confirms the route with you, collects the inputs,
and launches exactly one fixed pipeline:

```
/sdd <ticket-id | description>
   ├─ trivial   → /simple-task                  (no spec)
   ├─ bug       → fix-bug workflow
   ├─ decision  → tech-research workflow → ADR
   ├─ feature   → /write-spec → HUMAN APPROVAL → ship-feature { spec }
   ├─ shipped   → qa-and-docs workflow
   ├─ audit     → security-audit workflow      (not covered in this example)
   └─ new app   → greenfield-build workflow
```

The walkthrough uses each route except audit at least once:

| Chapter | Ticket | `/sdd` route | Kit features shown |
|---------|--------|--------------|--------------------|
| [01](01-workspace-and-install.md) | — | setup | Parent-folder workspace, plugin vs file-copy install, workspace `CLAUDE.md`, product brief |
| [02](02-greenfield-first-slice.md) | HIRE-1 | new app | `greenfield-build` with split-repo args: scaffold, CI, first vertical slice (job search and detail), per-repo project context |
| [03](03-decision-spa-auth-adr.md) | HIRE-2 | decision | `tech-research` with options and weighted criteria, adversarial claim checks, ADR-0001 signed off by a human |
| [04](04-feature-accounts-and-roles.md) | HIRE-3 | feature (M) | `write-spec`, approval recorded in frontmatter, `ship-feature` with explicit `spec`/`repos`/`url` args, one PR per repo |
| [05](05-feature-company-reviews-full-spec.md) | HIRE-4 | feature (M), shown in full | Every spec section: Must NOT change, EARS acceptance criteria with traceability, Boundaries, decisions, the fresh-context clarity gate |
| [06](06-execute-task-candidate-profiles.md) | HIRE-5 | feature (M) | "Approve only", then `/execute-task` task by task, stop mid-spec, resume with `--continue` |
| [07](07-applications-and-deep-review.md) | HIRE-6 | feature (M) | `ship-feature`, then `/deep-review` before merge, a fix with `/simple-task`, an adversarial re-review of the staged fix |
| [08](08-careers-page-s-spec-and-trivial-change.md) | HIRE-7, HIRE-8 | feature (S), trivial | A web-only S spec; a copy-sized change through `/simple-task` with no spec |
| [09](09-bug-closed-jobs-fix-bug.md) | HIRE-9 | bug | `fix-bug` with a `mustNotChange` list: regression test red to green, guard tests, original report re-walked |
| [10](10-qa-and-docs-browse-journey.md) | HIRE-10 | shipped | `qa-and-docs` over code that no single spec covers: traceable QA plan, user and dev docs |
| [11](11-running-it-as-a-team.md) | HIRE-11 (exercise) | — | Contract-sync as a failing CI check, routines, a project eval case, a pinned team marketplace |

Need a one-page scenario instead of a story? The scenario catalogue in
[src/docs/USAGE-EXAMPLES.md](../../reference/usage-examples.md) covers each route in a few
lines. This walkthrough does not repeat it.

## Prerequisites

The kit's own requirements are listed in
[INSTALLATION.md#prerequisites](../../reference/installation.md#prerequisites). Hireboard
adds the PHP and Node toolchains:

| Tool | Why you need it here |
|------|----------------------|
| Claude Code | Runs `/sdd`, the skills and the background workflows |
| git | Two repos (`api/`, `web/`), one branch and PR per feature in each |
| jq | The file-copy installer refuses to run without it, and the hook scripts need it in both modes |
| Node.js 20+ (`npx`) | The `context7` MCP server, `create-next-app@15`, and the web gates |
| PHP 8.3 + Composer 2 | `composer create-project laravel/laravel:^12.0`, Pest, Larastan, Pint |
| SQLite | Dev database (`database/database.sqlite`) and in-memory test database |
| gh (optional) | Opening the PRs in chapters 04-09 from the terminal |

Quick check:

```bash
claude --version && git --version && jq --version
node --version          # v20 or newer
php --version           # 8.3.x
composer --version      # 2.x
sqlite3 --version
```

### Plugin or file-copy?

[INSTALLATION.md#choose-a-mode](../../reference/installation.md#choose-a-mode) compares the
two modes. For this walkthrough the choice comes down to one constraint: **`api/` and `web/` must
not exist before chapter 02.** `composer create-project` and `create-next-app` need a missing or
empty target folder, and greenfield-build's Detect phase stops when it finds tracked files.
Chapter 01 shows both safe options:

- **Plugin mode** (recommended here). Install once with `/plugin marketplace add stasmarkov/sdd-kit` and
  `/plugin install sdd-kit@sdd-kit`, then the Laravel and Next.js preset with
  `/plugin install sdd-kit-laravel-nextjs@sdd-kit` (chapter 01, step 2), and nothing is written into the repos. Plugins do not create `CLAUDE.md`, `AGENTS.md` or
  `.claude/rules/`, so chapter 02 copies them by hand
  ([INSTALLATION.md#project-context-is-not-installed](../../reference/installation.md#project-context-is-not-installed)).
- **File-copy mode.** Run `./install.sh --project` inside each repo *after* greenfield-build has
  scaffolded it, never before.

## What you will have at the end

- Two git repos, `hireboard/api` (Laravel 12, Sanctum, Pest 3, Larastan) and `hireboard/web`
  (Next.js 15, React 19, Tailwind 4, Vitest). Both have green CI on the kit's gates:
  - api: `./vendor/bin/pint --test`, `./vendor/bin/phpstan analyse --no-progress`, `php artisan test`
  - web: `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build` when routing changes
- Five specs, `spec-HIRE-3` to `spec-HIRE-7`. Each has a ticked `tasks.md` and a Traceability
  table that links every acceptance criterion to a test or manual step. Four of the five also have
  a `manual-test.md`. HIRE-5 deliberately records its single manual check as step 4.4 in
  `tasks.md`; the kit's own rule is that manual checks point at `manual-test.md#step-N`, so
  chapter 06 flags this as a shortcut.
  The M specs live in `api/.ai/specs/` and the S spec in `web/.ai/specs/`.
- `api/docs/adr/0001-spa-auth.md` (ADR-0001), accepted by Maya Chen.
- One `/deep-review` report with a finding that was confirmed and fixed.
- A regression test and guard tests for the HIRE-9 bug.
- A QA plan plus user and dev docs for the public browse journey, graded against the code.
- Contract-sync in CI, which fails when `web/lib/api/endpoints.ts` drifts from the API routes.
- A Hireboard routing eval case for the team's kit fork.
- Demo data from `php artisan migrate:fresh --seed`, with these accounts (password `password`):

  | Account | Role |
  |---------|------|
  | `candidate@hireboard.test` (Casey Candidate) | candidate |
  | `employer@acme.test` (Erin Employer, owns Acme Robotics) | employer |
  | `admin@hireboard.test` (Ari Admin) | admin |

## How to read the artifacts

Every file the walkthrough produces is under [`artifacts/`](artifacts/), mapped like this:

| In this folder | In your workspace |
|----------------|-------------------|
| `artifacts/workspace/**` | `~/work/hireboard/**` |
| `artifacts/api/**` | `~/work/hireboard/api/**` (a fresh Laravel 12 app after the scaffold commands) |
| `artifacts/web/**` | `~/work/hireboard/web/**` (a fresh `create-next-app@15` app after the scaffold commands) |
| `artifacts/kit-fork/**` | a fork of the SDD Kit repo (the team eval case in chapter 11) |

- Each file belongs to the chapter that **first creates it** and shows its
  **end-of-walkthrough** state.
- A later change to that file appears in the later chapter as a diff, for example the HIRE-8
  salary formatting in `web/components/job-card.tsx`, or the HIRE-9 fix in the API's
  `JobPostingRepository`.
- Some files grow with every feature: `web/lib/api/endpoints.ts`,
  `api/docs/api/api-contracts.md`, `api/docs/context/business-rules.md`, `api/bootstrap/app.php`
  and `RepositoryServiceProvider`. They also show their final state, so reading one mid-story
  shows entries from later chapters.
- `composer.json` and `package.json` are not artifacts. Dependencies come from the scaffold
  commands in chapter 02.

## Cost and effort

Workflows (`greenfield-build`, `tech-research`, `ship-feature`, `fix-bug`, `qa-and-docs`) fan out
many agents in the background, so they cost far more tokens than a single chat. Phases name a
**tier** rather than a model:

- `deep` for investigation, specs, review and decisions
- `standard` for implementation and fixes
- `light` for inventory

[docs/effort-guidelines.md](../../reference/effort-guidelines.md#model-tier-selection) maps the tiers to
models. It also shows how a team pins exact model IDs, either in `MODEL_TIERS` or per run with the
`models` argument:

```js
Workflow({ name: "ship-feature", args: { spec: "...", models: { standard: { model: "<pinned id>", effort: "high" } } } })
```

This walkthrough leaves the defaults alone and quotes no prices. Check current pricing yourself.

No workflow starts on its own. `/sdd` shows the exact `Workflow({ ... })` call and waits for you
to agree before launching it. You can also opt in yourself with a direct call or a plain-English
request that names the workflow (see
[USAGE-EXAMPLES.md#running-workflows-directly](../../reference/usage-examples.md#running-workflows-directly)).
To watch running workflows, use `/workflows`. The cheaper options appear where they fit:
`/execute-task` in chapter 06 and `/simple-task` in chapters 07 and 08.

> **Conventions used in every chapter**
>
> - **Bare skill names.** Commands appear as `/sdd`, `/write-spec`, `/execute-task`,
>   `/deep-review`, `/simple-task`. In plugin mode, type them with the plugin prefix:
>   `/sdd-kit:sdd`, `/sdd-kit:execute-task`, and so on
>   ([INSTALLATION.md#namespacing](../../reference/installation.md#namespacing)).
> - **No tracker.** No Jira or Linear MCP server or CLI is connected. `/sdd` asks for the ticket
>   text, Alex pastes it, and the step that posts a link back to the ticket is skipped.
> - **Session location matters.** Spec resolvers and single-file outputs (ADRs, review reports,
>   execute-task state) are relative to the folder the session starts in. Each chapter says
>   where to start Claude: the workspace root, or inside a repo with `--add-dir` for the other
>   one ([docs/multi-repo.md](../../reference/multi-repo.md)).
> - **Simulated output** is labelled, and abridged with `…`.

## Further reading

- [src/docs/GETTING-STARTED.md](../../reference/getting-started.md): your first session,
  `/framework-doctor`, and where artifacts go.
- [src/docs/USAGE-EXAMPLES.md](../../reference/usage-examples.md): a short scenario for each
  route.
- [docs/multi-repo.md](../../reference/multi-repo.md): workspace layout, configuration traps, and
  contract sensors for split repos.

## What you have now

- A map of the 12 chapters and the `/sdd` route each one uses.
- The toolchain checked and an install mode chosen, with `api/` and `web/` still not created.
- A rule for reading `artifacts/`: final-state files, with later edits shown as diffs.

Next: [01 — Workspace and kit install](01-workspace-and-install.md)
