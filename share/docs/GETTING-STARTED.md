# Getting Started

From zero to building with SDD Kit: learn the Claude Code basics, install the kit, give Claude your project context, and take one ticket from spec to shipped code.

This guide uses bare skill names (`/sdd`, `/write-spec`). In plugin mode they are namespaced: `/sdd-kit:sdd`, `/sdd-kit-ops:deploy`, and so on.

## 0. New to Claude Code?

Skip this section if you already use Claude Code.

**What it is.** Claude Code is an AI coding agent that runs in your terminal (there are also IDE extensions and a desktop app). It reads your project, edits files and runs commands, and it asks your permission before it acts. SDD Kit adds a process on top: a written spec that a human approves, fixed pipelines with quality gates, and hooks that block risky actions.

**Install it.** Pick the line for your system ([official setup page](https://code.claude.com/docs/en/setup) for other options and requirements):

```bash
curl -fsSL https://claude.ai/install.sh | bash      # macOS, Linux, WSL
irm https://claude.ai/install.ps1 | iex             # Windows PowerShell
brew install --cask claude-code                     # Homebrew
winget install Anthropic.ClaudeCode                 # WinGet
```

Open a new terminal and check it with `claude --version`. Then start it with `claude` and follow the browser prompts to sign in. You need a Claude account that includes Claude Code, or a supported API provider.

The kit's background workflows run on paid plans and API access. On a Pro plan, turn on **Dynamic workflows** in `/config` before your first `/sdd`.

**Your first session.** The [quickstart](https://code.claude.com/docs/en/quickstart) walks through one; the essentials:

| To | Do this |
|----|---------|
| Work on a project | `cd` into the project root and run `claude`. Claude Code works on the folder you start it in. |
| Ask for something | Type it in plain English. Claude reads the code, proposes edits and runs commands to check them. |
| Find commands | Type `/` to list built-in commands and installed skills (the kit's `/sdd` among them); keep typing to filter. |
| Answer a permission prompt | Before it edits a file or runs a command, Claude asks. Allow it once, allow it for the session, or decline and say what to do instead. |
| Stop and redirect | Press `Esc`. The work done so far is kept. |
| Change how much it may do | `Shift+Tab` cycles the permission modes: the default asks before acting, accept-edits lets file edits through, and plan mode reads and plans without changing anything. |
| Start fresh | `/clear` empties the conversation when you switch tasks. Files and specs on disk stay. |
| Get help | `/help` lists commands and shortcuts. |

Every shortcut is in [interactive mode](https://code.claude.com/docs/en/interactive-mode).

**Words you will meet.**

| Claude Code term | Meaning | In the kit |
|------------------|---------|------------|
| Skill | A packaged set of instructions. Claude loads it when the task matches, or you start it with `/name`. | `/sdd` |
| Subagent | A separate Claude with its own context and tools that does one job and returns a summary. | `code-explorer` |
| Workflow | A background script that runs many subagents through fixed phases. Watch it with `/workflows`. | `ship-feature` |
| Hook | A script Claude Code runs on an event, such as before a shell command. It can block the action. | `block-dangerous` |
| MCP server | A connector that gives Claude extra tools. | Playwright MCP (browser), context7 (library docs) |
| Plugin | A bundle of skills, agents, hooks and MCP servers installed in one step. | `sdd-kit` |
| Spec | A kit term: a folder that says what "done" means, which a human approves before anything is built. | `.ai/specs/spec-PROJ-123-<slug>/` |

## 1. Before you start

Install the kit, either as a plugin (from inside Claude Code):

```
/plugin marketplace add stasmarkov/sdd-kit
/plugin install sdd-kit-laravel-nextjs@sdd-kit   # preset: the core plus its default stack add-ons
```

In plugin mode the workflows' browser steps use the plugin's own Playwright server and need no project `.mcp.json` entry: see [Playwright in plugin mode](INSTALLATION.md#playwright-in-plugin-mode).

or copied into your project's `.claude/` without cloning (from your project root; requirements in [Without cloning: npx](INSTALLATION.md#without-cloning-npx)):

```bash
npx github:stasmarkov/sdd-kit install --project
```

Both modes, add-ons, and a clone-based install are in [INSTALLATION.md](INSTALLATION.md). The core is stack-agnostic: stack add-ons supply detection, gates and specialists, and a new stack is one manifest (`/new-stack`). Plugin mode: the preset above, or the core plus your stack's add-ons (see INSTALLATION). File-copy mode installs the default stack add-ons, and `--stack` changes the choice. Coming from 2.x: [Upgrading from 2.x](INSTALLATION.md#upgrading-from-2x); see [Stacks and roadmap](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/README.md#stacks-and-roadmap).

Start Claude Code in your project root and run the health check:

```bash
cd ~/projects/my-app
claude
```

```
/framework-doctor
```

In plugin mode, type `/sdd-kit:framework-doctor`.

It reports PASS / WARN / FAIL for the directory layout, skill discovery, agents, MCP config, and hooks. In file-copy mode it also fires a harmless payload at the hooks to check they run; in plugin mode run `/hooks` to see which are listed. Fix any FAIL before you go on. `--fix` only sets permissions and creates missing directories. Anything else is covered in the troubleshooting section of [INSTALLATION.md](INSTALLATION.md).

## 2. Give Claude your project context

Claude only knows what the code shows and what you tell it. Three files carry that context. The file-copy installer creates them and never overwrites files that already exist. Plugin mode creates none of them, so plugin users fetch the templates once from the project root (skip any file you already have):

```bash
base=https://raw.githubusercontent.com/stasmarkov/sdd-kit/v4.0.2/share
curl -fsSL "$base/CLAUDE.template.md" -o CLAUDE.md
curl -fsSL "$base/templates/AGENTS.template.md" -o AGENTS.md
mkdir -p .claude/rules
curl -fsSL "$base/templates/rules/tests.md" -o .claude/rules/tests.md
```

Each stack add-on ships its own area rules in `plugins/<add-on>/rules/` of the same release; download the ones for your stack into `.claude/rules/` the same way.

| File | What it is for | Fill in first |
|------|----------------|---------------|
| `CLAUDE.md` | Loaded every session. Keep it under 200 lines. It imports `@AGENTS.md`. | One-paragraph product summary, the "Always load" docs, invariants (`INV-01`…) |
| `AGENTS.md` | Stack, exact commands, red lines, architecture, code standards. Cursor, Codex, and Copilot read it too. | The test, lint, and build commands; things that must never happen |
| `.claude/rules/*.md` | Area conventions (migrations, API controllers, services and DTOs, frontend pages, tests). Each file has a `paths:` glob and loads only when Claude touches matching files. | Delete the rules that don't apply to you and adjust the globs to match your layout |

Put each fact in one file. Commands and red lines go in `AGENTS.md`. Anything that only matters in one area goes in a rule. `CLAUDE.md` holds what is left. Replace every `<placeholder>` and delete sections you have nothing real for. An empty template costs tokens and teaches nothing.

### The Golden Triangle

Three short documents give Claude your business context. `CLAUDE.md` loads them in every session:

- `docs/context/business-rules.md`: what the system must enforce (prohibitions, money rules, security, validation)
- `docs/context/architecture.md`: how it is built (layers, modules, boundaries, patterns)
- `docs/api/api-contracts.md`: the request and response shapes the frontend relies on

For an existing codebase, generate them from the code rather than from memory:

```
/write-docs --type=all
```

Every rule and contract it writes cites `file:line`. Read the business rules before you rely on them: the code shows what the system does, not what it should do. If the rules already exist in a wiki, a PDF, or a ticket, `/write-docs --import <file|url>` reformats them into the same paths instead. Keep each document to one to three pages. Long context gets skimmed, and the rules Claude skims are the ones it breaks.

Create `docs/schemas/` (one file per table, written before its migration) and `docs/adr/` (ADRs from the decision route) as you need them.

After a context compaction, a hook re-injects the top of `docs/context/business-rules.md` and `docs/context/architecture.md` and the number of specs with pending tasks, so a long session keeps its rules. The API contract is not re-injected; Claude re-reads it when it touches an endpoint.

If your backend and frontend live in separate repositories, set up a workspace as described in [multi-repo.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/multi-repo.md) before your first ticket.

### Starting a new product

With no code yet, start with `/product-brief`: it turns the idea into a brief (users, problems, business rules, success metrics) and a backlog of vertical slices, each with its size, business-rule ids, and the `/sdd` line that starts it. `/sdd` then routes the first slice to the new-app route, which builds it with the `greenfield-build` workflow. The rest of this guide applies from the second slice on.

### First-session order

1. `/framework-doctor`: the install works.
2. Context from code: `/write-docs` for the Golden Triangle (or `/product-brief` for a new product).
3. `/sdd <ticket or description>`: your first piece of work.

## 3. Your first ticket with /sdd

`/sdd` is the front door for all spec-driven work. Give it a ticket key or a plain description:

```
/sdd PROJ-123
```

**1. Classify and confirm.** `/sdd` pulls the ticket text from Jira or Linear if a tracker MCP server or CLI is available. Otherwise it asks you to paste the ticket. It then proposes a route with a one-line reason:

```
Route: feature. Adds a new behavior (refund guard on top-up orders); no existing behavior is broken.
```

You confirm it or pick another route. The routes are trivial, bug, decision, feature, shipped code, new app, and security audit (a deep, coverage-led audit of existing code). The full route tree is in the [README](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/README.md). Nothing launches until you confirm.

**2. Inputs up front.** Background workflows can't stop to ask questions, so `/sdd` asks two to four now: single repo or backend and frontend paths, the dev URL for browser checks, and anything specific to the route.

A request is **trivial** only when it touches about three files with no design choice; `/sdd` sends it to `/simple-task` without a spec.

**3. Spec.** For a feature, `/sdd` runs `/write-spec`. It sizes the work, investigates the codebase, asks clarifying questions, and writes the spec:

```
.ai/specs/spec-PROJ-123-refund-guard/
├── spec-lite.md
└── tasks.md
```

Without a ticket, the folder is named from a timestamp, for example `spec-20261018-1430-order-pdf-export`. Work sized XS gets no spec and goes to `/simple-task` instead. Medium and large specs add more files.

**4. Review `spec-lite.md`.** This is the step that matters most. Read these sections:

- **Must NOT change**: behavior near the change that has to stay identical. Each item gets a guard test.
- **Acceptance criteria**: EARS or Given/When/Then statements. Each maps to a test or a manual-test step in the traceability table in `tasks.md`.
- **Boundaries**: what the build may always do, what it must ask about first, and what it must never do.
- **Open questions**: a spec with unchecked open questions can't be approved. Answer them, or accept them as assumptions.

Before you see the spec, a fresh-context clarity gate has already reread it. Anything it found ambiguous is listed for you. The format itself is defined in [specification-system.md](../templates/specs/specification-system.md).

**5. Approve.** `/sdd` asks: *Approve and build*, *Approve only* (approve now and build it yourself later with `/execute-task`, see section 4), *Request changes*, or *Stop here (draft)*. On approval it writes `status: approved`, `approved_by`, and `approved_at` into the spec frontmatter. If a tracker is connected, it offers to post the spec link back to the ticket, and posts only if you say yes.

**6. Build in the background.** *Approve and build* launches the `ship-feature` workflow with `{ spec: "spec-PROJ-123-refund-guard" }`. It investigates, builds the tasks with tests first, runs quality gates, closes gaps against the acceptance criteria, checks the UI in the browser, runs an adversarial review, re-walks the ticket's scenario, and updates the docs. Browser checks use the built-in Playwright MCP server (headless), fall back to Claude in Chrome, and are reported as "not run" when no browser is available.

Claude Code asks you to allow each workflow run (*Yes, run it*, *Yes, and don't ask again*, *View raw script*, *No*). *Don't ask again* is safe for the kit's workflows in this project. Watch the run with:

```
/workflows
```

**7. Read the report.** The report ends with a recommendation:

- **SHIP**: gates green, review approved, acceptance re-walked.
- **FIX-FIRST**: confirmed findings to address, listed by file and line with a one-line fix each.
- **BLOCKED**: a partial build, an unreachable gate, or an acceptance trace that did not resolve.

It also writes a manual test plan to `manual-test.md` in the spec folder. Run it before you merge.

### A bug takes a shorter path

```
/sdd "Refund button returns 500 for top-up orders since Tuesday's deploy"
```

`/sdd` proposes the bug route. It asks for repro steps, expected versus actual behavior, and what nearby must not change, then launches the `fix-bug` workflow. No spec is written, because the pipeline itself is the spec. It reproduces the bug, verifies the root cause, writes a failing regression test, applies a minimal fix, and runs the gates. The verdict is `FIXED` only when the regression test goes from red to green and the original report no longer reproduces. Otherwise it is `NOT-RESOLVED` or `NEEDS-INFO`.

Per-workflow phases and `Workflow()` arguments are in [USAGE-EXAMPLES.md](USAGE-EXAMPLES.md).

## 3a. First session on Codex or Cursor

After installing for another host (see [INSTALLATION](INSTALLATION.md)), the first session is the same as below with that host's invocation prefix.

On Codex (an unverified preview), where hooks need approval in `/hooks` once after install:

```
$framework-doctor
$sdd PROJ-123
```

Background workflows run through the bridge: `/sdd` starts the run with the `workflow_start` tool and your host's subagents do the work. Each step is described in [workflow-bridge.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/workflow-bridge.md).

On Cursor (also a preview), in Agent chat:

```
/framework-doctor
/sdd PROJ-123
```

## 4. Working interactively instead

If you want to watch each task land, skip the background build. Write the spec, approve it, then build it task by task:

```
/write-spec --ticket=PROJ-123 Block refunds on top-up orders
/sdd spec-PROJ-123-refund-guard
/execute-task --spec=PROJ-123
```

`/write-spec` always leaves the spec as `status: draft`. The second line reopens it in `/sdd`: review it as in section 3 and choose *Approve only*. `/execute-task` stops on a draft spec and asks before building anything.

`/execute-task` builds one task at a time with tests first and a verification gate after each task, then pauses. `--auto-continue` runs the remaining tasks back to back and stops at the first failed gate. For a larger spec, or an area you don't know yet, `/write-spec --background` runs the `create-spec` research workflow instead.

For an unattended run, set a goal with the built-in `/goal` and let Claude keep going until the condition holds:

```
/goal every task in .ai/specs/spec-PROJ-123-refund-guard/tasks.md is checked and the verification gates pass
/execute-task --spec=PROJ-123 --continue
```

## 5. After /sdd: continue, check, finish

`/sdd` starts the work. A short set of commands continues, checks, and finishes it. Progress is saved to disk, so a new session or a context reset loses nothing.

**Continue**

| Command | When |
|---------|------|
| `/execute-task --spec=<id> --continue` | Resume an approved spec task by task after `/clear`, a new day, or a switch to the other repo |
| `/investigate "<question>"` | Get a sourced answer and a recommendation before you decide |

**Check**

| Command | When |
|---------|------|
| `/run-tests` | Run the backend test gate; `--frontend` runs the frontend suite and `--e2e` the browser journeys |
| `/deep-review` | Get a blocking verdict before merge from a reviewer that never saw your prompt |
| `/progress` | Where was I across all specs, and the next task (`--spec=<ref>` for one spec, `--next` for a recommendation). `/progress --health` adds git, tests, lint, and dependency health |
| `/spec-board` | Board of every spec by status plus backlog slices, with approval and open-question warnings. `/spec-board --out /tmp/spec-board.html` writes a shareable snapshot |

People without Claude Code can open the same board from GitHub: `npx github:stasmarkov/sdd-kit spec-board --serve` in a repo that has `.ai/specs` (requirements in [Without cloning: npx](INSTALLATION.md#without-cloning-npx)).

**Finish**

| Command | When |
|---------|------|
| `/open-pr --spec=<id> --report=<report>` | Open spec-traced PRs, one per repo, backend first and cross-linked. The ship-feature and fix-bug reports end with this line ready to paste |
| `/learn "<finding>"` | Turn a review finding, bug class, or CI failure into a durable guard, so the mistake cannot recur |

File-copy installs also add a status line that shows the active spec and task progress (`spec-PROJ-123 · task 3/7`), unless you already have one. Plugins cannot set a status line, so in plugin mode point `statusLine` in your settings at `<plugin path>/scripts/statusline.sh` if you want it.

## 6. How memory works

The kit has no memory server of its own. Two built-in Claude Code mechanisms handle memory:

- **Auto memory**: Claude saves durable facts, preferences, and corrections it learns in your project and loads them in later sessions.
- **Agent memory**: several of the kit's agents declare `memory: project`, so each keeps its own notes for the project across sessions.

Run `/memory` to see what is stored and edit or delete entries. Facts every session must know belong in `CLAUDE.md`, `AGENTS.md`, or a rule, not in memory.

## 7. Where artifacts go

| Path | Contents |
|------|----------|
| `.ai/specs/<spec-folder>/` | One folder per spec: `spec-lite.md`, `tasks.md`, plus `decisions.md`, `manual-test.md`, and others for larger specs |
| `.ai/session/<spec-folder>-state.json` | `/execute-task` resume state |
| `.ai/verification/<spec-folder>/` | Per-task quality gate reports |
| `docs/context/` | Golden Triangle documents |

Folder naming, how spec references resolve, and the full layout are in [specification-system.md](../templates/specs/specification-system.md). Generated documentation uses lowercase filenames.

## 8. Where to go next

| Read | When |
|------|------|
| [Hireboard worked example](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/examples/job-board/README.md) | See the `/sdd` routes on one project, from an empty folder to a team: 12 chapters with real commands and tested code. Start with chapter 04 for a full feature |
| [Interactive guide](https://github.com/stasmarkov/sdd-kit/tree/v4.0.2/docs) | The same material, clickable, with the example's spec board. Open `docs/guide/index.html` from a clone in a browser, or run `npx github:stasmarkov/sdd-kit guide` |
| [USAGE-EXAMPLES.md](USAGE-EXAMPLES.md) | Real scenarios, phases of each workflow, `Workflow()` arguments |
| [INSTALLATION.md](INSTALLATION.md) | Upgrading, add-ons, MCP servers, troubleshooting |
| [plugin-mode.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/plugin-mode.md) | Plugin versus file-copy, add-on plugins, namespacing |
| [effort-guidelines.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/effort-guidelines.md) | Model tiers, effort levels, controlling cost |
| [multi-repo.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/multi-repo.md) | Separate backend and frontend repositories |
| [third-party.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/third-party.md) | Recommended third-party skills, LSP plugins |
| [skill index](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/skills.md), [agent index](https://github.com/stasmarkov/sdd-kit/blob/v4.0.2/docs/reference/agents.md) | Every skill and agent with a one-line description |
