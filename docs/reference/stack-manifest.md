# Stack manifest reference

A stack manifest, `stack.json`, is the one file that teaches the SDD Kit workflows a stack: how to recognise it, which agent implements it, which gates verify it and how to scaffold, deploy and test it. The workflows read manifests and never name a stack themselves, so a new stack is a new manifest, not a code change.

The format is defined by [`src/workflows/lib/stack.schema.json`](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/plugins/sdd-kit/workflows/lib/stack.schema.json). The examples on this page use a fictional stack, `acme`. To generate a manifest and a full add-on from a few answers, run `/new-stack`; this page is the field reference behind it.

## Shape

A manifest file holds one entry object, or an array of 1 to 8 entries with unique names (one add-on can carry several related stacks). A minimal entry has the nine required fields:

```json
{
  "$schema": "../../workflows/lib/stack.schema.json",
  "name": "acme",
  "order": 90,
  "role": "backend",
  "detect": "an acme.config file next to a build file that requires the acme framework",
  "agent": { "name": "acme-dev", "plugin": "sdd-kit-acme" },
  "conventions": ["thin controllers", "one service per use case"],
  "gates": [
    { "name": "Acme format", "command": "bin/acme-format --check", "kind": "format" },
    { "name": "Acme tests", "command": "bin/acme-test", "kind": "test" }
  ],
  "debugPatterns": ["acme_dump("],
  "acceptance": "exercise the API routes over HTTP and run bin/acme-test"
}
```

## Required fields

