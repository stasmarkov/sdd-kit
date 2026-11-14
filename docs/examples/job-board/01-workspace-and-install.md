# 01 — Workspace and kit install

**Date in the story:** 2026-10-19, morning. **Who:** Alex Rivera (developer). **Route:** none yet. This chapter is setup.

In this chapter Alex creates the parent folder that will hold both Hireboard repos, installs
the kit without touching the repos (which don't exist yet), and writes the two files that
greenfield-build reads as its constitution in [chapter 02](02-greenfield-first-slice.md):
the workspace `CLAUDE.md` and `product-brief.md`.

Prerequisites (Claude Code, PHP 8.3 + Composer, Node 20+, jq) are listed in
[00-overview.md](00-overview.md).

Finished files for this chapter:

- [`artifacts/workspace/CLAUDE.md`](artifacts/workspace/CLAUDE.md) becomes `~/work/hireboard/CLAUDE.md`
- [`artifacts/workspace/product-brief.md`](artifacts/workspace/product-brief.md) becomes `~/work/hireboard/product-brief.md`

Both artifacts show the **end-of-walkthrough** state. A few lines in them only become true
later: the contract-sync check comes in chapter 11, ADR-0001 in chapter 03, and BR-44 in
chapter 05. Those lines are called out below.

---

## Step 1: Create the workspace, and only the workspace

```bash
mkdir -p ~/work/hireboard && cd ~/work/hireboard
```

Create the parent folder and nothing else. Don't `git init` here, and don't create `api/` or `web/`.

> **Friction F1: leave `api/` and `web/` to the scaffolders.**
> `composer create-project laravel/laravel:^12.0 api` and `npx create-next-app@15 web` both
> need a target directory that is missing or empty. greenfield-build's **Detect** phase also
> checks each target with `git -C <path> ls-files`. If a target already has tracked files, it
> stops with `BLOCKED` unless you pass `force`. So you can't pre-create the repos "to install the kit
> into them first". The kit goes into the workspace (or into Claude Code as a plugin) now, and
> into each repo only after chapter 02.

The folder will end up like this (from [docs/multi-repo.md](../../reference/multi-repo.md), with real
names instead of `be/` and `fe/`):

```
~/work/hireboard/            no .git on purpose; start Claude here for cross-repo work
├── CLAUDE.md                this chapter
├── product-brief.md         this chapter
├── .ai/                     local scratch only (anything written while a session runs from the root)
├── api/                     chapter 02: Laravel 12 API, own git
└── web/                     chapter 02: Next.js 15 frontend, own git
```

---

## Step 2: Install the kit in plugin mode (recommended here)

Plugin mode puts nothing on disk inside the workspace or the repos, which is what you want
before the repos exist. In any Claude Code session:

```
/plugin marketplace add stasmarkov/sdd-kit
/plugin install sdd-kit@sdd-kit
```

The core is stack-neutral. Hireboard is Laravel plus Next.js, so also install the preset,
which pulls in the Laravel, Next.js and devenv add-ons:

```
/plugin install sdd-kit-laravel-nextjs@sdd-kit
```

In file-copy mode you pick the stacks yourself with `--stack=laravel,nextjs` (Step 3).
The plugin starts the `context7` and `playwright` MCP servers from its own `.mcp.json`, so
nothing is added to the repos.

If you work from a local checkout of the kit (to test a branch, or because you will fork it
for the team eval in chapter 11), skip the marketplace and load the directory for each session:

```bash
git clone https://github.com/stasmarkov/sdd-kit.git ~/tools/sdd-kit
cd ~/work/hireboard
claude --plugin-dir ~/tools/sdd-kit/plugins/sdd-kit \
       --plugin-dir ~/tools/sdd-kit/plugins/sdd-kit-laravel-nextjs
```

The rest of the walkthrough assumes the checkout lives at `~/tools/sdd-kit`,
because Step 4 copies a template out of it. Clone it even if you install from the marketplace.

> **Friction F5: plugin mode namespaces skills and installs no project context.**
> Every skill gets the plugin prefix: `/sdd` becomes `/sdd-kit:sdd`, `/framework-doctor`
> becomes `/sdd-kit:framework-doctor`, `/execute-task` becomes `/sdd-kit:execute-task`. The
> chapters use bare names, so add the prefix in plugin mode. Workflows are still started by
> name (`Workflow({ name: "greenfield-build", ... })`).
> Plugins also never create `CLAUDE.md`, `AGENTS.md` or `.claude/rules/`. You write the
> workspace `CLAUDE.md` by hand in Step 4, and chapter 02 gives each repo its own context
> files. See [INSTALLATION.md, "Project context is not installed"](../../reference/installation.md#project-context-is-not-installed).

Two plugin-mode differences that matter later, from [docs/plugin-mode.md](../../reference/plugin-mode.md):
the kit's guardrail hooks (dangerous-command blocking, the Conventional Commits check) run in
both modes, but the permission allow/deny lists in the plugin's `settings.json` don't apply.
Copy them into a project `.claude/settings.json` if your team wants them.

---

## Step 3: File-copy alternative

Use this if you want to edit agents and skills in place. Run the installer from the workspace
root so sessions started there get the skills, agents and workflows. **First do Step 4**,
copying the multi-repo `CLAUDE.md` in place: the installer creates `CLAUDE.md` from the
single-repo template when none exists, and it never overwrites an existing one.

```bash
cd ~/work/hireboard
cp ~/tools/sdd-kit/share/templates/multi-repo/CLAUDE.md CLAUDE.md   # Step 4 first
~/tools/sdd-kit/install.sh --project --stack=laravel,nextjs --dry-run
```

Simulated output (abridged):

```
SDD Kit v4.1.1
Target: /Users/alex/work/hireboard/.claude (project, full)
  added:   ...  (skills, agents, workflows, scripts, templates, settings.json)
  updated: 0
  removed: 0
Dry run: nothing written.
```

Then install for real (`--full` is the default; `--minimal` is the spec-driven core only):

```bash
~/tools/sdd-kit/install.sh --project --stack=laravel,nextjs
```

Besides `.claude/`, a project install merges hooks into `.claude/settings.json`, adds
`context7` and `playwright` to `.mcp.json`, and creates `AGENTS.md` and `.claude/rules/` when they are missing.
At the workspace root those last two don't help: the rules' `paths:` globs (`app/Http/Controllers/**`,
`tests/**`, ...) are relative to a repo root, and the gates live in each repo's `AGENTS.md`.
Delete the root copies and keep the real ones in `api/` and `web/`:

```bash
rm AGENTS.md && rm -r .claude/rules
```

Re-running the installer at the root (the update path) creates them again, so repeat this
cleanup after each update.

After chapter 02, run the same installer once inside each repo, each with its own stack (`cd api && .../install.sh --project --stack=laravel`,
then `cd ../web && .../install.sh --project --stack=nextjs`). That is the point where per-repo `AGENTS.md` and `.claude/rules/` are created. Never run it
inside `api/` or `web/` before chapter 02 (F1). The flags (`--stack=`, `--with=`, `--user`, `--yes`) are
documented in [INSTALLATION.md, file-copy mode](../../reference/installation.md#file-copy-mode).

**Other hosts.** Hireboard's team could also use Codex or Cursor (both an unverified preview; see [hosts.md](../../reference/hosts.md)). The file-copy install is the same dry run, then the real run, with `--host`:

```bash
~/tools/sdd-kit/install.sh --host codex --project --stack=laravel,nextjs --dry-run
~/tools/sdd-kit/install.sh --host cursor --project --stack=laravel,nextjs --dry-run
```

Drop `--dry-run` to install. Skills then start with `$` on Codex (`$sdd`) and `/` on Cursor (`/sdd`). Run each repo's installer after chapter 02, as above.

---

## Step 4: Write the workspace `CLAUDE.md`

Start from the kit's multi-repo template (skip the copy if you already did it in Step 3):

```bash
cd ~/work/hireboard
cp ~/tools/sdd-kit/share/templates/multi-repo/CLAUDE.md CLAUDE.md
```

The template is written for `be/` and `fe/`. Rename every occurrence to `api/` and `web/`,
fill in the placeholders, and add two sections the template doesn't have: `## Product` and
`## Where outputs land`. The finished file is
[`artifacts/workspace/CLAUDE.md`](artifacts/workspace/CLAUDE.md). The parts that matter:

**Imports.** Two lines at the top. They point at files that don't exist yet; they start
resolving once chapter 02 creates `api/CLAUDE.md` and `web/CLAUDE.md`.

```markdown
@api/CLAUDE.md
@web/CLAUDE.md
```

**Product and invariants.** A pointer to the brief and the seven invariants, so every
workflow's constitution phase sees them before deciding anything. Hireboard keeps a lighter
setup than the kit's full Golden Triangle (business rules, architecture, workflow): from
chapter 02 on, only the validated business rules live in `api/docs/context/`, and
architecture sits in `api/docs/architecture.md`. There is no workflow document.

```markdown
## Product
...
- Product brief, roles, scope and non-goals: `product-brief.md`
- Business rules (canonical, validated by Maya Chen): `api/docs/context/business-rules.md`.

### Invariants
| ID | Invariant |
|----|-----------|
| INV-01 | The API lives under `/api/v1`. Success envelope `{success, status, message, data[, meta]}` ... |
| INV-02 | Single-action invokable controllers, business logic in services, DTOs ... |
| INV-03 | Domain tables use UUID keys; `users` keeps bigint ids ... |
| INV-04 | Timestamps are stored in UTC and serialized as ISO-8601. |
| INV-05 | The browser never holds the API token ... HttpOnly cookie `hireboard_session` (ADR-0001). |
| INV-06 | Every endpoint the browser calls is listed in `web/lib/api/endpoints.ts` and `api/docs/api/api-contracts.md`. |
| INV-07 | Salaries are integers (annual, whole currency units) plus an ISO-4217 currency. |
```

INV-05 cites ADR-0001, which chapter 03 writes. On day one, write INV-05 as the constraint
Maya already wants ("no token readable by browser JavaScript"). The ADR then decides how to
meet it, and the cookie name is filled in after sign-off.

**Layout, Contract, Cross-repo routing.** These are the template's sections, filled in:

```markdown
| `api/` | `git@github.com:hireboard/api.git` | Laravel 12 JSON API (...) | see `api/AGENTS.md` |
| `web/` | `git@github.com:hireboard/web.git` | Next.js 15 App Router (BFF, ...) | see `web/AGENTS.md` |

- The API contract lives in `api/docs/api/api-contracts.md`. **The backend is authoritative.**
- Every backend endpoint the browser calls is registered in `web/lib/api/endpoints.ts` (INV-06).
- Frontend types mirror backend DTO output ... in `web/types/api/`.
```

The routing table keeps the template's generic rows (DTO, route, validation, enum, auth)
pointed at real paths and adds three Hireboard rows: a domain error code
(`api/app/Exceptions/` → the server action that maps `ApiError.code`), a table or column
(`api/docs/schemas/*.md` first, which is schema-first), and a business rule (ask Maya Chen first).
The drift-check line names `web/scripts/contract-sync.mjs`; that script arrives in
[chapter 11](11-running-it-as-a-team.md). Until then, the line is a promise.

**Process and Environment.**

```markdown
- Commit in each repo separately (`git -C api ...`, `git -C web ...`). Never run git from this root.
- Use the same branch name in both repos for one change: `<feature|fix|chore>/HIRE-<n>-<slug>`
- Merge order: `api` first when the change is additive. ...

- API: `http://localhost:8000` (`cd api && php artisan serve --port=8000`).
- Web: `http://localhost:3000` (`cd web && npm run dev`). This is the `url` for every workflow.
- The web server reads the API URL from `web/.env.local`: `API_BASE_URL=http://localhost:8000`.
```

**Where outputs land.** This section isn't in the template. It encodes friction F3 and F2:

```markdown
## Where outputs land

- **Specs live in the repo that starts the change**, usually `api/.ai/specs/spec-HIRE-<n>-<slug>/` ...
  From this root, pass the repo-relative folder: `spec: "api/.ai/specs/spec-HIRE-4-company-reviews"` ...
- **Root `.ai/` is local scratch and is never committed** (this folder has no git) ...
- **One-file outputs you want committed** (tech-research ADR in `docs/adr/`, a qa-and-docs plan
  in `docs/qa/`, `/deep-review` reports in `.ai/reviews/`): start the session inside the owning repo ...
    cd api && CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../web
```

> **Friction F3: single-file outputs land relative to the session's working directory.**
> The workspace root has no git. An ADR, a QA plan or a review report written from there
> lands in `~/work/hireboard/docs/...` or `~/work/hireboard/.ai/...`, where nothing commits it.
> When a workflow writes one file that belongs to a repo, start the session inside that repo
> with `--add-dir` for the sibling. `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` makes the
> sibling's `CLAUDE.md` load too ([docs/multi-repo.md, configuration traps](../../reference/multi-repo.md#configuration-traps)).
> Chapters 03, 06, 07 and 10 do this. Chapter 06 also needs it for another reason:
> `/execute-task --spec=` resolves only against the session's own `./.ai/specs` (friction F2).

Keep the root file small. It holds only what neither repo knows alone. Laravel and Next.js
conventions belong in `api/CLAUDE.md` and `web/CLAUDE.md` (chapter 02).

---

## Step 5: Write `product-brief.md`

greenfield-build's Constitution phase reads the project `CLAUDE.md` and any
`docs/context/*.md`. Neither exists in a greenfield repo yet, so the brief reaches the
workflow through the `## Product` pointer in the workspace `CLAUDE.md`. The `idea` argument in
chapter 02 also ends with "Conventions from CLAUDE.md and product-brief.md".

The finished brief is [`artifacts/workspace/product-brief.md`](artifacts/workspace/product-brief.md).
It has seven parts:

| Section | Content |
|---------|---------|
| Problem | Why a small job board: small employers are buried on big boards; candidates can't judge employers |
| Roles | Visitor, `candidate`, `employer`, `admin` (seeded only), and what each can do |
| MVP scope | Search with filters, careers pages, accounts, candidate profiles, applications, moderated reviews |
| Non-goals | Payments, messaging, email verification and notifications, employer job publishing until HIRE-11, uploads |
| Business rules (draft) | BR-01 ... BR-44 grouped by area, numbered with gaps (0x accounts, 1x postings, 2x profiles, 3x applications, 4x reviews) |
| Open questions | What Maya Chen still has to decide |
| Success for the MVP | Measurable outcomes: time to find a posting, registration to application in one sitting, no unmoderated review or public candidate identity |

Write the rules so that a spec can cite them and a test can check them:

```markdown
- **BR-10** Only `open` postings appear in search and detail. Draft and closed postings are
  never public (404 `job_not_found`).
- **BR-32** One application per candidate per posting (409 `already_applied`), also under a
  concurrent duplicate submit.
- **BR-43** Company rating is the mean of approved ratings, rounded half-up to 1 decimal, or
  null when there are none.
```

These are a **draft**. Maya Chen validates them before they become the canonical
`api/docs/context/business-rules.md` in chapter 02. Until a human has confirmed a rule, it's
an assumption, and write-spec's clarity gate treats it as one. BR-44 ("moderation is final
in v1") isn't in Alex's first draft. It comes out of the HIRE-4 clarity gate in
[chapter 05](05-feature-company-reviews-full-spec.md), and the artifact shows it with that source.

---

## Step 6: Check the install and the loaded context

Start Claude in the workspace (add `--plugin-dir ~/tools/sdd-kit/plugins/sdd-kit` if you use a
local checkout):

```bash
cd ~/work/hireboard
claude
```

Run the doctor. It's a manual skill (`disable-model-invocation: true`), so Claude won't run it
for you. Type it:

```
/sdd-kit:framework-doctor        # plugin mode
/framework-doctor                # file-copy mode
```

Simulated output, plugin mode (abridged):

```
Framework Health Check (plugin, v4.1.1)
=======================================
[WARN] Golden Triangle: docs/context/ not found
[SKIP] Manifest integrity: plugin mode
[SKIP] Hooks wired and firing: plugin mode (hooks come from hooks/hooks.json)
[SKIP] Also run /skill-doctor and /doctor prompt-audit

Result: 8 passed, 1 warning, 0 failures
```

Only `[WARN]`, `[FAIL]` and `[SKIP]` lines print by default; add `--verbose` to see the passes.
The Golden Triangle warning is expected at the root, and it stays expected inside `api/`
too: Hireboard keeps only `business-rules.md` in `docs/context/` (from chapter 02 on), so the
doctor still reports a partial triangle there. The root `CLAUDE.md` points to the rules. In file-copy mode you also get
the manifest check and **Hooks wired and firing**. That check pipes a harmless `rm -rf /`
payload into `block-dangerous.sh` and expects exit code 2. If it reports FAIL, check
`jq --version` first. "Green" here means **0 failures**; warnings are fine.

Then check what Claude actually loaded:

```
/memory
```

Simulated output (abridged):

```
Memory files
  User memory     ~/.claude/CLAUDE.md
  Project memory  ~/work/hireboard/CLAUDE.md
```

The root `CLAUDE.md` must be listed. `api/CLAUDE.md` and `web/CLAUDE.md` aren't there yet,
because the `@api/CLAUDE.md` and `@web/CLAUDE.md` imports point at files that chapter 02
creates. Run `/memory` again at the end of chapter 02: both imports must show up then. If
they don't, see the traps table in [docs/multi-repo.md](../../reference/multi-repo.md#configuration-traps).

The brief isn't imported (no `@product-brief.md`). It is long and only matters when someone
plans, so it is read on demand through the pointer. Keeping the always-loaded context small is
the kit's first design rule.

---

## Step 7: Checklist

- [ ] Kit installed: `/plugin` lists `sdd-kit` as enabled (or `.claude/` exists at the root after `install.sh --project`)
- [ ] `/framework-doctor` reports 0 failures
- [ ] `~/work/hireboard/CLAUDE.md` written from the multi-repo template: `api/`/`web/` names, Product + invariants, Layout, Contract, routing, Process, Where outputs land, Environment
- [ ] `~/work/hireboard/product-brief.md` written, with BR-01... marked as a draft for Maya Chen
- [ ] `/memory` shows the root `CLAUDE.md`
- [ ] `ls ~/work/hireboard` shows no `api/`, no `web/` and no `.git`

For the general install and usage reference, see [INSTALLATION.md](../../reference/installation.md),
[GETTING-STARTED.md](../../reference/getting-started.md) and the multi-repo scenario in
[USAGE-EXAMPLES.md](../../reference/usage-examples.md#11-split-backend-and-frontend-repos).

## What you have now

- An empty `~/work/hireboard/` workspace with no git, and with the target folders `api/` and `web/` still absent, so the scaffolders and greenfield-build's Detect phase will accept them.
- The kit active for sessions started there, as a plugin (`/sdd-kit:*`) or as a file-copy install at the root.
- A workspace `CLAUDE.md` that states the contract, the invariants INV-01..INV-07, the cross-repo routing, the process and where each kind of output lands.
- A product brief with roles, scope, non-goals and draft business rules, ready to serve as greenfield-build's constitution.

Next: [02 — New app: greenfield-build scaffolds both repos and ships the first slice (HIRE-1)](02-greenfield-first-slice.md)
