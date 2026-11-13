---
name: framework-doctor
description: Diagnose a framework installation and report PASS / WARN / FAIL per check - directory layout, flat skill discovery, agents, manifest drift (locally modified framework files), workflow name collisions, MCP config, hooks wired and firing, settings leftovers, stale worktrees, permission bloat, and contradictory memory instructions. Non-destructive; --fix only sets permissions and creates missing directories. Use when the framework behaves unexpectedly, after installing or upgrading, or when skills, agents, hooks, or workflows do not show up.
argument-hint: "[--verbose] [--fix]"
allowed-tools: Bash, Read, Glob, Grep
disable-model-invocation: true
metadata:
  version: "2.0"
---

# /framework-doctor

Diagnose the health of a SDD Kit installation, report issues, and optionally apply safe fixes.

## Usage

```bash
/framework-doctor                # Run all checks, show failures and warnings
/framework-doctor --verbose      # Show all checks including passes
/framework-doctor --fix          # Apply safe fixes (permissions, missing dirs)
```

## Arguments

| Argument | Description |
|----------|-------------|
| `--fix` | Apply safe, reversible fixes only: `chmod +x` on scripts, create missing directories |
| `--verbose` | Show all checks, not just failures and warnings |

## Ground Rules

- Every check is read-only. Nothing is deleted, moved, or rewritten.
- `--fix` never edits file contents, settings, `.mcp.json`, memory files, or worktrees. Everything else is reported with the exact command for the user to run.
- **FAIL** = something the framework relies on is broken (a component will not load or a safety hook does not fire). **WARN** = drift, leftovers, or hygiene that is safe to ignore short-term.

## Workflow

### Phase 1: Detect Installation

Plugin mode cannot be read from the environment: the Bash tool does not receive `CLAUDE_PLUGIN_ROOT`. Claude Code substitutes the braced `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` placeholders into this text before the block runs, so the detection works from those values. A placeholder that was not substituted arrives empty or as literal `${...}` text and counts as "not plugin".

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"
SKILL_DIR="${CLAUDE_SKILL_DIR}"
is_plugin_root() {   # a plugin root has the manifest and a skills/ folder next to it
  case "$1" in ''|*'${'*) return 1 ;; esac
  [ -f "$1/.claude-plugin/plugin.json" ] && [ -d "$1/skills" ]
}
MODE=""
if is_plugin_root "$PLUGIN_ROOT"; then
  MODE=plugin; INSTALL_DIR="$PLUGIN_ROOT"
else
  case "$SKILL_DIR" in ''|*'${'*) SKILL_DIR="" ;; esac
  if [ -n "$SKILL_DIR" ]; then
    # <root>/skills/framework-doctor, or <root>/src/skills/framework-doctor when skills/ is a symlink
    for candidate in "$(dirname "$(dirname "$SKILL_DIR")")" "$(dirname "$(dirname "$(dirname "$SKILL_DIR")")")"; do
      if is_plugin_root "$candidate"; then MODE=plugin; INSTALL_DIR="$candidate"; break; fi
    done
  fi
fi
if [ -n "$MODE" ]; then :
elif [ -d ".claude/skills" ] || [ -f ".claude/.framework-manifest" ]; then
  MODE=project; INSTALL_DIR=".claude"
elif [ -d "$HOME/.claude/skills" ] || [ -f "$HOME/.claude/.framework-manifest" ]; then
  MODE=user; INSTALL_DIR="$HOME/.claude"
else
  echo "[FAIL] No framework installation found (plugin, .claude/ or ~/.claude/)"
  echo "       Plugin users: run /plugin and check that sdd-kit is installed and enabled."
  exit 1
