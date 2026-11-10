---
name: sync-obsidian
description: Sync human-verified project knowledge - specs, review output, a spec-board status note, and architecture/context docs - into an Obsidian vault with frontmatter, tags, wiki-links, and an index note. Use when publishing reviewed project knowledge to a shared Obsidian vault; supports --dry-run to preview. Only content a human has verified is synced.
argument-hint: "[--project=name] [--vault=path] [--mode=full|specs|reviews|docs] [--dry-run]"
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob
disable-model-invocation: true
metadata:
  version: "1.1"
  encoding: "UTF-8"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /sync-obsidian

Publish project knowledge (specs, review output, architecture docs, business rules) from the repo to an Obsidian vault with frontmatter, tags, and cross-links.

## Verified content only

The vault is shared and read as the source of truth, so only content a human has verified goes there:
- **Specs**: `status` of `approved`, `in-progress` or `done` in `spec-lite.md` frontmatter, with `approved_by` set. Drafts are skipped.
- **Reviews**: validated output (`.ai/review/validated/`, `.ai/review/master/`) and human-written reviews (`.ai/reviews/`). Raw chunks are synced only when the user asks for them in this run.
- **Docs**: files under `docs/` that are committed. Uncommitted or AI-generated drafts the user has not reviewed are skipped.

When unsure whether something was verified, list it under "Skipped (unverified)" in the report and ask; never sync it by default. This skill is user-invoked only for the same reason.

---

## Usage

```bash
# Full sync — verified specs, docs, reviews
/sync-obsidian --vault="~/Documents/Obsidian Vault"

# Specs only
/sync-obsidian --mode=specs

# Dry run — show what would be synced and what is skipped
/sync-obsidian --dry-run
```

## Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--project` | The repo name (basename of the git root) | Project name for the vault folder |
| `--vault` | `$OBSIDIAN_VAULT`, else `~/Documents/Obsidian Vault` | Path to the Obsidian vault |
| `--mode` | `full` | What to sync: `full`, `specs`, `reviews`, `docs` |
| `--dry-run` | false | List files without syncing |

For a polyrepo project, run it once per repo, or pass a shared `--project` so both repos land in one vault folder.

## Two ways to write

The vault layout, priority and status rules, and the verified-only filter in this skill are the contract. Prefer the MCP server: it writes notes one at a time, so each one follows the rules below.

1. **Sync script** (legacy bulk copy). `.codex/sdd-kit/scripts/sync-to-obsidian.sh` in file-copy installs, `../../runtime/scripts/sync-to-obsidian.sh` in plugin mode. It predates this skill and does **not** follow it: it guesses priority from the folder name (default P2) into `P1-critical/`, `P2-medium/` folders instead of reading spec-lite frontmatter, has no `Board.md`, `Decisions/` or `Unprioritized/`, applies no verified-only filter, and still converts the retired `.ai/kanban.json`. Use it only for a one-off raw copy you then fix up, never as the reference for how notes should look.
   ```bash
   bash .codex/sdd-kit/scripts/sync-to-obsidian.sh --dry-run "$(git rev-parse --show-toplevel)"
   ```
   Check the dry-run list against the verified-only rule before any real run.
2. **Obsidian MCP server** (note-level, when configured). `@cyanheads/obsidian-mcp-server` needs the Obsidian Local REST API plugin enabled in the vault and `OBSIDIAN_API_KEY` set.

   | Tool | Purpose |
   |------|---------|
   | `obsidian_read_note` | Read note content and metadata |
   | `obsidian_update_note` | Create or update (append, prepend, overwrite) |
   | `obsidian_search_replace` | Find and replace in notes |
   | `obsidian_global_search` | Search across the vault |
   | `obsidian_list_notes` | List notes in a folder |
   | `obsidian_manage_frontmatter` | Get, set, delete frontmatter keys |
   | `obsidian_manage_tags` | Add, remove, list tags |
   | `obsidian_delete_note` | Remove notes |

---

## Workflow

### Step 1: Discover Source Files

```
Source directories:
  .ai/specs/            → Projects/{Project}/Specs/{priority}/
  .ai/specs/_archive/   → Projects/{Project}/Specs/Archive/
  .ai/review/validated/ → Projects/{Project}/Reviews/Validated/
  .ai/review/master/    → Projects/{Project}/Reviews/
  .ai/reviews/          → Projects/{Project}/Reviews/Manual/
  docs/architecture/    → Projects/{Project}/Architecture/
  docs/context/         → Projects/{Project}/Context/
  docs/adr/             → Projects/{Project}/Decisions/
```

