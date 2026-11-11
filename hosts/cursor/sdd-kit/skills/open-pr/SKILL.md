---
name: open-pr
description: 'Open spec-traced pull requests once a feature or fix is approved — one PR per changed repo, backend first, cross-linked. Checks the preconditions (spec in-progress or done, gates green, deep-review APPROVED when a report exists), builds each PR body from the spec (summary, every acceptance criterion mapped to its test, Must-NOT-change guards, manual test plan, ADR link, counterpart PR), uses a conventional-commit title, and shows the exact push and gh pr create commands before running them. Use when a spec or bug fix is built and reviewed and the user wants to open its PRs (/open-pr --spec=PROJ-123), when a ship-feature or fix-bug report ends with "Next: /open-pr", or when a polyrepo change needs linked backend and frontend PRs. Pushes branches and creates PRs, so it is user-invoked only.'
argument-hint: "[--spec=<folder | number | ticket key | timestamp id>] [--report=<.ai/reports/ship-… or fix-… path>] [--repos=backend:<path>,frontend:<path>] [--base=<branch>] [--render|--dry-run] [--draft] [--reviewer=<login>] [--label=<name>]"
allowed-tools: Bash, Read, Grep, Glob, AskUserQuestion
disable-model-invocation: true
license: Apache-2.0
metadata:
  version: "1.0"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /open-pr — review to merge, traced to the spec

A PR is the last place a reviewer sees the contract before it merges. `/open-pr` puts the spec in front of them: what changed, which test proves each acceptance criterion, what must stay identical, and how to test it by hand. On a polyrepo change it opens one PR per changed repo in merge order and links them both ways, so nobody pastes `#<n>` by hand.

```
/open-pr --spec=<ref> | current branch
   ├─ 1 Resolve   spec (or fix-bug report) + repos + which repos actually changed
   ├─ 2 Check     gh auth, spec status, gates, deep-review, branch, secrets
   ├─ 3 Compose   conventional title + spec-traced body per repo
   ├─ 4 Confirm   exact commands shown → user approves
   ├─ 5 Run       backend PR → frontend PR (links backend) → comment back on backend
   └─ 6 Report    PR URLs, merge order, spec status
```

## Usage

```bash
/open-pr --spec=PROJ-123                      # spec by ticket key, repo = current directory
/open-pr --spec=PROJ-123 --report=.ai/reports/ship-spec-PROJ-123-refund-guard-20261019-1012.md  # after ship-feature
/open-pr                                      # infer the spec from the branch name (feature/PROJ-123-…)
/open-pr --spec=PROJ-123 --repos=backend:api,frontend:web
/open-pr --report=.ai/reports/fix-PROJ-130-20261019-1412.md  # bug fixed by fix-bug (no spec)
/open-pr --spec=PROJ-123 --draft --reviewer=jdoe
```

