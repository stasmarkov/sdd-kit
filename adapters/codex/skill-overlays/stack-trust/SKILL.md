---
name: stack-trust
description: "Review and approve overlay stack manifests (project .codex/stacks, user stacks directory, add-on stack.json) before their gate commands run. Shows the commands, asks for confirmation, and records the manifest hash. Use when a workflow reports \"not run (untrusted manifest)\", when stack_list shows an untrusted manifest, or after authoring a stack with new-stack."
argument-hint: "[source]"
allowed-tools: Bash, Read
disable-model-invocation: true
metadata:
  version: "1.0"
---

# stack-trust

Overlay stack manifests carry gate commands (format, lint, test, scaffold, CI) that run on this machine. They run only after you approve the exact manifest content. Manifests from the kit's own add-ons are first-party and never listed.

Approvals live in `<home>/.codex/sdd-kit/trusted-stacks.json`, where `<home>` is the user's home directory from the OS user database. `$HOME` and `CODEX_HOME` do not move it, since a project setting can change both. The key is the sha256 of the canonical manifest, so any edit asks again. Workflows read approvals but never write them; only this skill does, through `trust-store.mjs`. Every command below passes `--host codex`, which selects this host's store and its stacks directories.

The script is `scripts/trust-store.mjs` in this skill's directory, next to this SKILL.md; run it by its full path. Other skills call `trust-store.mjs --host codex check <manifest file>` (exit 0 trusted, 1 untrusted, 2 usage error, invalid JSON, or a manifest the workflows reject) before running a manifest's commands.

Sources carry the labels the workflows report: `project:.codex/stacks/<file>`, `user:~/.codex/stacks/<file>` and `plugin:<name>@<marketplace>`. Pass the label from a workflow's `Next:` line as the argument unchanged.

## Steps

1. List what is waiting: `node scripts/trust-store.mjs --host codex --list-untrusted`. With an argument, restrict to that source. If nothing is listed, say so and stop. If the script prints `trust store unreadable`, tell the user the store will be rewritten on the first approval.
2. For each source, run `node scripts/trust-store.mjs --host codex --show <source>` and present every field it prints, verbatim: each gate `command` (with `kind` and `unless`), `scaffold`, `ci`, `e2e`, `migrations`, `audit`, `contractSync.routeListCommand`, `buildGateGuard`, the package manager `run` and `exec` strings, `sourceDirs`, `debugPatterns`, and the agent name and plugin. When it prints `rejected`, show that reason, do not offer approval, and tell the user to fix the manifest.
3. Ask the user, one manifest at a time, whether to approve, skip, or inspect the file first. Never approve on the user's behalf and never approve a source the user did not see.
4. On approval run `node scripts/trust-store.mjs --host codex --approve <source>`, then report the recorded hash.
5. End with: re-run the workflow that reported the untrusted manifest.

## Rules

- Do not edit the store by hand or with any command other than the approve flag above. The guard hook refuses shell and patch writes that name the store.
- A manifest that is not valid JSON, or that the workflows reject (`rejected` in `--show`, exit 2 from the approve flag), cannot be approved; point the user to the file and the reason.
- If a manifest changed since the last approval, say so: the old approval no longer applies.