fi
SETTINGS="${INSTALL_DIR}/settings.json"
echo "MODE=$MODE INSTALL_DIR=$INSTALL_DIR"
```

Both installed plugins (under `~/.claude/plugins/`) and `claude --plugin-dir <path>` resolve to a directory holding `.claude-plugin/plugin.json`, so either is reported as plugin mode. Never fall back to user mode because `~/.claude/skills/` happens to exist when either placeholder points into a plugin.

Report the mode and the version: in plugin mode the `"version"` field of `${INSTALL_DIR}/.claude-plugin/plugin.json`, otherwise `${INSTALL_DIR}/.framework-version` when present.

### Phase 2: Run Checks

Run every check, collect results, and track PASS / WARN / FAIL / SKIP counts.

#### Check 1: Directory Structure

- `${INSTALL_DIR}/skills/` and `${INSTALL_DIR}/agents/` exist → FAIL if missing.
- `${INSTALL_DIR}/scripts/` exists → WARN if missing (hooks will not run).
- `${INSTALL_DIR}/commands/` with framework namespaces (`upstream/`, `quality/`, `execution/`, `workflow/`, `design/`, `discovery/`, `release/`, `operations/`): a 2.0 full install and plugin mode ship the 1.x redirect stubs at exactly these paths, so tell stubs from 1.x leftovers per file:

  ```bash
  MANIFEST="${INSTALL_DIR}/.framework-manifest"
  for f in "${INSTALL_DIR}"/commands/*/*.md; do
    rel="${f#"${INSTALL_DIR}"/}"
    if [ -f "$MANIFEST" ] && grep -qF "  $rel" "$MANIFEST"; then continue; fi        # shipped by this install
    if awk '/^---/{n++; next} n==1' "$f" | grep -q '^disable-model-invocation: true' \
       && awk '/^---/{n++; next} n==1' "$f" | grep -qE '^description: "?(Replaced by|Renamed to|Removed)'; then continue; fi  # 2.0 stub
    echo "LEFTOVER $rel"
  done
  ls -d "${INSTALL_DIR}/commands/_shared" 2>/dev/null
  ```

  A stub (listed in the manifest, or with `disable-model-invocation: true` and a *Replaced by* / *Renamed to* / *Removed* description) → PASS. Each `LEFTOVER` file → WARN: a 1.x command that duplicates a 2.0 skill; delete it (re-running the installer removes it only when its content still matches the 1.x copy). `commands/_shared/` → always WARN: 2.0 never ships it; delete the folder.
- `.claude/context/` exists (1.x `/workflow:add-context` imports) → WARN: nothing in 2.0 reads it. Fix: `/write-docs --import .claude/context/<dir>/<file> --as=business|architecture|api` for each file, then delete the folder.

**Fix**: create missing directories with `--fix`.

#### Check 2: Skills Are Flat and Agents Present

Claude Code only discovers skills one level deep (`skills/<name>/SKILL.md`).

```bash
find "${INSTALL_DIR}/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l      # discoverable
find "${INSTALL_DIR}/skills" -mindepth 3 -name SKILL.md -not -path "*/skills/*/assets/*"  # nested
find "${INSTALL_DIR}/agents" -name '*.md' | wc -l
```

- Any `SKILL.md` nested deeper than `skills/<name>/SKILL.md` → FAIL, list them (they will never load).
- Two skill directories with the same `name:` frontmatter → FAIL.
- Zero agents, or a core agent missing → FAIL. The core agents are the ones a `--minimal` install also ships, because the main `/sdd` path hands off to each. Stack specialists belong to the stack add-ons and are checked in Check 12, never as a core FAIL: `code-explorer`, `requirements-analyst`, `test-writer`, `code-quality`, `adversarial-reviewer`, `security-auditor`.
- A core agent's `skills:` entry with no matching `skills/<name>/SKILL.md` → WARN only when the skill ships in the core plugin; other preloads are optional depth that `--full` or an add-on adds.

#### Check 3: Manifest Integrity

Skip in plugin mode. The installer writes `${INSTALL_DIR}/.framework-manifest` with one `<sha256>  <relative-path>` line per framework file.

```bash
MANIFEST="${INSTALL_DIR}/.framework-manifest"
while read -r hash rel; do
  f="${INSTALL_DIR}/$rel"
  if [ ! -f "$f" ]; then echo "MISSING $rel"
  elif [ "$(shasum -a 256 "$f" | awk '{print $1}')" != "$hash" ]; then echo "MODIFIED $rel"
  fi
done < "$MANIFEST"
```

- Manifest absent → WARN: installed by 1.x or by hand; re-run the installer so upgrades can track and back up files.
- Files missing → FAIL if a skill, agent, script, or workflow; otherwise WARN.
- Files modified → WARN, list each. Explain: the next install overwrites them (keeping a backup in `.framework-backups/`). To keep a customization, copy it to a new name (a new skill directory, agent file, or workflow with its own `meta.name`) instead of editing the framework copy.

#### Check 4: Workflow Name Collisions

A workflow is invoked by its `meta.name`, so a forked copy that kept the framework's name shadows or is shadowed by the original unpredictably.

```bash
FRAMEWORK_WF="ship-feature create-spec fix-bug qa-and-docs tech-research greenfield-build security-audit"
for f in .claude/workflows/*.js "$HOME/.claude/workflows/"*.js; do
  [ -f "$f" ] || continue
  name=$(grep -m1 -oE "name:[[:space:]]*['\"][^'\"]+['\"]" "$f" | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/")
  echo "$name $f"
done
```

Prefer the names from the manifest's `workflows/*.js` entries over the hard-coded list when the manifest exists.

- A file whose `meta.name` matches a framework workflow but which is either not the manifest-tracked framework file or whose content differs from it → WARN: "`<file>` reuses framework workflow name `<name>`. Rename its `meta.name` (e.g. `<name>-acme`) so both can run."
- Two files with the same `meta.name` anywhere → WARN with both paths.

#### Check 5: MCP Configuration

- `.mcp.json` (project root; plugin root in plugin mode) exists and parses with `jq empty` → FAIL if it does not parse, WARN if absent.
- Report the server count.
- Servers whose `env` points at a `.jsonl` memory file (`MEMORY_FILE_PATH`) are 1.x leftovers → WARN; Claude Code's auto-memory replaces them.

#### Check 6: Script Permissions

`${INSTALL_DIR}/scripts/*.sh` and `${INSTALL_DIR}/hooks/*.sh` are executable → WARN if not.

**Fix**: `chmod +x` with `--fix`.

#### Check 7: Path Integrity

```bash
grep -rlE "src/(agents|commands|skills)/|\.claude/commands/_shared" "${INSTALL_DIR}" --include="*.md"
```

Matches in an installed tree are broken references → WARN, list the files.

#### Check 8: Golden Triangle

`docs/context/business-rules.md`, `docs/context/architecture.md`, `docs/api/api-contracts.md` (the files the project `CLAUDE.md` loads) → WARN if missing, with the fix: `/write-docs --type=all` generates them from the code, `/write-docs --import <file>` brings in existing docs (project-specific, never a failure).

#### Check 9: Hooks Wired and Firing

Claude Code reads hooks from `settings.json` (`.claude/settings.json` for project installs, `~/.claude/settings.json` for user installs), not from `${INSTALL_DIR}/settings/`. Skip this check in plugin mode — hooks come from the plugin's `hooks/hooks.json`.

```bash
SETTINGS="${INSTALL_DIR}/settings.json"
# 1. Wired: framework hooks present
jq -e '[.hooks // {} | .[][] .hooks[] | .command? // empty | select(test("block-dangerous\\.sh"))] | length > 0' "$SETTINGS"
# 2. Firing: a harmless payload that must be blocked (exit 2)
CMD=$(jq -r '[.hooks.PreToolUse[].hooks[] | .command? // empty | select(test("block-dangerous"))][0]' "$SETTINGS")
echo '{"tool_input":{"command":"rm -rf /"}}' | bash -c "$CMD"; echo "exit=$?"
```

- FAIL if no framework hooks are wired, a referenced script is missing or not executable, or the test payload is not blocked (exit ≠ 2).
- The test only pipes JSON into the hook script; nothing is executed.

**Fix** (manual — `--fix` never edits settings): re-run the installer, or merge hooks only:
`<framework>/src/scripts/install-hooks.sh <framework>/src/settings/settings.template.json "$SETTINGS" <project|user>`
It backs up `settings.json` and preserves existing permissions and hooks. In a live session, `/hooks` lists what is active.

#### Check 10: Settings and Workspace Leftovers

**Unknown settings keys.** Claude Code silently ignores keys it does not recognize, so a misspelled or invented key looks configured but does nothing.

```bash
jq -r 'keys[]' .claude/settings.json .claude/settings.local.json 2>/dev/null | sort -u
```

Compare against the official top-level keys: `$schema`, `apiKeyHelper`, `attribution`, `availableModels`, `awsAuthRefresh`, `awsCredentialExport`, `cleanupPeriodDays`, `companyAnnouncements`, `disableAllHooks`, `disabledMcpjsonServers`, `enableAllProjectMcpServers`, `enabledMcpjsonServers`, `enabledPlugins`, `env`, `extraKnownMarketplaces`, `forceLoginMethod`, `forceLoginOrgUUID`, `hooks`, `includeCoAuthoredBy`, `includeGitInstructions`, `model`, `otelHeadersHelper`, `outputStyle`, `permissions`, `sandbox`, `spinnerTipsEnabled`, `statusLine`, `alwaysThinkingEnabled`. Report each unknown key as WARN ("not a Claude Code setting; it has no effect") and point to the settings reference (`/config`, or the Claude Code settings docs) because new official keys appear between releases — do not call a key wrong without saying so.

**MCP allow-list drift.** Every name in `enabledMcpjsonServers` / `disabledMcpjsonServers` must exist in `.mcp.json` `mcpServers` → WARN per missing name.

**Stale workflow worktrees.**

```bash
find .claude/worktrees -maxdepth 1 -type d -name 'wf_*' -mtime +7 2>/dev/null
git worktree list --porcelain
```

Directories older than seven days, or not listed by `git worktree list` → WARN. Suggest `git worktree remove <path>` (or `git worktree prune` for orphans) after confirming nothing unmerged is inside.

**Permission bloat.**

```bash
jq '.permissions.allow | length' .claude/settings.local.json
```

More than 100 allow rules → WARN. Suggest running `/fewer-permission-prompts` to consolidate, and moving rules the whole team needs into the shared `.claude/settings.json`.

**Detect Read rules.** Workflows read the trust store, the user stacks directory, the installed plugin list and the plugin cache (each installed plugin's `stack.json`) outside the project, which needs four Read allow rules in the user settings:

```bash
node "${CLAUDE_SKILL_DIR}/../stack-trust/scripts/trust-store.mjs" --read-rules
```

Every rule `present` → PASS. Each `missing` rule → WARN that quotes the exact rule to add, for example `[WARN] Detect Read rule missing: Read(~/.claude/stacks/**) — run /stack-trust to add it`. Until they are present, Detect reports `trustStore unreadable` and runs no overlay manifest's commands. The default rules are `Read(~/.claude/sdd-kit/trusted-stacks.json)`, `Read(~/.claude/stacks/**)`, `Read(~/.claude/plugins/installed_plugins.json)` and `Read(~/.claude/plugins/cache/**)`; with `CLAUDE_CONFIG_DIR` set the script prints the absolute form of the last three. The first always names the trust store in the home directory the OS user database records (absolute when `$HOME` points elsewhere), because `$HOME` and `CLAUDE_CONFIG_DIR` do not move the store.

#### Check 11: Memory Reconcile

List every instruction source that loads into sessions for this project:

```bash
ls CLAUDE.md .claude/CLAUDE.md CLAUDE.local.md "$HOME/.claude/CLAUDE.md" 2>/dev/null
ls "$HOME/.claude/projects/$(pwd | sed 's|/|-|g')/memory/"*.md 2>/dev/null   # auto-memory
ls .claude/agent-memory/*/*.md .claude/agent-memory-local/*/*.md "$HOME/.claude/agent-memory/"*/*.md 2>/dev/null
```

Read them and flag pairs of instructions that contradict each other (e.g. "always use X" vs "never use X", different test commands, conflicting naming rules), or that contradict the framework's current behavior (references to retired components or renamed skills). Report each as WARN with both `file:line` locations, quoted. Never edit or delete memory; a human decides which instruction wins.

#### Check 12: Add-ons and Shadowing

Classify every installed SDD Kit add-on. All problems here are WARN, never FAIL.

**Selection.**
- Plugin mode: entries of `claude plugin list --json` whose id starts with `sdd-kit-`, plus any plugin whose `installPath` holds a `stack.json`. Without the `claude` CLI print `plugin add-ons: not checked (claude CLI not found)` (SKIP).
- Inline add-ons, in every mode: the plugin list never shows plugins loaded with `--plugin-dir`, so also run the inline step `node "${CLAUDE_SKILL_DIR}/../stack-trust/scripts/trust-store.mjs" --plugin-dirs --json`. It reads the `--plugin-dir <path>` and `--plugin-dir=<path>` flags of the Claude Code process and the directories under `.claude/stack-addons/`, and prints `{name, path, source, origin, stackJson}` per add-on. Skip the core (`sdd-kit`) and classify the rest like installed plugins, with `<path>` as the install path, `<name>` as `<plugin>`, and ` [plugin:<name>@inline (mode plugin)]` appended to the line, for example `sdd-kit-<stack> (stack: <key>): specialist <name> present; manifest valid [plugin:sdd-kit-<stack>@inline (mode plugin)]`.
- File-copy mode: the installed set from `.framework-manifest`, with `.claude/stacks/<key>.json` marking stack add-ons.

**Classification and line formats.**
- Stack add-on (ships `stack.json`): `<plugin> (stack: <keys>): specialist <name> present|missing; manifest valid|invalid`. A stack with no shipped specialist reads `sdd-kit-<stack> (stack: <key>): specialist general-purpose (none shipped); manifest valid`. A missing specialist or an invalid manifest is a WARN.
- Preset (`plugin.json` with `dependencies`, no components): `<plugin> (preset): depends on <deps>; each installed|missing`. A missing dependency is a WARN.
- Tool add-on (no `stack.json`, has components such as devenv, ops, design): `<plugin> (tool add-on): <n> skills, <m> agents present`. Each `skills:` preload that does not resolve is a WARN.

When neither selection finds a stack add-on, print `[PASS] no stack add-ons installed` with the hints: `install.sh --stack=<key>` for file-copy installs, `/plugin install sdd-kit-laravel-nextjs@sdd-kit` (or one `sdd-kit-<stack>` add-on) for plugin installs. A core-only install is valid and is never a FAIL.

**Mixed-mode shadowing.** When a plugin is enabled and a file-copy copy of the same component also exists, both load: skills load twice, agents shadow each other and kit hooks run twice. "Enabled" comes from `claude plugin list --json`: its `enabled` reflects `enabledPlugins` false entries from the project and local settings, so no separate settings merge is needed. Without the CLI, skip the check. Consider only enabled plugins whose id starts with `sdd-kit`.

```bash
# agents: flat and nested add-on layouts, matched by name against each enabled plugin's agents/
for f in .claude/agents/*.md .claude/agents/*/*.md; do
  [ -f "$f" ] && ls "$PLUGIN_PATH/agents/$(basename "$f")" 2>/dev/null && echo "SHADOW $f"
