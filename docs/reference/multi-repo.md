# Multi-repo workspaces

Use this setup when the backend (Laravel API) and frontend (Next.js) are separate git repositories,
each with its own CI and its own `CLAUDE.md`. You get one Claude session that sees both
repos and the contract between them.

The same layout works on Codex and Cursor, which read `AGENTS.md` in each repo and in the workspace root; see [hosts.md](hosts.md). Install per repo with `install.sh --host codex|cursor --project`.

## Layout

The examples use one backend and one frontend. For several frontends, add one folder per frontend
(see [Several frontends](#several-frontends)).

```
project/                    no .git here, on purpose
├── CLAUDE.md               imports both repos + cross-repo rules
├── be/                     Laravel API: own .git, CLAUDE.md, AGENTS.md, .claude/, .ai/specs/
└── fe/                     Next.js: own .git, CLAUDE.md, AGENTS.md, .claude/, .ai/specs/
```

1. Create the parent folder and clone both repos into it (`be/` and `fe/`, or real names).
2. Install the framework into **each repo** as usual (`./install.sh --project` inside `be/` and `fe/`,
   or enable the plugin once). In plugin mode install the stack add-ons for both sides
   (`sdd-kit-laravel` and `sdd-kit-nextjs`, or the preset `sdd-kit-laravel-nextjs`); in file-copy mode the
   default `--stack=laravel,nextjs` stages both in each repo, and each workflow detects the stack per repo.
3. Copy `src/templates/multi-repo/CLAUDE.md` to `project/CLAUDE.md` and fill in the placeholders.
4. Start Claude from `project/`. Run `/memory` and confirm that both `be/CLAUDE.md` and
   `fe/CLAUDE.md` show up as loaded.

Starting from the parent gives one session the same context as starting in either repo,
plus the root file. Keep the root file small. It holds only what neither repo knows alone:

- **Contract:** where it lives and which side is authoritative (normally the backend).
- **Cross-repo routing table:** "changing a DTO → read the backend Resource, then update the frontend type mirror".
- **Rule of thumb:** if a backend change could be visible to the browser, assume the frontend has to change too.
  Grep the frontend before you call the backend task done.
- **Process:** commit in each repo separately, use matching branch names, never commit from the root.

## Several frontends

One API often serves more than one frontend, for example a customer site and an admin app:

```
project/
├── CLAUDE.md
├── be/        Laravel API
├── fe/        Next.js customer site (dev URL http://localhost:3000)
└── admin/     Next.js admin app (dev URL http://localhost:3001)
```

- **Per-repo stack.** Install each repo with its own stack: `./install.sh --project --stack=laravel`
  in `be/`, and `--stack=nextjs` in `fe/` and `admin/`. Each workflow detects the stack per repo.
- **Root file.** Copy `src/templates/multi-repo/CLAUDE.md`, keep one `@<repo>/CLAUDE.md` import and one
  layout row per frontend, and fill `<stack>`, `<repo>` and `<dev-url>`.
- **Contract-sync.** The template lives in `src/plugins/laravel/templates/contract-sync` and
  `install.sh` stages it at `.claude/templates/laravel/contract-sync/` for every selected add-on,
  minimal or full. Install the laravel add-on in the API repo and wire the check in CI against each frontend.
- **Runs.** One run covers all repos when `repos` is an array with a distinct `url` per frontend:

  ```js
  Workflow({
    name: "ship-feature",
    args: {
      spec: "<spec id>",
      repos: [
        { path: "be", role: "backend" },
        { path: "fe", role: "frontend", url: "http://localhost:3000" },
        { path: "admin", role: "frontend", url: "http://localhost:3001" }
      ]
    }
  })
  ```

  Or do one run per frontend: `{ repos: { backend: "be", frontend: "fe" }, url: "http://localhost:3000" }`,
  then the same for `admin`. A run takes zero or one backend. Each frontend gets its own dev URL and its own browser pass, reported by repo. The passes run one after another because they share one browser; Visual skips a frontend with no changed UI files, and Acceptance checks a frontend with no changed files on a lighter model. Two frontends that resolve to the same URL are refused with a message asking for distinct `url` values.

## Configuration traps

Each of these produces the same symptom: *"why does it ignore the frontend conventions?"*
`/memory` shows what is actually loaded.

| Mechanism | What it really does |
|-----------|---------------------|
| `permissions.additionalDirectories` in settings | Grants **file access only**. It doesn't load the sibling's `CLAUDE.md`, rules, or skills. |
| `claude --add-dir ../fe` | Loads the sibling's skills. Its `CLAUDE.md` loads only when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` is set. |
| `@../fe/CLAUDE.md` import from inside a repo | Imports from outside the working directory need a one-time approval. If you decline, they are **silently disabled**. |

The parent-folder layout avoids all three: both repos sit under the working directory, so the
root `@be/CLAUDE.md` and `@fe/CLAUDE.md` imports are local.

What `--add-dir` does and does not apply from an added directory:

- From its settings only `enabledPlugins` and `extraKnownMarketplaces` apply. Its hooks and permissions do not.
- Its `CLAUDE.md` and `.claude/rules` load only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.
- `permissions.additionalDirectories` grants file access only.
- Claude Code reads `AGENTS.md` only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`
  exists in the working directory or above (v2.1.277+), so keep `@AGENTS.md` in each `CLAUDE.md`.
- Relative imports resolve against the importing file, up to four hops.

If you have to start inside one repo, use `--add-dir` together with the env var:

```bash
cd be && CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../fe
```

## Workflows and specs

- Workflows detect both repos from the parent folder. To be explicit, pass
  `{ repos: { backend: "be", frontend: "fe" } }` to `ship-feature`, `fix-bug`, `create-spec`,
  `qa-and-docs`, or `greenfield-build`. `/sdd` asks for the repos when it can't detect them.
- Each repo's gates (tests, lint, types, build) run in that repo. A failure in one blocks the change.
- **The spec lives in the repo that starts the change** (`be/.ai/specs/...` for most API-driven
  features). It lists every affected repo with per-repo tasks. Don't copy it into the other repo.
- `resume_hint` in the session state (`.ai/session/spec-<id>-state.json`) records where work
  stopped, including which repo is next. A new session picks it up with
  `/execute-task --spec=<id> --continue`.
- See every spec across both repos on one board from the workspace root:
  `/spec-board be/.ai/specs fe/.ai/specs`.

## Process

- Commit with `git -C be ...` / `git -C fe ...`. The root has no `.git`, and that's how it should stay.
- Use the same branch name in both repos (`feature/<ticket>-<slug>`). `/open-pr --spec=<id>`
  opens one PR per changed repo, backend first, and cross-links them.
- Merge order: backend first for additive changes. For breaking changes, use expand/contract:
  add the new shape, move the frontend over, then remove the old shape.

## Make the contract a sensor

Prose contracts drift. A doc that says "148 endpoints" is wrong by the next sprint. Prefer a check
that fails:

- an OpenAPI diff in CI,
- a script that compares `php artisan route:list --json` with the frontend API registry,
- generated frontend types from the backend schema instead of hand-written mirrors.

Hand-maintained type mirrors cause the most cross-repo bugs. A typical example: frontend enum
literals that type-check but don't match the backend values.
