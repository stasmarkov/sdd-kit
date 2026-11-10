---
name: framework-doctor
description: "Diagnose an SDD Kit installation on Codex and report PASS, WARN or FAIL per check: install layout, skills and agents present, runtime root, bridge registration, hooks wired and firing, stack trust store, workflow name collisions and leftover files. Non-destructive; --fix only sets script permissions and creates missing directories. Use when the kit seems broken or after an install or upgrade."
argument-hint: "[--verbose] [--fix]"
allowed-tools: Bash, Read
disable-model-invocation: true
metadata:
  version: "1.0"
---

# framework-doctor

Diagnose the health of an SDD Kit installation on this host and report issues. The trust-store check passes `--host codex` to the stack-trust script.

## Ground rules

- Every check is read-only. `--fix` only runs `chmod +x` on kit scripts and creates missing directories; everything else is reported with the exact command for the user to run.
- **FAIL** means something the kit relies on is broken (a component will not load, the bridge cannot start, or a safety hook does not fire). **WARN** means drift, leftovers or hygiene that is safe to ignore short-term.

## Phase 1: find the installation

Two forms exist. A file-copy install has `.codex/sdd-kit/` (the runtime root, with `installed.json`) in the project or in `~/.codex`, and skills in `.agents/skills`. A plugin install has the plugin cache under `~/.codex/plugins/cache/<marketplace>/sdd-kit/<version>/` with `runtime/` inside it. Report which one you found, its version (the `VERSION` file in the runtime root) and the runtime root path. When neither exists, print `[FAIL] No SDD Kit installation found` and the install command from the kit's README, and stop.

## Phase 2: checks

1. **Runtime root.** `bridge/server.mjs`, `hooks/dispatch.mjs`, `stacks.json`, `workflows/`, `agents/`, `scripts/` and `VERSION` exist. A missing entry is FAIL.
2. **Skills.** Every skill folder under the skills directory is one level deep and holds a `SKILL.md` whose `name` matches its folder. Skills listed in `installed.json` but missing on disk are FAIL. Folders named like kit skills but absent from `installed.json` are WARN (imported copies; `install.sh --host codex --prune` replaces them).
3. **Agents.** The shared agent files exist in `<runtime root>/agents/`. A workflow job for a missing agent falls back to the general-purpose role, so report it as WARN.
4. **Bridge.** `node <runtime root>/bridge/server.mjs` starts and answers a tools list request, or the host's MCP list shows the `sdd-kit` server. Report the Playwright server separately: missing is WARN.
5. **Hooks.** The merged `.codex/hooks.json` (file-copy) or the package `hooks/hooks.json` lists the kit entries, every command uses `dispatch.mjs`, and a harmless blocked payload exits 2: `echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' | node <runtime root>/hooks/dispatch.mjs PreToolUse --host codex --hook block-dangerous.sh`.
6. **Script permissions.** Kit scripts under `<runtime root>/scripts/` are executable. `--fix` applies `chmod +x`.
7. **Trust store.** Run `node <skills dir>/stack-trust/scripts/trust-store.mjs --host codex --list-untrusted`. Untrusted manifests are WARN with the `$stack-trust` command; `trust store unreadable` is WARN.
8. **Workflow collisions.** Project workflow files that reuse the name of a shipped workflow are WARN.
9. **Leftovers.** Files from an older install listed in no `installed.json` are WARN.

## Phase 3: report

Print one line per finding, `[PASS]`, `[WARN]` or `[FAIL]`, then a summary count and the fix command for each WARN and FAIL. Show PASS lines only with `--verbose`.
