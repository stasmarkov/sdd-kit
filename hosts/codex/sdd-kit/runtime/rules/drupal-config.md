---
paths:
  - "**/modules/custom/**/config/install/**"
  - "**/modules/custom/**/config/optional/**"
  - "**/modules/custom/**/config/schema/**"
  - "**/themes/custom/**/config/**"
  - "config/sync/**"
  - "**/config/sync/**"
  - "config/*/**"
  - "**/config/*/**"
---

# Configuration (Drupal)

## Module config

- Every key a module ships in `config/install/` or `config/optional/` has a matching entry in `config/schema/<module>.schema.yml`. Kernel tests fail on config that has no schema.
- Default config holds no `uuid` and no `_core` key. Those belong to a site's exported config, not to a module.
- Put config that depends on another module (a view, a field on someone else's entity) in `config/optional/`, so the module still installs without it.
- Secrets and environment-specific values (API keys, endpoints, credentials) never go into exported config. Read them from `settings.php` or the environment.

## Site config (sync directory)

- Change site configuration through the UI or code, then export it with `<drush> cex`. Import with `<drush> cim`. Do not hand-edit files in the sync directory unless the task is a config-only change, and then run `<drush> cim` to prove it imports.
- Check with `<drush> config:status` before you report a task done: it must show no difference for the objects the task touched. After a scoped export it may list only the objects you deliberately restored (name them in the report); never re-run `cex` to clear them.
- A config change that needs a data change ships with an update hook in the same commit.

## Split and scoped export

- Export only what the task touched. After `<drush> cex -y`, run `git status --porcelain` on the sync directory and every split directory. Run `git restore` on each changed or deleted tracked file the task did not touch, and remove each unrelated new file by its exact path (never `git clean` on a directory). Then run `<drush> config:status`.
- A file counts as touched when it belongs to a config object the task created, changed or deleted. When unsure, keep the object and list it under "Manual steps for the developer".
- Touch split directories (`config_split`) only for environment-specific work. Shared config goes in the sync directory.
- Use plain `cex -y`; never `--add` or `--commit`.
