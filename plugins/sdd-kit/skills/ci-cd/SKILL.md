---
name: ci-cd
description: CI/CD pipelines for GitHub Actions, GitLab CI and Bitbucket Pipelines, built from the stack's gate commands. Use for testing, deployment and release automation.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# CI/CD pipelines

Patterns for continuous integration and deployment pipelines. Stack-specific pipelines (language setup, dependency caches, gate commands) live in the stack add-on's skill references.

## When to Load References

| Task | Load |
|------|------|
| Staging/production deployment workflows on GitHub Actions | `references/deployment-workflows.md` |
| A Bitbucket Pipelines file, including deployments | `references/bitbucket-pipelines.md` |
| Dependabot and secrets setup | the stack add-on's skill references |

---

## Pipeline files

| Provider | File | How "depends on" is spelled |
|----------|------|-----------------------------|
| GitHub Actions | `.github/workflows/*.yml` | job `needs:` |
| GitLab CI | `.gitlab-ci.yml` (plus local `include:` files, often under `.gitlab/`) | `stages:` order, or job `needs:` |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` | step order; `parallel:` groups steps that do not depend on each other |

Validate before committing: `actionlint` for GitHub Actions, `glab ci lint` for GitLab. Bitbucket has no local validator; check the file against its configuration reference.

GitHub Actions layout:

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

- Pin action, image and runtime versions; cache dependencies keyed on the lockfile hash.
- Scope each pipeline to the paths it checks in a polyrepo or monorepo (GitHub `paths:`, GitLab `rules:changes`, Bitbucket `condition.changesets`) so unrelated changes do not trigger it.
- Fail fast: cheap static gates first, expensive jobs after.
- Give jobs the least permission they need (GitHub `permissions:` block). Keep secrets in the provider's secret store (GitHub environment secrets, GitLab masked and protected variables, Bitbucket secured repository or deployment variables), never in the pipeline file.
- Deploy through the provider's deployment environments (GitHub `environment:`, GitLab `environment:`, Bitbucket `deployment:`) only from a protected branch or a tag; require a passing CI run and an approval for production (GitHub required reviewers, GitLab `when: manual` on a protected environment, Bitbucket `trigger: manual`).
- Make deploys reversible: tag every artifact with the commit SHA and keep the previous one deployable.
