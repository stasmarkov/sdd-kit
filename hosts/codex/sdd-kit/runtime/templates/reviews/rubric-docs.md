---
name: rubric-docs
description: Outcomes rubric for user and developer documentation written about shipped code.
domain: docs
threshold: 80
---

# Documentation Rubric

## Critical (any fail → BLOCKED)

- `docs.truth.matches-code`: Every behavior, command, flag, path, config key and example the doc states is truthful against the code. Evidence: the file:line that confirms each claim; unverifiable claims fail.
- `docs.links.no-phantom`: No phantom links. Every relative link, file path and anchor resolves to something that exists; every referenced command or symbol exists.
- `docs.coverage.acceptance-criteria`: Every acceptance criterion in scope is covered by the doc or test plan, and each is traceable to its criterion id. Evidence: a criterion-to-section mapping with no gaps.

## Important (≥ threshold% pass required)

- `docs.audience.clear`: The first paragraph states who the doc is for and what they can do after reading it.
- `docs.structure.one-home`: The topic has one home; other docs link to it instead of repeating it.
- `docs.examples.runnable`: Code and command examples run as written, or are marked as illustrative.
- `docs.errors.guidance`: Failure cases name the message the reader sees and the fix.
- `docs.prerequisites.stated`: Required versions, tools and permissions are listed before the first step.
- `docs.naming.conventions`: File names and headings follow the repository's documentation conventions.
- `docs.freshness.current`: No references to removed features, renamed commands or earlier versions.

## Nice-to-have (informational)

- `docs.style.concise`: Short sentences, no filler, active voice.
- `docs.navigation.toc`: Long docs open with a table of contents or a short summary.
- `docs.visuals`: Diagrams or screenshots where prose alone is slow to follow.
