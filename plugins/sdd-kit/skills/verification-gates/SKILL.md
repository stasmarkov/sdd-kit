---
name: verification-gates
description: Standard post-implementation quality gates (format, lint, types, tests, coverage, build, browser journeys, accessibility, contract sync) taken from the stack manifest, the one recipe for finding stack data (gates, audit, scaffold, migrations) that /lint, /run-tests, /security-scan, /generate and the migrate commands share, and how to report gates. Use after implementing any change, before declaring it done; "tool unreachable" is never a pass.
user-invocable: false
---

# Verification Gates

Standard quality checks to run after implementation. Apply them from any skill or workflow that changes code; the `code-quality` agent runs them as one verification step. The gates come from the stack manifest, so a gate that runs in a workflow runs here too. Other skills (`fix-ci`, `open-pr`, `run-tests`, `lint`) point here for the gate set, the stack-data recipe and the package-manager rule instead of keeping their own copies.

Run each repo's gates in that repo (in a polyrepo project, the backend gates in the backend repo and the frontend gates in the frontend repo). Use only tools that are installed, but a tool that should run and cannot is reported as unreachable, never skipped silently.

## Finding the stack data (the recipe)

Skills that need stack data (`lint`, `run-tests`, `verification-gates`, `generate`, `security-scan`, `upgrade-deps`, `fix-ci`, `learn`, `execute-task`, `simple-task` and the migrate commands) resolve it with these four steps, in this order. The workflows' Detect phase uses the same sources in the same order.

1. **Project and user manifests.** `.claude/stacks/*.json` in the project, then `<config>/stacks/*.json` with the Glob and Read tools, in both install modes. `<config>` is the path `echo "$CLAUDE_CONFIG_DIR"` prints, else the path `echo "$HOME"` prints plus `/.claude`, written out literally. When `<config>` is the project directory or inside it, read nothing there: report `config directory inside the project` and treat the user stacks as unreadable. The trust store is not under `<config>`: the trust check below reads it from the home directory the OS user database records. Use only entries that are not first-party copies of a built-in key.
2. **First-party keys.** The generated `stacks.json`: `${CLAUDE_PLUGIN_ROOT}/workflows/lib/stacks.json` in plugin mode, `.claude/workflows/lib/stacks.json` in a file-copy install. Read it with `jq` or Read and take the entry for the detected key (`entries.<key>`). No add-on discovery is needed for the first-party stacks.
3. **Third-party plugin add-ons.** `claude plugin list --json`, then `<installPath>/stack.json` of each enabled add-on; failing that, the path the add-on's conventions skill states when loaded.
4. **Nothing found.** Behave as the `other` stack: run the format, lint and test tooling the repo visibly has, label the result `stack manifest not found`, and suggest `/new-stack` with target `project`. This fallback applies only when no manifest found in steps 1 and 3 was rejected (the trust check exits 2), untrusted, or left unchecked because the trust check is unavailable. Otherwise run nothing and report the gates as `not run (no allowlisted gate)`.

**Repos and stack keys.** Find the repos the way `/lint` does: a single repo is its own root; in a polyrepo project, take the paths from `repos: { backend, frontend }`, else sibling folders or a parent workspace. Each repo's key is the `name` of the manifest whose `detect` rule matches it, searched in the order above. A matched overlay with `extends: K` resolves through first-party K's entry: when it is trusted, the fields it declares (`agent` included) replace K's; when it is untrusted, rejected or left unchecked, it is ignored and the repo stays on first-party K. A non-extending overlay that is not trusted supplies no gate, specialist or skill. The workflows' Detect phase applies the same rules.

The manifest fields used here: `execWrapper`, `gates[]` (`name`, `command`, `kind`, `unless`, `requires`), `debugPatterns`, `audit[]`, `skills.scaffold`, `migrations`, `e2e`, `packageManagers`.

### Trust