| Argument | Default | Meaning |
|----------|---------|---------|
| `--spec` | inferred from the branch | Spec reference: folder name, legacy number, ticket key, or timestamp id |
| `--report` | newest matching file in `.ai/reports/` | Saved workflow report (path in the run's `reportPath`). With `--spec`: the ship-feature report (`.ai/reports/ship-<spec>-<timestamp>.md`), used as gate and review evidence. Alone: the fix-bug report (`.ai/reports/fix-<ticket or slug>-<timestamp>.md`) for a fix without a spec |
| `--repos` | detected | Polyrepo map, same shape as the workflows' `repos: { backend, frontend }` |
| `--base` | the repo's default branch | Target branch for every PR |
| `--render`, `--dry-run` | off | Render mode: write the bodies and print the push line and the host's next step; no gh call, no commit, no push. Switches on by itself when the origin is not GitHub or gh is unavailable (see *Origin host*) |
| `--draft` | off | Open as draft (offered automatically when the spec is not complete) |
| `--reviewer`, `--label` | config | Passed through to `gh pr create`; repeatable |

## Step 1 — Resolve the input

**Spec.** With `--spec`, resolve it to one folder exactly as `/execute-task` does:

```bash
REF="${REF#.ai/specs/}"; REF="${REF%/}"; KEY="${REF#spec-}"
if [ -d ".ai/specs/$REF" ]; then echo ".ai/specs/$REF"
elif printf '%s' "$KEY" | grep -qE '^[0-9]+$'; then ls -d .ai/specs/*/ | grep -E "/(spec-)?0*$((10#$KEY))-"
else ls -d .ai/specs/*/ | grep -iE "/(spec-)?${KEY}-"; fi
```

Without `--spec`, take the ticket key from the current branch (`git branch --show-current`, e.g. `feature/PROJ-123-refund-guard` → `PROJ-123`) and resolve that. In a polyrepo workspace the spec lives in the repo that started the change, so search each repo's `.ai/specs/`. Several matches → list and ask. Then look for the ship-feature report: `--report`, or else the newest `.ai/reports/ship-<spec folder>-*.md` in the spec's repo. It is evidence for Step 2, not a body source. No match and no `--report` → ask whether this is a bug fix (point to the fix-bug report) or stop and suggest `/write-spec`.

**Bug mode.** With a fix-bug `--report` (`.ai/reports/fix-*.md`) and no spec, or when the user confirms a fix-bug run with no spec, read the report's Summary, Root cause, Regression test, Must NOT change, Quality gates, and Manual test plan sections. fix-bug saves its report under `.ai/reports/` and names the path in its `Next:` line; without `--report`, take the newest `.ai/reports/fix-*.md` whose name or Summary matches the branch's ticket, and confirm it with the user. A report that only exists in the conversation (an older run) → ask the user to save it to a file first so the body is built from text you can cite.

**Repos.** In order: `--repos`; the spec's *Technical context → Repos* line; the workspace `AGENTS.md` Layout table (`docs/multi-repo.md` layout); sibling git repos of the current directory. Confirm a detected polyrepo map with the user once. Then decide which repos get a PR:

```bash
git -C "$REPO" fetch origin --quiet
BASE=${BASE:-$(cd "$REPO" && gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)}   # gh flow only
git -C "$REPO" log --oneline "origin/$BASE..HEAD"      # empty → no PR for this repo
git -C "$REPO" status --porcelain                      # uncommitted work → Step 2
```

**Origin host.** Read `git remote get-url origin` per repo. Accepted forms: `git@<host>:<path>`, `ssh://[user@]<host>[:port]/<path>`, `http(s)://[user@]<host>[:port]/<path>`. Lowercase the host, drop the port, and drop a trailing `.git` from the path. For the two SSH forms the host may be an alias from `~/.ssh/config` (`git@github-work:org/repo.git`): replace it with the `hostname` line that `ssh -G <host>` prints (it reads the config and connects to nothing), and treat `ssh.github.com` as `github.com`.

| Host | gh | Render mode | Next step printed |
|------|----|-------------|-------------------|
| `github.com` | `gh auth status --hostname github.com`; exit 0 keeps the GitHub flow | Only when gh is missing or that check fails (Warn row below) | The plain push line `git push -u origin <branch>`, then `https://github.com/<owner>/<repo>/compare/<base>...<branch>?expand=1` |
| `bitbucket.org` | none | Always | The plain push line `git push -u origin <branch>`, then `https://bitbucket.org/<workspace>/<repo>/pull-requests/new?source=<branch>&dest=<base>` (workspace and repo are the first two path segments) |
| `gitlab.com`, or a first label of `gitlab` | none | Always | `git push -u -o merge_request.create -o merge_request.target=<base> -o 'merge_request.title=<title>' origin <branch>` in place of the plain push line; paste the body from the file |
| any other host | `gh auth status --hostname <host>` when gh is installed; exit 0 means GitHub Enterprise and keeps the GitHub flow | Otherwise | The plain push line `git push -u origin <branch>`, then `Open a pull request from <branch> into <base> on <host> and paste the body file.` |

In the Bitbucket URL, percent-encode branch and base except `A-Z a-z 0-9 - _ . ~ /`. In the GitLab push line, write a `'` in the title as `'\''`.

**Base without gh.** Resolve in order: `--base`, `open-pr.base` in the project `AGENTS.md`, `git symbolic-ref --short refs/remotes/origin/HEAD` with the `origin/` prefix removed, then ask the user, naming `git remote set-head origin --auto` as the fix.

A repo with no commits ahead of base and a clean tree gets no PR; say so in the report ("No web PR: no changes"). Each repo's role (frontend, backend) comes from the stack manifest the workflows' Detect phase reports.

## Step 2 — Preconditions

Run every check, then show one table. **Block** stops the run with the fix; **Warn** needs an explicit "continue" from the user.

| Check | How | Fails as |
|-------|-----|----------|
| Origin host | per *Origin host* in Step 1 | Not GitHub (`bitbucket.org`, GitLab, or a host where `gh auth status --hostname <host>` fails): Warn `origin is <host>, not GitHub — rendering the PR instead. Fix: run the printed push, then open the printed link` and switch to render mode |
| `gh` installed and authenticated | `gh auth status --hostname <origin host>` (GitHub flow only) | `github.com` with gh missing or the check failing: Warn `gh unavailable or not authenticated — rendering instead. Fix: gh auth login` and switch to render mode |
| Spec status | `status:` in spec-lite.md frontmatter is `in-progress` or `done` | Block on `draft` (→ `/sdd <spec>` for approval) or `approved` (→ `/execute-task` or ship-feature; nothing is built yet). Legacy spec without frontmatter → Warn |
| Spec complete | every `- [ ] N.` in tasks.md checked, every Traceability "Verified by" cell filled | Warn — offer `--draft` |
| Spec lint | `node ../write-spec/scripts/spec-lint.mjs --verified <spec-folder>`; report each finding | Warn — list the findings in the output |
| Spec approval | `approved_by` and `approved_at` in spec-lite.md frontmatter are both non-empty | Warn — the spec was never approved; say so in the output and in the PR body's Spec line |
| Gates green | see *Gate evidence* below | Block |
| Deep-review | newest `.ai/reviews/REVIEW-*` whose name or Source line matches the spec id, ticket, or branch | `BLOCKED` / `CHANGES_REQUIRED` → Block (fix, re-run `/deep-review`). When no deep-review report exists, the Recommendation of a saved workflow report under `.ai/reports/` counts as the review: ship-feature `SHIP` or fix-bug `FIXED` passes, anything else Blocks. No report of either kind → Warn, suggest `/deep-review --spec=<id>` |
| Branch | current branch is not the base, and the same branch name is used in every repo of the change | Block on base — offer `git switch -c <feature\|fix>/<ticket>-<slug>` |
| Working tree | `git status --porcelain` per repo | Warn — list the files; offer one commit with a conventional message (Step 3), staging the listed paths explicitly, never `git add -A` |
| Spec folder tracked | `git -C <spec repo> status --porcelain .ai/specs/<folder>` | Warn — it ships with the PR of the repo that holds it |
| Secrets | changed paths (`git diff --name-only origin/$BASE...HEAD` plus staged files) matching `.env`, `.env.*` (not `.env.example`), `*.pem`, `*.key`, `auth.json`, `credentials*` | Block — never pushed |
| Existing PR | `gh pr list --head <branch> --state open --json number,url` | Not a failure: switch that repo to update mode (`gh pr edit <n> --body-file`). In render mode: `not checked (render mode)` |

**Gate evidence.** Accept, newest first: a report in `.ai/verification/<spec-folder>/` (from `/execute-task`), or a saved workflow report under `.ai/reports/` (`ship-*.md` from ship-feature, `fix-*.md` from fix-bug) whose *Quality gates* section shows every gate passing for this repo, **only if** the file is newer than the repo's last commit (`git log -1 --format=%cI`). A report that exists only in the conversation is not evidence: every claim comes from a file you read. Otherwise run the gate set from the `verification-gates` skill now, per repo, with the tools installed there: the manifest's gates for that repo (format, lint, types, test, build) and its e2e gate when the change touches a journey. `<pm>` / `<pmx>` follow that skill's package-manager rule. Conditional gates are skipped only with the reason logged, as that skill describes.

A gate that cannot run (missing binary, no database for tests) is **unreachable, not a pass** — report it and Block.

## Step 3 — Compose titles, bodies, and any commit

**Title** — conventional commit, at most 72 characters, ticket key in parentheses:

| Spec `type` / mode | Prefix |
|--------------------|--------|
| `feature` | `feat` |
| `bug`, fix-bug report | `fix` |
| `improvement` | `refactor` when no AC changes observable behavior, otherwise `feat` |
| `refactor` | `refactor` |

Scope is the domain noun from the spec title (`refunds`, `auth`). In a polyrepo change both titles share prefix, scope, and ticket and differ in the repo-specific part: `feat(refunds): reject top-up refunds in the API (PROJ-123)` / `feat(refunds): hide refund action for top-ups (PROJ-123)`.

**Body** — build it from the spec using `references/pr-body.md` (section sources, the AC-to-test lookup, polyrepo links, and a full example). Every statement in the body comes from a file you read: the spec, tasks.md, manual-test.md, the review or gate report, or the diff. An AC whose test cannot be found by name is listed as **unverified**, never silently dropped. `$BLOB` is a text placeholder for the commit-pinned link prefix, not a shell variable. When Step 3 adds no commit, write the literal URL (`https://github.com/<owner>/<repo>/blob/<sha>`) into the body before Step 4 is shown. When a commit is still pending, `$BLOB` stays until Step 5.1. In the frontend body `<backend-pr>` also stays until Step 5.

**Commits** (only when Step 2 found uncommitted work) — conventional messages, one per repo, e.g. `feat(refunds): reject top-up refunds (PROJ-123)`.

**Spec status.** Leave it alone. ship-feature and `/execute-task` set `status: done` when gates and acceptance pass, so the spec already reads `done` on the PR branch and reaches the base branch when the PR merges. A spec still `in-progress` here means the build is unfinished: that is the *Spec complete* warning above, not something to flip.

Write each body to its own file. Each Bash call starts a fresh shell, so a variable set here (`BODY_API=…`) is empty in Steps 4 and 5. Create the file once and reuse the **printed path literally** in every later command:

```bash
mktemp "${TMPDIR:-/tmp}/open-pr-api.XXXXXX"     # prints e.g. /tmp/open-pr-api.k3J9qa; X's are required on GNU mktemp
```

Then write the body to that literal path (heredoc in a later Bash call) and show the same literal path in Step 4.

## Render mode

Render mode runs Step 1, every Step 2 row except `Existing PR`, and Step 3 without creating a commit. Block rows still stop the run. If `git fetch origin` fails, show the Warn row `could not fetch origin — comparing with the local <base> branch. Fix: check the remote URL and your access` and use the local `<base>`.

It writes one body file per repo with the `mktemp` names from Step 3, then prints per repo: the title, the body file path, any pending commit command, the push line (the plain `git push -u origin <branch>` unless the host row names its own), and the host's next step from the *Origin host* table. It makes no gh call, no commit and no push, asks no Step 4 question, and skips Step 5. Counterpart references are plain text (`references/pr-body.md`, *Links*).

## Step 4 — Confirm the exact commands

Show, per repo in run order: the preflight table result, the title, the rendered body (or the path to view it), and every command that changes state — commits, `git push`, `gh pr create`, `gh pr comment`, `gh pr edit`. Example for a polyrepo feature:

```bash
git -C api push -u origin feature/PROJ-123-refund-guard
(cd api && gh pr create --base main --head feature/PROJ-123-refund-guard \
  --title "feat(refunds): reject top-up refunds in the API (PROJ-123)" --body-file /tmp/open-pr-api.k3J9qa)
git -C web push -u origin feature/PROJ-123-refund-guard
(cd web && gh pr create --base main --head feature/PROJ-123-refund-guard \
  --title "feat(refunds): hide refund action for top-ups (PROJ-123)" --body-file /tmp/open-pr-web.Q81mzT)
(cd api && gh pr comment <api-pr-number> --body "Frontend counterpart: <owner>/web#<web-pr-number>")
```

The body file paths in these commands are the literal paths printed in Step 3, never `$BODY_API`-style variables. Ask with `AskUserQuestion`: **Run these** / **Run as draft** / **Edit title or body** / **Cancel**. *Edit* → apply the change and show the commands again. Nothing runs before an explicit yes in this conversation.

## Step 5 — Run

1. Run the confirmed commits, if any. If a body still holds `$BLOB`, read the new HEAD sha (`git -C api rev-parse HEAD`) and the slug, then rewrite the placeholder in the body file with both values typed literally, e.g. `sed -i.bak 's#\$BLOB#https://github.com/acme/api/blob/3f9c2e1d…#g' /tmp/open-pr-api.k3J9qa` (`references/pr-body.md`, *Links*). Check with `grep -c '\$BLOB' <file>` that none is left.
2. **Backend first.** Push, create the PR, capture the URL that `gh pr create` prints, and the reference `owner/repo#N` (`gh repo view --json nameWithOwner --jq .nameWithOwner`).
3. Fill the frontend body's counterpart placeholder with the backend reference, then push and create the frontend PR.
4. Comment the frontend reference back on the backend PR. In update mode, refresh the counterpart line with `gh pr edit` instead of adding a second comment.
5. Single repo: push and create one PR; there is no counterpart section.

Stop at the first failing command and report what already happened (e.g. "api PR #41 created; web push rejected — remote has new commits; pull and re-run `/open-pr`, which will update #41 and create the web PR"). Re-running is safe: existing PRs are updated, never duplicated.

## Step 6 — Report

```
Spec:        .ai/specs/spec-PROJ-123-refund-guard/ (status: done)
Review:      deep-review APPROVED (.ai/reviews/REVIEW-spec-PROJ-123-20261019-101500.md)
Gates:       api pass (format, types, test 148/148) · web pass (lint, types, build, test 62/62)
PRs:         api  https://github.com/acme/api/pull/41   feat(refunds): reject top-up refunds in the API (PROJ-123)
             web  https://github.com/acme/web/pull/88   feat(refunds): hide refund action for top-ups (PROJ-123)
Merge order: api #41 first (additive), then web #88
Warnings:    AC-3 has no automated test (manual step 4)
```

When a tracker CLI (`jira`, `linear`) is available and the spec has a ticket, ask whether to post the PR links to the ticket; post only on yes.

## Rules

- One PR per changed repo; never a PR for a repo with no changes. Same branch name across repos.
- Never force-push, rebase, merge, enable auto-merge, or use `--admin`. Merging stays a human decision.
- No tool attribution in titles, bodies, comments, or commits: no "Generated with" lines, no `Co-Authored-By` trailers for an assistant.
- Never post to a PR or tracker without the Step 4 confirmation.
- Only claim what a file shows. A missing test, gate result, or review is reported as missing.

## Configuration

Optional, in the project (or workspace) `AGENTS.md`:

```yaml
open-pr:
  base: main              # default: each repo's default branch
  draft: false            # open every PR as draft
  reviewers: []           # GitHub logins or org/team slugs
  labels: []
```

## Related

| Skill | When |
|-------|------|
| `/sdd`, `ship-feature`, `fix-bug` | Produce the spec, tests, review, and manual test plan this skill links |
| `/execute-task` | Task-by-task build; run `/open-pr` after the last task |
| `/deep-review` | Before `/open-pr` when the pipeline's own review did not run |
| `/changelog` | After merge, from the conventional-commit titles |
| `/sync-obsidian` | Publish the merged, human-verified spec |
