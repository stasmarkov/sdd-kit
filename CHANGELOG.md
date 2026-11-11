# Changelog

All notable changes to SDD Kit (released as the Claude Laravel + Next.js Development Framework before 2.0).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.1] - 2026-11-11

Drupal projects on DDEV get the same quality gates, dev-URL rule and specialist agent as Laravel ones. Claude Code behaviour is unchanged apart from the files listed below. The Drupal path is covered by tests against a scripted `ddev`; a recorded run on a real DDEV project is still to come, so Drupal stays an early preview.

### Added

- **Adopt page.** The interactive guide gains `adopt.html`, the launch plan for bringing the kit to any project in levels 0 to 10 (goal, steps, done-when check and common failure each, with Laravel and Drupal examples, the checklist and the stuck table), linked from the Tech lead role. Its data is generated from `docs/adoption/launch-recipe.md` by `tools/gen-guide-adopt.mjs`, and `verify.sh` fails when it is stale.

### Changed

- **Drupal gates and DDEV hosts in 4.0.1.** Drupal gets the DDEV wrapper, five quality gates and the `drupal-backend-dev` agent; manifests gain `requires` lists, an object `requiresRunning`, `devUrlHosts` and overlay `extends`; the gate skills take their commands from `trust-store.mjs plan`; `/open-pr` checks `gh auth status` for the origin host.
- **One dev-URL rule on every stack.** A run's `url` argument must now be a local dev URL (localhost, 127.0.0.1, [::1], *.localhost, *.test or *.ddev.site); any other value is ignored with a log line. `*.ddev.site` URLs are accepted on every stack.
- **`/open-pr` render mode and non-GitHub origins.** `--render` (alias `--dry-run`) writes the PR body files and prints the push line and the host's next step without any gh call, commit or push. Bitbucket and GitLab origins render automatically (Bitbucket prints its create-PR URL, GitLab a push with merge-request options), other hosts use `gh auth status --hostname <host>`, and the base branch resolves without gh. Behaviour change: a github.com origin whose gh is missing or not authenticated now renders with a Warn row (`Fix: gh auth login`) instead of stopping with a Block.
- **Gate planner matches the workflows.** `trust-store.mjs plan` fills `<pm>` and `<pmx>` from the repo's lockfile (with a notice when there is more than one), checks every `requires` path in one wrapped call within a 60-second limit, leaves gates with no `kind` out of `--kinds` and filters before probing, matches `unless` globs per path segment, and says so when key `other` has no gates. An extending overlay keeps the inherited wrapper fact, so its gates never run unwrapped.
- **Overlay dev URLs and review.** A trusted overlay's `devUrl` is used only when it passes the dev-URL rule, and `/stack-trust` shows `devUrl`, `visual`, `acceptance`, `conventions` and `notes` before approval. `/open-pr` resolves SSH host aliases with `ssh -G`, so a `git@github-work:` origin keeps the GitHub flow.
- **Spec board search box.** The search placeholder uses the themed muted colour (readable in dark mode) and a shorter text, and the spec count lines up with the Sort and Filters controls on narrow screens.
- **DDEV skill names the Drupal wrapper.** The "Quality gates in a DDEV project" section of the `ddev` skill now covers the Laravel and Drupal manifests and the Drupal running check (`ddev describe -j`), and its HTTPS note covers `mkcert -install`, `*.ddev.site` dev URLs and the unsupported custom `project_tld`.

### Fixed

- **Plugin-mode rule templates.** GETTING-STARTED fetches only the core tests rule from `share/` and points to each add-on's `rules/` folder for the stack rules; the old `share/templates/rules/` URLs for the stack rules returned 404 since 3.0.

## [4.0.0] - 2026-11-10

