# Hosts: Claude Code, Codex and Cursor

SDD Kit 4.0 runs on three coding-agent hosts. Claude Code is the reference host and is unchanged. Codex and Cursor are an **unverified preview**: the adapters are built and covered by automated tests, but no real Codex or Cursor session has been recorded yet. They move to "supported" in a 4.0.x release once that evidence exists.

Install commands are in [INSTALLATION.md](installation.md#codex); first-session commands are in [GETTING-STARTED.md](getting-started.md#3a-first-session-on-codex-or-cursor). The bridge that runs workflows on Codex and Cursor is in [workflow-bridge.md](workflow-bridge.md). Model mapping per host is only in [effort-guidelines.md](effort-guidelines.md#model-tier-selection).

## Capabilities

| | Claude Code | Codex | Cursor |
|---|---|---|---|
| Status | Supported | Unverified preview | Unverified preview |
| Install | Plugin mode or file-copy | Plugin marketplace or `install.sh --host codex` | `install.sh --host cursor`; team marketplace through the dashboard |
| Skill invocation | `/sdd` (`/sdd-kit:sdd` in plugin mode) | `$sdd` | `/sdd` |
| Instruction file | `CLAUDE.md` (imports `AGENTS.md`) | `AGENTS.md` | `AGENTS.md` and `.cursor/rules/*.mdc` |
| Skills directory | `.claude/skills` | `.agents/skills` | `.cursor/skills` |
| Agents | `.claude/agents/*.md` | `.codex/agents/*.toml` (file copy only) | `.cursor/agents/*.md` |
| Background workflows | Native `Workflow` tool | Bridge MCP server, jobs run by Codex subagents | Bridge MCP server, jobs run by Cursor subagents |
| Hooks | `hooks.json` or `settings.json` | `.codex/hooks.json`, trusted through `/hooks` | `.cursor/hooks.json`, `failClosed` on the guard before shell commands and file writes |

## Parity limits

- **No token budget.** The bridge reports a budget of 0, so workflow branches that depend on remaining budget never trigger.
- **Subagent nesting.** Cursor does not let a subagent start further subagents, so every bridge job is started by the parent session. Codex subagents inherit the parent's sandbox and approvals.
- **Read-only roles.** Cursor maps a read-only job to a read-only subagent; Codex cannot enforce it and treats it as an instruction.
- **Prompt-type hooks.** The Stop and SubagentStop prompt hooks are Claude-only. Command hooks are registered under each host's own event names; a hook whose event a host lacks is listed in the registration plan instead of dropped silently.
- **Cursor after-tool output.** Cursor has no PostToolUse event for shell, web or MCP output, so the injection scan does not run there.
- **PreCompact.** Cursor has no pre-compaction event, so the checkpoint hook (`pre-compact-save.sh`) does not run there.
- **SubagentStop and Notification.** Cursor has neither event, so hooks registered on them are listed in the registration plan and not installed.
- **Skill list size.** Codex lists the name and description of every skill that allows implicit invocation at session start, and shortens descriptions once that list passes its limit. The package build estimates the list (name, description and 4 characters per skill) and warns above 8,000 characters; the core package stays at or under 7,500. Each installed add-on adds its own skills to the same list, so a project with several add-ons can pass the limit; skills marked `disable-model-invocation` are not listed.
- **Rules.** Codex has no rules directory; the rules a stack needs are folded into the job packets and the instruction file.
- **Cloud and IDE surfaces.** Codex plugins are not available in the IDE extension, and Cursor cloud agents skip session and user-level hooks.
- **Windows.** Not supported for Codex or Cursor.
- **Double loading.** Cursor can also load a Claude install through its Third-Party Imports setting; the installer warns when it finds one.

## Migrating from Claude Code

The workflows, skills, specs and `.ai/` artifacts are shared, so a spec written under Claude Code is executed unchanged on another host.

1. Keep `CLAUDE.md` as is. Its content already lives in `AGENTS.md` through the `@AGENTS.md` import, which Codex and Cursor read directly.
2. Install the kit for the new host next to the Claude install; the host layouts do not overlap.
3. Re-approve project stack manifests on the new host with `/stack-trust` (trust stores are per host).
4. Codex and Cursor can import a Claude setup themselves; do not combine that import with the kit install, or skills load twice.

Claude plugin-mode names (`/sdd-kit:<skill>`, `sdd-kit:<agent>`) do not change.

## Sources

Official documentation the claims above rest on:

- Codex plugins: https://developers.openai.com/plugins/build/plugins and https://learn.chatgpt.com/docs/plugins
- Codex hooks and trust: https://learn.chatgpt.com/docs/hooks
- Codex skills and subagents: https://learn.chatgpt.com/docs/build-skills and https://learn.chatgpt.com/docs/agent-configuration/subagents.md
- Codex AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Cursor hooks: https://cursor.com/docs/agent/hooks and https://cursor.com/docs/reference/third-party-hooks
- Cursor skills, subagents and rules: https://cursor.com/docs/skills, https://cursor.com/docs/subagents and https://cursor.com/docs/context/rules
- Cursor plugins and team marketplaces: https://cursor.com/docs/reference/plugins and https://cursor.com/docs/plugins
- Cursor MCP: https://cursor.com/docs/context/mcp
