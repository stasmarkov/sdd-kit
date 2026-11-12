# <Project name>: agent instructions

<!--
Core instructions shared by every AI coding tool on this project (Claude Code, Cursor,
Codex, Copilot, Gemini CLI). Save it as AGENTS.md in the repo root.

Claude Code reads AGENTS.md only when there is no CLAUDE.md. Because this project has a
CLAUDE.md, it imports this file with `@AGENTS.md` on its own line. Keep tool-neutral facts
here and Claude-specific context (routing, gotchas, /sdd, .claude/rules) in CLAUDE.md.
Each fact goes in one file only.

Never state counts or versions of moving things as facts. Point to the file that defines them.
-->

## Stack

Fill this table from the project's own manifests, or ask Claude to fill it from the code.

| Item | Value | Source of truth |
|------|-------|-----------------|
| Backend | <framework, language version, database> | `<dependency manifest>`, `<environment config>` |
| Frontend | <framework, runtime version, package manager> | `<dependency manifest>`, `<version file>` |
| Auth | <auth mechanism> | `<auth config>` |
| Local env | <native / container / dev-environment tool> | `<environment config file>` |

## Commands

Run these exact commands. A change is done only when every gate passes for the code you touched.

```bash
# Backend
<test command>                            # tests (never against the dev DB)
<single test command>                     # one test
<format command>                          # style (run in fix mode to fix)
<static analysis command>                 # types / static analysis
<migration dry-run command>               # inspect migration SQL before running

# Frontend
<dev server command>                      # dev server
<test command>                            # unit tests
<lint and types commands>                 # lint + types
<build command>                           # production build
```

## Red lines

- Never run destructive commands against shared databases (fresh-migrate, wipe, raw `DROP`).
- Never commit secrets, env files, or real customer data.
- Never edit a migration that has run in a shared environment. Add a new one.
- Never push to `<main branch>` directly or force-push a shared branch.
- Never weaken or delete a test to make it pass.
- <Project-specific red line>

## Architecture

```
<request flow, e.g. Request -> Handler -> Service -> Repository -> Model>
```

- **Schema first:** update `<docs/schemas/>` before writing a migration.
- **Typed data:** data crosses layers as typed objects, never raw arrays or ORM models.
- **Thin handlers:** authorize, build the typed input, call the service, respond.
- **Services** own business rules and transactions. **Repositories** own queries.
- **Frontend:** <rendering model and where backend calls go, e.g. the typed API client in `<src/lib/api/>`>.
- The API contract in `<docs/api/api-contracts.md>` is authoritative for request and response shapes.

## Code standards

- Code should read like a senior developer wrote it. No history markers like `(NEW)`, `(FIXED)`,
  or `// updated per review`, and no comments that restate the code.
- Comments explain why: business rules, non-obvious constraints, security-sensitive steps.
- Write the failing test first, then the fix or feature.
- Documentation filenames are lowercase. Only `README.md`, `CLAUDE.md`, and `AGENTS.md` are uppercase.

## Git

- Branches: `<feature|fix>/<ticket>-<slug>` (`/open-pr` also reads `bugfix/` and `hotfix/`). Use the same branch name across repos for cross-repo work.
- Commits: Conventional Commits with the ticket key at the end (`feat(orders): ... (PROJ-123)`); the commit hook also accepts the key as the scope (`feat(PROJ-123): ...`). Keep each commit to one logical change.
- If a doc conflicts with the code, trust the code and fix the doc in the same change.