| Field | Type | Meaning |
|-------|------|---------|
| `name` | string | The stack key, 2 to 32 characters: lowercase letters, digits and hyphens, starting with a letter. For an add-on in `src/plugins/<dir>/` one entry must be named `<dir>`. |
| `order` | integer | Position in the Detect catalog and tie-breaker when several stacks match. Unique across all manifests. |
| `role` | string | `backend`, `frontend`, `fullstack` or `mobile`. Split-repo workflows pair a backend with a frontend. |
| `detect` | string | One sentence the Detect step uses to recognise the stack in a repository. Describe files and their content, not tools to install. |
| `agent` | object | The specialist that implements work in this stack. See [Agent and trust](#agent-and-trust). |
| `conventions` | array of strings | Short phrases the workflows quote as the stack's house rules, for example `"thin controllers"`. |
| `gates` | array of objects | Commands that verify the stack. See [Gates](#gates). |
| `debugPatterns` | array of strings | Leftover-debug tokens the debug scan greps for, for example `"acme_dump("`. May be empty. |
| `acceptance` | string | How a workflow proves the feature works end to end for this stack. |

## Gates

Each gate is an object with `name` and `command`, plus optional fields:

```json
{
  "name": "Acme types",
  "command": "bin/acme-types",
  "kind": "types",
  "skipWhenScaffolded": true,
  "unless": ["acme-test.config.*"]
}
```

- `kind`: `format`, `lint`, `types`, `test`, `e2e`, `build` or `other`. When absent the kind is `other`: the kit never infers a kind from a name or command. `/lint` runs `format`, `lint` and `types`; `/run-tests` runs `test` (and `e2e` with `--e2e`); `build` and `other` gates run through the verification gates and the workflow gate step.
- `skipWhenScaffolded`: `true` skips the gate on a freshly scaffolded project, before its tooling exists.
- `unless`: globs relative to the repository root. The gate is skipped, with the reason `skipped — <glob> present`, when any glob matches. Use it for a fallback gate that applies only when a better one is not configured.
- `requires`: what the gate's tool needs, as paths relative to the repository root. A string is one required path; when Detect finds it missing (checked through the exec wrapper when one applies), the gate is reported as `not run (<file name> not installed)` instead of failing. A list form holds strings and inner lists, all of which must be satisfied; an inner list is an "any of" group, satisfied when one of its paths exists. When something is missing the gate is reported as `not run (requires <path>; <path>)`, naming only the unmet entries (the plan step knows them from its probe, and Detect reports them as `missingRequires`; when they are not known, every entry is named), and an unmet group reads `one of <path>, <path>`. Paths are checked in the listed order. The first-party Drupal gates use this form.
- `lintFix`: `{ flag, fallback }` for a lint gate whose project script may rewrite files. When the repo's script contains `flag`, the gate runs `fallback` instead (`<pm>` and `<pmx>` expand per `packageManagers`).
- `scriptFallback`: `{ dependency, manifest, minMajor, contains, fallback }` for a gate whose project script calls a command a newer release of `dependency` removed. `manifest` is the file, relative to the repository root, that declares the dependency's version range (for example `package.json` or `composer.json`). Detect reports the lowest major that range admits, per dependency, so two gates can follow two different dependencies. The gate runs `fallback` instead when its script contains `contains` and the major is `minMajor` or later, or when the major cannot be read (the fallback must therefore also work on older releases).

### Which commands run

Workflows run a gate command only when the registry produces it. Detection only chooses among these commands; a command it reports is never run as written:

- **A stack in the kit:** the gates of its inlined manifest that detection found (matched by gate name or by the exact catalog command), with `<pm>`/`<pmx>` filled from the package manager its lockfile names.
- **An approved overlay:** the gates of the approved manifest content (see [Agent and trust](#agent-and-trust)).
- **`other`:** the `gateTemplates` of the core `other` manifest (`src/workflows/lib/other.stack.json`), for example `make {script}` with the evidence file `Makefile`. Detection must name the evidence file and a script or target defined in it; the script name may hold only letters, digits and `:._-`. Only the core `other` manifest may declare `gateTemplates`; any other manifest that does is rejected.

Anything else, including a reformatted copy of a declined manifest's command, is dropped and logged as `Gate commands dropped for <repo>: ... — declined`. A repo whose stack comes from a rejected manifest runs no gate: it reports one `unreachable` gate whose details start with `not run (stack manifest not used` and name the reason. The contract-sync gate follows the same rule: it runs `node scripts/contract-sync.mjs`, or a `contract-sync` / `contract:sync` script through a gate template, and nothing else.

## Optional fields

| Field | Example | Meaning |
|-------|---------|---------|
| `notes` | `"Run the dev server before acceptance."` | Free-text remark for people reading the manifest. |
| `devUrl` | `"http://localhost:8080"` | Default application URL for browser acceptance; a URL passed to the workflow wins. |
| `visual` | `"browser"` | Names the tool visual checks use for this stack. |
| `buildGateGuard` | `"The build shares a directory with the dev server at {devUrl}; check it responds first."` | A warning added to the build gate's instructions. `{devUrl}` is replaced with the application URL. |
| `execWrapper` | `{ "when": ".ddev/config.yaml", "command": "ddev exec", "requiresRunning": { "command": "ddev describe -j", "jsonField": "raw.status", "equals": "running" } }` | Runs the stack's gates through a wrapper when the marker file `when` exists in the repo: each gate runs as `<command> <gate command>`. When `requiresRunning` is set and fails, each wrapped gate is skipped as `not run (<first word of command> not running)`. `requiresRunning` is a string command (success means running), or an object `{ "command": "ddev describe -j", "jsonField": "raw.status", "equals": "running" }` that reads the `jsonField` of the command's JSON output (a dotted path) and compares it with `equals`. The object form may also list `devUrlFields`, dotted paths in the same output that hold the environment's URLs (a URL or a list of URLs), such as `["raw.primary_url", "raw.urls"]` for `ddev describe -j`: when the check passes, the hostnames there count as dev URL hosts for that repo only (see devUrl under the threat model). A string running check must fail, without side effects, when the environment is stopped; `ddev describe` exits 0 on a stopped project, so DDEV stacks use the object form. Optional `workdir` `{ "flag": "--dir", "root": "/var/www/html" }` covers a repo below the wrapper's project root: the marker may then sit in the repo or in the nearest ancestor directory that has it (up to the filesystem root), and the gates of a repo below that directory run as `<command> <flag> <root>/<dir> <gate command>`, where `<dir>` is the repo's path relative to the marker's directory. A `<dir>` with characters other than letters, digits, `.`, `_`, `-` and `/` is not used: those gates are reported unreachable rather than run at `root`. Paths under `root` in the gate output are reported relative to the repo (`web/modules/...`, `../vendor/...`). The gate planner (`trust-store.mjs plan`) first checks `<command> <flag> <root>/<dir> test -d .` and reports the wrapped gates unreachable when that directory does not exist in the container, and its output carries `wrapper.prefix` and `pathMap` for commands a skill writes itself. The flag must be valid directly after `command`, as `ddev exec --dir` is; a wrapper that ends in a service name, such as `docker compose exec -T php`, cannot declare `workdir`. Drupal declares it; Laravel does not, so a Laravel repo needs `.ddev/config.yaml` in the repo itself. Values are plain words and paths, no shell syntax. For a Docker-only project, set `working_dir:` on the compose service to the mounted project root (the command pattern allows no `/`, so it cannot pass `-w`), use `docker compose exec -T php` as the command, and optionally `docker compose exec -T php true` as the running check; that check does not start a stopped service. |
| `devUrlHosts` | `["ddev.site"]` | First-party manifests only. Host suffixes, beyond `localhost` and `test`, that a dev URL may use. An overlay that declares it is rejected. The suffixes apply to every stack, because the dev-URL rule is shared. |
| `extends` | `"drupal"` | Overlay manifests only. See [Extending a first-party stack](#extending-a-first-party-stack). |
| `contractSync` | see below | API contract synchronisation between a backend and its consumer. |
| `skills` | see below | Skill names the workflows load for this stack. |
| `packageManagers` | see below | Package managers the stack can use, matched by lockfile. |
| `scaffold` | see below | How greenfield-build creates a new project. |
| `ci` | see below | What the generated CI pipeline needs. |
| `e2e` | see below | The browser test setup. |
| `e2eBackend` | see below | What a backend adds to a frontend's E2E step when it serves that frontend's API. |
| `migrations` | see below | Database migration commands. |
| `audit` | see below | Dependency or security audit commands. |
| `sourceDirs` | `["src/", "lib/"]` | Directories the debug-statement scan greps. Without it the gate agent picks the repo's source directories. |
| `gateTemplates` | `[{ "evidence": "Makefile", "command": "make {script}" }]` | Core `other` manifest only. Each item names an `evidence` file, relative to the repository root, and a `command` that holds `{script}`. See [Which commands run](#which-commands-run). |
| `markers` | `["acme.config.*"]` | Globs relative to the project root, matching files or directories, that suggest the stack. The SessionStart hint reads them, and the file-copy installers read those of the kit's stack add-ons to pick the default stacks of a fresh project install. |
| `packages` | `{ "composer": ["acme/framework"], "npm": ["acme"] }` | Package names that suggest the stack: `composer` names count when the project root's `composer.json` lists one under `require` or `require-dev`, `npm` names when its `package.json` lists one under `dependencies` or `devDependencies`. Only the file-copy installers read it, from the kit's stack add-ons, for the default stacks of a fresh project install; it catches a checkout whose marker files are not there yet (for example before `composer install`). |
| `$schema` | `"../../workflows/lib/stack.schema.json"` | Editor-only: it gives your editor completion and validation. Nothing reads it at run time, and any string is accepted. |

### contractSync

```json
{
  "contractSync": {
    "routeListCommand": "bin/acme routes --json",
    "template": "templates/contract-sync"
  }
}
```

`routeListCommand` prints the backend's routes as JSON for drift checks. `template` is the add-on-relative path of the contract-sync template. `consumer: true` marks a frontend that consumes the contract. Of the three keys, `consumer` accepts only `true`.

### skills

```json
{
  "skills": {
    "conventions": ["acme-patterns"],
    "testing": ["acme-testing"],
    "scaffold": ["acme-patterns"]
  }
}
```

Each list names skills: `conventions` guide implementation, `testing` guide test writing, `scaffold` load while a greenfield project is created. Build tasks get all three lists; steps that only write tests (the fix-bug regression test, the ship-feature E2E test) get `testing`, or `conventions` when `testing` is empty.

### packageManagers

```json
{
  "packageManagers": [
    { "name": "acmepm", "lockfiles": ["acme.lock"], "run": "acmepm run", "exec": "acmepm exec" }
  ]
}
```

`lockfiles` are the files whose presence selects the manager, `run` runs a script and `exec` runs a package binary. Gate, `e2e.run` and `ci.setup` commands write them as `<pm>` and `<pmx>`. Detect records the manager whose lockfile it finds; with no lockfile the last entry is the default. Each stack resolves its own list: one stack's managers never apply to another.

### scaffold, ci, e2e, migrations, audit

```json
{
  "scaffold": { "command": "acme new", "tooling": ["a formatter configured in acme.config", "a test runner with one example test"] },
  "ci": { "services": ["a database service for the tests"], "setup": ["bin/acme migrate --force"] },
  "e2e": { "configGlob": "acme-e2e.config.*", "file": "e2e/{slug}.e2e", "run": "bin/acme-e2e <file>", "convention": "one test per acceptance criterion, named with its id", "seed": "bin/acme seed" },
  "e2eBackend": { "convention": "the e2e run starts this API on its own database; never reset the dev database", "seed": "the e2e baseline seed" },
  "migrations": { "status": "bin/acme migrate:status", "run": "bin/acme migrate", "fresh": "bin/acme migrate:fresh --seed" },
  "audit": [{ "name": "Acme audit", "command": "bin/acme audit" }]
}
```

| Block | Key | Meaning |
|-------|-----|---------|
| `scaffold` | `command` | Creates a new project. |
| `scaffold` | `tooling` | What the greenfield gate setup must configure. |
| `ci` | `services` | Service containers the CI pipeline starts. |
| `ci` | `setup` | Commands that run before the gates. |
| `e2e` | `configGlob` | Glob that finds the browser test config (required). |
| `e2e` | `file` | Path of the regression test ship-feature writes, relative to the repo; `{slug}` is the feature's short name (optional). Without it the agent places the file like the existing tests. |
| `e2e` | `run` | Command that runs the browser tests (required). |
| `e2e` | `convention` | Where specs live and how they are named (required). |
| `e2e` | `seed` | Command that seeds test data (optional). |
| `e2eBackend` | `convention` | Rules a frontend's E2E step must follow against this backend (required). |
| `e2eBackend` | `seed` | The backend's E2E baseline data (optional). |
| `migrations` | `status` | Reports the migration state. |
| `migrations` | `run` | Applies pending migrations. |
| `migrations` | `fresh` | Rebuilds the database from scratch. |
| `audit` items | `name`, `command` | One audit per item, both required. |
| `agent` | `plugin` | See [Agent and trust](#agent-and-trust). |

Without an `e2e` block the stack declares no browser tests. A frontend's `e2e` block describes only the frontend; anything that depends on the backend it talks to belongs in that backend's `e2eBackend`, which ship-feature adds to the E2E step when the backend is a separate repo.

## Agent and trust

`agent.name` is the specialist's agent name. `agent.plugin` is the name of the plugin that ships it; when set, workflows try the bare name first, then `<plugin>:<name>`. When the agent cannot be resolved, the workflow logs the attempted names and falls back to the default agent. `/execute-task` and `/simple-task` resolve `agent.name` the same way, in the same order and under the same trust and `extends` rules (the `verification-gates` skill, Repos and stack keys); when no specialist resolves, they build in the session and say so once.

Where a manifest comes from decides whether its commands may run:

- **Add-ons in the kit** (`src/plugins/<dir>/stack.json`) are first-party. They need `agent.plugin` equal to their own plugin name, `sdd-kit-<dir>`, and verify Check 16 enforces it. The agent file `src/plugins/<dir>/agents/<agent.name>.md` must exist (`gen-stacks` reports a missing one); a first-party stack that has no specialist names `general-purpose` and sets no `plugin`.
- **Overlay manifests** are third-party or project-local: `.claude/stacks/*.json` in a project, `stacks/*.json` in the user config directory, and `stack.json` in any other enabled plugin. They are validated with extra limits (strings up to 500 characters, lists up to 32 items) `agent.plugin` may not be `sdd-kit`, and `agent.name` may not be a core agent name (such as `test-writer` or `code-explorer`), so an overlay can never take over a core agent. A project or user overlay may not use a first-party key as its own name either: `/new-stack --target project` refuses one (use `extends` instead), and a workflow ignores such a file. Their commands (gates, `scaffold`, `ci`, `e2e.run`, `contractSync.routeListCommand`, `buildGateGuard`, `execWrapper`, `e2eBackend`) run only after you approve the exact content with `/stack-trust`, which records its hash. Any edit asks again. Until then workflows run none of them and print `not run (untrusted manifest)` against each gate by position (`gate 1 (untrusted manifest)`), never by the name the manifest gives it. An untrusted manifest's specialist agent and skill names are not used either: its steps run as the default agent with no stack skills, and the run log says so; a run is held at BLOCKED (NOT-RESOLVED for fix-bug) only when one of its repos uses the untrusted stack, and other untrusted manifests are listed for information. Once approved, workflows run the gate commands of the approved manifest, with `<pm>`/`<pmx>` filled from its `packageManagers`, not commands reported during detection.

**Threat model (OD-17).** A manifest that is neither first-party nor approved through `/stack-trust` (hash-matched) never supplies a command, path, URL or other value that reaches a shell, a gate plan or an agent prompt as an instruction. On top of that, every value the Detect or Scaffold agent reports is checked before a prompt or command quotes it, and an invalid value is dropped and logged:

- **Repo paths**: relative, inside the workspace, `[A-Za-z0-9._/-]` only, no `..` segment and no leading `-`. A repo root you pass in `args.repos` (such as `../web`) defines the workspace and is accepted verbatim; a repo with any other path is dropped.
- **devUrl**: `http(s)://` on `localhost`, `127.0.0.1`, `[::1]`, `*.localhost`, `*.test` or a suffix a first-party manifest lists in `devUrlHosts` (today `*.ddev.site`), with an optional port, a plain path and a query string of letters, digits and `._~=%/-` (no space, quote, backtick, `$`, `;`, `&`, `<`, `>` or `#`). A repo whose first-party or trusted manifest lists `execWrapper.requiresRunning.devUrlFields` also accepts URLs on exactly the hostnames its passing running check reported there (Detect returns them as `reportedDevHosts`); a host counts only when it ends in a private or reserved name (`internal`, `local`, `lan`, `home.arpa`, `localhost`, `test`, `example`, `invalid`, `intranet`, `private`, `corp`, `home`) or a `devUrlHosts` suffix, so a public or country-code host (`staging.example.com`, `shop.co.uk`) or an IP address is dropped, and a host reported by another repo does not count. This is how a custom DDEV `project_tld` works for Drupal; Laravel declares no `devUrlFields`. The run-level `url` argument passes the same check, with the hosts of the frontend repo, or of the first repo when there is none; an invalid one is ignored with a log line that names the accepted hosts. A manifest's `devUrl` is used only when the manifest is first-party or trusted, and only when it passes this same check; `/stack-trust` shows it before approval and flags one the workflows would never open.
- **packageManager**: one of the names the first-party or trusted manifest declares in `packageManagers`.
- **Gate names, script names and evidence files**: only what the allowlist produces (see [Which commands run](#which-commands-run)).
- **Prose** (conventions, warnings, blockers, scaffold gate details): words and plain punctuation only, no quotes or shell syntax. Conventions reported for an untrusted or rejected stack are dropped.

Report prompts get these validated fields, never the raw Detect object. A rejected manifest's reason names only the JSON pointer (keys the schema does not declare become `<key>`) and the rule it breaks, for example `/role has a value outside the allowed list (rule enum)`; `/stack-trust --show` lists the full problems for you. A source label must use only letters, digits and `: . _ ~ / @ -`, or the manifest is rejected with `missing or invalid source`. With no allowlisted gate, a repo falls back to the lint and test tooling it visibly has only when its stack is first-party or `other` and no manifest was rejected, ignored or untrusted in the run. Otherwise its gates are reported `not run (no allowlisted gate)`.

The trust check that skills run is the kit's own `trust-store.mjs`. The script is self-contained: `tools/gen-stacks.mjs` bundles the workflows' manifest checks and the first-party entries into it, and it loads no other script or registry file, so the hash covers everything it runs. A project copy is used only when its SHA-256 equals the hash generated into the `verification-gates` skill, and never by a hash stored in the project. When no copy can be verified, the check reports `trust check unavailable` and every overlay counts as untrusted. The trust store is always `~/.claude/sdd-kit/trusted-stacks.json` in your home directory as the operating system's user database records it; neither `$HOME` nor `CLAUDE_CONFIG_DIR` moves it, because a project setting can change both. User stack manifests still live in the config directory (`CLAUDE_CONFIG_DIR`, else `~/.claude`), since each one needs an approval anyway. As a further check, a config directory that resolves inside the current directory, its git toplevel, `CLAUDE_PROJECT_DIR`, or any ancestor of the current directory that holds `.git` is refused: the user stacks and plugin list there are reported unreadable.

The shell guard that refuses writes to a trust store and agent-run approvals (`block-dangerous.sh`) is best-effort hardening, not a boundary: it matches text in the command, so a symlink to the store, a directory glob or a script assembled at run time can get past it. Those are known limits, listed in [hooks/README.md](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/share/hooks/README.md) (Trust store guard), and the approval itself stays a human action in your own terminal.

Out of scope: running a workflow on a repository you do not trust. Agents read repository files and have Bash, so hostile repository content can steer them whatever `/stack-trust` says. `/stack-trust` controls manifests, not repository content. That includes values a repository's settings supply, such as the settings `env` values in `.claude/settings.json` (`NODE_OPTIONS`, `PATH`): they reach every process the agents start and sit outside the threat model.

A project-local manifest should set `agent.plugin` to the add-on that ships its agent, for example `sdd-kit-acme` from `.claude/stack-addons/sdd-kit-acme/`. Workflows, `/stack-trust` and `/framework-doctor` see a `--plugin-dir` add-on in two ways: a directory or symlink under the project's `.claude/stack-addons/`, or the `--plugin-dir` flags on the Claude Code command line. Either is reported as `plugin:<name>@inline`.

## Extending a first-party stack

An overlay normally applies only to repos that match no stack the kit ships. To change how a first-party stack runs in one project, for example to wrap its gates in `docker compose exec`, declare `extends`:

```json
{
  "name": "drupal-docker",
  "order": 50,
  "extends": "drupal",
  "execWrapper": { "when": "docker-compose.yml", "command": "docker compose exec -T php" }
}
```

- **Required:** `name`, `order` and `extends`. `extends` names a first-party key (any stack the kit ships, whether or not its add-on is installed), never `other` or an overlay key.
- **Semantics:** fields the overlay declares replace the first-party values wholesale; every other field is inherited, `devUrl` included. A trusted extending overlay takes over the repos Detect classifies as the extended stack, and the run report shows the overlay's key for them. If it declares `agent`, that agent implements the repo.
- **Refused fields:** `detect`, `markers`, `packages` and `role` (classification never changes), and `devUrlHosts`. Such a manifest is rejected (`rule extendsField`). The overlay's own name may not be a first-party key (`rule extendsName`), and `extends` may not name a key outside the first-party list (`rule extendsTarget`). A first-party manifest may not declare `extends`.
- **Trust:** the same `/stack-trust` approval as any overlay, by content hash. Until it is approved, or after an edit, the overlay is ignored with a log line and the first-party stack keeps running unchanged. `/stack-trust` shows the extended key and every inherited command before you approve. Detect runs the overlay's own commands, such as its running check, only once its hash is in the trust store.
- **Tie-break:** when several trusted overlays extend the same key, the lowest `order` wins, then the key in code-unit order. Each loser is logged.

## The plan step

Skills that run gates outside a workflow (`/lint`, `/run-tests`, `verification-gates`) ask the kit for a plan instead of reading the manifest themselves:

```
node trust-store.mjs plan --repo <dir> --key <stack key> [--kinds format,lint,types]
```

It merges the overlays with the trust store, applies the same wrapper, `requires`, `unless` and lockfile rules as the workflows, and prints JSON with the resolved `key`, `notices`, the gates to `run` (with the wrapper applied and `<pm>`/`<pmx>` filled from the repo's lockfile) and the `fixed` entries that are skipped with their reason. `--kinds` keeps only gates of those kinds; a gate with no `kind` is left out, and the filter applies before anything is probed. A usage error exits 2 with a `Fix:` message.

The skills run it through `launch.cjs` beside it (`node launch.cjs plan ...`), a CommonJS launcher that checks the Node version first: with a node older than 18 it prints `not run (Node 18+ required, found v<x>). Fix: put Node 18+ first on PATH` and exits 3, and otherwise passes the arguments and exit status through.

- **Probes:** when the wrapper is present and running (or declares no running check), every `requires` path of the planned gates is checked in one wrapped call, `<wrapper> ls -1d ./<path> ...`; otherwise the paths are checked on the host. The running check and that call share a 60-second limit, and a call that times out counts as not running or missing, with a notice.
- **`unless` globs** are relative to the repo root; `*` and `?` match within one path segment. Detect is told the same rule.
- **Notices:** more than one lockfile (the plan uses the first manager the manifest lists, and asks you to confirm which is canonical), a timed-out probe, and key `other`, for which the plan has no gates and the skills fall back to the tooling the repo visibly has.

## Discovery

Workflows discover manifests in this order: the project's `.claude/stacks/`, then the user config directory's `stacks/`, then the manifests of enabled plugins (from `claude plugin list --json`, then the installed-plugins file, then a cache sweep). The kit's own add-ons are inlined into the workflows. The first valid entry for a key wins, project before plugin before user. An entry that reuses a first-party key as its name is ignored; to adjust a first-party stack, declare `extends`.

A manifest Detect returns without a source label of the form `project:.claude/stacks/<file>`, `user:~/.claude/stacks/<file>` or `plugin:<name>@<marketplace>` is rejected with the reason `missing or invalid source`, and its text is not read.

Detect reads the trust store in your home directory and the user config directory (`CLAUDE_CONFIG_DIR`, else `~/.claude`) with the Read and Glob tools on literal paths, never through a shell command. It finds the home directory from the user database (`id -un`, then `dscl` on macOS or `getent passwd` on Linux), not from `$HOME`. Claude Code asks before any read outside the project, and a workflow agent cannot answer, so a fresh user's run reports `trustStore unreadable`, `user stacks unreadable` or `plugin list unreadable` and treats every overlay manifest as untrusted. `/stack-trust` offers to add exactly four Read allow rules to your user settings, and `/framework-doctor` reports any that are missing:

```
Read(~/.claude/sdd-kit/trusted-stacks.json)
Read(~/.claude/stacks/**)
Read(~/.claude/plugins/installed_plugins.json)
Read(~/.claude/plugins/cache/**)
```

The last rule covers the `stack.json` of installed plugins, which live under `plugins/cache/`.

With `CLAUDE_CONFIG_DIR` set elsewhere, the last three rules name that directory as an absolute path (`Read(//path/to/config/stacks/**)`); the first always names the store in your home directory, as an absolute path when `$HOME` points somewhere else. `claude plugin list --json` is tried first only if your settings already allow it; without it the installed-plugins file is used.

Staged first-party manifests are informational. File-copy installs stage copies of the kit's manifests under `.claude/stacks/` so you can read them, but editing one has no effect: the inlined registry wins, and a changed copy is reported as stale. To change a stack's behaviour, author a new key with `/new-stack`.

## Hooks and trust

Loading an add-on plugin is consent to its hooks, so an add-on's `hooks/hooks.json` entries run once the plugin is enabled. An overlay manifest alone never runs a hook: it carries gate commands that run only after `/stack-trust`, and hooks exist only in a plugin you chose to load.

## Related

- `/new-stack` scaffolds a manifest and add-on from a few answers; its template is [`src/templates/stack-addon/`](https://github.com/stasmarkov/sdd-kit/tree/v4.1.0/share/templates/stack-addon).
- `node tools/gen-stacks.mjs` regenerates the workflow registry from the kit's manifests; `./verify.sh` checks the add-on layout (Check 16).
- [Plugin mode](plugin-mode.md) explains add-on installation.