Gates from step 1 or step 3 (overlay manifests) run only when the manifest hash is trusted. Check with `node ${CLAUDE_SKILL_DIR}/../stack-trust/scripts/trust-store.mjs check <manifest file>` (the `/stack-trust` skill's script, beside this skill in both plugin and file-copy installs). Claude Code substitutes `${CLAUDE_SKILL_DIR}` in skill content. Verified 2026-10-26 on Claude Code 2.1.292: a plugin-mode agent that preloads this skill sees the variable expands to an absolute path; Claude Code does not document this for preloaded skills, so keep the fallback. If the command still shows the literal `${CLAUDE_SKILL_DIR}`, never run it (no Bash command may hold a variable in braces). Instead, use the project's copy `.claude/skills/stack-trust/scripts/trust-store.mjs`, or in a `--user` install `<config>/skills/stack-trust/scripts/trust-store.mjs`, only when it is the script this kit ships: `shasum -a 256 .claude/skills/stack-trust/scripts/trust-store.mjs` (or `sha256sum`, with `<config>` written out for the user copy) must print <!-- trust-store.mjs sha256, generated by tools/gen-stacks.mjs -->`6419c615cb546ef8c2e5d6445ce52c81b1828baf59684fb32de4dfd219beae96` in its first field. Compare with that hash only, never with one stored in the project (such as `.claude/.framework-manifest`), which a cloned repository can plant next to the script. When no copy matches, report `trust check unavailable` and treat every overlay manifest as untrusted: a cloned repository must never supply the script that decides what it may run. Exit 0 means trusted; on any other exit (1 untrusted, 2 rejected or a usage error), or when the trust check is unavailable, print `not run (untrusted manifest). Fix: run /stack-trust.` for each of its gates and never execute them. First-party entries from step 2 are always trusted.

### Kinds

A gate's `kind` decides which skill runs it:

| Skill | Runs |
|-------|------|
| `/lint` | kinds `format`, `lint`, `types` |
| `/run-tests` | kind `test`; kind `e2e` only with `--e2e` (using the manifest's `e2e` block) |
| `verification-gates` | every gate |
| Workflow Gates phases | every gate, whatever its kind |

Kinds `build`, `other` and an absent kind run only through verification-gates and the workflow Gates phases. Never infer a kind from a gate's name or command.

### Planning the gates

Do not evaluate `unless`, `requires` or the exec wrapper yourself. For each repo, classify its key as in step 2 (or 1), then ask the trust-store script for the plan:

```
node ${CLAUDE_SKILL_DIR}/../stack-trust/scripts/trust-store.mjs plan --repo <repo> --key <key>
```

Add `--kinds <list>` to keep only some gate kinds. The script applies the trust rules, the exec wrapper, `requires` and `unless` and prints `{key, repo, notices, run, fixed}`, plus `wrapper` and `pathMap` when the gates run through an exec wrapper. Report every `fixed` entry and every `notices` line verbatim, and run only `run[].command`, in the repo directory. A command you write yourself (a fix-mode form, a filtered or single-file test run) starts with `wrapper.prefix` when the plan has one. When the plan has `pathMap`, the gate output names container paths: report a path that starts with `pathMap.container` relative to the repo, so it can be opened on the host. A gate whose `unless` glob matches is reported `skipped — <glob> present`. For key `other` the plan has no gates and says so in `notices`: fall back to step 4 of the recipe (the tooling the repo visibly has, labelled `stack manifest not found`), under the same conditions. Use the same `${CLAUDE_SKILL_DIR}` fallback and sha256 rule as the trust check above. When no copy of the script matches, run no gate and report each as `not run (gate planner unavailable). Fix: reinstall sdd-kit`.

## Gates

Run, in order, every gate of the repo's manifest entry:

1. Format, lint and types first (fast).
2. Debug-call scan: grep the changed files, outside tests, for the manifest's `debugPatterns`.
3. Tests: scoped while iterating, the full suite before PASS.
4. Coverage, when the change touches business logic and the stack defines a coverage command.
5. Build, then e2e (browser journeys) when the change touches a journey and the repo has the e2e config the manifest names.
6. Accessibility, when the change touches UI components: an axe assertion in the component test, or a page-level audit (budget at least 95).

The stack add-on's conventions skill keeps the tool options in `references/quality-tools.md`.

## Package manager

`<pm>` runs a package script, `<pmx>` runs a local binary. The plan step already fills both in `run[].command` from the lockfile in the repo root, and reports more than one lockfile in `notices`. Apply the rule yourself only to a command you write (a fix-mode form, a filtered test run, the step 4 fallback):

Each manager is an entry of the manifest's `packageManagers` list: `lockfiles` (which file selects it), `run` (the `<pm>` prefix) and `exec` (the `<pmx>` prefix). The first entry whose lockfile exists wins; with no lockfile, use the last entry (the default). Without a manifest entry, read the lockfile name to pick the manager.

More than one lockfile is itself a finding: ask which one is canonical instead of picking or deleting one. Never hardcode a package runner in a repo with another lockfile.

## Cross-repo gate

Backend and frontend in separate repos, with the stack add-on's contract-sync installed: run `node scripts/contract-sync.mjs` (or the project's `contract-sync` script). Drift is a failure.

## Gate Results Format

```
Verification Gates: api (<stack>)
  [PASS] 1. Format
  [PASS] 2. Types
  [PASS] 3. No Debug Statements
  [PASS] 4. Tests Passing (214/214)
  [SKIP] 5. Coverage            reason: no business logic changed
  [SKIP] 6. E2E                 skipped — e2e.config.* present

Verification Gates: web (<stack>)
  [PASS] 1. Lint
  [FAIL] 2. Build               app/jobs/page.tsx: useState in a Server Component
  [----] 3. Custom gate         not run (untrusted manifest). Fix: run /stack-trust.

  [PASS] Contract Sync
```

Conditional gates (coverage, browser journeys, accessibility, contract sync) are skipped only with the reason logged; never silently omitted. Format, lint, types, debug-call scan and tests always apply to a repo whose code changed.

## On Failure

- Fix the issue immediately before proceeding
- Re-run only the failed gate after fixing, then the full set once before declaring done
- Never weaken a gate to pass it: no lowered analysis level, new baseline entries, suppression comments, skipped tests, or lowered coverage thresholds
- Do not skip gates unless the user explicitly requests `--skip-verify`
