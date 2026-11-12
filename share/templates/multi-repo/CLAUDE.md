# <Project name> workspace

<!--
Root context for a parent-folder workspace that holds separate repos. This folder has no
.git on purpose. Copy this file to <workspace>/CLAUDE.md and start Claude from here.
The imports pull in each repo's own context; this file adds only what neither repo knows
alone. Setup and traps: docs/multi-repo.md in the framework.
-->

@be/CLAUDE.md
@<repo>/CLAUDE.md
<!-- One import per frontend. Imports resolve against this file, up to four hops. -->

## Layout

| Folder | Repo | Stack | Gates |
|--------|------|-------|-------|
| `be/` | `<git remote>` | `<stack>` (backend API) | see `be/AGENTS.md` |
| `<repo>/` | `<git remote>` | `<stack>` (frontend, one row per frontend) | see `<repo>/AGENTS.md` |

## Contract

- The API contract lives in `<be/docs/api/api-contracts.md>`. **The backend is authoritative.**
  When the frontend and the contract disagree, the frontend is wrong.
- Every backend endpoint the browser calls is registered in `<repo>/src/lib/api/registry.ts`.
- In each frontend, types mirror backend DTOs and Resources in `<repo>/src/types/api/`. Enum literals
  must match the backend enum values exactly.
- Check drift with `<script or CI job that diffs routes/OpenAPI against the registry>`.
  Don't trust counts written in any doc.

## Cross-repo routing

| If you change | Read first | Then update |
|---------------|------------|-------------|
| A backend DTO or Resource | `be/` Resource + DTO | `<repo>/` type mirror, fetcher, affected pages |
| A route path, method, or auth | `be/` route definitions | `<repo>/` registry, API client, middleware |
| Validation rules | `be/` FormRequest or input DTO | `<repo>/` form schema and error mapping |
| An enum | `be/` enum class | `<repo>/` literal union, labels, filters |
| Auth or session flow | both auth configs | every side, in matching branches |
| <thing> | <file> | <dependents> |

**Rule of thumb:** if a backend change could be visible to the browser, assume the frontend
has to change too. Grep every frontend before you call the backend task done.

## Process

- Commit in each repo separately (`git -C be ...`, `git -C fe ...`). Never run git from this root.
- Use the same branch name in both repos for one change: `<feature|fix>/<ticket>-<slug>` (`/open-pr` also reads `bugfix/` and `hotfix/`).
- A spec lives in the repo that starts the change (usually `be/.ai/specs/`). It lists every
  affected repo with per-repo tasks. `resume_hint` in the session state hands off between repos.
- Workflows take every repo: `/sdd <ticket>`, or pass `repos` as an array of `{ path, role, url }`
  with one `frontend` entry per frontend. Each repo's gates run separately.
- Merge order: backend first when the change is additive. Use expand/contract when it breaks the contract.

## Environment

- Backend local URL: `<https://be.example.test>`. One line per frontend: `<repo>` at `<dev-url>`.
- Each frontend reads the backend URL from `<repo>/<env file: API base URL variable>`.
- <Drift warning, e.g. "staging frontend points at staging API; never at production">
