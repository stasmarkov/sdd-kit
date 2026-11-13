---
name: deep-review
description: Use for a code or PR review before merge. Reviews finished code adversarially and returns APPROVED, CHANGES_REQUIRED or BLOCKED.
argument-hint: "[--depth=quick|standard|adversarial] [--task=ID | --spec=ID | --files=path | --staged | --branch=name --base=main] [--focus=security|performance|architecture|testing] [--format=markdown|json] [--critical-only] [--auto-fix]"
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob
model: opus
metadata:
  mcp-tools: "context7"
  version: "2.0"
  subagents: "adversarial-reviewer, security-auditor"
  blocking: "true"
---
On this host, run Workflow and Agent through the sdd-runtime skill.


# /deep-review

Post-implementation review with a blocking verdict. One skill, three depths:

| Depth | Persona | Context given to the reviewer | Best for |
|-------|---------|-------------------------------|----------|
| `adversarial` (default) | Skeptical: assumes bugs until proven otherwise | Code, business rules, architecture, tool results. **Not** the original task prompt | Gate before deploy; anything touching auth, money, or data |
| `standard` | Constructive, checklist-driven | Code, diff against base, original intent (PR description, spec) | Branch/PR review; CI with `--format=json` |
| `quick` | Critical-only | Changed files and security/debug scans | Fast sanity check on small changes |

Models fail to correct their own errors most of the time but are good at reviewing someone else's code, so the reviewer is always a separate agent (`adversarial-reviewer`), never the session that wrote the code. Background: `references/adversarial-review.md`.

---

## Usage

```bash
/deep-review                                    # adversarial, last commit
/deep-review --task=TASK-0043                   # files from a task log
/deep-review --spec=spec-PROJ-123-refund-guard  # all files touched by a spec
/deep-review --files=app/Services/              # specific path
/deep-review --staged                           # staged changes
/deep-review --critical-only --auto-fix

/deep-review --depth=standard                   # current branch vs main
/deep-review --depth=standard --branch=feature/new-auth --base=develop
/deep-review --depth=standard --focus=security
/deep-review --depth=standard --checklist=quick
/deep-review --depth=standard --format=json     # CI-friendly

/deep-review --depth=quick --staged             # critical-only pass
```

## Arguments

| Argument | Depths | Description |
|----------|--------|-------------|
| `--depth` | all | `quick`, `standard`, or `adversarial` (default) |
| `--task=ID` | all | Review files listed in `.ai/tasks/TASK-{ID}.md` |
| `--spec=ID` | all | Review files touched by `.ai/specs/{ID}/` |
| `--files=path` | all | Review specific files or directories |
| `--staged` | all | Review staged changes |
| `--branch` / `--base` | all | Diff `{base}...{branch}` (defaults: current branch, `main`) |
| `--focus` | standard | `security`, `performance`, `architecture`, `testing` |
| `--checklist` | standard | `full` (default) or `quick` |
| `--format` | standard | `markdown` (default), `json`, `summary` |
| `--critical-only` | adversarial | Report only CRITICAL and MAJOR |
| `--auto-fix` | adversarial, quick | Apply safe MINOR fixes after the verdict |

With no source flag: adversarial and quick review the last commit; standard reviews the current branch against `--base`.

---

## When to Use

| Situation | Use |
|-----------|-----|
| After `/simple-task` or `/execute-task` completes | `/deep-review` |
| Before `/deploy` to production | `/deep-review` |
| Reviewing a teammate's branch or PR | `/deep-review --depth=standard` |
| CI review gate | `/deep-review --depth=standard --format=json` |
| Small change, want a fast safety net | `/deep-review --depth=quick` |
| Style only | `/lint` |
| Dependency CVEs and full OWASP scan | `/security-scan` |
| During active development | Wait until the change is complete |

---

## Workflow

### Phase 1: Resolve Scope and Ground Truth

```bash
git diff --name-only HEAD~1                    # default (adversarial, quick)
git diff --staged --name-only                  # --staged
git diff --name-only {base}...{branch}         # --branch / standard default
grep -A50 "Files" .ai/tasks/TASK-{ID}.md       # --task
grep -i "file" .ai/specs/{ID}/tasks.md         # --spec
```

Load ground truth when present: `docs/context/business-rules.md` (or `docs/business-rules.md`) and `docs/context/architecture.md` (or `docs/architecture.md`).

- **adversarial**: deliberately exclude the original task prompt, generation logs, and earlier review comments. The reviewer judges what the code does, not what it was meant to do.
- **standard**: include the PR description or spec summary so feedback addresses intent.
- **quick**: changed files only.

Follow the `source-verification` skill: every finding must cite `file:line` read from the actual code.

### Phase 2: Tool Verification

Run the gates from the `verification-gates` skill on the scoped files. Tool output is ground truth; record it before any model judgment.

| Depth | Gates |
|-------|-------|
| adversarial | Full gate set at the strictest level (the strictest static-analysis level the project configures), tests with coverage, formatter check, security and debug pattern scans |
| standard | Project-configured gate set, formatter check, tests for touched modules |
| quick | Security and debug pattern scans only |

Pattern scans and how to classify each tool failure: `references/adversarial-review.md`. A gate that could not run is reported as `UNVERIFIED`, never as a pass.

### Phase 3: Delegated Review

Always delegate the analysis with the Agent tool. The reviewing agent must not be the one that wrote the code.

**adversarial**

```
Agent tool:
  subagent_type: "adversarial-reviewer"
  model: "opus"
  prompt: |
    Adversarial review of: {files}
    Business rules: {business_rules}
    Architecture: {architecture}
    Tool results: {tool_results}
    Apply all 13 review criteria. Assume each file has bugs until you prove otherwise.
    Return findings as CRITICAL / MAJOR / MINOR / OBSERVATION with file:line and a concrete fix.
    Do not consider the original task prompt.
```

