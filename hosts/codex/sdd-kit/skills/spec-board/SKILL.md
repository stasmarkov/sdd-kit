---
name: spec-board
description: Use to see, browse or share the specs as a Kanban board by status with task progress, as a live local page or one offline HTML file.
argument-hint: "[dirs...] [--serve [--port 4477] | --out spec-board.html | --json]"
allowed-tools: Bash, Read
license: Apache-2.0
metadata:
  version: "1.1"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# Spec board

A read-only Kanban view over `.ai/specs/` and the product backlog. It reads the same frontmatter that `/sdd` and `/write-spec` write, and the `backlog.md` that `/product-brief` writes. It has no state of its own, so it cannot drift from either.

## What it shows

- **Columns** by `status`: Draft, Approved, In progress, Done. An Unknown column appears only when a spec has an unrecognised status (for example `blocked`).
- **Backlog column** (before Draft): slices from `backlog.md` that have no spec folder yet. Each card shows the slice id and title, its size, the BR ids it enforces, its backlog status (`proposed` or `approved`), "After SL-nn" dependencies, a Blocked badge, and its `/sdd` line, ready to copy. See "Backlog" below.
- **Cards** show the ticket or short id, title, type, size, priority, stacks, a repo label (polyrepo), and task progress (done/total). Badges flag open questions, drafts that need approval, approved specs with no `approved_by`, parse errors, and the "Resume at task N" hint from session state.
- **Toolbar**: search across title, id, ticket, acceptance criteria and task titles. Filters for type, size, status, repo and stack, "Has warnings" and "Hide done" toggles, and six sort orders.
- **Drawer** (click a card, or deep link `#spec/HIRE-7`) has four tabs:
  - Overview: warnings, session resume hint, frontmatter, acceptance and must-not-change criteria with "covered by tasks" and "verified by".
  - Spec: the rendered `spec-lite.md`.
  - Tasks: tasks by phase with Covers chips, plus the traceability table.
  - Files: every other file in the folder, rendered on click.
- **Legacy specs** (`spec-0042-2026-06-11-slug`, `14-2025-08-12-slug`, no frontmatter) still appear. Their title comes from the first heading, their status is inferred from task progress, and they are marked "Legacy".

## Commands

The script is `scripts/spec-board.mjs`. It needs Node 18+ and has no dependencies. If that path was not expanded (it shows up literally or as `/scripts/...`), find the script with:

```bash
find -L ~/.codex .codex "../../runtime" -maxdepth 14 -path '*spec-board/scripts/spec-board.mjs' 2>/dev/null | head -1
```

For a plugin loaded with `claude --plugin-dir /path/to/plugin`, the script is at `/path/to/plugin/skills/spec-board/scripts/spec-board.mjs`.

| Goal | Command |
|------|---------|
| Live board (default) | `node "scripts/spec-board.mjs" --serve` |
| Offline snapshot | `node "scripts/spec-board.mjs" --out /tmp/spec-board.html` |
| Full data for tooling | `node "scripts/spec-board.mjs" --json` |

`--json` prints every spec body and every file in each spec folder, so it is large and meant for tooling. To answer questions, pipe it through the one-line summary under "How Claude uses it".

Options:
- `--port <n>`: default 4477; `0` picks a free port.
- `--interval <ms>`: re-scan interval, default 2000.
- `--title <text>`: page title.
- `-h`: help.

Exit codes: 0 ok, 1 runtime failure (no spec dir, port in use, cannot write), 2 usage error.

Run it from the repo root. The default directory is `./.ai/specs`.

## How Claude uses it

