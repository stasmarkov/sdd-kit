---
name: doc-hygiene
description: Use before you create, rename, move or link a Markdown doc, or via /doc-hygiene to check changed docs, --audit a repo's docs or --init a convention. Applies only changes the user approves.
argument-hint: "[--audit [--path=<dir>] | --init]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, AskUserQuestion
effort: medium
metadata:
  version: "1.0"
  response_format: "concise"
  last_verified: "2026-11-13"
  next_review: "2027-02-13"
---

# /doc-hygiene

One convention for where Markdown docs live, what they are called and how they are linked. It runs before a doc is written, on the docs you changed, and as a whole-repo audit. It never changes a file without the user's approval in the session; the audit alone changes nothing except its report.

| Mode | What it does |
|------|--------------|
| bare `/doc-hygiene` | Runs `audit.mjs changed`: every in-scope `.md` path in `git status` (added, modified, renamed, untracked, also inside new folders) gets the name check and the link rules; report per file. Outside a git repo it says so and suggests `--audit` |
| `--audit [--path=<dir>]` | Reviews every in-scope doc for naming, placement, duplicates, orphans and staleness; proposes verdicts; applies approved ones |
| `--init` | Writes `docs/conventions.md` with the full default block; refuses when it exists |

## The convention

The default is in [references/default-convention.md](references/default-convention.md): a folder tree by doc type, the root files allowed, banned name tokens, ordered name patterns (ADR, postmortem, report, spec, archive), generated and ignored paths. A project overrides it with the first existing of `docs/conventions.md`, the `## Docs conventions` section of `AGENTS.md`, or of `CLAUDE.md`; keys merge onto the default per key and per type. Every check names the source it used.

`scripts/convention.mjs` (next to this file, no dependencies) applies it:

```bash
node <skill-dir>/scripts/convention.mjs check <path> [--json]   # ok, or each broken rule + suggested path + source
node <skill-dir>/scripts/convention.mjs --init                  # write docs/conventions.md (never overwrites)
```

A parse error names the line and the fix; relay it and stop rather than guessing a convention.

## Before writing a Markdown file

Do these in order, in the same change as the doc:

1. **Look for an existing doc.** Run `node <skill-dir>/scripts/audit.mjs find "<topic>"`. Prefer extending a match. If you create a new doc anyway, say why in one line ("not extending docs/x.md: it covers Y").
2. **Folder from the doc's type.** Take it from the convention's `folders` (a runbook goes in the runbooks folder, an ADR in the adr folder, and so on). A file in none of them is unplaced.
3. **Name from the check.** Run `convention.mjs check <path>`; if it fails, use the suggested path. If the user asked for a name that breaks a rule, flag it, propose the conforming one, and write the requested name only after they confirm.
4. **Link it from its index.** The index is `README.md` in the doc's folder, else the nearest `README.md` up to the repo root. Add a list item with the doc's title and a relative link. Create a folder `README.md` only after asking. Tell the user the doc is orphaned only when you could not add the link (no README up to the root and the user declined one, or the index is generated).

## Link rules

- A link to a doc in the repo is relative and its target exists. Anchors, external URLs (`http:`, `https:`, `mailto:`) and image links are fine; anchors are not validated.
- In a file matching `absoluteLinks`, a link that leaves that glob is an absolute URL (such files are copied elsewhere, so relative links would break); an absolute URL inside the glob is reported.
- If the target breaks the convention, rename or move it first, with the user's approval, then link the new path.

Bare `/doc-hygiene` (`node <skill-dir>/scripts/audit.mjs changed`, JSON with `files[]`: `path`, `status`, `problems`, `suggestion`, `links`, plus `source`) and the audit report broken targets, absolute URLs to in-repo docs and `absoluteLinks` violations.

## Audit

`/doc-hygiene --audit [--path=<dir>]`:

1. Run `node <skill-dir>/scripts/audit.mjs [--path=<dir>]`. It scans every `.md` under the root (or `--path`) minus `ignore` and `generated`; `.ai/specs`, `.ai/reports`, `docs/archive` and `**/_archive` are naming-only (`_archive` files keep their names), READMEs below the root outside `docs/` are link sources only, and the active convention file is never a delete, merge or archive candidate. It prints one line of JSON: `counts` per verdict and the rows that need attention (add `--all` for every row), each with one primary verdict by the precedence **delete > merge > archive > rename/move > keep** (`suggestion` for rename/move, `mergeInto` for merge), plus the other reasons and the evidence: inbound link count, last commit date or `unknown` (shallow clones and untracked files have no age, so no age-based archive), dead path citations (only paths under a top-level folder of this repo), unknown slash commands and runner scripts, duplicate titles, placeholder content, superseded names. `linkProblems` lists broken links, absolute URLs to in-repo docs and `absoluteLinks` violations; `notes` says when a check was skipped; `reportPath` is the next free report name.
2. **Judge what the script cannot.** For each doc that survives, check whether the features it describes still exist and whether topics overlap with another doc. Cite `file:line` evidence (or the search that found nothing). These are listed reasons, never a verdict on their own.
3. **Write the report** to `reportPath` (`.ai/reports/doc-hygiene-YYYYMMDD.md`, UTC date, `-2`, `-3` when it exists), even outside a git repo: one row per doc with verdict, reasons and evidence, and the convention source. `audit.mjs --write-report` writes that table; add your judged reasons to it.
4. **Ask once** for all renames and moves as a batch (apply all, pick, none), then per item for every merge, archive and delete. A merge asks a second question: "delete the source after the merge?"; delete the source only on yes. Nothing outside the approved items changes.
5. **Check the tree.** Outside a git repo, refuse to apply (`Fix: run git init and commit, then re-run`). With uncommitted changes, list them and ask before applying.
6. **Merge** (agent work): append the source's sections the target lacks under `## Merged from <source path>`; for sections present in both with different text, leave a `> [!NOTE]` callout naming the source section for the user to resolve. The merge target is the doc with more inbound links, then the newer one, then the shorter path; the user can swap it.
7. **Apply** the approved plan with `node <skill-dir>/scripts/apply.mjs --plan <file.json>`. The plan lists only approved operations; a merge source is deleted only when its `delete` operation is listed, with `redirectTo` set to the merge target so links to it follow:

   ```json
   { "date": "YYYY-MM-DD", "operations": [
     { "op": "rename", "from": "docs/Setup_Guide.md", "to": "docs/setup-guide.md" },
     { "op": "archive", "path": "docs/old-api.md", "reason": "cites only removed paths" },
     { "op": "delete", "path": "docs/Architecture Final.md", "redirectTo": "docs/architecture.md" }
   ] }
   ```

   `move` is a synonym of `rename`. It validates the whole plan before changing anything (no symlinks, nothing outside the repo, no ignored or generated destination, no `redirectTo` that the plan deletes), uses `git mv` for tracked files and `mv` for untracked, renames case-only in two steps, rewrites only the links the plan breaks: links to each moved, archived or redirected file and the relative links of a moved file (anchors kept, fenced code skipped, every other link byte-identical). It archives flat to `docs/archive/<original name>` (`-2`, `-3` on collision) with a `> Archived YYYY-MM-DD: <reason>` line, and prints a summary of every change. Relay that summary.

## Never

- Touch generated, ignored or vendored files, or files outside the repo.
- Overwrite an existing `docs/conventions.md`.
- Rename, move, merge, archive or delete without approval for that item.