**standard**

```
Agent tool:
  subagent_type: "adversarial-reviewer"
  prompt: |
    Structured code review of {branch} against {base}.
    Changed files, grouped by category: {categorized_files}
    Intent: {pr_description_or_spec_summary}
    Focus: {focus or "full"}
    Apply the category checklists from references/standard-review.md ({checklist}).
    Tone: constructive, for the author. Severity: Critical / Major / Minor / Suggestion,
    each with file:line, the current code, and a suggested change.
```

**quick**

```
Agent tool:
  subagent_type: "adversarial-reviewer"
  prompt: |
    Critical-only pass over: {files}
    Scan results: {scan_results}
    Report only issues that would allow unauthorized access, lose or corrupt data,
    crash the app, or leak secrets. Confirm each scan hit is reachable before reporting it.
    Return at most 10 findings. Return "none found" if clean.
```

**security-auditor** (in parallel with the reviewer above) when `--focus=security`, or when the scope touches authentication, authorization, payments, or personal data at any depth:

```
Agent tool:
  subagent_type: "security-auditor"
  prompt: |
    Security audit of: {files}
    Focus: OWASP Top 10, authn/authz flows, input validation, sensitive data handling,
    injection and XSS. Return findings with severity and file:line.
```

Merge security-auditor findings into the review, mapping high → CRITICAL or MAJOR by impact.

### Phase 4: Classify

| Severity | Meaning | Gate effect |
|----------|---------|-------------|
| CRITICAL | Security vulnerability, data loss, crash, leaked secret | Blocks |
| MAJOR | User-facing bug, architecture violation, significant performance hit, missing required behavior | Requires changes |
| MINOR | Style, small improvement, leftover debug call | Can defer |
| OBSERVATION / Suggestion | Good pattern or optional improvement | None |

Full classification rules: `references/adversarial-review.md`. Standard-depth severity table and checklists: `references/standard-review.md`.

Before reporting, re-read each CRITICAL and MAJOR finding's cited lines yourself. Drop findings that do not hold up and say how many were dropped.

**Recurring classes.** Grep the earlier review reports under `.ai/` (`.ai/reviews/REVIEW-*.md`, and `.ai/review/**` when the review pipeline has run) for each surviving finding's rule or class (for example "missing policy check", "N+1 in a resource", "Server Action without a session check"). When an earlier report already flagged the same class, add `Recurring: run /learn` to that finding, citing the earlier report. Recurrence never changes the severity or the verdict; it only says the fix should also become a guard.

### Phase 5: Report and Verdict

```
Any CRITICAL?  → BLOCKED           "Cannot proceed. Critical issues must be resolved."
Any MAJOR?     → CHANGES_REQUIRED  "Changes required before deploy or merge."
Otherwise      → APPROVED          "Production-ready."
```

Write the report to `.ai/reviews/REVIEW-{source}-{timestamp}.md` (get the timestamp from `date +%Y%m%d-%H%M%S`).

- adversarial / quick: template in `references/adversarial-review.md`
- standard: text or JSON format in `references/standard-review.md`

Print a short summary: depth, verdict, counts by severity, the top three findings, and the report path.

Offer a deeper audit after the report, outside its format: when `--focus=security` is set, or the security-auditor returned a finding with its own severity critical or high, print exactly one line, never with `--format=json` (its output must stay parseable):

```
Offer (not started): Workflow({ name: 'security-audit', args: { scope: <the reviewed scope>, profile: 'quick', repo: '<the reviewed repo>' } })
```

`<the reviewed scope>` is `{ gitRange: '<base>...HEAD' }` when Phase 1 reviewed a branch or PR diff, and otherwise `{ paths: [...] }` with the Phase 1 files that still exist (at most 200; past that, the common parent directories). `<the reviewed repo>` is the repository path the review ran in, relative to the current directory (`.` for the current one), so a polyrepo audit targets the same repo. This skill only prints the line; it does not launch it. Whoever launches it retries with the bare `security-audit` on "not found" ([workflow name rule](../sdd/SKILL.md#workflow-names)).

---

## Auto-Fix

With `--auto-fix`, after the verdict is written:

| Fixed automatically | Never auto-fixed |
|---------------------|------------------|
| Formatter violations (the project's formatter or linter autofix) | Security issues |
| Leftover debug calls | Architecture violations |
| Inferable missing type hints | Business-logic changes |
| Import ordering | Performance changes |

Re-run the affected gates after fixing and append the result to the report.

---

## Integration

```
/simple-task "Add user export"     →  /deep-review --task=TASK-0043
/execute-task --spec=spec-PROJ-123-refund-guard --auto-continue  →  /deep-review --spec=spec-PROJ-123-refund-guard

BLOCKED           → fix critical issues → re-run /deep-review
CHANGES_REQUIRED  → fix major issues    → re-run /deep-review
APPROVED          → /open-pr --spec=<ref>
Recurring finding → /learn <finding>
```

The `ship-feature` workflow runs its own adversarial review panel; use `/deep-review` for work done outside it or as a second opinion.

## Configuration

Optional, in the project AGENTS.md:

```yaml
deep-review:
  default-depth: adversarial
  phpstan-level: 9
  coverage-threshold: 80
  block-deploy: true      # require APPROVED before /deploy
```

## Related Skills

| Skill | When |
|-------|------|
| `/simple-task`, `/execute-task` | Implementation before review |
| `/lint` | Style-only check |
| `/security-scan` | Dependency audit and full OWASP scan |
| `/grade` | Rubric-based grading of a generated artifact |
| `/deploy` | After an APPROVED verdict |