1. **"Show me the board" / "open the spec board"**: start `--serve` with Bash `run_in_background: true`, then read the output for the line that starts with `Spec board:` (for example `Spec board: http://127.0.0.1:4477/ ...`) and give the user that URL. Warnings about parse problems may appear before it. The page refreshes itself when spec files change. If the port is busy, retry with `--port 0`. Stop the background task when the user is done.
2. **"Send/share a snapshot"**: run `--out /tmp/spec-board.html` and give the path. The file holds a frozen copy of every spec and its files and works offline from `file://`, so it can be attached to a ticket or a chat. Keep it out of version control: do not write it under `.ai/specs/`, and do not commit it.
3. **"What's awaiting approval / in flight?"**: do not open a browser and do not print the raw `--json` (it can exceed the Bash output limit). Pipe it into a one-line-per-spec summary:

   ```bash
   set -o pipefail; node "scripts/spec-board.mjs" --json | node -e 'const b=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const s of b.specs)console.log([s.repo+"/"+s.shortId,s.folder,s.status,s.tasks.done+"/"+s.tasks.total,s.title,s.warnings.filter(w=>w.level==="warn"||w.code==="awaiting-approval").map(w=>w.code+(w.level==="info"?":ready":"")).join(","),s.session&&s.session.resumeHint||""].join(" | "))'
   ```

   For a polyrepo workspace, pass the spec directories: `... spec-board.mjs api/.ai/specs web/.ai/specs --json | ...`. Keep stderr visible and keep `pipefail`: when no spec directory is found, the script prints guidance on stderr and exits 1. Empty output with a non-zero exit means "wrong directory", not "nothing in flight": rerun from the repo root or pass the paths, and never tell the user that no specs are awaiting approval in that case. Only a successful run with no lines means the folder exists and holds no specs.

   Each line is `repo/shortId | folder | status | tasks done/total | title | warning codes | resume hint`. For "what's left in the backlog?", list `b.backlog` the same way: `id | size | title | run`. The pipeline lists warn-level codes, plus `awaiting-approval` at either level. Warning codes:
   - `awaiting-approval:ready`: draft with no open questions and full traceability. Suggest `/sdd <id>` to approve.
   - `awaiting-approval` (no suffix): draft that is not ready. Do not suggest approving it yet: resolve the open questions or traceability gaps first (`/sdd` refuses to approve a spec with open questions).
   - `open-questions`: unchecked open questions in `spec-lite.md`. Resolve them first.
   - `approval-missing`: status is `approved` but `approved_by` is empty. Suggest `/sdd <id>`.
   - `status-drift`: status disagrees with task progress (a draft or approved spec with checked tasks, or a done spec with unchecked tasks). Suggest `/execute-task --spec=<id>` to reconcile, or `/sdd <id>` if the spec was never approved.
   - `parse-error`: frontmatter or file problems. Read the spec file.
   - `unknown-status`: `status` is not draft, approved, in-progress or done.
   - `missing-spec-lite`: the folder has `tasks.md` but no `spec-lite.md`, so the spec text, status and approval cannot be checked. Ask whether to write the spec (`/write-spec`) or treat it as a legacy task list.
   - `no-frontmatter`: `spec-lite.md` has no frontmatter block, so status is inferred from tasks and approval cannot be checked. Add the frontmatter (see `/write-spec`) before approving.
   - `ac-unparsed` (warn for drafts): the Acceptance criteria section has no `AC-n` ids, so traceability cannot be checked. Rewrite each criterion as `- **AC-1**: ...`.

   Name each spec by `shortId` and title. Suggest the next command with the full `folder` name: `/sdd <folder>` to approve a ready draft, `/execute-task --spec=<folder>` to continue. `/execute-task` and `/sdd` look only in the current directory's `.ai/specs`, and a shortId can exist in several repos, so in a polyrepo (more than one repo scanned) always name the repo as well: "in `api/`: `/execute-task --spec=spec-SHARED-1-auth-headers`", and tell the user to run it from that repo. For one spec's detail, read its `spec-lite.md` and `tasks.md` directly.

## Polyrepo

Pass several spec directories, or repo roots that contain `.ai/specs`:

```bash
node "scripts/spec-board.mjs" ../api ../web --serve
node "scripts/spec-board.mjs" api/.ai/specs web/.ai/specs --out /tmp/spec-board.html
```

Cards are labelled with the folder that contains `.ai` (`api`, `web`). The same spec id in two repos stays two cards; deep links use `#spec/<repo>/<id>`. `/execute-task` and `/sdd` resolve specs only in the current directory's `.ai/specs`, so commands suggested from a board run at the workspace root must name the repo and use the full folder name.

## Backlog

