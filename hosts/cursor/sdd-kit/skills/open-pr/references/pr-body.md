# PR body: sources, lookup rules, and example

Load this in Step 3 of `/open-pr`. Each section of the body has exactly one source. When the source is missing, drop the section or mark it as missing as the table says. Never fill it from memory.

## Section sources

| Section | Source | When the source is missing |
|---------|--------|----------------------------|
| Title line under the heading | spec-lite.md `title` + `ticket` | Bug mode: first line of the fix-bug report Summary |
| Summary | spec-lite.md *Summary* (one paragraph, trimmed to this repo's part in a polyrepo change) | Bug mode: report Summary + Root cause (mechanism, `file:line`) |
| Spec | path to the spec folder, plus `approved_by` / `approved_at`; when either is empty write "not approved (approval empty)" in their place | Bug mode: "No spec — fix-bug pipeline; report attached below" |
| Changes | `git diff --stat origin/$BASE...HEAD` grouped by area (see *Stack notes*) | — |
| Acceptance criteria | spec-lite.md *Acceptance criteria* joined with the tasks.md *Traceability* rows | Bug mode: the regression test(s) from the report |
| Must NOT change | spec-lite.md *Must NOT change* joined with Traceability `MNC-*` rows | Bug mode: report *Must NOT change* (behavior + guard test) |
| Quality attributes | spec-lite.md *Non-functional requirements* joined with Traceability `NFR-*` rows | No NFR table in the spec: omit the section |
| Manual test plan | `<spec-folder>/manual-test.md` (ship-feature TestPlan) | Bug mode: report *Manual test plan*. Neither → the Traceability rows of kind `manual`; none at all → omit and warn |
| Verification | gate evidence from Step 2 + the review verdict and report path | Never omitted: state "not run" explicitly |
| Decision record | ADR path found by the lookup below | Omit the section |
| Counterpart | the other repo's PR reference | Single repo: omit |
| Merge order | polyrepo only, see *Polyrepo* | Single repo: omit |

## AC-to-test lookup

For every `AC-*`, `MNC-*` and `NFR-*` row in the Traceability table:

1. Take the "Verified by" cell. `file::test name` → a test. `manual-test.md#step-N` → a manual step. `—` or empty → **unverified**.
2. Confirm that the test exists in the repo whose PR you are writing:
   ```bash
   grep -nF "<test name>" "<file>"         # the test framework's test declaration, e.g. it('…') / test('…')
   ```
   Found → link it with a permalink (see *Links*). Not found → **unverified (named test not found)**.
3. In a polyrepo change, list each row in the PR of the repo that holds its test. A row verified in the other repo is listed once with a link to the counterpart PR, not duplicated.

Show unverified rows in the table **and** in the Step 6 warnings. They never block on their own (the gates and review already ran), but the reviewer must see them.

## ADR lookup

```bash
grep -rhoE '(docs/adr|\.ai/decisions)/[A-Za-z0-9._/-]+\.md' "<spec-folder>"   # links written into the spec
grep -rlF "<TICKET>" docs/adr .ai/decisions 2>/dev/null                        # ADRs naming the ticket
```

Link every ADR found, and only those. tech-research writes ADRs to `docs/adr/` (falling back to `.ai/decisions/`).

## Stack notes for "Changes"

Group the changed paths so a reviewer sees risk first:

| Change type | Call out separately |
|-------------|---------------------|
| Backend | database migrations (name each; note the ones that are not additive), new or changed endpoints, configuration, new dependencies |
| Frontend | new or changed routes and pages, middleware, public environment variables, dependency changes |

Anything else goes in one line: `+N −M across K files`.

## Links

GitHub does not resolve relative paths in PR descriptions to repository files, so every file link is absolute and pinned to the commit being pushed:

```bash
(cd api && gh repo view --json nameWithOwner --jq .nameWithOwner)   # prints e.g. acme/api
git -C api rev-parse HEAD                                           # prints the sha, after any Step 3 commit
```

Read both outputs and write the link with those values typed in: `https://github.com/acme/api/blob/3f9c2e1d…/<path>#L<line>`. Shell variables don't survive between Bash calls, so never leave `$SLUG` or `$SHA` in a command or body for a later step to expand.

A pinned link keeps pointing at the reviewed code after later pushes. In the template below, `$BLOB` is a text placeholder for `https://github.com/<owner>/<repo>/blob/<sha>`. Replace it with the literal URL in the body file: before Step 4 when no commit is pending, otherwise in Step 5.1 right after the commit.

## Polyrepo

- The spec lives in one repo, usually the backend. Both PRs link the spec and `manual-test.md` with that repo's `$BLOB` URLs.
- **Merge order line.** The default is "Merge `<backend>#N` first, then this PR." Use expand/contract wording instead ("Phase 1 of 3: adds the new field; the old one is removed in a follow-up") when the spec's *Technical context*, *Decisions*, or `decisions.md` says the change breaks the API contract.
- The frontend body is written with the placeholder `<backend-pr>`. Step 5 replaces it with `owner/repo#N` after the backend PR exists. If that replacement does not happen, do not create the frontend PR.

## Template

```markdown
## <Spec title> (<TICKET>)

<Summary paragraph>

**Spec:** [.ai/specs/<folder>]($BLOB/.ai/specs/<folder>/spec-lite.md) — approved by <approved_by>, <approved_at>
**Counterpart:** <backend-pr | frontend-pr>  ·  **Merge order:** <line>

### Changes
- Migrations: `2026_10_19_101500_add_refund_blocked_to_orders` (additive, default false)
- Endpoints: `POST /api/v1/orders/{order}/refunds` now returns 422 `refund_not_allowed` for top-ups
- +214 −31 across 9 files

### Acceptance criteria
| ID | Criterion | Verified by |
|----|-----------|-------------|
| AC-1 | Top-up refund rejected with 422 | [`tests/refund-test` › rejects top-up refunds]($BLOB/tests/refund-test#L42) |
| AC-2 | Admin override is audited | [`tests/refund-override-test` › audits override]($BLOB/tests/refund-override-test#L18) |
| AC-3 | Refund button hidden for top-ups | web: see <frontend-pr> |

### Must NOT change
| ID | Behavior that stays identical | Guard |
|----|-------------------------------|-------|
| MNC-1 | Card refunds still need approval | [`tests/refund-test` › card refund needs approval]($BLOB/tests/refund-test#L77) |
| MNC-2 | Order response shape unchanged | manual step 4 |

### Quality attributes
| ID | Requirement | Verified by |
|----|-------------|-------------|
| NFR-1 | Every role other than admin gets 403 on the override endpoint | [`tests/refund-override-test` › non-admin roles get 403]($BLOB/tests/refund-override-test#L55) |

### Manual test plan
[manual-test.md]($BLOB/.ai/specs/<folder>/manual-test.md) — 5 steps.

<details><summary>Steps</summary>

1. …
</details>

### Verification
- Gates: format pass · types pass · test 148/148 pass (run 2026-10-19 10:12 UTC, after the last commit)
- Review: deep-review **APPROVED** — `.ai/reviews/REVIEW-spec-PROJ-123-20261019-101500.md`

### Decision record
- [docs/adr/0007-refund-guard-placement.md]($BLOB/docs/adr/0007-refund-guard-placement.md)
```

Keep the body in the reviewer's language: no internal phase names, no agent names, no tool attribution. If the rendered body exceeds about 300 lines, collapse the manual steps and the Changes list under `<details>`, not the AC, MNC and NFR tables.
