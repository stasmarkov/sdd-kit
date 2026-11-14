# Default docs convention

The kit default. A project overrides it with `docs/conventions.md` (or a `## Docs conventions` section in `AGENTS.md` or `CLAUDE.md`); `/doc-hygiene --init` writes this block there as a starting point. `scripts/convention.mjs` reads the first yaml block in this file, so keep it first.

```yaml
folders:            # type -> folder, repo-relative, no trailing slash
  context: docs/context
  adr: docs/adr
  guide: docs/guides
  runbook: docs/runbooks
  api: docs/api
  schema: docs/schemas
  research: docs/research
  postmortem: docs/postmortems
  spike: docs/spikes
  example: docs/examples
  reference: docs/reference
  archive: docs/archive
  spec: .ai/specs
  report: .ai/reports
rootAllowed: [README.md, CHANGELOG.md, CONTRIBUTING.md, LICENSE, LICENSE.md, AGENTS.md, CLAUDE.md, CLAUDE.local.md, GEMINI.md, SECURITY.md, CODE_OF_CONDUCT.md, SUPPORT.md, product-brief.md, backlog.md]
bannedTokens: [final, new, old, copy, tmp, v<N>]
ordered:            # type -> name pattern
  adr: NNNN-<slug>
  postmortem: YYYY-MM-DD-<slug>
  report: <kind>[-<subject>]-YYYYMMDD[-HHMM][-<n>]
  spec: spec-folder
  archive: keep
generated: [.ai/reviews/**, .ai/verification/**, .ai/session/**, .ai/requests/**]
ignore: ["**/SKILL.md", "**/skills/**", "**/agents/**", "**/commands/**", "**/templates/**", "**/*.template.md", "**/prompts/**", "**/rules/**", "**/test/**", "**/tests/**", "**/__tests__/**", "**/fixtures/**", .github/**, "**/node_modules/**", "**/vendor/**", dist/**, build/**, .git/**, .claude/**, .agents/**, .cursor/**, .codex/**]
nameExceptions: []  # path globs exempt from the case, space and banned-token rules
absoluteLinks: []   # path globs whose links leaving the glob must be absolute URLs
```

## Merging an override

- Top-level keys the override sets replace the default's; omitted keys keep the default.
- `folders` and `ordered` merge per type; a type set to `~` is removed.
- Lists (`rootAllowed`, `bannedTokens`, `generated`, `ignore`, `nameExceptions`, `absoluteLinks`) replace the default list as a whole.
- Unknown keys are an error naming their line. `folders` values are repo-relative folders (no `..`, no absolute path, no glob). The first existing source wins as a whole.

## Rules with examples

| Rule | Example |
|------|---------|
| `README.md` is allowed in any folder, ordered ones included | `docs/guides/README.md`, `docs/adr/README.md` ok |
| Other uppercase `rootAllowed` names only at the root | `SECURITY.md` ok, `docs/SECURITY.md` flagged; `docs/product-brief.md` ok |
| Other names are lowercase, hyphenated, no spaces or underscores; a placed file keeps its folder | `docs/guides/deploy/Setup_Guide.md` flagged, suggested `docs/guides/deploy/setup-guide.md` |
| Banned tokens match whole tokens, case-insensitively | `PLAN_v2.md` flagged, `renewal.md` ok |
| `notes` breaks a rule only as the whole basename of a root file | `NOTES.md` at the root flagged, `docs/meeting-notes.md` ok |
| Only `ordered` types carry numbers or dates | `docs/adr/0007-use-queues.md` ok; `docs/release-20261113.md` warns |
| Postmortems are dated | `docs/postmortems/2026-11-13-db-outage.md` |
| Reports follow `<kind>[-<subject>]-YYYYMMDD[-HHMM][-<n>]` | `.ai/reports/ship-spec-x-20261020-1538.md`, `.ai/reports/doc-hygiene-20261113-2.md` |
| A file outside the `folders` tree, `docs/` itself and `rootAllowed` is unplaced | `Deploy NOTES.md` at the root, suggested `docs/guides/deploy-notes.md` |
| Archives keep the original name, in `archive` and any `_archive` folder | `docs/archive/Old Plan.md`, `.ai/reports/_archive/v3-run.md` ok |

Pattern vocabulary: `NNNN` four digits, `YYYY-MM-DD` and `YYYYMMDD` a date, `HHMM` four digits, `<slug>`, `<kind>`, `<subject>` lowercase hyphenated words, `<n>` digits, `[...]` optional, `.md` implied; `spec-folder` means the folder rules of the spec system; `keep` means the original name is kept. In `bannedTokens`, a trailing `<N>` means followed by one or more digits.
