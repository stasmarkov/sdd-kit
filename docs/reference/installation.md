# Installing SDD Kit

How to install, update, upgrade, and remove the kit in either mode, plus what the installer
changes and how to set up MCP servers. For your first session after installing, see
[GETTING-STARTED](getting-started.md).

- [Prerequisites](#prerequisites)
- [Choose a mode](#choose-a-mode)
- [Codex](#codex)
- [Cursor](#cursor)
- [Plugin mode](#plugin-mode)
- [File-copy mode](#file-copy-mode)
- [MCP servers](#mcp-servers)
- [Recommended settings](#recommended-settings)
- [Upgrading from 1.x](#upgrading-from-1x)
- [Verifying an install](#verifying-an-install)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Tool | Needed for |
|------|-----------|
| Claude Code | Everything |
| git | Cloning the repo; `--third-party` fetches pinned skills with it |
| jq | File-copy installer (it refuses to run without it) and the hook scripts in both modes |
| Node.js 18+ (`npx`) | Both default MCP servers (`context7` and Playwright MCP), the spec board, and the npx install |
| Google Chrome, or Chromium via `npx playwright install chromium` with `--browser chromium` | Playwright MCP browser checks (Reproduce, Visual, Acceptance); without one they report "not run" |

Install jq with `brew install jq` or `apt-get install jq`.

New to Claude Code? Install it first: [GETTING-STARTED, section 0](getting-started.md#0-new-to-claude-code).

## Choose a mode

- **Plugin mode**: install from the marketplace; one pinned version per team, updated with `/plugin`.
- **File-copy mode**: `./install.sh` merges the kit into `.claude/`; you can edit agents and skills in place.
- Both ship the same agents, skills, workflows, and hooks. The full comparison (hooks, permissions, namespacing, limitations) is in [plugin-mode.md](plugin-mode.md).

## Codex plugins

The distribution root carries `.agents/plugins/marketplace.json` beside `.claude-plugin/marketplace.json`, with the Codex packages under `hosts/codex/`:

```bash
codex plugin marketplace add stasmarkov/sdd-kit
codex plugin add sdd-kit@sdd-kit
```

For a file-copy install use `install.sh --host codex` (or `--host cursor`).

## Codex

Codex support is an unverified preview in 4.0: it is built and tested, but no real Codex session has been recorded yet ([hosts.md](hosts.md)). Codex plugins cannot ship agents, so the plugin install carries skills, hooks and the bridge; custom agents come with the file-copy install. You need Codex, git, jq and Node.js 20+. Windows is not supported.

Plugin install, from your shell:

```bash
codex plugin marketplace add stasmarkov/sdd-kit
codex plugin add sdd-kit@sdd-kit
```

File-copy install, from your project root (skills go to `.agents/skills`, agents to `.codex/agents`):

```bash
bash install.sh --host codex --project --dry-run
bash install.sh --host codex --project
npx github:stasmarkov/sdd-kit install --host codex --project
```

Flags: `--project` or `--user`, `--stack=LIST`, `--with=LIST`, `--prune`, `--dry-run`, `--yes` and `--uninstall`. Codex skills start with `$`, for example `$sdd`.

## Cursor

Cursor support is an unverified preview in 4.0, like Codex. You need Cursor, git, jq and Node.js 20+. Windows is not supported. For a team, import the distribution repo as a team marketplace in the Cursor dashboard (Plugins & MCPs, Add Marketplace, Import from Repo; this needs a Teams or Enterprise plan).

File-copy install, from your project root (skills go to `.cursor/skills`, agents to `.cursor/agents`, rules to `.cursor/rules`):

```bash
bash install.sh --host cursor --project --dry-run
bash install.sh --host cursor --project
npx github:stasmarkov/sdd-kit install --host cursor --project
```

Flags: `--project` or `--user`, `--stack=LIST`, `--with=LIST`, `--prune`, `--dry-run`, `--yes` and `--uninstall`. Cursor skills start with `/`, for example `/sdd`. If Cursor's Third-Party Imports also loads a Claude install of the kit, turn that setting off (Settings > Agents > Third-Party Imports) so the kit does not load twice.

## Plugin mode

### Install

```
/plugin marketplace add stasmarkov/sdd-kit
/plugin install sdd-kit-laravel-nextjs@sdd-kit   # preset: core + Laravel + Next.js + devenv
```

The core plugin is stack-neutral. Stack knowledge lives in add-on plugins; the preset
`sdd-kit-laravel-nextjs` installs the core and the Laravel, Next.js and devenv add-ons in one step
(Claude Code resolves its dependencies). To pick pieces yourself, install the core and the add-ons you need:

```
/plugin install sdd-kit@sdd-kit
/plugin install sdd-kit-laravel@sdd-kit  # Laravel agent, skills, rules, hooks
/plugin install sdd-kit-nextjs@sdd-kit   # Next.js agent, skills, rules, hooks
/plugin install sdd-kit-devenv@sdd-kit   # docker and ddev skills
/plugin install sdd-kit-ops@sdd-kit      # deploy, rollback, feature flags, health checks, incidents
/plugin install sdd-kit-ios@sdd-kit      # iOS/Swift agent and skills
/plugin install sdd-kit-drupal@sdd-kit   # Drupal 11 skill
/plugin install sdd-kit-design@sdd-kit   # UI/UX agent and /design-ui
```

To work from a local checkout (developing the kit, or testing an unreleased branch), skip the
marketplace and load the directory directly. Pass `--plugin-dir` once per plugin:

```bash
claude --plugin-dir /path/to/sdd-kit/plugins/sdd-kit \
       --plugin-dir /path/to/sdd-kit/plugins/sdd-kit-ops
```

### Playwright in plugin mode

The plugin's root `.mcp.json` starts `context7` and Playwright MCP. Claude Code names the tools of a
plugin's own servers `mcp__plugin_sdd-kit_playwright__*`, and the workflows' browser steps accept
both that prefix and `mcp__playwright__*`, so plugin mode needs no `.mcp.json` entry in your project.
Visual and Acceptance drive the browser with the plugin's server as is.

If neither Playwright server is available, those phases fall back to Claude in Chrome or report
"not run". A file-copy `--project` install writes a `playwright` entry to the project `.mcp.json`
for you, because no plugin supplies the server there.

To pick a different browser in file-copy mode, add `--browser chromium` (or `msedge`, `firefox`,
`webkit`) to that entry's `args`. In plugin mode the plugin's server and its `args` cannot be edited,
so a different browser needs a whole `playwright` entry of your own in the project `.mcp.json`, with
the kit's pin:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.83", "--headless", "--isolated", "--browser", "chromium"]
    }
  }
}
```

That entry starts a second Playwright server next to the plugin's. Its tools are named
`mcp__playwright__*`, which the browser steps also accept, so a step may use either server; turn
the plugin's server off in `/mcp` when every step must use your browser. Keep the version in step
with the kit's pin when you upgrade.

### Namespacing

This guide uses bare skill names (`/sdd`, `/write-spec`), which is what file-copy mode gives
you. Plugin mode prefixes every skill with its plugin name: `/sdd-kit:sdd`,
`/sdd-kit:framework-doctor`, `/sdd-kit-ops:deploy`.

### Project context is not installed

Plugins do not create `CLAUDE.md`, `AGENTS.md`, or `.claude/rules/`. Copy them from the repo
by hand:

```bash
cp /path/to/sdd-kit/share/CLAUDE.template.md CLAUDE.md
cp /path/to/sdd-kit/share/templates/AGENTS.template.md AGENTS.md
mkdir -p .claude/rules && cp /path/to/sdd-kit/share/templates/rules/*.md .claude/rules/
```

How to fill them in is covered in [GETTING-STARTED](getting-started.md).

### Update and uninstall

```
/plugin marketplace update sdd-kit   # refresh the catalog
/plugin update                       # update installed plugins
/plugin uninstall sdd-kit@sdd-kit    # repeat for each add-on
/plugin marketplace remove sdd-kit
```

### Mixing plugin and file-copy installs

A global plugin plus a project file-copy install double-loads the kit: skills, agents and hooks
appear from both, and the duplicate hooks run twice per tool call. Pick one mode per project.

To keep the file-copy install in a project, switch the plugins off there with `enabledPlugins` false
entries in `.claude/settings.json` (shared with the team) or `.claude/settings.local.json` (personal):

```json
{
  "enabledPlugins": {
    "sdd-kit-laravel-nextjs@sdd-kit": false,
    "sdd-kit@sdd-kit": false,
    "sdd-kit-laravel@sdd-kit": false,
    "sdd-kit-nextjs@sdd-kit": false,
    "sdd-kit-devenv@sdd-kit": false
  }
}
```

The preset and each of its four dependencies need their own entry. With the CLI, run
`claude plugin disable` for the preset before its dependencies, because disable refuses a plugin
another enabled plugin needs. The alternative is a file-copy-only machine: uninstall the plugins
(see above) and keep the project install.

To update a plugin install, run `claude plugin update` (or `/plugin update`), then `/reload-plugins`
in the session.

### Team rollout

To pin a reviewed version for a whole team, publish your own marketplace that points at a
release tag and commit. See [team-marketplace.md](team-marketplace.md).

## File-copy mode

```bash
git clone https://github.com/stasmarkov/sdd-kit.git
cd /path/to/your-project
/path/to/sdd-kit/install.sh --project --dry-run   # preview
/path/to/sdd-kit/install.sh --project             # install
```

Run the installer from your project root: `--project` installs into `./.claude` of the
current directory. With no flags it asks where to install, defaults to a full install,
shows the change list, and asks before writing anything.

### Without cloning: npx

From your project root, `npx github:stasmarkov/sdd-kit install --project --dry-run`
previews and `npx github:stasmarkov/sdd-kit install --project` installs; every
`install.sh` flag below works (`--stack`, `--minimal`, `--full`, `--with=ops`, `--yes`, `--user`). It runs
the same `install.sh` as a clone, so the result is identical, and it needs bash, git, jq and
Node 18+. On Windows use Git Bash or WSL, or the plugin.

Add `#v4.0.1` to pin a release (`npx github:stasmarkov/sdd-kit#v4.0.1 install --project`);
without a tag npx fetches the default branch. npx caches the download. The package is not
published to npm.

### Flags

| Flag | Effect |
|------|--------|
| `--project` | Install into `./.claude` (this project only) |
| `--user` | Install into `~/.claude` (all projects). Paths in installed docs are rewritten to `~/.claude/` |
| `--minimal` | Spec-driven core only, without `/progress`, `/spec-board`, `/investigate`, `/learn` or `/fix-ci` (see below) |
| `--full` | Everything in core. This is the default |
| `--stack=LIST` | Stack add-ons to install, comma-separated, or `none` for core only. Default: `laravel,nextjs` on a fresh install, the installed stacks on an upgrade. Other stacks: `drupal`, `ios`. An add-on that is not a stack (`devenv`, `ops`, `design`) is rejected with a hint to use `--with` |
| `--with=LIST` | Add optional add-ons, comma-separated: `devenv`, `ops`, `design`, plus any stack add-on |
| `--prune` | On an upgrade, remove installed add-ons that are not selected. Without it, flags and prompt answers only add, and unselected add-ons are kept. Modified files are never deleted, and everything removed is backed up |
| `--third-party` | Also install the pinned third-party skills from `src/settings/third-party.json` and print the recommended plugin commands. Policy: [third-party.md](third-party.md) |
| `--dry-run` | Print added / updated / removed files and stop. Nothing is written |
| `--yes`, `-y` | Skip the confirmation prompt |
| `--help`, `-h` | Show help |

Examples:

```bash
./install.sh --project --minimal
./install.sh --project --with=ops,design
./install.sh --user --full --yes
```

### Stacks and add-ons: two axes

`--stack` picks the stack add-ons and `--with` picks the optional ones. They are independent.

- **Fresh install, no `--stack`:** `laravel,nextjs` are installed. `devenv` is added to the defaults even when `--with` names other add-ons, so `--with=ops` installs laravel, nextjs, devenv and ops.
- **`--with` given:** the optional add-ons are exactly the list you pass (plus the devenv rule above when `--stack` is absent).
- **`--stack=none` with a stack add-on in `--with`** is an error.
- **Upgrade:** flags and prompt answers add to what is installed. Add-ons you do not mention are kept (`Keeping installed add-on` in the plan).
- **`--prune`:** makes the installed set exactly your selection: stacks exactly `--stack`, non-stack add-ons exactly `--with` (the installed non-stack set when `--with` is omitted). Removed files are backed up, and files you modified are kept and listed (`Removing add-on '<x>' (--prune)` in the plan).

Add-on templates (for example the Laravel contract-sync template) are staged to `.claude/templates/<addon>/`.
Add-on rules and add-on `third-party.json` fragments are file-copy only: plugin mode has no rules directory
and ships no third-party fragments, so copy them from the add-on if you need them. Rules are copied into
`.claude/rules/` only when absent, in project mode.

Non-interactive behaviour: prompts read the terminal device, never stdin. With `--yes`, or when no terminal is
available, nothing is asked and the defaults above apply (pass `--project` or `--user` too). There is no piped
install; clone the repository (or use npx) and run `install.sh` as a command.

### Minimal vs full

| | `--minimal` | `--full` |
|---|---|---|
| Skills | The main path: `sdd`, `product-brief`, `write-spec`, `execute-task`, `simple-task`, `run-tests`, `deep-review`, `open-pr`, `framework-doctor`, `stack-trust` (overlay approvals), `security-audit`, the shared `verification-gates` and `source-verification` references, and the stack-neutral `api-design` and `api-security` | Every core skill ([skill index](skills.md)) |
| Agents | Every agent the main path hands off to: `code-explorer`, `requirements-analyst` (product-brief, write-spec), `test-writer`, `code-quality` (execute-task), `adversarial-reviewer`, `security-auditor` (deep-review), `security-hunter` (security-audit workflow) | Every core agent ([agents index](agents.md)) |
| Not included | Four of the after-`/sdd` commands (`/progress`, `/spec-board`, `/investigate`, `/learn`) and `/fix-ci`, the `/sdd` route for red CI. Use `--full` if you want them | Included |
| Workflows | All of them: `ship-feature`, `create-spec`, `fix-bug`, `qa-and-docs`, `tech-research`, `greenfield-build`, `security-audit` | Same |
| Templates | Context and spec templates | All templates |
| Hooks | Lifecycle hooks merged into `settings.json` | Same, plus the git/CI scripts in `.claude/hooks/` |
| Also | Settings templates, MCP configs, output styles, hook scripts | Same, plus these docs and the 1.x redirect stubs in `.claude/commands/` |

Stack skills and agents (Laravel, Next.js, Drupal, iOS) ship only through add-ons, never through core. The stack add-ons are staged in full with either choice; `--minimal` only trims core. Add-ons (`--with=`) work with either. Re-run with `--full` at any time to grow a minimal
install. A few agents also preload depth skills that only `--full` ships (`event-driven`,
`error-handling-patterns`, `typescript`, `tailwind-4`, `accessibility`, `oauth2-passport`);
they load when installed and are skipped otherwise.

### Building from source

Contributors build the distribution tree and plugin archives from the source repository with
`./build.sh`. It runs `./verify.sh` first, then writes one plugin archive per plugin to `dist/`.
`dist/` is gitignored: release artifacts are published to `stasmarkov/sdd-kit` by CI. There is no
single-file installer; use the `install.sh` in a clone of `stasmarkov/sdd-kit`, or the npx form above.

### What the installer does

1. **Merges, never replaces.** Files the kit does not own are never touched. Your own skills,
   agents, and settings stay as they are.
2. **Reports first.** It prints added / updated / removed counts and the paths before writing.
3. **Records a manifest.** `.claude/.framework-manifest` lists every installed file with its
   hash; `.claude/.framework-version` holds the version. The next run uses the manifest to
   update changed files and remove files the kit no longer ships.
4. **Removes retired files.** Files that 1.x installed but 2.0 dropped (merged agents,
   knowledge-graph scripts) are removed even when no manifest exists yet.
5. **Keeps unowned files and the five newest backups.** An unowned file at a staged path (one the
   manifest does not list) is kept and the kit copy is not installed. A modified kit file is copied to
   `.claude/.framework-backups/<stamp>/` and replaced. On a 1.x upgrade (no manifest yet), a file that
   still matches a version a 1.x installer placed at that path counts as a kit file and is replaced
   the same way. The five newest backup folders are kept and older ones are pruned; pruning never
   follows a symlink and never deletes anything outside `.framework-backups/`. When
   `.framework-backups` is itself a symlink, the installer stops before changing anything rather than
   write backups outside `.claude/`.
6. **Merges hooks into `settings.json`** via `src/scripts/install-hooks.sh` (needs jq). A
   missing file is created; an existing one is backed up to `settings.json.backup.<timestamp>`
   and only the kit's own hook entries are replaced. Permissions, env, model, and your own
   hooks are preserved. Invalid JSON is left untouched and reported.
7. **Merges `context7` and `playwright` into `.mcp.json`** (project mode). Existing servers
   win on name conflicts. In user mode it prints the commands instead:
   `claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp` and
   `claude mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 --headless --isolated`.
8. **Creates project context when absent** (project mode only): `CLAUDE.md` from
   `src/CLAUDE.template.md`, `AGENTS.md` from `src/templates/AGENTS.template.md`, and
   `.claude/rules/` from `src/templates/rules/`. Existing files are never overwritten.
9. **Sets the spec-aware status line** (`scripts/statusline.sh`: active spec, task, model) only
   if `settings.json` has no `statusLine` yet.

Re-running the installer is the update path. Use `--dry-run` to see the diff first.

## MCP servers

The kit enables two servers by default:

- `context7`: current library and framework docs.
- `playwright`: [Playwright MCP](https://github.com/microsoft/playwright-mcp), pinned to one
  version and started with `--headless --isolated` (no visible window, no profile kept
  between runs). Remove `--headless` from its entry to watch the browser.

Everything else is opt-in. Optional servers are defined in `src/mcp-configs/development.json`, installed
as `.claude/mcp-configs/development.json`. To enable one, copy its block into your project
`.mcp.json` under `mcpServers`, or add it with `claude mcp add`.

| Server | When to use | Requires |
|--------|-------------|----------|
| `phpstorm` | You work in PhpStorm and want IDE symbols, inspections, refactorings, and DB access | PhpStorm MCP server enabled; copy the exact SSE URL from Settings > Tools > MCP Server |
| `serena` | Semantic code navigation on a large codebase without an IDE | [uv](https://docs.astral.sh/uv/) |
| `laravel-boost` | Laravel-aware tools for the running app | `composer require laravel/boost --dev` |
| `github` | Working with PRs, issues, and releases from the session | `GITHUB_TOKEN` in your environment |
| `ddev` | Controlling a DDEV environment | `npm install -g ddev-mcp` |
| `obsidian` | Syncing specs and docs to an Obsidian vault (`/sync-obsidian`) | Obsidian Local REST API plugin; `OBSIDIAN_API_KEY` |
| `sequential-thinking` | Structured multi-step reasoning; rarely needed with current models | Node.js |

`src/mcp-configs/production.json` holds operations servers (Sentry, Datadog, Slack, Vercel)
for teams using the ops add-on.

Examples with the CLI:

```bash
claude mcp add --transport sse phpstorm http://localhost:64342/sse
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer $GITHUB_TOKEN"
```

Keep secrets in environment variables (`${GITHUB_TOKEN}`), never inline in `.mcp.json`, which
is usually committed.

**Browser checks.** Every workflow's Reproduce, Visual, and Acceptance steps drive the browser
with Playwright MCP: they assert on the page's accessibility snapshot and check console errors
and failed network requests on every page. When the Playwright tools are unavailable they fall
back to Claude in Chrome, and when neither is available they report the check as "not run",
never as passed. For web stacks Playwright is also a quality gate, and `ship-feature` turns the
acceptance walk into an `e2e/<spec>.spec.ts` test traced to the acceptance criteria.

## Recommended settings

These are environment choices the installer leaves to you.

**Code intelligence (LSP).** The `php-lsp` and `typescript-lsp` plugins give Claude
post-edit diagnostics (type errors, missing imports) and precise navigation instead of
grep-only search. They are listed in `src/settings/third-party.json`; `--third-party` prints
the install commands, or run them yourself:

```
/plugin install php-lsp@claude-plugins-official
/plugin install typescript-lsp@claude-plugins-official
```

See [third-party.md](third-party.md)
for the review policy behind the list.

**Permissions and sandboxing.** Permission mode and sandboxing depend on your machine and
threat model, so the kit does not force either, and the installer does not write any
`permissions` into your `settings.json`. The repo's root `settings.json` carries a conservative
`permissions.allow` / `permissions.deny` list (read-only git, test and lint runners; denies
`rm -rf`, force-push, `git reset --hard`) and `env.CLAUDE_BUDGET_THRESHOLD`. Copy what you want
from it into your own `settings.json`, in either mode. A plugin's `settings.json` does not apply
these keys; see
[plugin-mode.md](plugin-mode.md#limitation-plugin-settingsjson).
To opt in to a stricter `defaultMode` or sandbox, set them in your own `settings.json`.
Filesystem sandboxing limits where Claude can write; do not rely on network sandboxing as a
security control.

A stack manifest (`stack.json`) is the only thing that makes a stack; its fields and the trust
rules are in [stack-manifest.md](stack-manifest.md).

**Read rules for overlay stacks.** Workflows read four locations outside the project: the trust
store, the user stacks directory, the installed plugin list and the plugin cache that holds each
installed plugin's `stack.json`. Claude Code asks before such a
read and a workflow agent cannot answer, so until they are allowed every overlay stack manifest
(a project or user `stacks/*.json`, or a third-party plugin's `stack.json`) is treated as
untrusted and its gates are not run. The kit's own stacks are not affected. `/stack-trust` offers
to add exactly these rules to your user settings, and `/framework-doctor` warns when one is missing:

```
Read(~/.claude/sdd-kit/trusted-stacks.json)
Read(~/.claude/stacks/**)
Read(~/.claude/plugins/installed_plugins.json)
Read(~/.claude/plugins/cache/**)
```

With `CLAUDE_CONFIG_DIR` set, the last three name that directory as an absolute path instead; run
`/stack-trust` to get the exact text. The trust store itself always lives in
`~/.claude/sdd-kit/trusted-stacks.json` in your home directory as the operating system's user
database records it: neither `$HOME` nor `CLAUDE_CONFIG_DIR` moves it.

Model tiers and effort per workflow phase are covered in
[effort-guidelines.md](effort-guidelines.md).

## Upgrading from 3.x to 4.0

4.0 adds Codex and Cursor. A Claude Code install behaves as it did in 3.x: names, hooks, trust store and flags are unchanged, and an install with no `--host` produces the same `.claude/` tree. Re-run `install.sh` (use `--dry-run` first) or update the plugin as usual.

If you adopt Codex:

- **Re-trust hooks.** Codex ties trust to each hook's hash, and installing a plugin does not trust its hooks. Open `/hooks` in Codex and approve the kit's hooks after every install or update.
- **Fork runs.** If you ran a fork of the Codex workflow bridge, its `.ai/codex-workflows` runs cannot be resumed by the kit's bridge. Finish them first or start new runs, which are kept under `.ai/workflow-runs/`.
- **Windows.** Codex and Cursor installs are not supported on Windows. Use WSL, or stay on Claude Code there.

## Upgrading from 2.x

3.0 moves the Laravel, Next.js and docker/ddev components out of the core into add-ons.

**Plugin mode.** Install the preset, `/plugin install sdd-kit-laravel-nextjs@sdd-kit`, to keep what 2.x gave you. Namespaces
follow the plugin that ships the component: `/sdd-kit-laravel:laravel-12`, agents `sdd-kit-laravel:laravel-backend-dev`
and `sdd-kit-nextjs:nextjs-frontend-dev`. Claude Code installs the preset's dependencies; on claude.ai install each add-on yourself.
A SessionStart hint suggests the matching add-on once per project.

**File-copy mode.** Re-run `install.sh` (use `--dry-run` first). With no `--stack` it installs the Laravel and Next.js
add-ons, plus devenv on a fresh install. Moved files are replaced at their new paths, old paths are retired, and every
overwritten or removed file is backed up to `.claude/.framework-backups/<timestamp>/`. A user agent with the same name as
an add-on agent wins: the staged copy is dropped and the installer prints the fix. Use `--prune` to drop add-ons you no longer want.
Bare names keep working (`/laravel-12`, `/migrate-db`, agent `laravel-backend-dev`).

## Upgrading from 1.x

Re-run the 2.0 installer (or update the plugin). In file-copy mode it removes the files 1.x
installed that 2.0 no longer ships (retired agents, skills, templates, and scripts) and backs
them up first. It only removes a file whose content matches a copy the kit shipped; a file you
edited or replaced (for example an upstream Stripe or skill-creator skill installed at the same
path) is listed as "kept (modified or not from the kit)" and left for you to review.

The tables below match the CHANGELOG's [Migrating from 1.x](https://github.com/stasmarkov/sdd-kit/blob/v4.0.1/CHANGELOG.md#migrating-from-1x) section. They list what a 1.x release shipped; components that were added and removed again during the 2.0 cycle appear only in the CHANGELOG's *Removed* table.
Current lists: [skills](skills.md),
[agents](agents.md).

### Commands

Commands became skills with flat names. Only the commands in the table's left column existed in
1.x; a name that is not listed (for example `/kanban` or `/add-context`) never existed as a flat
command and has no stub.

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

`/sdd` routes work to the right workflow. The workflows stay directly runnable as
`/ship-feature`, `/fix-bug`, `/qa-and-docs`, `/tech-research`, `/greenfield-build`, and
`/create-spec`.

The old namespaced commands remain as redirect stubs in `.claude/commands/`
(full installs and plugin mode; they are still shipped in 3.x and go in a later release). They are manual-only: Claude will not pick them on its own.
A stub translates old flags that changed meaning (`/workflow:add-context`, `/workflow:kanban`,
`/workflow:status`) and, for a user-invoked skill such as `/changelog` or `/framework-doctor`,
tells you the command to type. `/workflow:update-knowledge-graph` has no replacement; its stub
only explains the retirement.

### Removed skills and templates

Skills and templates are removed as well, not only commands:

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
| `drupal-11` (core in 1.x) | `drupal-11` in the drupal add-on (`--stack=drupal`) |

### Merged, moved, and removed agents

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

If you used the moved agents, add the add-on: `--stack=laravel,nextjs,ios --with=ops,design` or the matching
`sdd-kit-*` plugins.

### Knowledge graph retired

Memory is now Claude Code auto memory plus agent memory (`memory: project` in agent
frontmatter). The installer already removes the `knowledge-graph-manager` and
`learning-extractor` agents, `scripts/kg-capture.sh`, `scripts/init-knowledge-graph.js`, and
`hooks/post-change-kg-sync.sh`, and drops the `kg-capture` hook from `settings.json`. It does
**not** touch your data or MCP config, so finish the cleanup by hand:

1. Remove the `knowledge-graph` entry from `mcpServers` in `.mcp.json` (or
   `claude mcp remove knowledge-graph`).
2. Delete `.claude/knowledge-graph.jsonl` and `.ai/knowledge-graph.jsonl` if present. Move
   anything worth keeping into `CLAUDE.md`, `AGENTS.md`, or `.claude/rules/` first.

### Other leftovers

- 1.x left `*.backup.*` copies inside `.claude/`. The installer warns about them; delete
  them once you no longer need them.
- Cards in a 1.x `.ai/kanban.json` are not read by `/spec-board`, which takes status from the
  spec files. A card with a spec needs nothing. Drop the DONE, IN_PROGRESS, and REVIEW cards
  that have no spec: that work is already started or finished, and a backlog slice would
  re-plan it. Migrate only the BACKLOG and TODO cards without a spec: paste their titles and
  descriptions into `/product-brief --intake "<cards>"` (with no `product-brief.md` yet, it
  offers to write the brief first or to start a backlog only), or turn one into a spec with
  `/write-spec`. Then delete the file.
- Documents imported with 1.x `/workflow:add-context` into `.claude/context/business/`,
  `.claude/context/architecture/`, or `.claude/context/workflow/` are no longer read by anything:
  their only readers were the retired `context-fetcher` agent and the knowledge graph. Re-import
  each one into the Golden Triangle paths that `/write-spec`, `create-spec`, and
  `/framework-doctor` read: `/write-docs --import .claude/context/<dir>/<file> --as=business`
  (or `--as=architecture`, `--as=api`; for `workflow/` files, pick the one that fits or fold
  them into `AGENTS.md`). Then delete `.claude/context/`. `/framework-doctor` warns while it
  exists.
- `docs/context/workflow.md` from 1.x `/workflow:getting-started` is no longer generated, and
  `CLAUDE.md` no longer loads it. The SessionStart (compact) hook still re-injects its first lines after a
  compaction while the file exists, so fold anything still true into `AGENTS.md` (commands,
  red lines) and delete it.
- Files the installer kept because they no longer match the kit's copy are listed as "kept" in
  its plan; review each and delete the ones you do not use (a kept 1.x agent in a category
  folder, such as `agents/quality/code-reviewer.md`, still loads next to the flat 2.0 agents).
- A 2.0 `--minimal` install ships no `.claude/commands/`, so a 1.x full install's namespaced
  commands stay behind. `/framework-doctor` flags them; delete the namespaced folders
  (`upstream/`, `quality/`, `execution/`, `workflow/`, `_shared/`, and so on) under
  `.claude/commands/`.

## Verifying an install

| Check | What it tells you |
|-------|-------------------|
| `/framework-doctor` | Directory layout, flat skill discovery, manifest drift, workflow name collisions, MCP config, and that hooks are wired and actually fire (it sends a harmless payload that must be blocked) |
| `/hooks` | Active hooks and where they come from |
| `/memory` | Loaded `CLAUDE.md`, `AGENTS.md`, and rules files |
| `/plugin` → **Errors** tab | Plugin components that failed to load (plugin mode) |
| `claude plugin validate <path>` | Manifest and frontmatter problems in a plugin directory |

The hooks themselves are documented in [src/hooks/README.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.1/share/hooks/README.md).

## Uninstalling

**Plugin mode:** `/plugin uninstall sdd-kit@sdd-kit` and the same for each add-on.

**File-copy mode:** there is no `--uninstall` flag. The manifest lists every file the kit
installed (second column), relative to `.claude/`:

```bash
cd .claude
awk '{print $2}' .framework-manifest | xargs rm -f
find agents skills commands templates hooks docs workflows settings mcp-configs \
     output-styles scripts -type d -empty -delete 2>/dev/null
rm -f .framework-manifest .framework-version
```

Then remove the kit's hook entries and `statusLine` from `settings.json` (or restore the
`settings.json.backup.<timestamp>` taken at install), and the `context7` and `playwright`
entries from `.mcp.json` if you don't want them. `CLAUDE.md`, `AGENTS.md`, and `.claude/rules/` are yours
after creation; keep or delete them. Files the installer overwrote or removed on its last run
are in `.claude/.framework-backups/<timestamp>/` if you need to restore them.

## Troubleshooting

**Hooks don't fire.** Check `jq --version`: both the installer and the hook scripts need it.
If the installer printed "Hooks were NOT installed", `settings.json` was probably invalid JSON;
fix it and re-run. Then run `/hooks` and `/framework-doctor`. In plugin mode hooks come from
the plugin's `hooks/hooks.json`, not your `settings.json`.

**An MCP server doesn't start.** `context7` and other `npx` servers need Node.js on the `PATH`
Claude Code sees. Run `claude mcp list` to see status, and check the server's requirement in
the [MCP table](#mcp-servers) (uv for Serena, the Composer package for laravel-boost, the
env var for GitHub/Obsidian). In user mode `.mcp.json` is not written; run the
`claude mcp add` command the installer printed.

**Browser checks say "not run".** The Playwright MCP server did not start or its tools were
not available to the workflow. Run `claude mcp list` and look for `playwright`; in user mode,
run the `claude mcp add` command the installer printed. Node.js must be on the `PATH` Claude
Code sees. If the server is connected but cannot launch a browser, choose one you have with
its `--browser` option (see the [Playwright MCP README](https://github.com/microsoft/playwright-mcp)).

**The spec board finds no specs.** It reads `./.ai/specs` of the current directory. Run it from
the repo root, or pass the spec folders: `/spec-board api/.ai/specs web/.ai/specs` (or the same
arguments after `npx github:stasmarkov/sdd-kit spec-board`). A non-zero exit with
no board means the folder was not found, not that there are no specs.

**A skill isn't found.** In plugin mode use the namespaced name (`/sdd-kit:sdd`, not `/sdd`).
In file-copy mode skills must sit exactly one level deep (`.claude/skills/<name>/SKILL.md`);
Claude Code does not discover nested folders, which also applies to anything you add to
`~/.claude/skills` by hand. `/framework-doctor` checks this. Add-on skills (`/deploy`,
`/design-ui`) appear only after installing that add-on.

**A workflow isn't found.** File-copy installs put workflows in `.claude/workflows/` (or
`~/.claude/workflows/` with `--user`); confirm the files are there. A copied workflow that
kept a kit `meta.name` collides with the original, and `/framework-doctor` reports it. To
build an existing spec, go through `/sdd` or pass `{ spec: "<ref>" }`: a plain string
argument to `ship-feature` is treated as a new feature description.

**Something else.** Run `/framework-doctor`, then re-run the installer with `--dry-run` to see
whether files have drifted from the manifest.
