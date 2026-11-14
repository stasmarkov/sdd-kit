# Plugin mode vs file-copy mode

SDD Kit installs in two ways. Both ship the same agents, skills, workflows, and hook
scripts, but Claude Code treats plugin components differently from project files. This page
covers what changes and which guardrails need extra care.

This page is about Claude Code. For Codex and Cursor, see [hosts.md](hosts.md); their plugin and file-copy installs are in [INSTALLATION.md](installation.md#codex).

## Choosing a mode

| | Plugin mode | File-copy mode |
|---|---|---|
| Install | `/plugin marketplace add <repo>` then `/plugin install <name>@sdd-kit`, or `claude --plugin-dir <path>` | `./install.sh --project` (or `--user`) |
| Updates | `/plugin update`, same version for the whole team | Re-run the installer; `--dry-run` shows the diff |
| Hooks | `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` | `.claude/settings.json` with `$CLAUDE_PROJECT_DIR` |
| Permissions and env | Not applied from the plugin (see below) | `.claude/settings.json` |
| MCP servers | The plugin's root `.mcp.json` starts `context7` and Playwright MCP; the workflows' browser steps use it with no project entry, see [Playwright in plugin mode](installation.md#playwright-in-plugin-mode) | Project `.mcp.json` with the same two, merged, never overwritten |
| Names | Namespaced: `/sdd-kit:sdd` | Bare: `/sdd` |
| Project context | `CLAUDE.md`, `AGENTS.md`, and `.claude/rules/` are **not** installed | Installer creates them from templates when absent |
| Best for | Teams that want one pinned version | Projects that customize agents, or need agent-level guardrails |

You can combine them: install the plugin for components, then copy the project-context
templates by hand (`src/CLAUDE.template.md`, `src/templates/AGENTS.template.md`,
`src/templates/rules/`). Plugins never load a `CLAUDE.md` from the plugin itself, so
project context always lives in the project.

## Add-on plugins

The marketplace publishes the core plugin and the optional add-ons; the install commands are in [INSTALLATION.md](installation.md#plugin-mode).

In file-copy mode the same add-ons install with `./install.sh --stack=laravel,nextjs --with=ops`. Stack add-on skills are namespaced by their own plugin, for example `/sdd-kit-laravel:laravel-12`. Rules and third-party fragments of an add-on are file-copy only.

Every plugin component is namespaced under its plugin name:

- Skills: `<plugin>:<skill>`, for example `/sdd-kit:sdd` or
  `/sdd-kit-ops:deploy`.
- Agents: `<plugin>:<agent>`. Skills and agents are one level deep, so
  `src/agents/adversarial-reviewer.md` loads as `sdd-kit:adversarial-reviewer`. Workflows try
  the bare name first, then the namespaced one (the plugin comes from the stack manifest's `agent.plugin`), so they work in both modes.

Docs and prompts that use bare names (`/sdd`, `code-explorer`) are written for file-copy mode.
In plugin mode, Claude usually resolves them from the description, but scripts that name an
agent exactly must use the scoped name.

## Limitation: ignored agent frontmatter

Claude Code ignores these frontmatter fields on agents loaded from a plugin:

- `hooks`
- `mcpServers`
- `permissionMode`
- `initialPrompt`

The agent still loads; the field silently has no effect. Anything security-sensitive placed
there (a Bash guard that blocks `migrate:fresh`, a read-only `permissionMode: plan` reviewer,
an agent-only MCP server) is **off** in plugin mode.

**Kit status.** No agent in `src/agents/` or `src/plugins/*/agents/` currently uses
these fields, so nothing breaks today. To re-check:

```bash
grep -rlE '^(hooks|mcpServers|permissionMode|initialPrompt):' src/agents src/plugins/*/agents
```

**Rule for new agents.** Don't put guardrails in agent frontmatter. Put them in:

1. **Global hooks** in `hooks/hooks.json` (plugin) / `.claude/settings.json` (file-copy).
   Plugin hooks work in plugin mode and apply to the whole session, including subagents.
2. **`tools` / `disallowedTools`** in agent frontmatter. These are honored in plugin mode,
   so a read-only reviewer should drop `Write`/`Edit`/`Bash` instead of relying on `permissionMode`.
3. **File-copy install** for the rare agent that truly needs its own hooks or MCP servers.
   Document that requirement in the agent's description.

## Limitation: plugin settings.json

A plugin's root `settings.json` only applies `agent` and `subagentStatusLine`. Other keys
are dropped at load. In SDD Kit that means the root `settings.json`'s
`permissions.allow`/`permissions.deny` lists and `env.CLAUDE_BUDGET_THRESHOLD` **do not
apply in plugin mode**.

The global hooks still run, so command blocking goes through `scripts/block-dangerous.sh`
in both modes. To get the deny list and env as well, copy them into the project's
`.claude/settings.json` (shared with the team) or `~/.claude/settings.json` (personal).
`src/settings/settings.template.json` is the reference.

## Hooks that run in both modes

All of the kit's hooks are global (`hooks/hooks.json`), so plugin mode keeps them:

| Event | Script | Purpose |
|-------|--------|---------|
| PreToolUse (Bash) | `block-dangerous.sh`, `check-commit-msg.sh` | Block destructive commands; enforce commit format |
| PreToolUse (Write/Edit) | `laravel-test-first.sh`, `nextjs-test-first.sh` (stack add-ons) | Block edits to Laravel controllers, models and services, and Next.js components, until a matching test exists |
| PreToolUse (Read/Grep/Glob/Bash) | `token-budget.sh` | Block `find /`, and unbounded reads once context usage passes the threshold |
| PostToolUse (Write/Edit) | `laravel-lint.sh`, `nextjs-lint.sh` (stack add-ons), `scan-secrets.sh` | Lint changed files; catch secrets |
| PostToolUse (Bash/WebFetch/MCP) | `scan-injection.sh` | Flag prompt-injection patterns |
| SessionStart, UserPromptSubmit, PreCompact, SessionEnd, Stop, SubagentStop, Notification | various | Context load/save, prompt preflight, completion checks |

`hooks/hooks.json` is the source of truth. If this table and that file disagree, trust the file. Every hook, with how to tune or disable it, is in [src/hooks/README.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.1/share/hooks/README.md).

## Verifying an install

- `/plugin` → **Errors** tab shows components that failed to load.
- `claude plugin validate <path>` checks the manifest and agent frontmatter.
- `/hooks` lists active hooks; `/memory` lists loaded `CLAUDE.md`, `AGENTS.md`, and rules files.
- `/framework-doctor` (`/sdd-kit:framework-doctor` in plugin mode) checks that hooks fire and paths resolve.
