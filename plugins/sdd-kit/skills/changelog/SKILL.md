---
name: changelog
description: Generate a changelog from git history by parsing conventional commits and grouping them into Keep a Changelog sections, optionally updating CHANGELOG.md. --release <version> runs a release-readiness check (specs done, gates and contract-sync green, security and dependency audits clean, migrations safe), suggests the semver bump, writes CHANGELOG.md, and proposes the tag. Use when preparing a release, summarizing unreleased changes, or producing notes between two tags.
argument-hint: "[version] | --from=[tag] | --to=[tag] | --unreleased | --release <version>"
allowed-tools: Bash, Read, Write, Grep, Glob, AskUserQuestion
disable-model-invocation: true
metadata:
  version: "1.2"
  subagents: "changelog-writer, code-quality"
---

# /changelog

Generate changelogs from git commits following conventional commits specification.

## Usage

```bash
# Generate for next release
/changelog v2.1.0

# Generate unreleased changes
/changelog --unreleased

# Generate between tags
/changelog --from=v2.0.0 --to=v2.1.0

# Generate and update CHANGELOG.md
/changelog v2.1.0 --update

# Release readiness, semver suggestion, CHANGELOG.md, proposed tag
/changelog --release 2.1.0
/changelog --release auto        # suggest the version from the commits
```

This skill is user-invoked only (`disable-model-invocation`), because release mode bumps versions and creates tags.

## Conventional Commits Format

### Commit Types
```
feat:     New feature
fix:      Bug fix
docs:     Documentation changes
style:    Code style changes (formatting)
refactor: Code refactoring
perf:     Performance improvements
test:     Adding/updating tests
build:    Build system changes
ci:       CI/CD changes
chore:    Other changes
```

### Commit Format
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Source verification**: follow the `source-verification` skill.

---

## Examples
```
feat(auth): add two-factor authentication
fix(api): resolve rate limiting issue
docs: update API documentation
BREAKING CHANGE: API v1 endpoints deprecated
```

## Generation Process

### Step 1: Collect Commits

Parse git history to automatically categorize changes rather than writing changelog entries manually.
```bash
# Get commits since last tag
LAST_TAG=$(git describe --tags --abbrev=0)
COMMITS=$(git log $LAST_TAG..HEAD --oneline)

# Parse conventional commits
echo "$COMMITS" | while read commit; do
    TYPE=$(echo "$commit" | grep -oE "^[a-z]+(\([^)]+\))?:" | head -1)
    # Categorize by type
done
```

### Step 2: Categorize Changes

Group changes by type (features, fixes, breaking) so stakeholders can quickly find what matters to them.
```bash
# Group by type
FEATURES=$(git log $LAST_TAG..HEAD --oneline --grep="^feat")
FIXES=$(git log $LAST_TAG..HEAD --oneline --grep="^fix")
BREAKING=$(git log $LAST_TAG..HEAD --oneline --grep="BREAKING")
```

### Step 3: Generate Markdown

Produce standardized changelog format that integrates with existing documentation.
```markdown
## [2.1.0] - 2025-01-15

### Added
- Two-factor authentication support (#123)
- User profile image uploads (#125)
- API rate limiting configuration (#127)

### Changed
- Improved password validation rules
- Updated user registration flow

### Fixed
- Fixed login redirect issue (#124)
- Resolved API timeout errors (#126)

### Security
- Updated dependencies for security patches

### Breaking Changes
- Deprecated API v1 endpoints
```

## Release Mode (`--release <version>`)

Release mode checks that the range is actually releasable before writing anything. Every check reports PASS, FAIL, or SKIP with a reason; a FAIL stops the release unless the user explicitly accepts it.

### 1. Range and specs

- The range is the last tag (`git describe --tags --abbrev=0`) to `HEAD`, or `--from`/`--to`.
- Collect the spec ids referenced in the range: commit messages, branch names, and `.ai/specs/*` folders whose files changed in the range (in a polyrepo project, each repo's `.ai/specs`).
- Every referenced spec must be done: `status: done` in `spec-lite.md` frontmatter and every top-level task checked in `tasks.md`. List any spec that is not.

### 2. Quality gates

Run the project's detected gate commands for each repo (the `verification-gates` skill; delegate to the `code-quality` agent). Use the commands the project actually has; never assume a dev-environment wrapper. When the project has a backend and a frontend repo and contract-sync is installed (`scripts/contract-sync.mjs` or a `contract-sync` package script), run it as a gate: drift fails the release.

### 3. Security and dependencies

- `/security-scan` (dependency audit and code scans): no critical or high findings.
- `/security-scan --dependencies`: no known-vulnerable or abandoned packages (the outdated table is informational).

### 4. Migrations

For migrations added in the range, apply the stack's migration checks (the manifest `migrations` commands, or the stack add-on's migration skill): a dry-run or status check of the pending migrations succeeds, NOT NULL columns on existing tables use a split backfill, destructive changes have a rollback path, and the down/up cycle works on a disposable database.

