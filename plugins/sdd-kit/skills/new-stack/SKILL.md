---
name: new-stack
description: Scaffold a new stack add-on (manifest, agent, conventions skill, lint hook) from the kit template, or stage a project-local stack. Use when the user wants SDD Kit to support a stack it does not ship, says "add a stack", "new stack", or "scaffold a stack add-on", or after /sdd reports that no stack matched.
argument-hint: "[stack name]"
allowed-tools: Bash, Read, Write, AskUserQuestion
disable-model-invocation: true
metadata:
  version: "1.0"
---

# /new-stack

Creates the files that teach the workflows a stack: a `stack.json` manifest (detection rule, gates, agent), a specialist agent, a conventions skill scoped by `paths:`, and an async lint hook. The field reference is [stack-manifest.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/stack-manifest.md). The examples below use the fictional stack `acme`.

The script is `scripts/new-stack.mjs` in this skill's directory (`${CLAUDE_SKILL_DIR}/scripts/new-stack.mjs`). It fills Markdown and shell files by substitution, builds JSON structurally, validates the manifest with the same validator the workflows run, and refuses a stack key that already appears in the kit's core files.

## Steps

1. Ask for the answers with AskUserQuestion, one short question at a time, skipping what `$ARGUMENTS` already gives:
   - `name`: the stack key, for example `acme`.
   - `role`: backend, frontend, fullstack or mobile.
   - `detect`: one line on how to recognise the stack, for example `a build file that requires the acme framework`.
   - `paths`: the globs of its source files (required), for example `src/**/*.acme`.
   - `gates`: each gate's name, command and kind (format, lint, types, test, e2e, build or other). Ask for the kind of every gate; do not guess it.
   - `markers` (optional): globs at the project root that suggest the stack, for example `acme.config.*`. These feed the SessionStart hint only.
2. Write the answers to a temporary JSON file:

   ```json
   {
     "name": "acme",
     "role": "backend",
     "detect": "a build file that requires the acme framework",
     "paths": ["src/**/*.acme", "config/**/*.yaml"],
     "gates": [
       { "name": "Acme format", "command": "bin/acme-format --check", "kind": "format" },
       { "name": "Acme tests", "command": "bin/acme-test", "kind": "test" }
     ],
     "markers": ["acme.config.*"]
   }
   ```

   Without a `kind` the script uses `other`; with `--interactive` it asks instead.
3. Choose the target and run the script:
   - In the SDD Kit source checkout, add the stack to the kit: `node ${CLAUDE_SKILL_DIR}/scripts/new-stack.mjs --answers <file> --target src/plugins`. It writes `src/plugins/acme/`, adds the `categories.json` entries and regenerates the registry and indexes.
   - In any other project, keep the stack local: `node ${CLAUDE_SKILL_DIR}/scripts/new-stack.mjs --answers <file> --target project`. It writes `.claude/stacks/acme.json` (with `agent.plugin: sdd-kit-acme`) and the add-on under `.claude/stack-addons/sdd-kit-acme/`.
4. If the script rejects the answers, show its message and fix the cause. A stack key that already appears in core files is rejected with the list of hits and a more specific key that the same check accepts; use that one or another specific key. For a project target, a first-party key (any key in the core registry, and `other`) and an agent named like a core agent are rejected too; the message names the add-on that provides the key, which may have a different name than the key (`other` needs none). Path globs may use only letters, digits and `_ . / * ? -`; a lint-like gate whose command uses shell syntax (`;`, `|`, `$( )`, quotes, an environment prefix) stays in the manifest but is left out of the lint hook.
5. Relay the script's next steps verbatim. For a project target they are: start Claude Code with `--plugin-dir .claude/stack-addons/sdd-kit-acme` so the agent, skill and hook load; in file-copy mode workflows fall back to the default agent; run `/stack-trust` so the manifest's gate commands may run.

## Rules

- Never write a stack name into a kit core file by hand; the scaffold and the registry generator do that.
- A lint hook runs a gate only when its tool is present and never starts a package runner. Gates that start with one are left out of the hook (they still run as workflow gates once trusted).
- Do not approve the new manifest for the user; `/stack-trust` shows them the commands first.
