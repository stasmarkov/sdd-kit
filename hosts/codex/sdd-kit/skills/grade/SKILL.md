---
name: grade
description: Grade a target artifact against a domain rubric using the outcomes-grader subagent. Returns PASS / CHANGES_REQUIRED / BLOCKED with item-level findings. Use after any non-trivial generation task before marking it done.
argument-hint: "--domain=api|ui|migration|test --target=<path|glob> [--threshold=80] [--max-iterations=3]"
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

Map `--domain` to the rubric file. `<reviews>` is `.codex/sdd-kit/templates/reviews/` in a file-copy install and `src/templates/reviews/` in the plugin; use the first one that exists.

| Domain | Rubric path |
|--------|-------------|
| `api` | `<reviews>/rubric-api.md` |
| `ui` | `<reviews>/rubric-ui.md` |
| `migration` | `<reviews>/rubric-migration.md` |
| `test` | `<reviews>/rubric-test.md` |

If the domain is unknown, fail fast with the list of valid domains.

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
- The rubric file must exist under `<reviews>` (Step 1).
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

