---
name: grade
description: Use when asked to grade an artifact against a rubric. Runs the outcomes-grader subagent and returns PASS / CHANGES_REQUIRED / BLOCKED with item-level findings.
argument-hint: "--domain=api|ui|migration|test|docs [--rubric=<path>] --target=<path|glob> [--threshold=80] [--max-iterations=3]"
disable-model-invocation: true
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob
model: opus
metadata:
  subagents: "outcomes-grader, adversarial-reviewer"
---

# /grade

Run rubric-based outcomes grading against a target artifact. Loops the grader against the writer up to `max-iterations` times until the grader returns PASS, then optionally hands off to `adversarial-reviewer` for a final sanity check.

---

## Usage

```bash
# Grade an API endpoint implementation
/grade --domain=api --target=src/controllers/order-controller

# Grade a UI component
/grade --domain=ui --target=src/components/checkout/checkout-form

# Grade a migration
/grade --domain=migration --target=database/migrations/2026_05_18_*_create_orders_table

# Grade a test suite
/grade --domain=test --target=tests/order-api-test

# Adjust threshold (default 80%)
/grade --domain=api --target=... --threshold=90

# Grade documentation
/grade --domain=docs --target=docs/order-api.md

# Use your own rubric
/grade --rubric=docs/rubrics/my-rubric.md --target=...

# Cap writer retries (default 3)
/grade --domain=api --target=... --max-iterations=5
```

---

## When to Use

| Situation | Use `/grade` | Alternative |
|-----------|--------------|-------------|
| After `/simple-task` produces code | Yes | |
| After AI-generated migration | Yes | |
| Need fast verdict (under 30s) | | `/lint` |
| Pre-deploy comprehensive audit | Combine | `/deep-review` |

---

## Workflow

### Step 1: Resolve Rubric

Map `--domain` to the bundled rubric `${CLAUDE_SKILL_DIR}/assets/rubric-<d>.md`.

| Domain | Rubric path |
|--------|-------------|
| `api` | `${CLAUDE_SKILL_DIR}/assets/rubric-api.md` |
| `ui` | `${CLAUDE_SKILL_DIR}/assets/rubric-ui.md` |
| `migration` | `${CLAUDE_SKILL_DIR}/assets/rubric-migration.md` |
| `test` | `${CLAUDE_SKILL_DIR}/assets/rubric-test.md` |
| `docs` | `${CLAUDE_SKILL_DIR}/assets/rubric-docs.md` |

`--rubric=<path>` replaces the bundled rubric with your own file; `--domain` is then optional and only names the report. If the domain is unknown, fail fast with the list of valid domains.

### Step 2: Invoke Outcomes Grader

Spawn `outcomes-grader` via the Agent tool in a fresh session.

```
subagent_type: outcomes-grader
prompt: |
  Grade the target against the rubric.
  --rubric=<resolved path>
  --target=<--target arg>
  --threshold=<--threshold or 80>
  --max-iterations=<--max-iterations or 3>
  Do not see the original prompt. Use only the rubric and target file contents.
```

### Step 3: Interpret Verdict

- **PASS**: proceed to Step 4.
- **CHANGES_REQUIRED** or **BLOCKED**: emit the grader's "Recommended Next Action" verbatim and stop. The orchestrating session (or human) is responsible for re-generating; this skill does not auto-fix.

If invoked inside a larger workflow with `--auto-iterate` (future flag), the caller may re-invoke generation with the failure list, then re-invoke `/grade` until PASS or `max-iterations` reached.

### Step 4: Optional Adversarial Sanity Check

After a clean PASS, optionally hand to `adversarial-reviewer` for one more pass focused on issues rubrics tend to miss (architectural smells, hidden coupling, overengineering). Skip this for `--domain=test` and `--domain=migration` (already constrained).

### Step 5: Record

Write the final grade report to `.ai/reviews/GRADE-<domain>-<target-slug>-<timestamp>.md`.

---

## Pre-conditions

- The target file(s) must exist.
- The rubric file must exist (Step 1).
- Tooling referenced in the rubric (static analyzer, test runner, linter, etc.) should be present; missing tools degrade affected items to `n/a`, not failure.

---

## Output Format

```
Grade: <domain>
Target: <path>
Verdict: PASS | CHANGES_REQUIRED | BLOCKED
Critical fails: <n>
Important pass rate: <n>%

Failures:
  [CRITICAL] <item> — <reason>. Fix: <fix>.
  [IMPORTANT] <item> — <reason>. Fix: <fix>.

Recommended Next Action:
  <one sentence>

Report: .ai/reviews/GRADE-<...>.md
```

---

## Constraints

- Grading is read-only with respect to the target. Never modify the target during grading.
- The grader runs in a fresh subagent session — do NOT pass the original task prompt to it.
- One rubric per invocation. To grade across domains, invoke once per domain.

---

## Related Skills

| Skill | When to Use Instead |
|---------|---------------------|
| `/deep-review` | Pre-deploy adversarial audit (broader, no rubric) |
| `/lint` | Style/format only |
| `/security-scan` | Security-focused audit |
| `/run-tests` | Run tests without grading code structure |