done
# hooks: match by basename (scripts/<name>.sh), as install-hooks.sh does
for s in "$PLUGIN_PATH"/scripts/*.sh; do
  n=$(basename "$s")
  jq -r --arg n "$n" '[.hooks // {} | .[][] .hooks[] | .command? // empty | select(endswith("/scripts/" + $n))] | .[]' .claude/settings.json 2>/dev/null
done
```

`$PLUGIN_PATH` is each enabled plugin's `installPath`. Read the plugin's own wiring from its `hooks/hooks.json` (core) or `hooks/hooks.json` in the add-on, and report only scripts that plugin wires.

- `.claude/agents/<agent>.md` or `.claude/agents/<addon>/<agent>.md` (the layout `install.sh` writes for add-on agents) next to an enabled plugin that ships `<agent>` → WARN: "`<file>` shadows the plugin agent `<plugin>:<agent>`. Fix: delete `<file>`."
- A kit hook script (for example `block-dangerous.sh`, or an add-on lint or test-first script such as `laravel-lint.sh`) wired both by an enabled plugin's `hooks/hooks.json` and in `.claude/settings.json` → one WARN listing all such scripts: "the hooks would run twice, and the plugin skills load a second time next to the file-copy skills. Fix: set `enabledPlugins` to false for the preset and each of its dependencies in `.claude/settings.json` (keep the file-copy install), or delete the entries naming these scripts from `.claude/settings.json` and the file-copy kit files."

#### Check 13: Node Version

The gate planner (`trust-store.mjs`, which `/lint`, `/run-tests` and `verification-gates` run through `stack-trust/scripts/launch.cjs`) needs Node 18 or later. Run `node --version` and report:

- Major 18 or later → `[PASS] Node: v<x> (18+ required)`.
- Below 18 → `[FAIL] Node: v<x> (18+ required): not run (Node 18+ required, found v<x>). Fix: put Node 18+ first on PATH`. Every gate would be reported not run.
- `node: command not found` or exit 127 → `[FAIL] Node: node not found on PATH. Fix: install Node 18+`.

Check the `node` first on PATH, the one the skills call; a newer node elsewhere (nvm, a version manager shim that is not active) does not count.

#### Check 14: Built-in Diagnostics

Always end with a SKIP-style note recommending the Claude Code built-ins, which check what this skill cannot see from files alone:

- `/skill-doctor` — skill loading, frontmatter, and trigger quality
- `/doctor prompt-audit` — size and overlap of everything loaded into the system prompt

### Phase 3: Report

```
Framework Health Check (project, v<version>)
========================================
[PASS] Directory structure: skills/, agents/, scripts/
[PASS] Skills flat: <n> discoverable, 0 nested; agents: <n>
[WARN] Manifest: 2 framework files modified locally
         skills/lint/SKILL.md
         agents/test-writer.md
[WARN] Workflow collision: .claude/workflows/my-ship.js reuses name "ship-feature"
         Rename its meta.name so both workflows can run.
[PASS] MCP config: .mcp.json valid (3 servers)
[PASS] Script permissions
[PASS] Path integrity
[PASS] Add-ons: no stack add-ons installed (--stack=<key> or /plugin install sdd-kit-laravel-nextjs@sdd-kit)
[WARN] Golden Triangle: docs/context/ not found
[PASS] Hooks wired and firing (block-dangerous exit=2)
[PASS] Node: v22.4.1 (18+ required)
[WARN] Settings: unknown key "autoReview" in .claude/settings.json (no effect)
[WARN] Permissions: 143 allow rules in settings.local.json — run /fewer-permission-prompts
[WARN] Memory: contradictory instructions
         CLAUDE.md:42 "Run tests with <test command>"
         ~/.claude/projects/.../memory/testing.md:3 "Always run tests via <wrapper command>"
[SKIP] Also run /skill-doctor and /doctor prompt-audit

Result: 7 passed, 6 warnings, 0 failures
```

In plugin mode the header names the plugin root, and the checks that only apply to file-copy installs are skipped:

```
Framework Health Check (plugin, v<version>)
========================================
Install: ~/.claude/plugins/cache/<marketplace>/sdd-kit/<version>
[PASS] Directory structure: skills/, agents/, scripts/
[PASS] Skills flat: <n> discoverable, 0 nested; agents: <n>
[SKIP] Manifest: plugin installs are managed by /plugin
[PASS] MCP config: plugin .mcp.json valid (<n> servers)
[PASS] Script permissions
[PASS] Path integrity
[WARN] Golden Triangle: docs/context/ not found
[SKIP] Hooks: loaded from the plugin's hooks/hooks.json — run /hooks to see them
[FAIL] Node: v11.15.0 (18+ required): not run (Node 18+ required, found v11.15.0). Fix: put Node 18+ first on PATH
[SKIP] Also run /skill-doctor and /doctor prompt-audit

Result: 5 passed, 1 warning, 1 failure
```

With `--fix`, also list what was fixed:

```
Fixes applied:
  [FIXED] Script permissions: chmod +x scripts/lint-check.sh
```

Then list remaining issues with the manual command for each.

## Output Markers

- `[PASS]` — check passed (shown only with `--verbose`)
- `[WARN]` — non-critical issue (always shown)
- `[FAIL]` — broken component (always shown)
- `[FIXED]` — fixed by `--fix`
- `[SKIP]` — not applicable in this mode, or an advisory note

End with the totals and, if anything is fixable, a suggestion to re-run with `--fix`.
