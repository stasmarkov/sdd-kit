# CI failure map

Cross-stack root causes for `/fix-ci`. Load once the failing step is classified. The per-stack maps (formatter, static analysis, test runner, build, install and audit specifics) live in the stack add-on's conventions skill under `references/ci-failure-map.md`. Every "Do not" here is on the protected list in SKILL.md and needs explicit user confirmation.

## Cross-cutting: "passes locally, fails in CI"

| Symptom | Cause | Fix |
|---------|-------|-----|
| An import or class "not found" only in CI | macOS file systems are case-insensitive by default, Linux runners are not; the reference casing differs from the filename | Make the reference match the file exactly. For a filename-only case change use `git mv -f` so git records it |
| Different results on the same command | The runtime major differs between CI and local | Align local with CI (version file, `*-version` in the workflow) before fixing. If CI is the outdated side, change CI through devops-engineer |
| Works after deleting the dependency directory | Stale local install hid the failure | Reproduce from a clean install with the lockfile's frozen-install command |
| Fails only on the first run of a new cache key | Cache restored a dependency tree that no longer matches the lockfile | Fix the cache key to hash the lockfile (devops-engineer) |

## Install and lockfiles

| Error | Fix |
|-------|-----|
| Frozen install reports the lockfile out of sync with the manifest | Install without the frozen flag locally with CI's runtime major, then commit the lockfile |
| Dependency resolution fails (peer conflict) | Upgrade or replace the library whose constraints are outdated. Force flags and overrides are protected |
| Lock resolved for a different platform runtime version | Set the platform runtime version in the manifest to the production version and re-resolve, or align the CI version |
| Two lockfiles from different package managers | Ask which manager is canonical, then remove the other |

## Contract sync

A job that regenerates the API contract (an OpenAPI document from the backend, or client types generated from it) and fails on `git diff --exit-code` means the committed contract is stale.

1. Run the same generate command the step runs (read the workflow; it is usually a package or task-runner script).
2. Inspect the diff. Additive or descriptive changes → commit the regenerated files.
3. A removed field, renamed property, or changed type that the frontend consumes is a breaking API change. Fix the consumer in the same change if the spec intended it; otherwise it is a backend regression → `/sdd` bug.

Do not hand-edit generated files to match.

## Audit

- The audit command failing on a new advisory → bump to the patched version within the existing constraint.
- The patch needs a major upgrade → stop and recommend `/upgrade-deps`; run `/security-scan` if the advisory touches auth or data handling.
- Do not add the advisory to an ignore list unless the user confirms that the vulnerable path is unreachable, and record why.

## CI config and containers (devops-engineer)

| Symptom | Typical fix |
|---------|-------------|
| `Invalid workflow file` | YAML or expression error; validate with `actionlint` |
| Deprecated action version (artifact or cache actions) | Bump to the supported major |
| Service container never healthy | Add a `--health-cmd` with retries, and wait for it before migrations |
| Container image build stage fails | Reproduce with the project's container build command for that stage; match the base image's runtime version to the project |
| Job needs a secret that forks cannot read | Gate the step on the event, not by deleting it; document the secret |
