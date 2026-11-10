---
name: new-stack
description: "Scaffold a new stack add-on (manifest, agent, conventions skill, lint hook) from the kit template, or stage a project-local stack. Use when the user wants SDD Kit to support a stack it does not ship, says \"add a stack\", \"new stack\", or \"scaffold a stack add-on\", or after sdd reports that no stack matched."
argument-hint: "[stack name]"
allowed-tools: Bash, Read, Write
disable-model-invocation: true
metadata:
  version: "1.0"
---

# new-stack

Creates the files that teach the workflows a stack: a `stack.json` manifest (detection rule, gates, agent), a specialist agent, a conventions skill scoped by `paths:`, and an async lint hook. The examples below use the fictional stack `acme`.

The script is `skills/new-stack/scripts/new-stack.mjs` in the SDD Kit runtime root, which is `../../runtime` relative to the directory that holds this SKILL.md; resolve that against the SKILL.md directory and run the script by its full path. It fills Markdown and shell files by substitution, builds JSON structurally, validates the manifest with the validator the workflows run, and refuses a stack key that already appears in the kit's core files. Every command below passes `--host cursor`, so project stacks go to `.cursor/stacks` and `.cursor/stack-addons`.

## Steps

1. Ask the user for the answers, one short question at a time, skipping what the argument already gives:
   - `name`: the stack key, for example `acme`.
   - `role`: backend, frontend, fullstack or mobile.
   - `detect`: one line on how to recognise the stack.
   - `paths`: the globs of its source files (required), for example `src/**/*.acme`.
   - `gates`: each gate's name, command and kind (format, lint, types, test, e2e, build or other). Ask for the kind of every gate; do not guess it.
   - `markers` (optional): globs at the project root that suggest the stack. These feed the session hint only.
2. Write the answers to a temporary JSON file:

   ```json
   {
     "name": "acme",
     "role": "backend",
     "detect": "a build file that requires the acme framework",
     "paths": ["src/**/*.acme"],
     "gates": [{ "name": "Acme tests", "command": "bin/acme-test", "kind": "test" }],
     "markers": ["acme.config.*"]
   }
   ```

3. Run the script: in the SDD Kit source checkout add the stack to the kit with `node ../../runtime/skills/new-stack/scripts/new-stack.mjs --host cursor --answers <file> --target src/plugins`; in any other project keep it local with `node ../../runtime/skills/new-stack/scripts/new-stack.mjs --host cursor --answers <file> --target project`.
4. If the script rejects the answers, show its message and fix the cause. A stack key that already appears in core files is rejected with a more specific key that the same check accepts. Path globs may use only letters, digits and `_ . / * ? -`.
5. Relay the script's next steps verbatim, and tell the user to run `/stack-trust` so the manifest's gate commands may run.

## Rules

- Never write a stack name into a kit core file by hand; the scaffold and the registry generator do that.
- Do not approve the new manifest for the user; `stack-trust` shows them the commands first.