Apply the verified-only rule here, and list every skipped file with the reason.

### Step 2: Transform Files

For each file:

1. **Frontmatter**: add or update project, type, tags, source-path, and sync date.
2. **Status and priority** come from the spec's `spec-lite.md` frontmatter (`status`, `priority`), not from the folder name. A spec without `priority` goes to `Specs/Unprioritized/`.
3. **Internal paths** become `[[wiki-links]]`:
   - `docs/context/business-rules.md` → `[[Business Rules]]`
   - `.ai/specs/spec-HIRE-7-job-posting/` → `[[HIRE-7 Job Posting]]`
4. **Tags**:
   - Source directory (`#spec`, `#review`, `#architecture`, `#context`, `#adr`)
   - Priority (`#P0`, `#P1`, `#P2`, `#P3`)
   - Status (`#status/approved`, `#status/in-progress`, `#status/done`)
   - Module references in the content

### Step 3: Write to Vault

- Create parent directories if needed.
- If the note exists, compare content and update only if it changed.

### Step 4: Board Status

Publish the spec board as one of these, the user's choice:
- **Status note** generated from spec frontmatter (default). `Projects/{Project}/Board.md`, one section per status with a line per spec: `[[HIRE-7 Job Posting]] - P1 - 5/8 tasks`. It uses the same `status` field and task counts as `/spec-board`, so it cannot drift from the specs.
- **Offline board**: run `/spec-board` with `--out` into the vault's attachments folder (for example `Projects/{Project}/Attachments/spec-board.html`) and link it from the index note.

### Step 5: Create Index Note

Write `Projects/{Project}/Index.md`:

```markdown
---
project: {Project}
type: index
updated: YYYY-MM-DD
tags: [project, index]
---
# {Project}

## Quick Links
- [[Business Rules]]
- [[Architecture]]
- [[Board]]

## Specs
- [[Specs/P0/]] [[Specs/P1/]] [[Specs/P2/]] [[Specs/P3/]]

## Stats
- Specs synced: X (approved X | in progress X | done X)
- Last sync: YYYY-MM-DD
```

### Step 6: Update Sync State

Write `.sync-state.json` in the vault project folder:
```json
{
  "last_sync": "ISO-8601",
  "project_root": "/path/to/project",
  "files_synced": 42,
  "skipped_unverified": 3,
  "mode": "full"
}
```

---

## Vault Structure

```
{Vault}/
└── Projects/
    └── {Project}/
        ├── Index.md
        ├── Board.md
        ├── Specs/{P0,P1,P2,P3,Unprioritized,Archive}/
        ├── Architecture/
        ├── Context/
        ├── Decisions/
        ├── Reviews/{Validated,Manual}/
        └── .sync-state.json
```

## Frontmatter Standards

### Specs
```yaml
---
project: "ProjectName"
type: spec
priority: P0|P1|P2|P3
status: approved|in-progress|done
approved_by: "name"
created: "YYYY-MM-DD"
source-path: ".ai/specs/spec-HIRE-7-job-posting"
tags: [spec, module-name]
---
```

### Reviews and Docs
```yaml
---
project: "ProjectName"
type: architecture|business-rules|review|context|adr
synced: "YYYY-MM-DD"
source-path: "docs/architecture/..."
tags: [architecture, module-name]
---
```

## Filename Transformation Rules

| Source | Obsidian Name |
|--------|---------------|
| `spec-HIRE-7-job-posting` | `HIRE-7 Job Posting` |
| `spec-20261019-1430-csv-export` | `CSV Export` |
| `business-rules.md` | `Business Rules.md` |
| `api-contracts.md` | `API Contracts.md` |
| `bugs-and-risks.md` | `Bugs and Risks.md` |

Rules: drop the `spec-` prefix and timestamps, keep the ticket key, convert kebab-case to Title Case, keep the `.md` extension.

---

## Quality Gates

- [ ] Only verified content synced; skipped files listed with reasons
- [ ] Frontmatter on every synced file, with status and priority from spec frontmatter
- [ ] Internal references converted to wiki-links
- [ ] Board note matches the spec frontmatter
- [ ] Index note created with accurate stats
- [ ] Sync state file written
- [ ] No duplicate notes in the vault
