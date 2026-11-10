---
name: stack-trust
description: Review and approve overlay stack manifests (project .claude/stacks, user stacks directory, third-party plugin stack.json) before their gate commands run. Shows the commands, asks for confirmation, and records the manifest hash. Use when a workflow reports "not run (untrusted manifest)", when /sdd lists untrusted manifests, or after authoring a stack with /new-stack.
argument-hint: "[source]"
allowed-tools: Bash, Read, AskUserQuestion
disable-model-invocation: true
metadata:
  version: "1.0"
---

# /stack-trust

Overlay stack manifests carry gate commands (format, lint, test, scaffold, CI) that run on this machine. They run only after you approve the exact manifest content. Manifests inlined from the kit's own add-ons are first-party and never listed.

Approvals live in `<home>/.claude/sdd-kit/trusted-stacks.json` as `{"version":1,"trusted":[{sha256, keys, source, approvedAt}]}`, where `<home>` is the user's home directory from the OS user database. `$HOME` and `CLAUDE_CONFIG_DIR` do not move it, since a project setting can change both. The key is the sha256 of the canonical manifest, so any edit asks again. Workflows read approvals but never write them; only this skill does, through `trust-store.mjs`. User stacks and the user settings stay in the config directory (`CLAUDE_CONFIG_DIR`, else `~/.claude`). When that directory is inside the current directory, its git toplevel, `CLAUDE_PROJECT_DIR` or any ancestor of the current directory that holds `.git`, the script lists no user stacks from it, writes no settings there and reports `config directory inside the project`; approvals still go to the store in the home directory.

The script is `scripts/trust-store.mjs` in this skill's directory (`${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs`). Other skills call `trust-store.mjs check <manifest file>` (exit 0 trusted, 1 untrusted, 2 usage error, a manifest that is not valid JSON, or a manifest the workflows reject) before running a manifest's commands.

`--approve`, `--show` and `check` run the same manifest checks the workflows run (`mergeOverlay` in `workflows/lib/stacks.js`): schema validation with the overlay limits (unknown field, wrong type, string over 500 characters, file over 64 KB, and the rest), a key that reuses a first-party stack, and a stale first-party copy. The workflows drop such a manifest and run none of its commands, so `--approve` refuses it with exit 2 and `Not approved: the workflows reject <source>: <pointer> <problem>. Fix: <fix>.`, `check` reports it `rejected` with exit 2 (as it does for a file that is not valid JSON) even when its hash is in the store, and `--show` adds a `rejected` line with the same reason.

Sources carry the labels the workflows report: `project:.claude/stacks/<file>`, `user:~/.claude/stacks/<file>`, `plugin:<name>@<marketplace>` and `plugin:<name>@inline` (an add-on loaded with `--plugin-dir`: a directory or symlink under `.claude/stack-addons/`, or a `--plugin-dir` path on the Claude Code command line). `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --plugin-dirs` lists the inline add-ons this session sees. An inline add-on named like a first-party plugin (`sdd-kit-<stack>`) is listed only when it adds keys of its own, and is approved only by its full `plugin:<name>@inline` label; the short `plugin:<name>` form names the first-party plugin. Pass the label from a workflow's `Next: /stack-trust` line as `$ARGUMENTS` unchanged.

## Steps

1. List what is waiting: `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --list-untrusted`. With `$ARGUMENTS`, restrict to that source. If nothing is listed, say so and stop. If the script prints `trust store unreadable`, tell the user the store will be rewritten on the first approval.
2. For each source, run `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --show <source>` and present every field it prints, verbatim: each gate `command` (with `kind` and `unless`), `scaffold` (`command`, `tooling`), `ci` (`services`, `setup`), `e2e` (`run`, `seed`), `migrations`, `audit`, `contractSync.routeListCommand`, `buildGateGuard` (text added to every gate prompt), the package manager `run`/`exec` strings, `sourceDirs` and `debugPatterns` (both pasted into the debug-scan command of the gate prompt; an untrusted manifest's values are not used), and the agent name and plugin. When it prints `rejected`, show that reason, do not offer approval, and tell the user to fix the manifest. When it prints `pluginHooks`, show those hook commands too and say that Claude Code runs them whenever the plugin is loaded, whatever you decide here.
3. Ask with AskUserQuestion, one manifest at a time: approve, skip, or inspect the file first. Never approve on the user's behalf and never approve a source the user did not see.
4. On approval run `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --approve <source>`, then report the recorded hash.
5. End with: re-run the workflow that reported `Next: /stack-trust`.

## Read access for Detect

A workflow's Detect agent reads four locations outside the project with the Read and Glob tools: the store, the user stacks directory, the installed plugin list and the plugin cache, where each installed plugin's `stack.json` lives. Claude Code asks before any read outside the working directory, and a workflow agent cannot answer, so until these reads are allowed Detect reports `trustStore unreadable`, `user stacks unreadable` or `plugin list unreadable` and treats every overlay manifest as untrusted.

After the approvals (or on its own, when a workflow reported one of those errors), run `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --read-rules`. It prints `present` or `missing` for each rule. When any is missing, show the user the exact rules and ask with AskUserQuestion whether to add them to the user settings (`<config>/settings.json`). Only on a yes run `node ${CLAUDE_SKILL_DIR}/scripts/trust-store.mjs --add-read-rules`. With the default config directory the rules are:

```
Read(~/.claude/sdd-kit/trusted-stacks.json)
Read(~/.claude/stacks/**)
Read(~/.claude/plugins/installed_plugins.json)
Read(~/.claude/plugins/cache/**)
```

With `CLAUDE_CONFIG_DIR` set elsewhere the last three name that directory as an absolute `//` path, because a `~/.claude` rule does not cover it; the first names the store in the home directory, absolute when `$HOME` points elsewhere. `--read-rules` prints the right form. The script adds only these four rules, keeps every other setting and rule as it was, changes nothing when they are already present, and refuses a settings file that is not valid JSON. Never add a broader rule (such as all of `~/.claude`) and never edit the settings file another way.

## Rules

- Do not edit the store by hand or with any command other than `--approve`. The `block-dangerous.sh` hook refuses shell writes that name the store and `--approve` run by a subagent.
- A manifest that is not valid JSON, or that the workflows reject (`rejected` in `--show`, exit 2 from `--approve`), cannot be approved; point the user to the file and the reason.
- If a manifest changed since the last approval, say so: the old approval no longer applies.
