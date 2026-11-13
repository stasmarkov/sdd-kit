# Hooks

SDD Kit ships two kinds of scripts:

- **Claude Code lifecycle hooks** in `scripts/` (copied to `.claude/scripts/` in file-copy installs). Claude Code runs them on session, prompt, and tool events. They are described below.
- **Operational git/CI scripts** in `src/hooks/*.sh` (copied to `.claude/hooks/`). Claude Code never runs these; you wire them into git or CI yourself. See [Operational scripts](#operational-scripts).

For the hook API itself (events, matchers, exit codes, stdin/stdout JSON, async hooks), see the [official Claude Code hooks documentation](https://docs.claude.com/en/docs/claude-code/hooks).

## Lifecycle hooks

[`hooks/hooks.json`](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/hooks/hooks.json) is the source of truth. If this table disagrees with that file, trust the file. All command hooks need `jq`.

| Script | Event (matcher) | Blocks? | Purpose | Tune/disable |
|--------|-----------------|---------|---------|--------------|
| `session-start.sh` | SessionStart | No | Reports active specs with unchecked tasks and the latest `.ai/session/spec-*-state.json`, and suggests `/execute-task --continue` | Remove the entry |
| `stack-hint.sh` | SessionStart | No | Prints one line, once per project, when a stack's marker files are present but its add-on is not installed. See [Stack hint](#stack-hint) | `SDD_KIT_NO_STACK_HINT=1` or remove the entry |
| `post-compact-context.sh` | SessionStart (`compact`) | No | After compaction, re-injects the first 30 lines of `docs/context/{business-rules,architecture,workflow}.md`, the active spec count, and the latest session checkpoint | Remove the entry |
| `block-dangerous.sh` | PreToolUse (`Bash`) | Yes (exit 2) | Blocks `rm` on `/` or `/*`, force pushes to protected branches (see [Protected branches](#protected-branches)), and `DROP DATABASE`/`dropdb`. Guards the stack trust store: see [Trust store guard](#trust-store-guard) | `SDD_KIT_PROTECTED_BRANCHES` adds branches. Keep it on. Run the command yourself if you really mean it |
| `check-commit-msg.sh` | PreToolUse (`Bash`) | Yes (exit 2) | Makes `git commit -m` subjects follow Conventional Commits (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`) and stay within 72 characters. The scope is a lowercase area or a ticket key such as `PROJ-123` (`fix(PROJ-123): ...`); a key can also go at the end of the subject (`fix(refunds): ... (PROJ-123)`). Lets merge/revert messages and editor-based `--amend` through | Remove the entry |
| `token-budget.sh` | PreToolUse (`Read\|Grep\|Glob\|Bash`) | Yes (exit 2) | Always blocks `find /`. When context usage is at or above the threshold, it also blocks unbounded reads of 5,000+ line files, repo-wide content greps, `**` globs, unscoped recursive `grep`/`rg`, and `cat` of whole `.log` files | `CLAUDE_BUDGET_THRESHOLD` (default `75`, percent). Usage is read from `CLAUDE_CONTEXT_USAGE`. If that is unset, only the `find /` rule applies |
| `prompt-preflight.sh` | UserPromptSubmit | No | Adds guardrail context when a prompt targets production data, force pushes, `rm -rf /`, or skipping verification. Adds a hint to load the spec when a prompt references one | Remove the entry |
| `scan-secrets.sh` | PostToolUse (`Write\|Edit`) | Reports (exit 2) | Scans the written file with `gitleaks` if it is installed, otherwise with a regex bank. On a hit, tells Claude to remove the secret and rotate it. The file is already written by then | Remove the entry (not recommended) |
| `scan-injection.sh` | PostToolUse (`Bash\|WebFetch\|mcp__.*`), async | No | Scans the first 32 KB of tool output for prompt-injection patterns and warns Claude | Remove the entry |
| `pre-compact-save.sh` | PreCompact | No | Writes a `.ai/session/pre-compact-<timestamp>.json` checkpoint (active spec, done/pending task counts) | Remove the entry |
| `session-end.sh` | SessionEnd, async | No | Writes a session summary (branch, uncommitted changes, recent commits) to `.ai/session/<timestamp>.md` and deletes summaries older than 30 days | Remove the entry |
| `notify.sh` | Notification | No | Shows a desktop notification | See [Notifications](#notifications) |
| *(prompt)* | Stop | Yes | Before Claude stops, checks that completed tasks have passing tests, no uncommitted changes are left unexplained, and session state is saved mid-spec | See [Stop and SubagentStop checks](#stop-and-subagentstop-checks) |
| `lesson-nudge.sh` | Stop | No | Records a candidate lesson in `.ai/session/lessons.jsonl` and suggests `/learn`. See [Candidate lessons](#candidate-lessons) | Remove the entry |
| *(prompt)* | SubagentStop | Yes | Checks that the subagent finished its task, and flags errors or incomplete results for a retry | Remove the entry |

Stack add-ons add their own hooks; see [Add-on hooks](#add-on-hooks).

Blocking PreToolUse hooks (`token-budget.sh` and the test-first scripts) answer with `hookSpecificOutput` (`hookEventName: "PreToolUse"`, `permissionDecision: "deny"`, `permissionDecisionReason`) on stdout and exit 2. On exit 2, Claude Code and the Codex and Cursor dispatcher read only stderr, so a blocking script must also write the reason to stderr; otherwise Claude sees the block without the reason. New blocking scripts do both.

Environment variables such as `CLAUDE_BUDGET_THRESHOLD` and `CLAUDE_SKIP_TEST_FIRST` can go in your shell or in the `env` block of `settings.json`. Both work in either install mode:

```json
{ "env": { "CLAUDE_BUDGET_THRESHOLD": "85", "CLAUDE_SKIP_TEST_FIRST": "1" } }
```

To turn off every hook temporarily, set `"disableAllHooks": true` in `settings.json`.

## Where hooks are configured

| Mode | File | Script path |
|------|------|-------------|
| Plugin | `hooks/hooks.json` in the plugin | `"${CLAUDE_PLUGIN_ROOT}"/scripts/<name>.sh` |
| File-copy, project | `.claude/settings.json` | `"$CLAUDE_PROJECT_DIR"/.claude/scripts/<name>.sh` |
| File-copy, user | `~/.claude/settings.json` | `"$HOME"/.claude/scripts/<name>.sh` |

In file-copy mode, `src/scripts/install-hooks.sh` merges the hooks into your existing `settings.json`. It needs `jq`, backs up the file first, and keeps your permissions and your own hooks. Re-running the installer replaces the kit's hooks instead of duplicating them. That also restores any kit hook you deleted, so use the env-var opt-outs above for hooks you want to keep off. Installer behavior is covered in [INSTALLATION.md](../docs/INSTALLATION.md).

**Plugin mode.** The plugin's `hooks/hooks.json` is global. It applies to the whole session, subagents included, and you can't edit it per project. Use the env-var opt-outs or `disableAllHooks` instead. For what does and doesn't apply in plugin mode, see [plugin-mode.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/docs/reference/plugin-mode.md).

**Drift rule.** `src/settings/settings.template.json` must contain exactly the hooks in `hooks/hooks.json`, differing only in the script path prefix. `./verify.sh` fails the build if they drift. When you add or change a hook, edit both files.

**Codex and Cursor.** Codex reads `.codex/hooks.json` and Cursor reads `.cursor/hooks.json` (or the plugin's hooks). The installer writes them with the script path for that host: `$CURSOR_PROJECT_DIR` for a Cursor project install, the plugin root variable in a Codex package. Codex requires you to trust every hook once through `/hooks`, and again whenever a hook changes. Cursor sets `failClosed` on `block-dangerous.sh` where it runs before the action (`beforeShellExecution` and `preToolUse` on writes), so an error in the guard blocks the shell command or the write instead of letting it through. `scan-secrets.sh` and `gate-guard.sh` run on `afterFileEdit`, after Cursor has written the file: there they report a finding to the agent but cannot block or undo the edit, so they carry no `failClosed`. These hosts register the same command hooks under their own event and tool names, read from the host table; prompt-type hooks are not carried. A hook whose event a host lacks is listed in the registration plan (`hostHookPlan().dropped` in `src/adapters/hooks/registrations.mjs`) rather than lost without a trace. Known gap: Cursor has no after-tool event for shell, web or MCP output, so `scan-injection.sh` does not run there. Any other missing security hook fails the tests.

## Add-on hooks

The test-first and lint hooks live in the stack add-ons, not in core. Each add-on ships its own `hooks/hooks.json` (plugin mode loads it with the plugin) and uniquely named scripts in its `scripts/` folder, which file-copy installs stage flat into `.claude/scripts/`:

| Script | Event (matcher) | Blocks? | Purpose | Tune/disable |
|--------|-----------------|---------|---------|--------------|
| `<stack>-test-first.sh` | PreToolUse (`Write\|Edit`) | Yes (exit 2) | Blocks edits to the stack's source files until a matching test file exists. An add-on may only warn (a system message, exit 0) for some source folders and leave others unguarded | `CLAUDE_SKIP_TEST_FIRST=1` |
| `<stack>-lint.sh` | PostToolUse (`Write\|Edit`), async | No | Runs the stack's linter or formatter check on changed files and reports issues as a system message. Where the stack's gates run through an exec wrapper, the lint script uses the same wrapper when its environment is running, and never starts it | Skipped automatically when the tool or its standard isn't installed |

The add-on's own documentation lists which source patterns and tools each script covers.

Each script filters by file type itself, so an add-on script exits 0 for files that belong to another stack. The `hooks.json` entries carry no `if` field. `install-hooks.sh <template> <settings.json> <project|user> [<addon hooks.json>...]` merges the add-on files after the core template and swaps `"${CLAUDE_PLUGIN_ROOT}"/scripts` for the install's script prefix. It also unwires the old core `lint-check.sh` and `test-first-check.sh` entries from existing installs.

## Stack hint

`stack-hint.sh` reads the generated `workflows/lib/stacks.json` (`markers`, which are globs relative to the project root that match files or directories). When a first-party stack's marker matches and neither its add-on nor a preset including it is enabled (`enabledPlugins` in the user, project or local settings) or staged (`.claude/stacks/<add-on>.json` in the project or under the config directory), it prints one line naming the stack, the `/plugin install` command and `install.sh --stack=<add-on>`. When no marker matches at the root, each subdirectory one level down (except `vendor`, `node_modules` and dot directories) is tested for the markers and for the stack's manifest `packages` in the package files they name, so a site kept in `site/` gets the same hint. The project is then recorded as the SHA-256 of `pwd -P` in `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/sdd-kit/stack-hint-shown`, and later sessions stay silent. It always exits 0. Set `SDD_KIT_NO_STACK_HINT=1` to turn it off.

## Trust store guard

An approval in `<home>/.claude/sdd-kit/trusted-stacks.json`, where `<home>` is your home directory from the OS user database (never `$HOME` or `CLAUDE_CONFIG_DIR`), lets an overlay stack manifest's commands run, so only `/stack-trust`, after the user has reviewed the manifest, may write it. `block-dangerous.sh` refuses:

- `trust-store.mjs --approve` when the hook input carries an `agent_id`, that is, when a subagent or workflow agent runs it. The main session running `/stack-trust` is allowed.
- Shell commands that name `trusted-stacks.json` and could write it: an output redirect (other than to `/dev/null` or a descriptor), `tee`, `cp`, `mv`, `rm`, `ln`, `install`, `rsync`, `truncate`, `dd`, `touch`, `chmod`, `chown`, an editor, `sed -i`, or inline code passed with `-e`, `-c`, `-p`, `--eval` or `--print`.

Reading the store stays allowed. Detect reads it with the Read tool on its literal path (never `cat` or `jq`, which Claude Code refuses outside the project) and returns its text to the workflow; a shell read such as `jq` or `test -f` in the main session is not blocked either. The hook is wired to `Bash` only; the Write and Edit tools are held back by Claude Code's own rule that writes outside the project directory need permission, since the store lives in your home directory, outside any project. The trust decision itself is made by the workflow script from the store's hashes.

**Limits.** The guard is a speed bump for agents that follow the documented path, not a security boundary. It matches text in the command, so it does not stop a command that names neither the store file nor `--approve`, for example:

- inline code that imports the script and calls its export: `node -e "import('<path>/trust-store.mjs').then((m) => m.approve('<source>'))"`;
- a script file written first and run afterwards, or a file name assembled from variables or an environment value;
- the main session (no `agent_id`) running `trust-store.mjs --approve` itself;
- Write or Edit on the store when the session's permission mode already allows writes outside the project;
- a symlink that points at the store, written through afterwards, and a glob that hides the file name but not its directory (`sdd-kit/*`).

The shell check is best-effort hardening. It does match the store name and paths without regard to case, reads the command with quotes and backslashes removed (so `--appro""ve` is still `--approve`), treats a glob that matches the store file name as naming it, and treats a shell command starting with `apply_patch` as a patch. It never blocks a read-only tool. Anything beyond that is a known limit, not a defect to chase: a stronger control needs the trust script itself to refuse, which this kit does not do.

**Threat model (OD-17).** A stack manifest that is neither first-party nor approved by `/stack-trust` (hash-matched) never supplies a command, path, URL or other value that reaches a shell, a gate plan or an agent prompt as an instruction. The workflows also check every value Detect and the scaffold report against a strict pattern (paths, `devUrl`, `packageManager`, gate and script names, prose) before quoting it, and drop and log the rest. Skills verify the trust script against a hash shipped in the kit, never one stored in the project. The trust store lives in the home directory the OS user database records, so neither `$HOME` nor `CLAUDE_CONFIG_DIR` (both of which a project setting can change) can point it into a repository. A config directory that resolves inside the project (the current directory, its git toplevel, `CLAUDE_PROJECT_DIR`, or any ancestor of the current directory that holds `.git`) is refused as well: the user stacks and plugin list there count as unreadable, and `trust-store.mjs` writes no settings there. Out of scope: running workflows on a repository you do not trust. Agents read repository files and have Bash, so hostile repository content can steer them regardless of `/stack-trust`, which controls manifests, not repository content. Full rules: [stack-manifest.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/docs/reference/stack-manifest.md#agent-and-trust).

What keeps an untrusted manifest's commands from running is the review step: an approval records the manifest's hash, and any edit to the manifest makes it untrusted again. Review the diff of `trusted-stacks.json` (or run `trust-store.mjs --list`) if an approval you did not give shows up.

## Protected branches

`block-dangerous.sh` refuses a force push to a protected branch. The protected branches are:

- `main` and `master`;
- the remote's default branch, read from `refs/remotes/<remote>/HEAD` (for example `develop` on a git-flow repository, or `trunk`). A clone sets it; in a repository made with `git init` and `git remote add`, run `git remote set-head origin -a` once;
- every branch matching `SDD_KIT_PROTECTED_BRANCHES`: branch names or globs separated by spaces or commas, such as `export SDD_KIT_PROTECTED_BRANCHES='develop release/*'`. Set it in the shell that launches Claude Code, Codex or Cursor. It only adds branches; nothing removes `main`, `master` or the default branch.

A push counts as forced when it has `--force`, `-f` (also inside a group such as `-uf`), `--force-with-lease`, `--force-if-includes` or `--mirror`, or an abbreviation git accepts for one of them (`--force-with`, `--mirr`), wherever the flag sits, or a refspec starting with `+`. The destination is the part after `:` without `refs/heads/` or `heads/`; `HEAD` and `@` stand for the current branch, and a wildcard destination such as `refs/heads/*` is checked against main, master and every local and remote-tracking branch it matches. A push with no refspec is checked against the current branch and its upstream, and against every local branch when `push.default` is `matching` (in the repository config or an inline `-c`) or an inline `-c remote.<name>.push` is set; `--all` or `--mirror` is checked against every local branch. `git -C <dir>` and an earlier `cd <dir>` on the same line pick the repository, `-c` and `--config-env` values are skipped as values, and `sudo`, `env`, `bash -c` and subshell forms are read the same way. A command that runs an alias defined inline with `-c alias.<name>=` and able to push is blocked, because its target cannot be read.

The hook reads each command segment (split at `;`, `&&`, `||`, `|` and newlines) on its own, so a forced push to `mainline-fix`, or one to a feature branch followed by `echo main`, is allowed. It only calls git when a segment looks like a forced push. It reads quoted text as words too, so a commit message that spells out a forced push to `main` is blocked; run that commit from your terminal.

**Limits.** Deleting a branch (`git push origin :main`, `--delete`) is not checked, and neither is a target set only by `remote.<name>.push` in git config, nor a push run through an alias defined in git config (the hook does not expand aliases). Like the trust store guard, this is best-effort hardening: branch protection on the code host is the real boundary, so turn it on for the same branches.

## Notifications

`notify.sh` uses `osascript` on macOS, `notify-send` on Linux (install `libnotify-bin`), and a PowerShell message box on Git Bash/MSYS2/Cygwin. It shows the message and title Claude Code sends with the notification, falling back to "Claude Code needs your attention" when none is given. If `notify-send` is missing it does nothing.

## Stop and SubagentStop checks

Both are `prompt` hooks: a model reviews the context and either allows the stop or blocks it with a reason. A Stop check that keeps blocking would loop forever, so the prompt includes an escape hatch: *"If this is a re-check after a previous stop attempt, allow stopping."* After one round of verification, Claude can always stop. Keep that sentence if you edit the prompt.

## Candidate lessons

`lesson-nudge.sh` reads the last 200 transcript lines when Claude stops and records a pending line in `.ai/session/lessons.jsonl` (`{at, session, signal, excerpt, status}`) for each of these signals:

| Signal | Fires when | `excerpt` |
|--------|-----------|-----------|
| `workflow verdict <V>` | One tool result holds both `"recommendation": "<V>"`, with `<V>` FIX-FIRST, BLOCKED or NOT-RESOLVED, and a `"reportPath"` under `.ai/reports/` ending in `.md`. Any workflow whose result has both fields counts (ship-feature, fix-bug) | `<V> <reportPath>` |
| `review verdict <V>` | One assistant message holds CHANGES_REQUIRED or BLOCKED and a `.ai/reviews/REVIEW-<name>.md` path, as the `/deep-review` summary does | `<V> <path>` |
| `user correction` | A typed user message reads as a correction ("no, ...", "you forgot ...", "don't use ...") | The correction, up to 200 characters |
| `fix-bug Prevention item` | A fix-bug result asks to run `/learn` with its Prevention item | Empty |

A verdict counts only with its report in the same entry, so skill and doc text that mention a verdict word (skill text sits in user entries, which are not searched for verdicts) and a verdict without a saved report record nothing. Verdicts are deduped per session per excerpt: two runs with different reports give two lessons, and the same report seen at a later stop gives none. Corrections and Prevention items are recorded once per session. The hook never blocks and never edits project files; `/learn` reads the pending lines, marks them captured or dismissed, and offers to drop empty-excerpt lines left by older versions.

## Agent-scoped hooks

Don't put guardrails in agent frontmatter (`hooks:`, `permissionMode:`). Plugin mode ignores those fields without warning, so a guard defined there is off for plugin users. Put guards in the global hooks above, or restrict the agent's `tools`. Details are in [plugin-mode.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/docs/reference/plugin-mode.md).

## Operational scripts

These live in `src/hooks/` (`.claude/hooks/` after a full file-copy install). Run them from the project root.

| Script | Purpose | Wire into |
|--------|---------|-----------|
| `pre-commit.sh` | Blocks uppercase markdown filenames under `docs/` and `.ai/` (only `CLAUDE.md` and `README.md` are exempt), warns on files over 1 MB, then runs the stack fragments | Git pre-commit hook |
| `post-test.sh` | Reports a test results file, then runs the stack fragments (coverage against `COVERAGE_THRESHOLD`, default `80`, and slow tests) | CI after the test step |
| `pre-deploy.sh <env>` | Checks git state, env files, secrets, and recent test results, then runs the stack fragments | CI/CD before deploy |
| `post-deploy.sh <env> [url]` | Health check, then the stack fragments, then a deployment log entry | CI/CD after deploy |

The scripts exit non-zero when a blocking check fails; warnings do not fail them. To wire `pre-commit.sh` into git:

```bash
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
exec .claude/hooks/pre-commit.sh
EOF
chmod +x .git/hooks/pre-commit
```

### Stack fragments (run-parts)

The four scripts are dispatchers. Stack checks live in fragments that add-ons ship at `src/plugins/<add-on>/hooks/<stage>.d/NN-<add-on>.sh` (`NN` from 10 to 90, first-party add-ons use 50) and that `install.sh --full` stages to `.claude/hooks/<stage>.d/`. Plugin mode does not run them; run `install.sh --full` if you want them.

The contract each dispatcher follows:

1. Run the stack-neutral checks first.
2. Run every regular `*.sh` in `<stage>.d/` (next to the dispatcher) in `LC_ALL=C` lexical order, in the caller's working directory, passing the dispatcher's arguments (`"$@"`).
3. Skip a file that is not executable and print `skipped <file> (not executable)`. Other names are ignored.
4. Run all fragments even after a failure, then exit 1 and print `failed: <list>` if any failed or a neutral check failed.
5. With no fragment directory or no executable fragment, print `no stack checks installed` and exit with the result of the neutral checks.

Fragments are committed with mode 100755; `./verify.sh` asserts it. To add your own check, drop an executable `NN-name.sh` into the stage directory.

## Checking hooks work

- `/hooks` in a live session lists every active hook and the file it came from.
- `/framework-doctor` (`/sdd-kit:framework-doctor` in plugin mode, where skills are namespaced) checks that the hooks are wired into `settings.json`, that the scripts exist and are executable, and that `block-dangerous.sh` blocks a harmless test payload with exit 2. Nothing gets executed. In plugin mode it skips the wiring check because the hooks come from `hooks/hooks.json`.
- To test one script by hand, pipe JSON into it:

```bash
echo '{"tool_input":{"command":"git push --force origin main"}}' | .claude/scripts/block-dangerous.sh; echo "exit=$?"
```
