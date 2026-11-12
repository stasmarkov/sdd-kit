# 11 — Running Hireboard as a team: contract-sync, routines, evals, pinned versions

By the end of [chapter 10](10-qa-and-docs-browse-journey.md), Alex Rivera had shipped Hireboard on his own: one greenfield slice, an ADR, five specs, a trivial change, a bug fix and a QA plan. Two more developers join on Monday, 2026-11-09. This chapter turns what Alex did by habit into checks and conventions that hold when he isn't watching:

1. The api/web contract becomes a check that fails CI.
2. Drift checks run on a schedule and only report.
3. A Hireboard-flavored eval guards `/sdd` routing.
4. Everyone runs the same pinned kit version, and Cursor or Codex users get the same gates.
5. A short team rhythm, then the next ticket (HIRE-11) as an exercise.

This chapter links to the existing docs instead of repeating them: [multi-repo.md](../../reference/multi-repo.md), evals.md, [team-marketplace.md](../../reference/team-marketplace.md), [USAGE-EXAMPLES.md section 14](../../reference/usage-examples.md#14-recurring-checks-with-routines) and the [contract-sync README](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/plugins/sdd-kit-laravel/templates/contract-sync/README.md).

> Artifacts for this chapter: `artifacts/api/.github/workflows/export-routes.yml`, `artifacts/web/.github/workflows/contract-sync.yml` and `artifacts/kit-fork/evals/hireboard-routing/` (`case.yaml`, `prompt.md`, `graders/routes-correct.md`).

---

## 1. Make the contract a sensor

Hireboard keeps the contract in two hand-maintained places (INV-06): `web/lib/api/endpoints.ts` and `api/docs/api/api-contracts.md`. Prose drifts, as [multi-repo.md, "Make the contract a sensor"](../../reference/multi-repo.md#make-the-contract-a-sensor) warns. So the registry is compared against the routes Laravel actually registers.

The kit ships the checker as a template. Copy it into `web/` **unmodified** and configure it through environment variables, so a later kit upgrade means copying the file again with no merge:

```bash
cd ~/work/hireboard
mkdir -p web/scripts
cp ~/tools/sdd-kit/plugins/sdd-kit-laravel/templates/contract-sync/contract-sync.mjs web/scripts/contract-sync.mjs
echo "route-list.json" >> web/.gitignore
```

The defaults already fit Hireboard. `backendPrefix: 'api'` turns Laravel's `api/v1/jobs` into `/v1/jobs`, and `frontendPrefix: '/api'` turns the registry's `/api/v1/jobs` into the same path. `onlyBackendUris: '^api/'` drops `up` and `sanctum/csrf-cookie`. The only settings that need changing are the registry path and the route file:

| Variable | Value | Why |
|---|---|---|
| `CONTRACT_SYNC_REGISTRY` | `lib/api/endpoints.ts` | The template default points at `../frontend/src/lib/...`, but Hireboard has no `src/` dir |
| `CONTRACT_SYNC_ROUTES_FILE` | `route-list.json` | CI has no PHP in the web job, so it reads a saved `route:list --json` |

The `registry-ts` format is auto-detected from the `.ts` extension. It picks up every object literal that has a `method` and a `path`, which is exactly the shape of Hireboard's registry:

```ts
// web/lib/api/endpoints.ts (excerpt; full file owned by chapter 02)
export const endpoints = {
  searchJobs: { method: 'GET', path: '/api/v1/jobs' },
  // ...
  approveReview: { method: 'POST', path: '/api/v1/admin/reviews/{id}/approve' },
  rejectReview: { method: 'POST', path: '/api/v1/admin/reviews/{id}/reject' },
  // ...
} as const;
```

### Run it locally

From the workspace root:

```bash
(cd api && php artisan route:list --json > ../web/route-list.json) \
  && (cd web && node scripts/contract-sync.mjs --routes-file route-list.json --registry lib/api/endpoints.ts)
echo "exit $?"
```

```text
contract-sync: 18 backend routes, 18 frontend endpoints compared

In sync.
exit 0
```

All 18 entries match: 3 from jobs (ch02), 4 from auth (ch04), 6 from reviews (ch05), 2 from profiles (ch06) and 3 from applications (ch07). The counts exclude `HEAD` and every non-`api/` route.

### What drift looks like

Suppose a developer renames the approve endpoint on the web side only, changing `/approve` to `/approval` in `endpoints.ts`:

```diff
-  approveReview: { method: 'POST', path: '/api/v1/admin/reviews/{id}/approve' },
+  approveReview: { method: 'POST', path: '/api/v1/admin/reviews/{id}/approval' },
```

Re-run the same command:

```text
contract-sync: 18 backend routes, 18 frontend endpoints compared

Missing in backend — frontend calls a route the API does not have (1)
  POST   /v1/admin/reviews/{}/approval   <- lib/api/endpoints.ts:14

Unused by frontend (warning) — API route with no registry entry (1)
  POST   /v1/admin/reviews/{}/approve   -> App\Http\Controllers\Reviews\ApproveReviewController

Fix: add the missing Laravel route (or remove the stale registry entry), align methods, then re-run. Paths compare after prefix stripping and parameter normalization ({id}, [id], :id, ${id} -> {}).
exit 1
```

*(Real checker output format. The line number depends on your file.)* `/admin/reviews` would have shown "The decision could not be saved. Please try again." for every review, `npx tsc --noEmit` would have passed and no Pest test would have failed. Revert the change before you go on.

Parameter names are normalized to `{}`, so the check catches path and method drift. It does not catch payload drift, such as a renamed JSON field. Those are still covered by the `types/api/*.ts` mirrors, the Pest shape tests and `/deep-review`.

### Wire it into CI

Commit the two artifact workflows (on a `chore/contract-sync` branch in each repo, api merged first as usual):

- **`api/.github/workflows/export-routes.yml`**, named "Export API routes". It runs on every push to `main` and on pull requests, boots the app with `cp .env.example .env && php artisan key:generate` (no database), and uploads `route-list.json` as the artifact `route-list`.
- **`web/.github/workflows/contract-sync.yml`**. It runs on every web pull request, downloads `route-list` from the latest **successful `main`** run of "Export API routes" in `hireboard/api` using `gh`, and then runs the checker with the two env vars set:

```yaml
# web/.github/workflows/contract-sync.yml (excerpt)
    env:
      CONTRACT_SYNC_REGISTRY: lib/api/endpoints.ts
      CONTRACT_SYNC_ROUTES_FILE: route-list.json
    steps:
      # ...
      - name: Download the route list from the latest green api main build
        env:
          GH_TOKEN: ${{ secrets.BACKEND_REPO_TOKEN }}
        run: |
          run_id=$(gh run list -R hireboard/api -w "Export API routes" -b main -s success -L 1 --json databaseId -q '.[0].databaseId')
          # ...
          gh run download "$run_id" -R hireboard/api -n route-list
      - name: Compare lib/api/endpoints.ts with the API routes
        run: node scripts/contract-sync.mjs
```

Create the `BACKEND_REPO_TOKEN` secret in `hireboard/web`. Use a fine-grained token with read access to **Actions** on `hireboard/api`, because the default `GITHUB_TOKEN` cannot read another repo's artifacts.

Two choices are deliberate:

- **No `--strict` yet.** The README advises starting with warnings allowed. Today there are no unused routes. HIRE-11 will add employer posting endpoints, and while its api PR is merged but its web PR is still open, those routes show up as `unused-by-frontend` warnings. That is the expected state between the two merges, and it should not block anyone. Turn on `--strict` (or `CONTRACT_SYNC_STRICT=1`) once the team trusts the check.
- **The check reads api `main`, not the api PR.** This is what makes "api merged first" enforceable. A web PR that calls an endpoint the api has not merged yet fails with `missing-in-backend` until the api PR lands.

Optional, but the agent benefits: the README's [PostToolUse hook](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/plugins/sdd-kit-laravel/templates/contract-sync/README.md#as-a-claude-code-hook) runs the checker whenever Claude edits `routes/*.php` or `endpoints.ts`, so drift surfaces in the same turn. The same section describes a lighter pre-push variant (`node scripts/contract-sync.mjs || exit 1`). Hireboard adds the pre-push hook in `web/` only. In the workspace, the hook would need a fresh `route-list.json` on every edit, and the README recommends `routesFile` in that case.

---

## 2. Routines: report-only drift checks

CI only checks pull requests. If someone renames a route on api `main` while no web PR is open, nothing goes red. Routines cover the gap. They are Claude Code cloud agents on a cron, created with `/schedule`. [USAGE-EXAMPLES.md section 14](../../reference/usage-examples.md#14-recurring-checks-with-routines) gives generic prompts, and these are tailored to Hireboard. Give each routine access to both `hireboard/api` and `hireboard/web` when `/schedule` asks for repositories.

**Nightly contract drift:**

```text
/schedule every night at 02:00 Europe/Berlin: In hireboard/api run `composer install --no-interaction --prefer-dist`, `cp .env.example .env && php artisan key:generate`, then `php artisan route:list --json > route-list.json`. If PHP is not available, download the `route-list` artifact from the latest successful "Export API routes" run on hireboard/api main with gh instead. In hireboard/web run `node scripts/contract-sync.mjs --routes-file <path to route-list.json> --registry lib/api/endpoints.ts --json`. Report every error and warning with method, path and the registry line or controller, plus the api and web commits you checked. Report only: do not edit files, commit, push or open pull requests.
```

**Weekly spec status reconciliation:**

```text
/schedule every Monday at 07:00 Europe/Berlin: In hireboard/api and hireboard/web, for every folder under .ai/specs/, read the status in spec-lite.md frontmatter and the checkboxes in tasks.md. Report specs whose status disagrees with their tasks: done with unchecked tasks, in-progress or approved with every task checked, draft older than 7 days, approved without approved_by/approved_at. For each spec, give the folder, the status, checked/total tasks and a one-line suggestion. Report only: do not edit specs or code.
```

**Weekly dependency audit:**

```text
/schedule every Monday at 07:30 Europe/Berlin: In hireboard/api and hireboard/web run the audit commands directly: in api, `composer outdated --direct` and `composer audit`; in web, `npm outdated` and `npm audit --omit=dev`. Summarize outdated and vulnerable packages per repo by risk (security first, then majors), with the advisory id and the fixed version. Report only: do not upgrade, edit lockfiles or open pull requests.
```

`/upgrade-deps` is a manual-only skill: a routine agent cannot invoke it, so the routine runs the underlying commands itself. Type `/upgrade-deps` (or `/security-scan`) yourself when you act on the report.

*(Simulated)* `/schedule` echoes each routine with its cron and repositories, and the first nightly report arrives the next morning:

```text
Contract drift — 2026-11-10 02:00 CET
api main 4e1c9a2 · web main b77d310
contract-sync: 18 backend routes, 18 frontend endpoints compared
In sync. No errors, no warnings.
```

The rule that makes routines safe: **a routine finds, a person acts through `/sdd`.** If the dependency audit flags a vulnerable package, someone runs `/sdd` with the finding. A patch bump is `trivial`, and a breaking upgrade is a `feature` with a spec. A routine that "just fixes it" pushes unreviewed changes at 02:00, bypassing the approval gate and the api-first merge order.

---

## 3. A Hireboard routing eval

`/sdd` routing decides which pipeline runs, so a wrong route is expensive. A `trivial` request routed to `feature` costs a spec, and a `bug` routed to `trivial` skips the regression test. The kit's built-in `sdd-routing` case covers four routes (bug, feature, decision, trivial). Hireboard's tickets exercise all six, so the team adds a case in its own words. See evals.md for the format and flags.

Evals run against the plugin source, so the case lives in a fork of the kit (`hireboard/claude-laravel-nexjs`). The fork tracks upstream tags, and `evals/hireboard-routing/` is its only addition, so the plugin code under test is byte-identical to the version the team pins in section 4. The artifact `artifacts/kit-fork/evals/hireboard-routing/` maps to `evals/hireboard-routing/` in that fork:

```text
evals/hireboard-routing/
├── case.yaml               runs: 5, max_turns 8, allowed_tools [Read, Glob, Grep, Skill]
├── prompt.md               dry run: classify six requests, one line each
└── graders/
    └── routes-correct.md   type: llm, focus: last_message
```

The prompt mirrors the built-in case. It uses the six route names, a no-launch dry run and one line per request, and ticket text is included so `/sdd` doesn't ask for a paste (there is no tracker, F8). The six requests:

| # | Request (abridged) | Expected route | Chapter |
|---|---|---|---|
| 1 | HIRE-9: closed posting renders by direct link | bug | [09](09-bug-closed-jobs-fix-bug.md) |
| 2 | HIRE-6: candidates apply, employers see applications | feature | [07](07-applications-and-deep-review.md) |
| 3 | HIRE-2: which SPA auth approach | decision | [03](03-decision-spa-auth-adr.md) |
| 4 | HIRE-10: QA plan + docs for the live browse journey | shipped | [10](10-qa-and-docs-browse-journey.md) |
| 5 | New admin analytics service in an empty repository | new app | [02](02-greenfield-first-slice.md) shape |
| 6 | HIRE-8: format the salary on job cards | trivial | [08](08-careers-page-s-spec-and-trivial-change.md) |

The grader passes only on exactly those six routes, with no hedging and nothing launched or written:

```markdown
---
type: llm
focus: last_message
weight: 1
---
Pass only if the final answer assigns exactly these routes: request 1 → bug, request 2 → feature, ...
```

Run it from the fork root in a plain terminal, not inside a Claude Code session. It has no fixture, so `--scaffold` and `--allow-tools` aren't needed:

```bash
cd ~/tools/hireboard-kit-fork
claude plugin eval . --case hireboard-routing --runs 5 --no-publish
```

*(Simulated, abridged)*

```text
hireboard-routing   with plugin   5/5 pass   median 1.00
                    baseline      2/5 pass   median 0.00
                    delta         +1.00
Report: evals/results/2026-11-09T09-14-03/report.html
```

The default `--ablation with-without` adds the no-plugin baseline arm, so the score shows what the kit adds, not just whether a model can sort six sentences. Judge it the way evals.md, "How to judge results" says: **the median of 5 runs, against the baseline**, never a single run. Keep `--judge-model` fixed across runs you compare, and **rerun it on every model release and every kit release**. A drop blocks the kit upgrade in section 4 until someone explains it.

---

## 4. Pin the kit for everyone

Alex installed the kit in plugin mode in [chapter 01](01-workspace-and-install.md). If three developers each run "whatever is on master", their behavior diverges and every eval result is meaningless. Follow [team-marketplace.md](../../reference/team-marketplace.md): a catalog repo `hireboard/claude-marketplace` with the core plugin pinned by `ref` **and** `sha`:

```json
{
  "name": "hireboard-claude",
  "owner": { "name": "Hireboard" },
  "plugins": [
    {
      "name": "sdd-kit",
      "description": "Spec-driven Laravel API + Next.js framework: /sdd, workflows, agents, skills, hooks.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit",
        "ref": "v4.0.2",
        "sha": "<40-char commit sha of v4.0.2>"
      }
    }
  ]
}
```

Get the sha with `git ls-remote https://github.com/stasmarkov/sdd-kit refs/tags/v4.0.2` (use the `^{}` line for an annotated tag), and validate with `claude plugin validate ./claude-marketplace`. The catalog points at upstream rather than the fork, because the fork's only difference is the eval case. Add the stack add-ons the same way (next paragraph). Hireboard has no on-call rotation, so it does not need `sdd-kit-ops`.

Commit the same `.claude/settings.json` to **both** `api/` and `web/` (section 2 of the doc):

```json
{
  "extraKnownMarketplaces": {
    "hireboard-claude": { "source": { "source": "github", "repo": "hireboard/claude-marketplace" } }
  },
  "enabledPlugins": { "sdd-kit@hireboard-claude": true }
}
```

Each developer then runs `claude plugin install sdd-kit@hireboard-claude --scope project` once per repo. Hireboard also needs the stack add-ons, so the catalog lists the preset `sdd-kit-laravel-nextjs`, which depends on `sdd-kit-laravel`, `sdd-kit-nextjs` and `sdd-kit-devenv`, pinned the same way. The workspace root `~/work/hireboard/` has no git, so nothing there can be committed. Each developer either keeps an untracked copy of that settings file at the root or starts cross-repo sessions from inside a repo with `--add-dir` (F3). Plugin mode namespaces skills, so `/sdd` in this walkthrough is `/sdd-kit:sdd` (F5, [INSTALLATION.md, "Namespacing"](../../reference/installation.md#namespacing)).

Upgrades follow the doc's [pinning policy](../../reference/team-marketplace.md#4-update-and-pinning-policy). Open a PR to the marketplace repo that bumps `ref` and `sha`, rebase the fork onto the new tag, and run the section 3 eval plus the built-in suite. Merge only if the medians hold.

**Other AI tools.** Not everyone uses Claude Code. The `AGENTS.md` files from [chapter 02](02-greenfield-first-slice.md) are tool-neutral (stack, the exact gate commands, the red lines), and Cursor and Codex read them directly. Make sure they are committed in both repos, and that each `CLAUDE.md` imports `@AGENTS.md` so each fact lives in one file only (see the comment at the top of `src/templates/AGENTS.template.md`). Keep every `CLAUDE.md` under 200 lines, as `src/CLAUDE.template.md` and [GETTING-STARTED.md](../../reference/getting-started.md#2-give-claude-your-project-context) advise:

```bash
cd ~/work/hireboard
wc -l CLAUDE.md api/CLAUDE.md web/CLAUDE.md api/AGENTS.md web/AGENTS.md
git -C api ls-files AGENTS.md CLAUDE.md .claude/settings.json
git -C web ls-files AGENTS.md CLAUDE.md .claude/settings.json
```

Run `/memory` in a fresh session to confirm the right files load. New rules go in `api/.claude/rules/` or `web/.claude/rules/`, not as more lines in `CLAUDE.md`.

---

## 5. Team rhythm

Print this out. It is the walkthrough compressed to six rules:

- [ ] **Every ticket starts with `/sdd`.** It picks the route, and the team doesn't debate the pipeline.
- [ ] **The spec lives in the repo that starts the change.** api + web features go in `api/.ai/specs/` (HIRE-3 to HIRE-6), and web-only features go in `web/.ai/specs/` (HIRE-7). From the workspace root, pass workflows the repo-relative path; run `/execute-task` and `/deep-review --spec` from a session inside the owning repo (F2).
- [ ] **Approval is recorded in frontmatter** (`status: approved`, `approved_by`, `approved_at`) by `/sdd` in the same conversation. A Slack "lgtm" is not approval (F7).
- [ ] **One PR per repo, with matching branch names, and api merged first.** The contract-sync check from section 1 now enforces this order.
- [ ] **`/deep-review` before merge** for anything touching auth, personal data or money, as in [chapter 07](07-applications-and-deep-review.md).
- [ ] **`qa-and-docs` before a release**, as in [chapter 10](10-qa-and-docs-browse-journey.md). Maya Chen validates inferred criteria.

---

## 6. Exercise: HIRE-11 "Employers publish and close job postings"

This ticket is the hand-off to the new developers. It is not built in this walkthrough. The ticket text, as Maya would paste it:

> **HIRE-11 Employers publish and close job postings.** An employer creates job postings for their own company as drafts, publishes them (they become `open` with a `published_at`), and closes them when filled. Employers see all their own postings, including drafts and closed ones. Other companies' postings are off-limits.

Start it the way every ticket starts. Run this from inside `api/` with `--add-dir ../web`, so the spec lands in `api/.ai/specs/`:

```text
/sdd HIRE-11
```

What you should see:

- **Route: feature.** It adds behavior, and the code base already exists. Expect `write-spec` to size it **M**: a schema-touching API change plus web pages is the template's own M shape, and two repos alone don't make it L (F6). If it proposes L, ask why.
- **Must NOT change, as a hint.** Expect at least these two, and add them yourself if they are missing:
  - MNC: `GET /api/v1/jobs` and `GET /api/v1/jobs/{id}` still return only `open` postings. Drafts stay invisible and closed postings return 404 `job_not_found` (BR-10, plus the HIRE-9 regression tests in `ClosedJobPostingVisibilityTest.php`).
  - MNC: applying to a closed posting still returns 422 `job_not_open` (BR-31), and employers still see applications to their closed postings (BR-33).
- **Clarity gate questions worth raising:** can a closed posting be reopened? Can a published posting be edited, and does `published_at` change when it is? Does closing a posting notify its applicants? Is the salary rule BR-12 enforced on publish or on save?
- **Contract:** new endpoints such as an employer postings list and publish/close actions show up as `unused-by-frontend` warnings in contract-sync between the api and web merges. That is expected without `--strict`.

Then follow [chapter 04](04-feature-accounts-and-roles.md) for approval and `ship-feature`, or [chapter 06](06-execute-task-candidate-profiles.md) to go task by task.

---

## What you have now

- A contract check that fails a web PR when `lib/api/endpoints.ts` calls a route the api `main` doesn't have, fed by an "Export API routes" artifact from `hireboard/api`.
- Three report-only routines (nightly contract drift, weekly spec reconciliation, weekly dependency audit) whose findings go back through `/sdd`.
- A `hireboard-routing` eval covering all six `/sdd` routes, judged on the median of 5 runs against the baseline and rerun on every model or kit release.
- One pinned kit version for the whole team through `hireboard-claude`, plus committed `AGENTS.md` files for non-Claude tools.

## Where to go next

This is the last chapter. Go back to the [overview](00-overview.md) for the full map. For depth on each topic, see [multi-repo.md](../../reference/multi-repo.md), evals.md, [team-marketplace.md](../../reference/team-marketplace.md), [effort-guidelines.md](../../reference/effort-guidelines.md) (which model tier each workflow phase uses), [USAGE-EXAMPLES.md](../../reference/usage-examples.md) and [GETTING-STARTED.md](../../reference/getting-started.md).
