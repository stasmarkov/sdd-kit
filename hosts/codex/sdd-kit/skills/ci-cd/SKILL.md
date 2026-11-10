---
name: ci-cd
description: GitHub Actions CI/CD pipelines. Use for testing, deployment, and release automation workflows.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# CI/CD with GitHub Actions

Patterns for continuous integration and deployment workflows. Stack-specific pipelines (language setup, dependency caches, gate commands) live in the stack add-on's skill references.

## When to Load References

| Task | Load |
|------|------|
| Staging/production deployment workflows | `references/deployment-workflows.md` |
| Dependabot and secrets setup | the stack add-on's skill references |

---

## Workflow Structure

```
.github/
├── workflows/
│   ├── ci.yml              # Main CI pipeline
│   ├── deploy-staging.yml  # Staging deployment
│   ├── deploy-prod.yml     # Production deployment
│   └── release.yml         # Release automation
└── dependabot.yml          # Dependency updates
```

---

## Pipeline Shape

Build the pipeline from the project's gate commands (the `verification-gates` skill reads them from the stack manifest) rather than hardcoding tools.

| Job | Runs | Depends on |
|-----|------|------------|
| lint | the format, lint and types gates | none |
| test | the test gate, with coverage and any services the stack's `ci.services` declares | lint |
| audit | the manifest `audit` commands | none |
| build | the build gate | lint, test |

## Principles

- Pin action versions and runtime versions; cache dependencies keyed on the lockfile hash.
- Scope each workflow with `paths:` filters in a polyrepo or monorepo so unrelated changes do not trigger it.
- Use job `needs:` to fail fast: cheap static gates first, expensive jobs after.
- Give jobs the least permission they need (`permissions:` block) and keep secrets in environments, never in the workflow file.
- Deploy only from a protected branch or a tag; require a passing CI run and an approval for production.
- Make deploys reversible: tag every artifact with the commit SHA and keep the previous one deployable.