### 5. Version, changelog, tag

1. **Suggest the bump** from the commits since the last tag (Semantic Versioning):
   - MAJOR: a `BREAKING CHANGE:` footer or `!` after the type, a removed or renamed endpoint, a contract change the frontend must follow
   - MINOR: any `feat`
   - PATCH: only `fix`, `perf`, `refactor`, `docs`, `chore`
   - Pre-release: `X.Y.Z-beta.N` when the user asks for one
   If the user's `<version>` disagrees with the suggestion (for example a `feat` in a patch release), say so and ask.
2. **Write CHANGELOG.md** for that version with the `changelog-writer` agent (the format below). Add an upgrade note for breaking changes and new environment variables.
3. **Update version files** the project keeps (`package.json` `version`, a `VERSION` file, an application config `version`), only if they exist.
4. **Propose, then confirm.** Show the release commit and tag commands:
   ```bash
   git commit -am "chore(release): v2.1.0"
   git tag -a v2.1.0 -m "Release v2.1.0"
   git push origin v2.1.0
   ```
   Ask with AskUserQuestion before running any of them. Never push or tag without that confirmation.

### Release report

```
Release readiness: v2.1.0 (suggested: minor - 4 feat, 7 fix, 0 breaking)
  [PASS] Specs done            6/6 (spec-HIRE-12-..., ...)
  [PASS] Gates                 api: format, types, test · web: lint, types, build, test
  [PASS] Contract sync         0 drift
  [FAIL] Security scan         1 high: axios < 1.7.4 (web/package.json)
  [PASS] Dependency audit
  [PASS] Migrations            2 new, pretend run OK, rollback cycle OK
Verdict: NOT READY - resolve the security finding, then re-run /changelog --release 2.1.0
```

### Hand-off

When the verdict is READY and the tag is pushed: if the ops add-on is installed, the next step is `/deploy` (it owns pre-deploy checks, rollout, and verification, and `/rollback` if needed). Otherwise, name the project's own deploy pipeline. For a hotfix, branch from the production tag, keep the fix minimal, release it as a patch, and merge it back to the main branch.

## Changelog Template

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Pending features

### Changed
- Pending changes

### Fixed
- Pending fixes

## [2.1.0] - 2025-01-15

### Added
- Feature 1
- Feature 2

### Changed
- Change 1

### Fixed
- Fix 1

## [2.0.0] - 2025-01-01

### Added
- Initial release
```

## Categories

### Added
- New features
- New endpoints
- New functionality

### Changed
- Updates to existing features
- Configuration changes
- Behavior changes

### Deprecated
- Features to be removed
- Deprecated APIs

### Removed
- Removed features
- Deleted endpoints

### Fixed
- Bug fixes
- Error corrections

### Security
- Security patches
- Vulnerability fixes

## Output Format

```
📝 Changelog Generation

═══════════════════════════════════════════════════════════

📊 Commit Analysis:
  Total Commits: 45
  Features: 12
  Fixes: 18
  Docs: 5
  Other: 10

═══════════════════════════════════════════════════════════

## [2.1.0] - 2025-01-15

### Added
- feat(auth): add two-factor authentication (#123)
- feat(api): add user profile endpoint (#125)
- feat(payments): add Stripe webhook handling (#127)
- feat(notifications): add email notifications (#130)

### Changed
- refactor(auth): improve password validation
- perf(api): optimize database queries

### Fixed
- fix(auth): resolve login redirect issue (#124)
- fix(api): fix rate limiting timeout (#126)
- fix(payments): correct amount calculation (#128)

### Security
- security: update axios to 1.6.0

### Breaking Changes
- BREAKING: API v1 endpoints deprecated

═══════════════════════════════════════════════════════════

📁 Files:
  ✅ CHANGELOG.md updated
  📊 45 commits processed
```