SDD Kit now runs on Codex and Cursor as well as Claude Code. Claude Code behaviour is unchanged apart from the files listed below. Upgrading: [Upgrading from 3.x to 4.0](https://github.com/stasmarkov/sdd-kit/blob/main/share/docs/INSTALLATION.md#upgrading-from-3x-to-40). Codex and Cursor ship as an **unverified preview**: they are tested in this repo's suites, not yet in recorded real-host sessions ([docs/hosts.md](https://github.com/stasmarkov/sdd-kit/blob/main/docs/reference/hosts.md)).

### Added

- **Codex and Cursor hosts (preview).** `install.sh --host codex|cursor` installs the kit into `.codex/` / `.agents/skills/` or `.cursor/`, and per-host plugin packages are built under `hosts/<host>/`. Skills, agents, rules and hooks are converted per host from one source, and the build fails on any Claude-only path left behind. Codex and Cursor support was contributed by Bogdan Konkevich, ported from his fork.
- **Workflow bridge.** An MCP server (`adapters/bridge/`) runs the background workflows on hosts without Claude Code's Workflow tool: every agent call becomes a job the host claims, runs with its own subagent and submits, with durable state, resume after a restart and a completion review. See `docs/workflow-bridge.md`.
- **Host-neutral hooks.** One dispatcher runs the kit's hook scripts on Codex and Cursor, translating their payloads, and fails closed for the guard scripts. Known gaps per host are listed in `docs/hosts.md`.
- **Guide host selector.** The interactive guide shows install steps, commands and the catalog for Claude Code, Codex or Cursor.

- **Vendored security-audit skill.** Cloudflare's security-audit skill (MIT, pinned upstream commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`) is vendored in `src/skills/security-audit/` with path-only changes, shipped in minimal and full installs, and credited to Cloudflare in `docs/third-party.md`.
- **security-audit workflow.** `security-audit` is a new background workflow that audits a scope for vulnerabilities with the vendored skill's report schema and validators, and writes a validated ledger and findings report. It is the only workflow added since 3.1.0.
- **security-hunter agent.** A new read-only core agent without memory runs the security-audit workflow's hunters, coverage critics and verifiers, so independent votes share no state; it ships in every install, `--minimal` included.
- **LF line endings for the vendored skill.** The repository and the distribution tree ship a `.gitattributes` rule that keeps `skills/security-audit/` LF, so the workflow's hash pin also holds on Windows checkouts.
- **/sdd security audit route.** `/sdd` gains an `audit` route that launches the `security-audit` workflow, and offers that audit after ship-feature when a confirmed finding has dimension security or the spec has an authorization, personal-data or privacy NFR. The existing routes and their launch calls are unchanged.
- **Security tool differentiation.** `/deep-review` prints a one-line security-audit offer after its report (not with `--format=json`), and `security-scan`, the routing guide and USAGE-EXAMPLES section 10 explain how the quick scan, the security-auditor agent and the security-audit workflow differ.
- **Host-aware trust store and new-stack.** `--host claude|codex|cursor` on the stack-trust and new-stack scripts and the host-aware registry: each host keeps its own trust store, and the generated registry region of every workflow, `lib/stacks.js` and `lib/stacks.json` carries the host table. Without `--host` nothing changes.
- **Trust store guard.** `block-dangerous.sh` blocks shell writes to the Claude, Codex and Cursor trust stores; the paths are generated into a marked region. Under Claude it also refuses a subagent's quoted or escaped `--approve`, matches the store name and paths without regard to case, and treats a glob that matches the store file name as naming it. `verification-gates` pins the regenerated `trust-store.mjs` hash.
- **Hooks doc.** `hooks/README.md` documents the limits of the trust store guard.

### Changed

- **Strict YAML skill frontmatter.** Five descriptions with an unquoted `: `, one with an unquoted ` #`, and every unquoted `metadata:` value are quoted so strict YAML parsers accept the skills. The parsed strings are unchanged, so the catalog and the reference indexes do not change.

### Fixed

- **Commit-message hook reads the first `-m`.** `check-commit-msg.sh` checks the first line of the first `-m` or `--message` value, so a body passed as a second `-m` is no longer taken for the subject, and a multi-line message is checked by its first line.
- **Greenfield acceptance.** greenfield-build passes the architecture decisions to the scaffold, CI, slice and acceptance agents, and acceptance returns one evidence-backed `architectureChecks` entry per decision. The recommendation is computed from the evidence: a failed, missing or duplicate check, a failed journey step, no steps, or a broken link means `FIX-FIRST` even when the agent reports `resolved=true`. The CI step honours a local-only runner when the architecture picks one. The result adds `architecturePlanSound` and `architectureImplemented`; `architectureSound` now requires both. Contributed by Bogdan Konkevich.
- **Pinned URLs.** Plugin-mode template URLs in the docs name the current release.

## [3.1.0] - 2026-10-26

### Changed

- **1.x redirect stubs.** The 1.x redirect stubs stay in 3.1.0; removal is scheduled for a later release.
- **Core agent resolution order.** Workflows now try the qualified `sdd-kit:<name>` first and the bare name second for core agents; specialist order is unchanged.
- **Playwright prefixes.** `BROWSER_GUIDE` accepts both the project prefix `mcp__playwright__` and the plugin prefix `mcp__plugin_sdd-kit_playwright__`.
- **Next.js 16.** The ESLint gate falls back to `<pmx> eslint .` when the repo is on Next.js 16 or later and its lint script still calls `next lint`.
- **3.x docs.** The install, first-session, plugin-mode, team-marketplace, multi-repo and contributor docs, the guide and the Hireboard chapters describe the 3.x install (preset first, `--stack`).
- **Threat model.** `docs/stack-manifest.md` notes that repository-supplied settings `env` values sit outside the threat model.

### Added

- **Several frontends.** `args.repos` accepts an array of `{ path, role, url? }`; Visual and Acceptance run one browser pass per frontend, one at a time, and Visual skips a frontend with no changed UI. See `docs/multi-repo.md`.
- **Wrapper-aware gates.** A stack manifest can declare `execWrapper`, and gates can declare `requires` and `lintFix`.
- **Spec gates.** `spec-lint --gates` stops builds at an unchecked `Gate:` task; `open-pr` runs `spec-lint --verified` and warns on missing approval.
- **fix-bug checkpoint.** The regression test is committed and checked for changes before the verdict.
- **Published-path check.** `tools/dist/published-paths.txt` is verified by `tools/check-dist.sh`.
- **Installer.** Unowned files at staged paths are kept, and the five newest backups are retained.

### Fixed

- **Installer backup pruning.** Pruning `.claude/.framework-backups/` considers only `<stamp>` entries directly inside it, removes a symlinked entry as a link without following it, and stops the install before any change when the folder itself is a symlink, so it never writes or deletes files outside `.claude/`.
- **1.x upgrades.** A 1.x install has no manifest, so the unowned-file guard kept every 1.x kit file at a path 3.x still ships (stale hook scripts such as `token-budget.sh`). A file that matches a version a 1.x installer placed there (`src/scripts/kit-1x.sha256`, generated by `tools/gen-retired-hashes.sh`) is now backed up and replaced.
- **Trust check exit code.** `trust-store.mjs check` exits 2, the rejected code, for a manifest that is not valid JSON; an unreadable file still exits 1.
- **PreToolUse deny output.** `token-budget.sh`, `laravel-test-first.sh` and `nextjs-test-first.sh` now emit `hookSpecificOutput` with `permissionDecision: "deny"` instead of the top-level `decision: "block"`, the PreToolUse form documented at https://code.claude.com/docs/en/hooks (checked 2026-10-26). Exit codes and the `CLAUDE_SKIP_TEST_FIRST=1` bypass are unchanged.
- **framework-doctor mixed-mode check.** It now finds file-copy agents nested at `.claude/agents/<addon>/<agent>.md` that shadow an enabled plugin's agent, and warns when a kit hook script is wired both by an enabled plugin and in `.claude/settings.json`, with the `enabledPlugins` false fix. Sample headers show `v<version>` instead of `v2.0.0`.

## [3.0.0] - 2026-10-22

SDD Kit 3.0 makes the core stack-neutral. Laravel, Next.js and the dev-environment tooling move into add-on plugins that the installer and the preset bring back by default. See [Migrating from 2.x](#migrating-from-2x).

### Changed

- **Stack components moved into add-ons.** The Laravel agent, skills, rules, hooks and the contract-sync template now live in `sdd-kit-laravel`; the Next.js agent, skills (including TypeScript and Tailwind), rules and hooks in `sdd-kit-nextjs`; docker and ddev in the new `sdd-kit-devenv` add-on. The laravel-boost, ddev and vercel optional MCP entries and the php-lsp and typescript-lsp third-party entries moved with them. Skills keep their names, so `/laravel-12` and `/migrate-db` still resolve in file-copy installs.
- **Lint and test-first hooks** are now add-on scripts (`laravel-lint.sh`, `laravel-test-first.sh` and the Next.js pair) with the same patterns, matchers and messages. The git and CI hook scripts run per-stack fragments from `hooks/<stage>.d/`.
- **Stack manifests.** Stack data gains gate kinds, `unless` globs, markers, scaffold and CI fields. Teams can declare their own stack in `.claude/stacks/<name>.json`; unreviewed manifests do not run until `/stack-trust` approves them. See `docs/stack-manifest.md`.
- **Gate commands come from an allowlist.** Workflows run only the catalog gates of a kit stack, the gates of an approved overlay manifest, or, for an unrecognized stack, a gate template of the core `other` manifest proved by an evidence file and a script name. Detection, scaffold and contract-sync output only select among these. A repo whose stack comes from a rejected manifest reports its gates as not run. `/stack-trust` adds a fourth Read rule, `Read(~/.claude/plugins/cache/**)`, for installed plugins' manifests.
- Every manifest and the marketplace are at 3.0.0.

### Added

- **Preset `sdd-kit-laravel-nextjs`**: one plugin that depends on the core and the Laravel, Next.js and devenv add-ons.
- `install.sh --stack=LIST` and `--prune`, and install prompts for stacks and add-ons.
- `/new-stack` scaffolds a stack add-on or a project overlay; `/stack-trust` approves overlay manifests.
- A SessionStart hint (`scripts/stack-hint.sh`) that suggests the matching stack add-on once per project.
- `tools/spec-lint.mjs`, run by `/write-spec` and `/sdd` before approval, and a core neutrality check in `verify.sh`.

### Migrating from 2.x

**Plugin mode.** Install the preset to keep the 2.x behaviour: `/plugin install sdd-kit-laravel-nextjs@sdd-kit`. It installs the core plus the Laravel, Next.js and devenv add-ons. Or install only the add-ons you use (`sdd-kit-laravel`, `sdd-kit-nextjs`, `sdd-kit-devenv`). Skill and agent namespaces follow the plugin that ships them: `/sdd-kit-laravel:laravel-12` replaces `/sdd-kit:laravel-12`, and the specialist agents become `sdd-kit-laravel:laravel-backend-dev` and `sdd-kit-nextjs:nextjs-frontend-dev`. Plugin dependencies resolve in the Claude Code CLI; claude.ai and Cowork may not install dependencies automatically, so install each add-on by hand there. When a project matches a stack that has no add-on enabled, a SessionStart hint prints the install command once.

**File-copy mode.** Re-run `install.sh` from the new release; to name the stacks explicitly, run `install.sh --stack=laravel,nextjs`. With no `--stack`, it still installs the Laravel and Next.js add-ons; a fresh install adds devenv even when `--with` names other add-ons, so `--with=ops` installs laravel, nextjs, devenv and ops. The installer moves the stack agents, skills, rules and hooks to their add-on paths, retires the old paths, and backs up every file it overwrites or removes to `.claude/.framework-backups/<timestamp>/`. User-modified files are never deleted. A same-name agent guard drops the staged copy of an agent when a user agent with that name already exists and prints the fix. Old `lint-check.sh` and `test-first-check.sh` hook entries are removed from `settings.json`, so a stale copy cannot fire next to the add-on hooks; `/framework-doctor` reports leftovers that shadow a plugin add-on. On an upgrade, flags and prompt answers only add add-ons; `--prune` makes the installed set exactly the selection (stacks exactly `--stack`, non-stack add-ons exactly `--with`, or the installed ones when `--with` is omitted).

**Not run.** Plugin evals were not run for 3.0.0.

## [2.1.1] - 2026-10-21

### Changed

- **One interactive guide.** `docs/guide/index.html` is now the single guide, with every section on one page: primer, install, quickstart, route picker, routes map, pipeline, spec anatomy, hooks, workflows, the Hireboard example, spec board and the searchable catalog. A Cmd/Ctrl+K command palette searches sections, routes, workflows, skills, agents, Hireboard chapters and example specs. The page shows the kit version, and `verify.sh` fails when it differs from `VERSION`.
- `field-guide.html`, `flow-map.html` and `terminal.html` are redirect stubs that keep old deep links working, including the terminal's command aliases. The README embeds the new desktop screenshot.
- **Markdown pages on the published site.** Every Markdown file the site serves (the Hireboard chapters and artifacts, the reference docs, and now Getting started, Installation and Usage examples) also gets an HTML page in the guide's styles, with light and dark themes and working heading anchors. Links between site pages open those pages; folders without a README open on GitHub.

## [2.1.0] - 2026-10-20

### Changed

- **The self-extracting installer is removed.** `build.sh` no longer writes `dist/claude-framework-installer.sh`. Use `install.sh` from a clone of the distribution repo, or `npx`. Plugin archive names are unchanged.
- **Stack data now has one hand-edited source.** Edit `src/plugins/<stack>/stack.json` (or `tools/stacks/runtime.template.js` for shared code) and run `node tools/gen-stacks.mjs`; it writes `src/workflows/lib/stacks.js` and the registry region of the six workflows. `verify.sh` runs the generator in `--check` mode, and `build.sh` regenerates before verifying. `install.sh` derives its add-on list from `src/plugins/*/.claude-plugin/plugin.json`. Behaviour matches 2.0.1 except for the deviations below.
- DV-1: a workflow logs one line when a specialist agent cannot be resolved and falls back to the default agent.
- DV-2: ship-feature contract-sync omits the route-list sentence for backends without a route-list command.
- DV-3: add-ons are listed alphabetically in `install.sh` help and error messages.

### Added

- **Separate distribution repo (2.1.0).** Releases are published to the public repo `stasmarkov/sdd-kit` by CI. The interactive guide and the Hireboard worked example ship in that repo's `docs/` folder, served by GitHub Pages at <https://stasmarkov.github.io/sdd-kit/>. `build.sh --dist DIR` writes the distribution tree locally; CONTRIBUTING documents the signed-tag release flow, owner setup and recovery.
- **Tag-triggered release workflow** (`.github/workflows/release.yml`) with `tools/release/check-tag.sh`, `changelog-excerpt.sh` and `publish-dist.mjs`: a verified tag builds and validates the dist tree, then publishes one Verified commit, tags and a GitHub Release to the distribution repo through the GitHub API.
- **`stack-registry-job-board` eval** (`evals/stack-registry-job-board/`): runs the `fix-bug` workflow on the job-board `api/` + `web/` artifacts and checks that Detect reports a split Laravel + Next.js workspace, that no specialist falls back to the default agent, that a Laravel or Next.js specialist completes, and that unreachable gates are not reported as passed. It needs `--allow-tools Workflow` (see `docs/evals.md`).

## [2.0.1] - 2026-10-20

### Changed

- **Stop hook decides on evidence, not on pending work.** It blocks only when the final message claims work is complete or verified and the transcript contradicts it. It always allows stopping on a re-check, after answering a question, when the remaining items are offers waiting for the user, or when work is delegated to background agents or workflows, and it never asks Claude to restate its answer. Re-running the installer replaces the old wording instead of adding a second prompt.

### Added

- **Gate-weakening guard** (`scripts/gate-guard.sh`, PostToolUse Write|Edit): warns, without blocking, when an edit adds `@ts-ignore`/`@ts-expect-error`, `eslint-disable`, `@phpstan-ignore`, skipped or focused tests, static-analysis baseline entries, or coverage-threshold changes, and asks Claude to fix the cause or get explicit consent.
- **Lesson nudge** (`scripts/lesson-nudge.sh`, Stop): when a user correction, a CHANGES_REQUIRED/BLOCKED verdict, a NOT-RESOLVED fix, or a fix-bug Prevention item appears, records a candidate in `.ai/session/lessons.jsonl` and suggests `/learn`. Pending candidates survive compaction (`pre-compact-save.sh`, `post-compact-context.sh`), and `/learn` offers them and marks them captured or dismissed.

### Fixed

- `post-compact-context.sh` exited with an error (and re-injected nothing) when `.ai/session/` existed without a spec state file.

## [2.0.0] - 2026-10-18

The framework becomes **SDD Kit for Laravel + Next.js**: a spec-driven toolkit with a single entry point, `/sdd`. Commands are now skills with flat names, the agent roster is merged and slimmed, operations/iOS/Drupal/design move to optional add-on plugins, and the knowledge graph is retired in favour of Claude Code's built-in memory. `install.sh` becomes the only install path and upgrades in place, removing what 2.0 no longer ships. See [Migrating from 1.x](#migrating-from-1x) before upgrading.

### Breaking changes

- **Plugin renamed `claude-laravel-nextjs` → `sdd-kit`.** Plugin names starting with `claude-` are reserved and fail `claude plugin validate`. In plugin mode skills are namespaced `/sdd-kit:<skill>`; add-ons are `sdd-kit-ops`, `sdd-kit-ios`, `sdd-kit-drupal`, `sdd-kit-design`; the marketplace and build archives follow the new names.
- **Commands are skills.** Namespaced commands (`/upstream:…`, `/quality:…`, `/workflow:…`) become flat skill names; several were renamed and the workflow front doors fold into `/sdd`. The old names remain for this release only, as manual-only redirect stubs.
- **Agents merged or moved.** Several agents were folded into others, removed, or moved to add-on plugins. Anything that spawns them by name must be updated.
- **Knowledge graph retired.** The KG MCP server, its agents, hook, command, templates, and `knowledge-graph.jsonl` are gone. Memory is Claude Code auto memory plus agent memory (`memory: project`).
- **Ops, iOS, Drupal, and design are opt-in add-ons.** `/deploy`, `/rollback`, `/feature-flag`, `/health-check`, `/incident`, the ops agents, the iOS and Drupal skills, and `/design-ui` are no longer in core. Install them with `--with=…` or from the marketplace.
- **New spec folder naming.** New specs are `.ai/specs/spec-<TICKET>-<slug>/` or `.ai/specs/spec-<YYYYMMDD-HHMM>-<slug>/` instead of `<id>-<date>-<slug>`. Numeric 1.x ids still resolve.
- **MCP defaults trimmed.** The generated `.mcp.json` ships only `context7` and Playwright MCP; other servers are opt-in (see Changed).

### Added

- **Playwright MCP built in.** `@playwright/mcp` (pinned, headless, isolated profile) ships in the plugin and every generated `.mcp.json`. All six workflows give their Reproduce, Visual, and Acceptance steps the same browser instructions through the shared registry: Playwright MCP first, Claude in Chrome as a fallback, and an explicit "not run" when no browser is available. Web stacks list Playwright as a quality gate, and `ship-feature` turns the acceptance walk into a Playwright regression test.
- **Worked example: Hireboard** (`docs/examples/job-board/`): a 12-chapter, from-scratch Laravel 12 API + Next.js 15 job board built with the kit, exercising every `/sdd` route; artifacts include specs, an ADR, and code that was compiled and tested in freshly scaffolded apps (57 Pest tests, Next.js production build).
- **Interactive guide** (`docs/guide/`): three offline HTML variants — terminal, field guide, flow map — rendered from hand-written how-to data, a catalog generated from frontmatter, and example data generated from the worked example by `tools/gen-guide-example.mjs` (`verify.sh` keeps both current). It includes a primer for people new to Claude Code, the "after `/sdd`" command set (continue, check, finish), an interactive Hireboard walkthrough, and a spec-board view of the example's specs with a static export (`docs/guide/example-board.html`).
- **Guide example walkthrough and spec board views:** every guide variant steps through the twelve Hireboard chapters (route, commands, and specs per chapter, with deep links) and shows the example's specs as a spec board with status columns, approval details, open questions, and acceptance-criteria traceability per spec (the `hireboard`, `chapter`, and `board` commands in the terminal variant; the Example and Spec board sections in the field guide and flow map). Both views read `docs/guide/example-data.js`, generated from the example's artifacts, and work offline.
- **npx launcher** (`package.json`, `cli/`): `npx github:stasmarkov/sdd-kit spec-board` runs the spec board straight from GitHub, without Claude Code or a clone (`--serve`, `--out <file>`, `--json`, spec folders as arguments; `#v2.0.0` pins a release). The same launcher runs the installer (`... install --project`, every `install.sh` flag) and opens the guide (`... guide`, or `... guide board` for the example board). It needs Node 18+; the package is not published to npm.
- **`LICENSE`** file (MIT), which the manifests already declared.
- **`/sdd <ticket-id | description>` — single entry point for spec-driven work** (`src/skills/sdd/`). Classifies the request and routes it: trivial → `/simple-task`, bug → `fix-bug` workflow, decision → `tech-research` workflow (ADR), feature → `/write-spec` → human approval → `ship-feature`, shipped code → `qa-and-docs`, new app → `greenfield-build`. It confirms the route, collects every workflow input up front, records approval in the spec, offers (never silently) to post the spec link to the ticket, and never builds an unapproved spec.
- **Optional add-on plugins** under `src/plugins/<name>/`, each with its own manifest and marketplace entry: `sdd-kit-ops` (deploy, rollback, feature flags, health checks, incidents, and the ops agents including the new `ops-analyst`), `sdd-kit-ios` (`ios-native` and `swift-testing` skills, `ios-mobile-dev` agent; SwiftUI code templates live in `ios-native/assets/templates`), `sdd-kit-drupal` (`drupal-11` skill), `sdd-kit-design` (`/design-ui`, `ui-ux-advisor`). Marketplace: `.claude-plugin/marketplace.json`; guides: `docs/plugin-mode.md`, `docs/team-marketplace.md`.
- **Data-driven stack registry** (`src/workflows/lib/stacks.js`), inlined into all six workflows between registry markers. The schema `stack` enum, specialist-agent map, Detect catalog, and debug scan derive from it; iOS/Swift is the first stack added this way. `verify.sh` fails when an inlined copy drifts.
- **Model tiers with explicit effort.** Workflow phases name a `deep` / `standard` / `light` tier; `MODEL_TIERS` in the registry maps each tier to a model and an effort level, and every `agent()` call receives both explicitly. Teams pin full model IDs in the map or per run via `args.models`. Guidance lives in `docs/effort-guidelines.md`.
- **Spec system upgrades** (`src/templates/specs/specification-system.md`):
  - IDs come from the ticket key or a timestamp and are created atomically (never "highest + 1"); references resolve by folder, number, ticket key, or timestamp and list candidates when ambiguous.
  - `spec-lite.md` frontmatter: `id`, `title`, `type`, `size`, `priority`, `status`, `ticket`, `stakeholders`, `approved_by`, `approved_at`, `created`, `stacks`.
  - New sections: Must NOT change, EARS / Given-When-Then acceptance criteria with a traceability table, Boundaries (Always / Ask first / Never), Open questions.
  - Proportionality: XS gets no spec, S gets spec-lite + tasks, M/L the full set. A fresh-context clarity gate lists hidden assumptions; a spec is ready only when they are resolved.
- **`ship-feature` Converge phase** — audits code against the spec, appends gap tasks, and rebuilds (at most two audits). The pipeline is now Detect → Investigate → Spec → Build → Gates → Converge → Visual → Review → Acceptance → Docs → TestPlan → Report, and it refuses draft specs.
- **`fix-bug` must-not-change guards** — protected behaviours are covered by tests the fix may not edit.
- **`/deep-review --depth=quick|standard|adversarial`**, with references for both review styles.
- **Third-party manifest** (`src/settings/third-party.json`, `docs/third-party.md`): recommended skills and plugins with source, license, pinned commit, and risk notes. `install.sh --third-party` (or `install-third-party.sh`) installs only pinned entries with the upstream LICENSE; unlicensed entries are listed but never installed, and plugins are printed as commands rather than auto-installed. `verify.sh` enforces pins and forbids vendoring.
- **Project templates:** `src/templates/AGENTS.template.md` (cross-tool core instructions, imported by `CLAUDE.template.md`), path-scoped `.claude/rules/` templates (`src/templates/rules/`: tests, migrations, API controllers, frontend pages, services/DTOs), and a multi-repo workspace template and guide (`src/templates/multi-repo/CLAUDE.md`, `docs/multi-repo.md`).
- **Evals** (`evals/`, `docs/evals.md`) for `claude plugin eval`: write-spec EARS criteria, a seeded off-by-one fix, planted review defects, `/sdd` routing, and answer-first Q&A without creating a spec.
- **Contract-sync checker** template (`src/templates/contract-sync/`): compares Laravel routes against a BFF registry or OpenAPI document.
- **Spec-aware status line** (`scripts/statusline.sh`) and a **stakeholder output style** (`src/output-styles/stakeholder.md`), shipped in the plugin and set up by file-copy installs.
- **Generated indexes:** `docs/reference/skills.md`, `docs/reference/agents.md`, and the guide catalog are produced by `tools/gen-indexes.py`, which also validates frontmatter keys; `verify.sh` fails when they are stale.
- **`/product-brief`** (upstream): turns an idea or raw feedback into `product-brief.md` (problem, users and roles, MVP scope, non-goals, numbered draft business rules `BR-nn`, success metrics, open questions) and a dependency-ordered `backlog.md` of vertical slices (`SL-nn`, sized XS–L, citing BR ids, each ending in a ready `/sdd` call). `--revise` edits in place without renumbering; `--intake` folds feedback into the backlog without reordering approved slices. `/sdd`'s new-app route offers it first, `greenfield-build` reads it as the constitution, and `/spec-board` shows its slices.
- **`nextjs-testing`** (frameworks, background knowledge): Vitest + React Testing Library, MSW mocks built from the Laravel response envelope, Server Action and Route Handler tests, and Playwright journeys against a seeded Laravel e2e database; tests are named after AC ids for traceability. Preloaded by `test-writer`, auto-activated on `*.test.ts(x)` and `e2e/*.spec.ts`.
- **`/fix-ci`** (execution): reads the failing CI job (`gh pr checks`, `gh run view --log-failed`) or local output, maps the step to its gate, reproduces it with the lockfile's package manager, applies the minimal fix, and re-runs the gates. Never pushes; suppressions, skips, baselines, and lowered thresholds need explicit confirmation. A test that shows wrong behaviour goes to the `/sdd` bug route.
- **`/learn`** (workflow): turns one mistake into the cheapest durable guard for its class (regression or architecture test, PHPStan/ESLint rule, path-scoped rule line, or a CLAUDE.md GOTCHA/INV entry), deduped against what exists, shown as a diff, and written only after approval. Fed by fix-bug's Prevention section, recurring `/deep-review` findings, `/fix-ci`, and incident postmortems.
- **`/open-pr`** (release): one spec-traced PR per changed repo, backend first and cross-linked; checks spec status, gates, and the deep-review verdict, builds the body from the spec (acceptance criteria mapped to tests, Must-NOT-change guards, manual test plan, ADR link), uses a conventional-commit title and `feature|fix/<ticket>-<slug>` branches, and shows the push and `gh pr create` commands before running them. `ship-feature`, `fix-bug`, `/execute-task`, and `/deep-review` hand off to it.
- `/framework-doctor` checks that hooks are wired in `settings.json` and actually fire (it pipes a harmless payload into `block-dangerous.sh`), plus flat skills, manifest drift, workflow name collisions, settings leftovers, permission-rule sprawl, and memory contradictions.

### Changed

- **`install.sh` is the single install path:** `./install.sh [--project|--user] [--minimal|--full] [--with=ops,ios,drupal,design] [--third-party] [--dry-run] [--yes]`. It stages the tree, shows added / updated / removed files (`--dry-run` writes nothing), merges into `.claude/` without touching files it does not own, records what it installed in `.framework-manifest`, removes files 2.0 no longer ships (including a retired-path list for 1.x upgrades), and keeps only the latest backup in `.claude/.framework-backups/`. Project installs also create `CLAUDE.md`, `AGENTS.md`, and `.claude/rules/` from templates when absent, and both modes set the spec-aware status line when none is configured.
- **`build.sh`** produces a self-extracting installer that bundles the sources and runs `install.sh`, plus one plugin archive per plugin (`sdd-kit-plugin-<version>.tar.gz`, `sdd-kit-<addon>-plugin-<version>.tar.gz`). `dist/` is not committed; release artifacts belong on GitHub Releases.
- **Skills use official frontmatter only** (custom keys under `metadata:`), `Agent` replaces `Task` in tool lists, and side-effect skills (`migrate-db`, `upgrade-deps`, `deploy`, `rollback`, `feature-flag`, `sync-obsidian`) set `disable-model-invocation`.
- **Agents slimmed:** every agent is at most 250 lines (`verify.sh` enforces it); long examples moved to skill references or were dropped as duplicates. Codebase-specific agents use `memory: project`. `api-architect` and `requirements-analyst` run as subagents and never ask the user: they return open questions, each with the assumption they used.
- **`CLAUDE.template.md`** stays under 200 lines and imports `@AGENTS.md`.
- **MCP:** the generated `.mcp.json` ships `context7` and Playwright MCP (pinned `@playwright/mcp`, `--headless --isolated`) and is merged into an existing file instead of overwriting it; user installs print both `claude mcp add --scope user` commands instead of writing `~/.mcp.json`. `src/mcp-configs/development.json` lists optional servers (PhpStorm SSE, Serena, laravel-boost, GitHub over HTTP, DDEV, Obsidian, sequential-thinking) and uses `${VAR}` instead of `${env:VAR}`. Browser steps use Playwright MCP, with Claude in Chrome as the fallback; browsermcp is removed.
- **Headless review pipeline** (`scripts/review/review.sh`) builds its `claude -p` flags in one helper: per-call tool allowlists, `--permission-mode dontAsk`, `--strict-mcp-config`, `--no-session-persistence`, `--max-budget-usd` (`REVIEW_MAX_BUDGET_USD`), and `--bare` when `ANTHROPIC_API_KEY` is set.
- `/execute-task --auto-continue` points to the built-in `/goal` for "keep going until the spec is done".
- `verify.sh` validates frontmatter, generated indexes, registry sync, hooks drift between `hooks/hooks.json` and `settings.template.json`, manifest versions across all plugins, and the third-party manifest.
- **README and docs rewritten for newcomers.** The README starts with what the repo contains and a "New to Claude Code? Start here" path from installing Claude Code to the first `/sdd` and presents the everyday commands as `/sdd` plus a short "after `/sdd`" set: `/execute-task --continue`, `/deep-review`, `/run-tests`, `/progress`, `/investigate`, `/open-pr`, `/learn`, `/spec-board`. `GETTING-STARTED.md` gains a "New to Claude Code?" section and an "After /sdd" section; `INSTALLATION.md` covers npx, the Playwright browser requirement, and the 1.x renames; plugin, multi-repo, third-party, evals, review-pipeline, and contributing docs were brought up to date, and duplicate docs (`scripts/review/USAGE.md`, `docs/talk/slides-prompts.md`) were folded in or removed. This release targets Laravel + Next.js; other stacks and an install-time stack prompt are on the roadmap.
- **Talk updates** (`docs/talk/`): the article, slides, and demo script reflect 2.0: pruned and merged components, Playwright MCP as a default server, the spec board (new article section and slide, optional demo), the "after `/sdd`" command set, workflow phase lists including Detect and Report, and a Try It section. The demo script rebuilds the Hireboard example from its artifacts and puts its HIRE-9 bug back for the bug-fix demo; the demos are recorded and played back.
- `docs/effort-guidelines.md` replaces its hardcoded model/price table with links and documents aliases vs. full-ID pinning.
- **Stack registry: Next.js gates and package managers.** Next.js gates are ESLint, `tsc`, `next build`, Vitest and Playwright; Detect records the package manager from the lockfile (pnpm, yarn, bun, npm) and gate commands use it instead of hardcoded `npm`/`npx`. `verification-gates` matches the registry and adds the ESLint and build gates.
- **`code-quality` is the single gate runner** (absorbs `test-runner`): it runs every applicable gate per repo, auto-fixes formatter-class issues only, never weakens a gate, and has a cleanup mode that reports dead code with evidence. `/execute-task` uses it for its one verification step (or runs `verification-gates` inline when the agent is not installed) and ends with `/deep-review`, then `/open-pr`.
- **`ship-feature`:** contract-sync runs as a gate when split repos have it installed; browser acceptance writes and runs an `e2e/<spec>.spec.ts` Playwright test traced to AC ids (`args.e2e`, default on with a `playwright.config.*`); the report is saved to `.ai/reports/ship-<spec>-<timestamp>.md` in the spec's repo (`reportPath`) and ends with `Next: /open-pr --spec=<id> --report=<reportPath>`, so `/open-pr` reuses its gate results and verdict; quality attributes (`NFR-n`) are built against, audited in Converge, and checked in Acceptance like ACs; a `type: refactor` spec builds green-first (characterization tests pass on today's code, no RED step).
- **`fix-bug`:** a slowness report is reproduced as a measured baseline and target; the report adds a Prevention section (bug class and the guard that would catch it, proposed only), is saved to `.ai/reports/fix-<ticket or slug>-<timestamp>.md` (`reportPath`), and hands off to `/open-pr --report=<reportPath>` and `/learn`.
- **`greenfield-build`:** reads `product-brief.md` as its constitution (`args.brief`), decides architecture with `api-architect`, scaffolds working gate tooling (Pest, Larastan, Pint; ESLint, tsc, Vitest, `next build`, Playwright) plus contract-sync for split repos and stops if an applicable gate cannot run (returning the architecture, first slice, and a ship-feature call to finish it), adds CI through `devops-engineer`, and appends the next slices to `backlog.md`.
- **`/sdd`:** one trivial threshold (about three files, as in `write-spec` XS); red CI goes to `/fix-ci`; the new-app route offers `/product-brief` first; hand-offs list `/open-pr` and `/learn`. The routing guide gains a lifecycle table ("Beyond the six routes").
- **`/spec-board`** adds a Backlog column fed from `backlog.md`; **`/progress`** is rebuilt on data that exists (tasks, spec frontmatter, session state, git) and gains `--health`; **`/write-docs`** gains `--import` and `--audit` and writes to the paths `CLAUDE.md` loads; **`/changelog --release <version>`** checks release readiness, suggests the semver bump, and proposes the tag (now user-invoked only).
- **Product brief drives the specs:** `write-spec`, `create-spec`, and `ship-feature` read `product-brief.md` (current folder or its parent), cite the slice's BR ids in the spec (`slice`, `brs` frontmatter; `AC-n (BR-nn)`), carry draft rules as unchecked assumptions so the spec cannot be approved unvalidated, and move the backlog slice to `specced`; ship-feature and `/execute-task` mark it `shipped` with the spec.
- **`write-spec`:** `--type=refactor` (must-not-change is the contract, characterization tests first and green, which `/execute-task` and ship-feature honor; `/sdd` routes behavior-preserving refactors here), an optional Quality attributes section (`NFR-n`: authorization per role, p95 budget, WCAG level, personal data) traced like ACs in tasks.md, `/execute-task`, ship-feature, `/spec-board`, and `/open-pr`, and an optional Rollout section (flag, deploy order, rollback) required for L specs, migrations, and public API contract changes.
- **`--minimal` covers the main path:** it adds `product-brief`, `deep-review`, `nextjs-frontend-dev`, `requirements-analyst`, `adversarial-reviewer`, `security-auditor`, and the stack skills these agents preload, so every hand-off from `/sdd` to `/open-pr` resolves.
- **Docs and rules:** `/run-tests --frontend` (Vitest) and `--e2e` (Playwright, one E2E convention: `playwright.config` `webServer` and `e2e/db.setup.ts` own an isolated `APP_ENV=e2e` environment); `/security-scan --dependencies` is the one read-only dependency audit (advisories, outdated, unused) behind `/progress --health`, `/changelog --release`, and `/upgrade-deps --audit-only`; `verification-gates` owns the package-manager rule the other skills point to; `test-writer` covers Vitest and Playwright and names RED tests with AC ids; Server Actions and Route Handlers must re-check the session and role (`frontend-pages` rule, `/security-scan`); one money rule (integer minor units plus a currency column) in `schema-first` and `laravel-migration-coordinator`; `design-schema` writes `docs/schemas/{table}.md`; `generate` points at the skill asset templates with `App\Services` / `App\DTOs` / `App\Repositories`; `observability` adds request-id correlation from Next.js to Laravel; `/incident` uses the postmortem and runbook templates and hands off to `/sdd` and `/learn`.

### Removed

- **Knowledge graph:** the KG MCP server from default configs, `knowledge-graph-manager` and `learning-extractor` agents, the `kg-capture` hook, `/workflow:update-knowledge-graph`, KG templates and guides, and `init-knowledge-graph.js`.
- **Agents:** `api-dev`, `integration-dev`, `database-dev`, `monitor`, `log-analyst`, `support-analyst`, `code-reviewer` (merged or removed; see the migration table).
- **Workflow front-door commands** (`/execution:ship-feature`, `/execution:fix-bug`, `/quality:qa-and-docs`, `/upstream:tech-research`, `/execution:greenfield-build`): use `/sdd`, or run the workflow directly by name.
- Unknown plugin manifest fields: `components` in `plugin.json` and `recommended` in `marketplace.json` (ignored at load). Discovery uses the root symlinks; recommended plugins moved to the third-party manifest.
- **Duplicated, superseded, or vendored components** (content worth keeping was merged into the replacement first):

  | Removed | Replacement |
  |---------|-------------|
  | `kanban` skill (`.ai/kanban.json`) | `/spec-board`, which now has a Backlog column fed from `backlog.md` |
  | `project-status` skill | `/progress --health` (delegates to `/lint`, `/run-tests`, `/security-scan --dependencies`) |
  | `getting-started` skill | `src/docs/GETTING-STARTED.md` and `/framework-doctor` |
  | `add-context` skill | `/write-docs --import <file\|url>` |
  | `analyze-docs` skill | `/write-docs --audit` |
  | `obsidian-sync` skill | `/sync-obsidian` (verified content only) |
  | `stripe-best-practices`, `upgrade-stripe`, `stripe-projects` skills | Stripe's own published skills (`github.com/stripe/ai`, MIT): `install.sh --third-party` installs `stripe-best-practices` and `upgrade-stripe` from a pinned commit; `stripe-projects` is a manual install (`docs/third-party.md`) |
  | `skill-creator` skill | Anthropic's `skill-creator` plugin, listed in the third-party manifest |
  | `prompt-engineering-patterns` skill | None (outside the kit's scope) |
  | `intake-processor` agent | `requirements-analyst` (clarity score, question rules) and `/product-brief --intake` |
  | `pattern-discoverer` agent | `code-explorer` (feature-completeness checklist) |
  | `context-fetcher` agent | None (a subagent cannot see the main context) |
  | `dependency-analyzer` agent | `/product-brief` (slice ordering, blockers), `/upgrade-deps`, `/security-scan`, `code-explorer` |
  | `tech-researcher` agent | `tech-research` workflow and `/investigate` |
  | `system-architect` agent | `api-architect` (with `architecture-patterns/references/technology-selection.md`) |
  | `test-runner` agent | `code-quality` (single gate runner) and `/run-tests` |
  | `git-workflow` agent | `/open-pr` (branch, commit, and PR body conventions) |
  | `release-manager` agent (ops add-on) | `/changelog --release <version>`, then `/deploy` |
  | `src/templates/code/` | Identical copies live in `laravel-12/assets/templates`, `nextjs-15/assets/templates`, and `laravel-12/references/module-scaffolding.md` |
  | `src/templates/context/workflow.template.md` | None: nothing generated `docs/context/workflow.md` any more; the Golden Triangle is business rules, architecture, and API contracts |
  | `src/plugins/ios/templates/` | Identical copies in `ios-native/assets/templates` |
  | Unused spec templates (`feature`, `epic`, `user-story`, `requirements`, `code-review-checklist`, `execute-task-workflow`) | `write-spec` templates (NFR table now in spec-lite), `product-brief` assets, `specification-system.md`; `feature-flag-doc` moved to the ops `feature-flag` skill |

### Fixed

- **Hooks now install in file-copy mode.** `install.sh` and the built installer merge the framework hooks into an existing `settings.json` (backed up first) instead of skipping it, preserving permissions and user-defined hooks. Re-running is idempotent, and the retired `kg-capture` hook is stripped. Shared logic lives in `src/scripts/install-hooks.sh` (requires `jq`).
- `settings.template.json` carried only 8 of 17 hooks; it now mirrors `hooks/hooks.json`, and `verify.sh` fails the build if they drift.
- User-level installs point hook commands at `$HOME/.claude/scripts/` (was `$CLAUDE_PROJECT_DIR/.claude/scripts/`, which does not exist in most projects).
- Project installs carry `settings.json` / `settings.local.json` forward from the backed-up `.claude/`.
- The built installer now copies hook scripts into `.claude/scripts/`.
- `--minimal` install crashed on a moved agent template path.
- `block-dangerous.sh` silently allowed `rm -rf /` on macOS (grep rejected an empty regex alternative) and over-blocked any `rm` of an absolute path on GNU grep.
- Plugin hook commands quote `"${CLAUDE_PLUGIN_ROOT}"`, so install paths containing spaces work.
- `/framework-doctor` looked at `settings/settings.json`, a file Claude Code never reads.
- Project installs create `AGENTS.md`, which `CLAUDE.template.md` imports.
- The Notification hook read its message from arguments, so it always showed generic text; it now reads Claude Code's stdin JSON and passes text to AppleScript as arguments (quotes in messages no longer break it).
- The agent and skill indexes moved to `docs/reference/`: inside `agents/`, Claude Code parsed the index as an agent definition without frontmatter. Upgrades remove the old `agents/all-agents.md`.
- The core plugin ships its output styles (root `output-styles/`), and every built plugin archive passes `claude plugin validate` without warnings.
- **Plugin mode exposed none of the skills.** Claude Code discovers skills one level deep, and the source kept them in category folders, so plugin users saw only the workflows (this also affected 1.x plugin releases). Skills and agents are now flat (`src/skills/<name>/`, `src/agents/<name>.md`, categories in `src/categories.json`), and upgrades remove the old nested agent files.
- Workflows resolve specialist agents in both install modes: bare names (file copy), then `sdd-kit:<name>` (plugin), then the default agent.
- `claude --plugin-dir <checkout>` now finds the workflows through a root `workflows` symlink, matching the built plugin archive.
- Repository URLs point at the correct GitHub owner (manifests and docs had a mistyped owner).

### Migrating from 1.x

#### Commands

Old namespaced commands still work in 2.0 as manual-only redirect stubs (`src/commands/**`). **The stubs are removed in the next minor release**; update scripts, docs, and habits now. Full list of current skills: [`docs/reference/skills.md`](docs/reference/skills.md). In plugin mode, prefix with the plugin name (`/sdd-kit:write-spec`, `/sdd-kit-ops:deploy`).

| 1.x | 2.0 |
|-----|-----|
| `/upstream:create-spec` | `/write-spec` |
| `/upstream:research-spec` | `/write-spec --background` (runs the `create-spec` workflow) |
| `/upstream:tech-research` | `/sdd` (or `/tech-research` directly) |
| `/execution:ship-feature` | `/sdd` (or `/ship-feature` directly) |
| `/execution:fix-bug` | `/sdd` (or `/fix-bug` directly) |
| `/execution:greenfield-build` | `/sdd` (or `/greenfield-build` directly) |
| `/quality:qa-and-docs` | `/sdd` (or `/qa-and-docs` directly) |
| `/quality:code-review` | `/deep-review --depth=standard` |
| `/quality:deep-review` | `/deep-review` |
| `/quality:test` | `/run-tests` |
| `/workflow:status` | `/progress --health` |
| `/workflow:doctor` | `/framework-doctor` |
| `/workflow:update-knowledge-graph` | Removed (knowledge graph retired) |
| `/execution:execute-task`, `/execution:simple-task`, `/execution:generate`, `/execution:migrate-db` | `/execute-task`, `/simple-task`, `/generate`, `/migrate-db` |
| `/discovery:investigate` | `/investigate` |
| `/discovery:analyze-docs` | `/write-docs --audit` |
| `/design:design-api`, `/design:design-schema` | `/design-api`, `/design-schema` |
| `/design:design-ui` | `/design-ui` (design add-on) |
| `/quality:grade`, `/quality:lint`, `/quality:security-scan`, `/quality:upgrade-deps` | `/grade`, `/lint`, `/security-scan`, `/upgrade-deps` |
| `/release:changelog` | `/changelog` |
| `/release:deploy`, `/release:rollback`, `/release:feature-flag` | `/deploy`, `/rollback`, `/feature-flag` (ops add-on) |
| `/operations:health-check`, `/operations:incident` | `/health-check`, `/incident` (ops add-on) |
| `/workflow:progress`, `/workflow:sync-obsidian`, `/workflow:write-docs` | `/progress`, `/sync-obsidian`, `/write-docs` |
| `/workflow:add-context` | `/write-docs --import` |
| `/workflow:getting-started` | `/framework-doctor`, then `GETTING-STARTED.md` |
| `/workflow:kanban` | `/spec-board` |

#### Skills

Skills and templates that a 1.x release shipped and 2.0 removes (details in [Removed](#removed), which also lists components added and removed again during the 2.0 cycle):

| 1.x | 2.0 |
|-----|-----|
| `obsidian-sync` | `/sync-obsidian` |
| `stripe-best-practices`, `upgrade-stripe`, `stripe-projects` | Stripe's published skills: `install.sh --project --third-party` installs `stripe-best-practices` and `upgrade-stripe` (pinned in `src/settings/third-party.json`); `stripe-projects` is installed by hand (`docs/third-party.md`) |
| `skill-creator` | Anthropic's `skill-creator` plugin (third-party manifest) |
| `prompt-engineering-patterns` | Removed (outside the kit's scope) |
| `src/templates/code/*` | `laravel-12/assets/templates/`, `nextjs-15/assets/templates/`, used by `/generate` |
| `src/templates/specs/{feature,epic,user-story,requirements,code-review-checklist}.template.md`, `execute-task-workflow.md` | `write-spec` templates, `product-brief` assets, `specification-system.md` |
| `src/templates/specs/feature-flag-doc.template.md` | `feature-flag/references/flag-doc.template.md` (ops add-on) |
| `src/templates/context/workflow.template.md` | None: the Golden Triangle is business rules, architecture, and API contracts (`templates/context/golden-triangle.md`); the process lives in `/sdd` and `AGENTS.md` |
| `src/templates/commands/_templates/command.template.md` | `src/templates/skills/_templates/` (commands became skills) |
| `src/templates/knowledge-graph/*` | Removed (knowledge graph retired) |
| `drupal-11` (core in 1.x) | `drupal-11` in the drupal add-on (`--with=drupal`) |

#### Agents

Full list of current agents: [`docs/reference/agents.md`](docs/reference/agents.md).

| 1.x | 2.0 |
|-----|-----|
| `api-dev` | `laravel-backend-dev` |
| `integration-dev` | `laravel-backend-dev` |
| `database-dev` | `database-designer` |
| `monitor`, `log-analyst`, `support-analyst` | `ops-analyst` (ops add-on) |
| `code-reviewer` | Removed; `/deep-review` uses `adversarial-reviewer` |
| `deployment-specialist`, `rollback-specialist`, `incident-responder` | Same names, ops add-on |
| `release-manager` | `/changelog --release <version>`, then `/deploy` (ops add-on) |
| `intake-processor` | `requirements-analyst`, `/product-brief --intake` |
| `pattern-discoverer` | `code-explorer` |
| `system-architect` | `api-architect` |
| `test-runner` | `code-quality` |
| `git-workflow` | `/open-pr` |
| `tech-researcher` | `tech-research` workflow, `/investigate` |
| `context-fetcher` | Removed (a subagent cannot see the main context) |
| `dependency-analyzer` | `/product-brief` (slice ordering, blockers), `/upgrade-deps`, `/security-scan`, `code-explorer` |
| `ui-ux-advisor` | Same name, design add-on |
| `knowledge-graph-manager`, `learning-extractor` | Removed (knowledge graph retired) |

#### Plugin rename

The plugin is now `sdd-kit` (was `claude-laravel-nextjs`) because names starting with `claude-` are reserved and fail `claude plugin validate`. Uninstall the old plugin, then install under the new name:

```bash
/plugin marketplace add stasmarkov/sdd-kit
/plugin install sdd-kit@sdd-kit
```

Add-ons install the same way (`sdd-kit-ops@sdd-kit`, …). Skill invocations in plugin mode change from `/claude-laravel-nextjs:…` to `/sdd-kit:…`.

#### Knowledge graph removal

Project memory now lives in Claude Code auto memory and agent memory; nothing needs migrating. Delete locally:

- `.claude/knowledge-graph.jsonl` (or wherever your project kept `knowledge-graph.jsonl`)
- the `knowledge-graph` server entry in your project `.mcp.json` (and in user-level MCP config if you added it there)

#### Imported context and kanban cards

- Files imported by 1.x `/workflow:add-context` under `.claude/context/{business,architecture,workflow}/` are no longer read (their readers, `context-fetcher` and the knowledge graph, are gone). Run `/write-docs --import .claude/context/<dir>/<file> --as=business|architecture|api` for each, then delete the folder. `/framework-doctor` warns while it exists.
- In a 1.x `.ai/kanban.json`, drop DONE / IN_PROGRESS / REVIEW cards that have no spec and migrate only BACKLOG / TODO cards without a spec, by pasting their text into `/product-brief --intake` (it offers to write the brief first when none exists). Then delete the file.

#### How to upgrade

- **File-copy installs:** re-run `./install.sh --project` (or `--user`) from 2.0; add `--dry-run` first to preview. It shows added / updated / removed files, removes retired 1.x files (merged agents, KG scripts, old indexes and shared references), strips the retired `kg-capture` hook from `settings.json` while keeping your own hooks and permissions, and backs up what it replaces in `.claude/.framework-backups/`. Add `--with=ops,ios,drupal,design` for the add-ons you used.
- **Plugin installs:** reinstall under the new name (see [Plugin rename](#plugin-rename)).
- Existing specs keep working; numeric ids still resolve. New specs use the ticket key or timestamp naming.
- Redirect stubs for the old namespaced commands disappear in the next minor release.

## [1.10.0] - 2026-06-12

### Added

- **Four new background workflows**, grounded in a verified survey of how leading agentic coding assistants (Devin, Cursor, Copilot, Codex, Claude Code, Aider, OpenHands, Cline/Roo, Jules/Antigravity, Factory/Amp) and patterns (spec-driven dev, plan-act-verify/Reflexion, TDD-as-oracle, multi-agent orchestration, long-horizon harness, doc/QA generation) structure building work. The research report is in `research/agentic-flow-research-2026-06-12.md`.
  - **`fix-bug`** (`/execution:fix-bug`) — Detect → Reproduce → RootCause (3-vote adversarial verify) → failing RegressionTest (committed, immutable) → minimal Fix → Gates → Acceptance that the ORIGINAL report resolves end-to-end. Returns FIXED / NOT-RESOLVED / NEEDS-INFO. Deliberately tighter than `ship-feature` (Agentless cost lesson).
  - **`qa-and-docs`** (`/quality:qa-and-docs`) — Detect → Index (bottom-up) → Criteria → QAPlan ∥ Docs → Grade. Generates a traceable QA/test plan and user/dev docs from already-shipped code, each claim linked to real code + an acceptance criterion; a Verifier (`outcomes-grader`) scores completeness/helpfulness/truthfulness and gates on coverage + phantom links.
  - **`tech-research`** (`/upstream:tech-research`) — Detect → Frame (weighted criteria) → Research (per-option sourced web ∥ codebase fit) → Verify (drop unsourced claims) → Decide → write an ADR. For fork-in-the-road technology decisions; surfaces disagreement and open questions for human sign-off.
  - **`greenfield-build`** (`/execution:greenfield-build`) — Detect (refuses a tracked tree unless `--force`) → Constitution (load conventions/skills as principles) → Architecture (verified vs constitution) → Scaffold + CI (committed checkpoint) → vertical Slice (TDD) → Gates → Acceptance → Handoff docs. Takes a new project from nothing to a first shippable slice.
- **Front-door commands** for all four, each owning the human-approval gate (clarify + confirm scale) since background workflows cannot pause.

### Changed

- Command count 34 → 38; CLAUDE.md "Built-in workflows" table and the command registry index updated.
- All four new workflows obey the framework authoring rules: pure-literal `meta`, `model:` pinned on every `agent()` call, a `Detect` phase that never hardcodes a stack and supports split repos, `pipeline()` by default, adversarial verification, existing-implementation/broken-link awareness, an Acceptance phase, and a manual test plan / human-facing artifact.

## [1.9.0] - 2026-06-12

### Added

- **Acceptance phase** (`ship-feature`) — after Review, re-walks the ORIGINAL reported scenario end-to-end against the built code. Passing unit tests no longer count as done if the reported problem (a dead link, a 404) still happens; an unresolved acceptance trace skips Docs and forces a non-SHIP recommendation.
- **Existing-implementation detection** — the Investigate (ship-feature) and Research (create-spec) phases now record what already exists for the feature (committed routes/controllers via git history) so the build never rebuilds shipped work; specs skip pieces marked `complete`.
- **User-journey / broken-link tracing** — investigation traces the reported journey end-to-end and flags any target it depends on (route, page, redirect destination, API) that does not resolve; every broken link must map to a task.
- **Manual test plan** — `ship-feature` writes `manual-test.md` to the spec folder (TestPlan phase) and `create-spec` includes it in the persisted spec: copy-paste human QA steps covering the happy path and the originally-reported failing case.
- **Untracked/WIP repo detection** — the Detect phase marks repos with no committed history as unverified deploy targets; building into one forces a non-SHIP recommendation.

### Changed

- `ship-feature` report recommendation now factors in the acceptance trace and repo warnings (not just gates/build/findings).
- `ship-feature.md` and `research-spec.md` command docs updated with the new phases and outputs.

## [1.8.0] - 2026-06-11

### Added

- **Background multi-agent workflows** — `ship-feature` and `create-spec` (`src/workflows/*.js`): deterministic fan-out pipelines that run dozens of subagents in the background.
- **`create-spec` workflow** + `/upstream:research-spec` command — research-driven spec creation: Detect → Classify → Research (codebase ∥ web ∥ docs) → Synthesize → Document. Writes `spec-lite.md`, `tasks.md`, `business-rules.md`, `decisions.md`, `references.md` to `.ai/specs/`; flags inferred rules as "NEEDS HUMAN VALIDATION"; requires source URLs on web findings.
- **`ship-feature` spec persistence + progress tracking** — feature mode persists a real spec to `.ai/specs/` and ticks each task's checkbox in `tasks.md` as it builds; `--spec=<id>` mode executes an already-created spec.
- **Dynamic stack detection** — a `Detect` phase identifies Laravel / Drupal / Next.js per repo and drives gate tooling, specialist agent, and conventions; no framework is hardcoded.
- **Cross-repo (polyrepo) support** — pass `{ repos: { backend, frontend } }` to investigate, build, and gate a Laravel backend repo and a separate Next.js frontend repo; gates run per-repo in parallel.
- **Visual testing phase** — drives the Claude Chrome extension to check theming, layout, responsive breakpoints, and WCAG-AA contrast when UI files change.
- **Adversarial review phase** — 4 dimensions × 3-vote refutation panel; only findings confirmed by a majority survive.

### Changed

- All workflow `agent()` calls pin `model` explicitly (opus for reasoning phases, sonnet for mechanical phases) — fixes subagents silently inheriting the wrong model tier from agent frontmatter.
- Quality gates distinguish `unreachable` (tool exists but cannot run) from `pass`; a partial build or unreachable gate forces a non-SHIP recommendation.
- README, GETTING-STARTED, USAGE-EXAMPLES, CLAUDE.md, and the command index document how to trigger workflows (slash command, plain-English opt-in, direct `Workflow(...)`).

## [1.7.0] - 2026-06-04

Version 1.6.0 was skipped; the version moved from 1.5.0 straight to 1.7.0.

### Added

- **`ship-feature` workflow** (`src/workflows/ship-feature.js`) and `/execution:ship-feature` command: spec → build → quality gates with auto-fix → adversarial review panel.
- `.claude-plugin/marketplace.json` for one-command plugin install, recommending LSP, security-guidance, and PR-review plugins.
- `/quality:grade` command and `outcomes-grader` agent, with review rubrics for APIs, migrations, tests, and UI (`src/templates/reviews/`).
- `/quality:upgrade-deps` command for tiered dependency upgrades.
- Skills: `accessibility`, `observability`, `laravel-migration-coordinator`, `nextjs-performance-profiler`, `stripe-best-practices`, `stripe-projects`, `upgrade-stripe`.
- Hooks: `check-commit-msg`, `token-budget`, `test-first-check`, `prompt-preflight`, `scan-secrets`, `scan-injection`, `session-end`, and `kg-capture` (retired in 2.0).
- Coverage, type-safety, and accessibility gates in the shared verification gates and `ship-feature`.
- `src/docs/INSTALLATION.md`: LSP, sandbox/auto mode, and the plugin-mode subagent constraint (agent `hooks`, `mcpServers`, and `permissionMode` are ignored).

### Changed

- Stack skills gain `paths:` globs so they auto-activate only on matching files.
- Agent model/effort tiering: mechanical agents moved to a cheaper tier with low effort, reasoning agents to high effort.
- Expanded the safe permission allow-list to reduce prompt friction.

### Fixed

- `install.sh` flattens skills into one level so Claude Code discovers them (category nesting hid every skill) and copies `workflows/`.
- `verify.sh` no longer counts `_shared` references as commands.

## [1.5.0] - 2026-03-26

### Added

- **Phase I (Reconcile)** — cross-references AI-generated business rules against existing documentation, produces a human sign-off checklist with contradictions, gaps, and unverifiable claims. Pipeline blocks until human reviews and signs off.
- **Phase J (Doc Validation)** — validates every testable claim in existing docs against actual source code. Three sub-phases: J1 extracts claims, J2 verifies each against code (VALID/OUTDATED/INVALID), J3 rewrites docs with corrections. Produces per-doc health scores in `SUMMARY.md`.
- **Phase K (Doc Generation)** — gap analysis identifies missing business rules, edge cases, and API contracts. Generates new documentation to fill gaps.
- **Phase L (Cleanup)** — applies corrected docs over originals (with backups), archives intermediates into compressed tarball, creates final manifest `README.md`.
- **Rate-limit auto-detection** — pipeline detects Claude usage limits in output, halts cleanly without creating lockfiles for failed items, shows clear resume instructions. No manual lockfile cleanup needed — just re-run after limit resets.
- **Phase I sign-off blocking** — when human sign-off is pending, pipeline shows detailed progress (contradictions X/Y, gaps, unverifiable), lists unsigned contradictions by ID, and exits with clear 3-step instructions.
- `EXISTING_DOCS_PATHS` config — controls which docs Phase J validates (narrow to high-value docs to manage cost)
- `source-path.txt` per validated doc — preserves original file path for Phase L to apply corrections (slug encoding is lossy)
- `scripts/review/USAGE.md` — step-by-step walkthrough with phase-by-phase instructions and doc health score interpretation guide
- 21 knowledge modules (added tailwind-4, architecture-patterns)

### Changed

- Pipeline expanded from 9 phases to 13 phases (0, A, B, C, D, E, I, F, J, K, G, H, L)
- `run_claude()` adds `< /dev/null` to prevent stdin consumption in `while read` loops
- Phase L reconstructs original file paths from `source-path.txt` / `claims.json` instead of lossy slug-to-path conversion
- Phase G truncates cleaned docs context with `|| true` to prevent SIGPIPE exit under `set -o pipefail`
- `scripts/review/README.md` updated with all 13 phases, doc-validation output, updated cost model
- `README.md` updated with 13-phase pipeline description, expanded directory structure, USAGE.md references

### Fixed

- **`except: pass` catching `SystemExit`** — Python JSON validation in Phases J1/J2 used bare `except:` which caught `sys.exit(0)`, causing every valid JSON output to be rejected as "bad JSON". Fixed to `except (ValueError, json.JSONDecodeError):`.
- **Broken pipe in Phase G** — `echo "$cleaned_docs_context" | head -2000` caused SIGPIPE when context exceeded 2000 lines under `set -eo pipefail`. Fixed with `printf ... || true`.
- **Phase L slug-to-path reconstruction** — `sed 's/__/\//g; s/_/./g'` was lossy and failed for paths with hyphens. Now reads `source-path.txt` or `claims.json` document field.
- **`run_claude` stdin consumption** — `claude -p` inside `while read` loops consumed stdin from the loop, causing only the first iteration to process. Fixed with `< /dev/null` redirect.

### Removed

- `scripts/review/validate-docs.sh` — standalone doc validation script, superseded by Phase J in the main pipeline

## [1.4.0] - 2026-03-10

### Added

- **Project Intelligence Pipeline** — autonomous 9-phase codebase review that builds a persistent knowledge base Claude reads at every session start. After one run, you never explain your project again.
  - Phase 0 (Triage): Free static analysis — PHPStan, tsc, npm/composer audit, git hotspots, security pattern scan, complexity grep
  - Phase A (Inventory): Free manifests — routes, jobs, events, emails, frontend API patterns
  - Phase B (Survey): Cheap model survey — file-list only triage, RED/YELLOW/GREEN per chunk, skips 20-40% of chunks
  - Phase C (Review): Deep adversarial review — 13-criteria checklist, assume-buggy stance, file:line evidence required
  - Phase D (Validate): Semi-blind validation — reads code BEFORE report to prevent anchoring bias, CONFIRMED/REJECTED verdicts
  - Phase E (Aggregate): 5 separate doc-writing calls — architecture, business logic, API contracts, background systems, specs
  - Phase F (Spec Check): Each spec verified against live code before it becomes actionable
  - Phase G (Context): Writes ground truth docs that `/quality:deep-review` loads in Phase 1
  - Phase H (Brain): PROJECT-BRAIN.md + CLAUDE.md patch + `.claude/project-context.md` auto-loaded at session start
- **Multi-framework support** — auto-detects and adapts to Laravel, Drupal, Symfony, Django, Rails, Node.js, and generic projects
  - Framework-specific security patterns, route detection, background system discovery, coding standards
  - Smart chunk discovery per framework (modular monolith, DDD layers, Django apps, Rails conventions)
- **Resumable pipeline** — lockfile-based state management, interrupted runs continue from last completed step
- **Review pipeline scripts** (`scripts/review/`):
  - `review.sh` — main orchestrator (2170 lines, all 9 phases, 15+ commands)
  - `review.config.sh` — framework-agnostic configuration template
  - `review-setup.sh` — preflight validation (tools, auth, directories, scope estimate)
- **Pipeline integration with install.sh** — review scripts included in both minimal and full install modes
- **Pipeline documentation** — `scripts/review/README.md` with quick start, cost model, and usage guide

### Changed

- Updated default AI models to the latest Claude model family (opus for review, haiku for survey)
- All bash output uses `printf` and `$'...'` ANSI codes for macOS bash 3.2 compatibility

### Fixed

- Bash 3.2 compatibility: replaced `mapfile`, process substitution in case blocks, empty array handling
- macOS `echo -e` not processing escape sequences — switched to `printf` throughout

## [1.3.0] - 2026-02-15

### Added

- Plugin mode support (`.claude-plugin/plugin.json` manifest)
- Root symlinks for plugin auto-discovery (`commands/`, `agents/`, `skills/`)
- Claude Code lifecycle hooks system (`hooks/hooks.json`)
- Hook scripts: session-start, block-dangerous, lint-check, pre-compact-save
- Self-contained installer builder (`build.sh`)
- Plugin archive builder (`dist/claude-laravel-nextjs-plugin-*.tar.gz`)
- Pre-build validation (`verify.sh`)
- Knowledge modules (skills) with progressive disclosure
- Skill creator tooling (`src/skills/tooling/skill-creator/`)

### Changed

- Framework restructured to support both plugin mode and file-copy mode
- MCP configs use `${CLAUDE_PLUGIN_ROOT}` for plugin mode, `$CLAUDE_PROJECT_DIR` for file-copy
- Settings split: `hooks/hooks.json` (plugin) vs `.claude/settings.json` (file-copy)

## [1.2.0] - 2026-01-20

### Added

- Cross-session state management with delta tracking
- `/workflow:progress` command with visual dashboard
- `/execution:execute-task` with checkpoint resume
- Specification system (`spec-lite.md` + `tasks.md`)
- Golden Triangle context pattern (business rules + architecture + workflow)

## [1.1.0] - 2025-12-15

### Added

- 35 specialized agents covering complete development lifecycle
- 42 custom commands for development workflows
- MCP integrations (knowledge-graph, context7, sequential-thinking)
- Quality gates with configurable thresholds
- Code templates for Laravel and Next.js patterns

## [1.0.0] - 2025-11-01

### Added

- Initial release
- Core agent framework for Laravel + Next.js development
- Basic command structure
- Installation script
