---
name: lint
description: Run the code quality suite - the format, lint and type-check gates of the detected stack (taken from the stack manifest) - in check or auto-fix mode, scoped to one repo or language if needed. Use when you want to validate style and static analysis before committing or opening a PR, or to auto-fix formatting issues.
argument-hint: "--fix | --check | --backend | --frontend"
allowed-tools: Bash, Read, Grep, Glob
metadata:
  version: "2.0"
---

# /lint

Run the format, lint and type-check gates of the detected stack. Gates come from the stack manifest, not from this file.

## Usage

```bash
/lint                # all format, lint and types gates, check mode
/lint --check        # check only (no fixes)
/lint --fix          # run the auto-fix form of formatter-class gates, then re-check
/lint --backend      # backend repo only
/lint --frontend     # frontend repo only
```

## How it works

1. **Find the repos and their stacks.** Single repo: run from its root. Polyrepo: backend and frontend from `repos: { backend, frontend }` paths, sibling folders, or a parent workspace. Label results by repo.
2. **Resolve the stack data** with the recipe in the `verification-gates` skill: project and user `.claude/stacks`, then the generated `stacks.json` for first-party keys, then plugin add-on manifests, else `other`. With no manifest, say `stack manifest not found`, suggest `/new-stack`, and run only the lint and format tooling the repo visibly has; when a manifest was rejected or untrusted, or the trust check is unavailable, run nothing and report `not run (no allowlisted gate)` instead (verification-gates step 4).
3. **Pick the gates.** Run kinds `format`, `lint` and `types`. Gates of any other kind (`test`, `e2e`, `build`, `other`, or no kind) are not run here; they run through `/run-tests`, `verification-gates` and the workflow Gates phases.
4. **Evaluate `unless`.** For each gate with `unless` globs, Glob the repo; a match is reported `skipped — <glob> present` and the gate is not run.
5. **Check trust.** For gates from a project or user manifest or a third-party plugin manifest, run `node ${CLAUDE_SKILL_DIR}/../stack-trust/scripts/trust-store.mjs check <manifest file>`. If the manifest is not trusted, print `not run (untrusted manifest). Fix: run /stack-trust.` for each gate and do not execute it. First-party entries are always trusted.
6. **Run the gates** in each repo's directory, with `<pm>` and `<pmx>` from the lockfile rule in `verification-gates`. With `--fix`, use the gate's auto-fix form for formatter-class gates only (the stack add-on's `references/quality-tools.md` names it), never for type errors or lint rules that change behavior.
7. **Report** per repo and gate. A tool that cannot run (not installed, broken environment) is `NOT RUN` with the reason, never `PASS`.

Tool options and examples per stack are in the stack add-on's conventions skill, under `references/quality-tools.md`.

## Output Format

```
Code Quality Report

api (<stack>)
  [PASS] Format           0 violations
  [PASS] Types            no errors
web (<stack>)
  [WARN] Lint             3 warnings, 0 errors
  [SKIP] Types            skipped — <glob> present
  [----] Custom gate      not run (untrusted manifest). Fix: run /stack-trust.

Summary: api PASS, web 3 warnings
Status: ready to commit
Recommendations: review the lint warnings in components/
```

**Source Verification**: Follow the `source-verification` skill.
