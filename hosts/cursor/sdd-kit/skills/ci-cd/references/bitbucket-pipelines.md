# Bitbucket Pipelines

A `bitbucket-pipelines.yml` built from the Pipeline Shape table in SKILL.md. Every `<...>` is a placeholder: fill it from the project, never from another stack's example.

## Where the values come from

| Placeholder | Source |
|-------------|--------|
| `<format/lint/types/test/build gate command>` | the stack manifest's gates, read with the `verification-gates` recipe |
| `<audit command>` | the manifest's `audit` list |
| `<install command from the lockfile>` | the lockfile's frozen install (the `verification-gates` package-manager rule) |
| `<ci.setup commands>` | the manifest's `ci.setup` list, in order |
| `<service image>` | one per entry of the manifest's `ci.services`; pin the version the project runs locally |
| `<runtime image>` | an official image matching the runtime version the project pins |

A stack whose manifest has no `ci` block gets the gate commands only: no services and no setup lines. Ask the user for anything the tests need that the manifest does not list. The stack add-on's `ci-pipeline.md` reference is GitHub Actions YAML; take its commands, not its syntax.

## Skeleton

```yaml
image: <runtime image>

definitions:
  caches:
    deps:
      key:
        files:
          - <lockfile>
      path: <dependency directory>
  services:
    db:
      image: <service image>
      variables:
        <SERVICE_VARIABLE>: <value>
  steps:
    - step: &static
        name: Format, lint and types
        caches: [deps]
        script:
          - <install command from the lockfile>
          - <format gate command>
          - <lint gate command>
          - <types gate command>
    - step: &audit
        name: Audit
        script:
          - <audit command>
    - step: &test
        name: Tests
        caches: [deps]
        services: [db]
        script:
          - <install command from the lockfile>
          - <ci.setup commands>
          - <test gate command>
    - step: &build
        name: Build
        caches: [deps]
        script:
          - <install command from the lockfile>
          - <build gate command>

pipelines:
  pull-requests:
    '**':
      - parallel:
          - step: *static
          - step: *audit
      - step: *test
      - step: *build
  branches:
    main:
      - parallel:
          - step: *static
          - step: *audit
      - step: *test
      - step: *build
      - step:
          name: Deploy to staging
          deployment: staging
          script:
            - <deploy command>
      - step:
          name: Deploy to production
          deployment: production
          trigger: manual
          script:
            - <deploy command>
```

## Notes

- Steps run in order and a failed step stops the pipeline; `parallel:` is the only way to run steps side by side, so put the cheap static gates there.
- `deployment:` names must match an environment under Repository settings > Deployments. Keep production secrets as deployment variables (secured), not repository variables, and restrict the production environment to the main branch.
- `trigger: manual` on the production step is the approval. Removing it, or adding `trigger: manual` to a gate step that ran automatically, is a gate change.
- Scope a monorepo step with `condition.changesets.includePaths`; narrowing it later is a gate change too.
- A step that runs out of memory or time: `size: 2x` or `max-time:` on that step, or split it.
- Commands in `after-script:` run after the step's result is decided and cannot fail it; never move a gate there.
