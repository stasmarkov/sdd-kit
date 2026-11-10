---
name: source-verification
description: Rules for verifying claims against the actual code before stating or changing anything — read referenced files, cite file:line, never assume. Use when investigating code, reviewing, or writing specs and docs about existing behavior.
user-invocable: false
---

# Source Verification

Rules for investigating code before making claims or changes.

## Rules

- Read all referenced files before making claims about code structure or behavior.
- Never speculate about implementations you haven't examined.
- When investigating the codebase, use Grep and Glob tools rather than assuming file locations.
- Cite `file:line` for every claim about existing behavior, and re-read the cited lines before reporting.