`/product-brief` writes `backlog.md` next to `product-brief.md`. The board reads it from:
1. the directory you run the board from (the workspace root of a polyrepo, or a single repo's root),
2. each scanned repo's root (the folder that holds `.ai/`),
3. the folder above a repo, when that folder also holds `product-brief.md` (running the board from inside `api/`).

Only a file named `backlog.md` is read, never through a symlink, and only up to 256 KB. Slices are the `### SL-nn · Title` headings under `## Slices`, each with `- **Field:** value` lines (`Size`, `BRs`, `Depends on`, `Blocked by`, `Ticket`, `Status`, `Spec`, `Run`).

A slice leaves the Backlog column once it has a spec: its `Status` is `specced` or `shipped`, its `Spec:` names a spec folder (one on the board, or a `spec-…` / numbered folder name; other values such as `greenfield-build` on an unfinished first slice keep it in Backlog), or its `Ticket` matches a spec's ticket on the board. Search and the size filter apply to backlog cards; the type, status, repo, stack and warnings filters hide the column, since slices have none of those yet. Parse problems (duplicate ids, unknown statuses, `SL-nn` headings outside `## Slices`) appear in the issues panel.

In `--json` output, slices are under `backlog` and the files read under `backlogFiles`.

To start a slice, run its `/sdd` line. When `/sdd` writes the spec for a slice, it records the folder in the slice (`Status: specced`, `Spec: <folder>`), and the card moves from Backlog to Draft on the next refresh. A slice with a `Ticket:` moves as soon as a spec with that ticket exists.

## How it reads specs

- **Spec folders**: any child folder with `spec-lite.md` or `tasks.md`. Folders starting with `.` or `_` (for example `_archive`) are skipped. Other folders are listed as ignored in the "issues" panel.
- **Frontmatter**: read with a small built-in YAML subset (scalars, quoted strings, flow and block lists, block scalars). Values always stay strings, so `0042` and `P2` are kept as written. Status aliases such as `in_progress`, `wip` and `completed` are normalised.
- **Tasks**: progress counts top-level numbered tasks (`- [x] 3. Title (backend)`). "Done when" and "Success Criteria" boxes are not counted, and neither is anything inside code fences.
- **Traceability**: comes from the table under `## Traceability`. Acceptance (`AC-n`), must-not-change (`MNC-n`), and quality-attribute (`NFR-n`) ids missing from that table are shown as uncovered.
- **Session state**: read from `.ai/session/*-state.json` (`current_task`, `completed_tasks`, `resume_hint`).

## Read-only by design

The board never writes to specs:
- Approval happens in `/sdd`, which sets `status`, `approved_by` and `approved_at`.
- Progress changes in `/execute-task`, which checks tasks off and writes session state.

The board picks up both changes on its next refresh.

## Related skills

- `/progress` answers "where was I" and "what is the next task". Use the board for the visual overview of all specs.
- `/product-brief` writes and revises `backlog.md`; the board only reads it.
- `/sdd` is the entry point for creating, approving and executing specs.

## Security

- The server listens on 127.0.0.1 only. There is no `--host` flag.
- Requests with a Host header other than `127.0.0.1:<port>` or `localhost:<port>` are refused, which guards against DNS rebinding.
- The server only answers GET and HEAD on `/`, `/api/board` and `/api/events`. There is no file-serving route.
- File contents reach the page only inside the board data. The parser builds that data after it checks that every file is inside the spec directory, and it never follows symlinks that leave it.
- All text is HTML-escaped. Markdown rendering allows only a safe subset: no raw HTML, no images, and no `javascript:`, `data:` or `file:` links.
- The page has a strict CSP and makes no external requests.

## Limits

- Files larger than 512 KB are listed but not previewed, and file previews stop once the board holds 12 MB of file text. Up to 100 files are listed per spec folder (two levels of subfolders), and up to 1000 specs per root.
- YAML nested mappings and flow mappings are not supported. Those values are kept as text and reported as parse problems.
- Markdown is a safe subset (headings, lists, task lists, tables, code, emphasis, links). Raw HTML is shown as text.

## Tests

From this skill's directory, on Node 18 or later (`test/index.js` makes the bare directory form work on Node 22, which treats it as a module path):

```bash
node --test test
```
