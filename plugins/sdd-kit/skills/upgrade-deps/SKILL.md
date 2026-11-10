---
name: upgrade-deps
description: Audit and upgrade dependencies (any package manager the stack uses) safely — report outdated/vulnerable packages, bump in tiers (patch → minor → major), and verify with the quality gates after each tier. Use when packages are outdated, a security advisory lands, or before a release.
argument-hint: "--audit-only | --patch | --minor | --major=[package] | --backend | --frontend"
allowed-tools: Read, Edit, Bash, Grep, Glob
disable-model-invocation: true
metadata:
  mcp-tools: "context7"
  version: "1.0"
  disallowed-tools: "WebFetch"
---

# /upgrade-deps

Keep dependencies current and CVE-free without breaking the build. Upgrades in risk tiers and re-runs the project quality gates between tiers so a regression is caught at the smallest possible blast radius.

---

## Usage

```bash
# Report only — what's outdated and what has advisories (same as /security-scan --dependencies)
/upgrade-deps --audit-only

# Safe patch bumps (no API changes expected)
/upgrade-deps --patch

# Minor bumps (new features, should be backward compatible)
/upgrade-deps --minor

# One major upgrade, deliberately, with migration notes
/upgrade-deps --major=<package>

# Scope to one side
/upgrade-deps --patch --backend
```

---

## Workflow

```
AUDIT → PLAN TIERS → UPGRADE (one tier) → GATES → COMMIT → repeat
```

### 1. Audit

Resolve each repo's stack data with the recipe in the `verification-gates` skill, then run the `security-scan` skill's dependency audit (`--dependencies`): advisories, outdated packages, and unused direct dependencies, with the package manager the lockfile names. It is the one owner of these read-only commands, so `/progress --health` and `/changelog --release` get the same table. `--audit-only` stops here.

Unused direct dependencies from that table are removal candidates; removing one is a normal change that goes through the gates like any other.

### 2. Plan tiers

Group by risk. **Security advisories first**, regardless of tier. Then patch, then minor. Majors are handled one at a time with a changelog/migration review (use `context7` for the package's upgrade guide).

### 3. Upgrade one tier

Use the package manager's update command for the named packages in each repo (the stack add-on's `references/quality-tools.md` has the exact forms), with the manager the lockfile names.

Never blanket-update across tiers in one shot — you lose the ability to bisect a break.

### 4. Gates (blocking)

Run the project gates after each tier (the manifest's gates, via the `verification-gates` skill): format, lint, types and tests. A failing gate stops the upgrade; fix or pin before continuing.

### 5. Commit per tier

One commit per tier (`chore(deps): patch-level bumps`) so a later rollback is surgical.

---

## Major upgrades

For `--major`, before changing anything:
1. Fetch the upgrade guide (`context7`) and summarize breaking changes.
2. List affected files in this codebase.
3. Apply, then run gates + a focused test pass on affected areas.
4. Note any required follow-up in the commit body.

---

## On advisories

A package with a security advisory is upgraded even if it means a minor/major jump. If no fixed version exists, document the exposure and apply a mitigation (config, WAF rule, or temporary pin) rather than ignoring it.

