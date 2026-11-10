# Review pipeline: autonomous codebase review and project intelligence

A bash pipeline that reviews an existing codebase with `claude -p`, validates every finding adversarially, and writes a verified knowledge base (architecture, business rules, confirmed bugs, user flows, constraints) plus prioritized specs. Later Claude Code sessions start from documented facts instead of rediscovery. Re-run it when the codebase moves on.

It runs from a plain terminal, typically overnight. For reviewing a single change before merge, use `/deep-review` instead.

## Requirements

- **Claude Code**, installed and logged in (`claude --version`, `claude auth status`). For CI or untrusted checkouts, export `ANTHROPIC_API_KEY`: every call then runs with `--bare` (see [Headless safety](#headless-safety)).
- **bash** (the macOS built-in works).
- **python3** for risk scoring (optional, recommended).
- **git** for hotspot analysis (optional).
- The project's own tools, if the config uses them: a running DDEV (`ddev start`) when static analysis runs inside it, and `npm install` in each frontend so `tsc` has `node_modules`.

> **Run AI phases (B to H) from a separate terminal, never from inside a Claude Code session.** Nested `claude -p` calls hang. The non-AI commands (`triage`, `inventory`, `status`, `discover`) work anywhere, including inside Claude Code.

Check that the model aliases work from that terminal:

```bash
claude -p "say OK" --model sonnet
claude -p "say OK" --model haiku
```

## Step by step

### 1. Copy the scripts into the project

```bash
mkdir -p /path/to/your-project/scripts/review
cp scripts/review/{review.sh,review.config.sh,review-setup.sh} /path/to/your-project/scripts/review/
chmod +x /path/to/your-project/scripts/review/{review.sh,review-setup.sh}
```

Full file-copy installs (`install.sh --project --full`) also place a copy in `.claude/scripts/review/`. Copy those three files into `scripts/review/` at the project root before running: the pipeline finds the project root two levels above the script.

For split repos, put the scripts in the backend (the main project) and point the config at the frontend by absolute path.

### 2. Configure

Edit `scripts/review/review.config.sh`. Two values are required:

```bash
PROJECT_NAME="MyProject"
PROJECT_DESCRIPTION="What this project does and who uses it"
```

Everything else is auto-detected from marker files ([Supported frameworks](#supported-frameworks)). Override paths, static analysis, frontends, and the docs to validate as needed; the [example](#example-a-laravel-modular-monolith-with-a-nextjs-frontend) below shows a full config.

### 3. Run the preflight check

```bash
bash scripts/review/review-setup.sh
```

It validates the config and required fields, detects the framework, checks the chunk registry, the Claude CLI and its login, static analysis tools and frontend paths, and creates the output directories. Fix every red line before going on.

### 4. Discover chunks

```bash
bash scripts/review/review.sh discover
```

This scans the filesystem and writes `CHUNKS_BACKEND` and `CHUNKS_FRONTEND` (the code areas to review) into `review.config.sh`. Modules over 40 files are split by layer. Review the result and hand-tune large modules; skip this step if you already have hand-tuned chunks.

### 5. Free triage (no AI cost)

```bash
bash scripts/review/review.sh triage
```

Two to five minutes: static analysis (PHPStan, mypy, RuboCop or ESLint), TypeScript checks on frontends, Composer/npm/pip audits, git hotspots (most-changed files in 90 days), complexity, a security pattern scan (raw SQL, debug calls, mass assignment), and RED/YELLOW/GREEN risk per module. Results:

```bash
cat .ai/review/triage/triage-report.md       # full report
cat .ai/review/triage/risk.json              # module risk scores
cat .ai/review/triage/security-patterns.txt  # security findings
cat .ai/review/triage/hotspots.txt           # most-changed files
cat .ai/review/triage/complexity.txt         # complex or large files
```

### 6. Run the pipeline

Overnight, in the background:

```bash
nohup bash scripts/review/review.sh run > .ai/review/run.log 2>&1 &
echo $! | tee .ai/review/pid.txt
tail -f .ai/review/run.log    # Ctrl+C stops watching; the pipeline keeps running
```

Or phase by phase, to inspect between steps:

```bash
bash scripts/review/review.sh survey     # B: cheap survey (~5 min)
bash scripts/review/review.sh status     # RED/YELLOW/GREEN per chunk
bash scripts/review/review.sh phase C    # deep review (~1-2 h)
bash scripts/review/review.sh phase D    # validation (~1-2 h)
bash scripts/review/review.sh phase E    # aggregate docs (~20 min)
# Phase I runs here and blocks for sign-off when EXISTING_DOCS_PATHS is set
bash scripts/review/review.sh phase F    # spec check (~15-30 min)
bash scripts/review/review.sh phase J    # doc validation (~1-3 h, scales with doc count)
bash scripts/review/review.sh phase K    # gap analysis and doc generation (~15 min)
bash scripts/review/review.sh phase G    # context docs (~10 min)
bash scripts/review/review.sh phase H    # brain and CLAUDE.md patch (~10 min)
bash scripts/review/review.sh phase L    # cleanup: apply cleaned docs, archive intermediates
```

### 7. Monitor

```bash
bash scripts/review/review.sh status                  # works anywhere, including Claude Code
ps -p "$(cat .ai/review/pid.txt)"                     # still running?
cat .ai/review/errors.log                             # failures so far

watch -n 60 'bash scripts/review/review.sh status'                       # Linux
while true; do clear; bash scripts/review/review.sh status; sleep 60; done   # macOS
```

### 8. Read the results

```bash
cat docs/context/PROJECT-BRAIN.md              # 1. full project intelligence
cat .ai/review/master/bugs-and-risks.md        # 2. confirmed bugs by severity
cat .ai/review/master/INDEX.md                 # 3. work queue in priority order
cat docs/architecture/architecture.md          # 4. architecture reference
cat docs/architecture/business-logic.md        # 5. rules and edge cases
cat docs/architecture/api-contracts.md         # 6. every endpoint and its callers
cat docs/context/business-rules.md             # 7. business rules ground truth
cat docs/context-for-ai/known-gotchas.md       # 8. traps that cause bugs
cat docs/context-for-ai/change-impact-map.md   # 9. change X, then also check Y
cat .ai/review/doc-validation/SUMMARY.md       # 10. health score per existing doc
```

Doc health scores from Phase J: above 80% needs no action; 50 to 80% had outdated claims that Phase L corrected; below 50% has drifted far enough that you should read the cleaned version yourself; below 30%, consider rewriting or deleting the doc. Phase L never deletes docs.

### 9. Work from the results

Phase H adds a "Project Intelligence" section to `CLAUDE.md` that points every session at the brain, the business rules, and the architecture docs. It also writes a short primer to `.claude/project-context.md`; import it from `CLAUDE.md` with `@.claude/project-context.md` if you want it loaded too.

Work through the generated specs, highest priority first:

```bash
ls .ai/specs/REVIEW-P*/
/execute-task --spec=REVIEW-P1-20260310-fix-auth
/deep-review --spec=REVIEW-P1-20260310-fix-auth    # every generated spec ends with this gate
```

## Example: a Laravel modular monolith with a Next.js frontend

A fictional project, Acme: an invoicing and payments platform with a Laravel 12 modular monolith backend under DDEV and a separate Next.js App Router frontend repo.

```
~/work/acme/
├── be/                         Laravel 12, DDEV, modular monolith
│   ├── Modules/
│   │   ├── Billing/            large: invoices, plans, proration
│   │   ├── Accounts/           customers, organisations, roles
│   │   ├── Payments/           gateways, webhooks, reconciliation
│   │   ├── Ledger/             balances, transactions
│   │   ├── Notifications/      mail and in-app notifications
│   │   └── Shared/             base classes, traits
│   └── .ddev/
└── frontend/                   Next.js App Router
    └── app/
```

`be/scripts/review/review.config.sh`:

```bash
PROJECT_NAME="Acme"
PROJECT_TYPE="laravel+nextjs"
PROJECT_DESCRIPTION="Invoicing and payments platform. Laravel 12 modular monolith
(Billing, Accounts, Payments, Ledger, Notifications, Shared) with DDEV.
Next.js App Router frontend."

BACKEND_FRAMEWORK="laravel"
SOURCE_EXTENSIONS="php ts tsx"
BACKEND_SRC_PATHS="Modules app"
# Standard layout: Modules/*/Infrastructure/Routes; with a Core/ sublayer: Modules/*/Core/Infrastructure/Routes
BACKEND_ROUTES_PATHS="Modules/*/Infrastructure/Routes Modules/*/Core/Infrastructure/Routes routes"
BACKEND_JOBS_PATHS="app/Jobs Modules/*/Jobs Modules/*/Core/Application/Jobs app/Console"
BACKEND_EVENTS_PATHS="Modules/*/Events Modules/*/Core/Domain/Events app/Listeners Modules/*/Core/Application/Listeners"
BACKEND_MAIL_PATHS="app/Mail app/Notifications Modules/*/Mail Modules/*/Core/Application/Mail"
BACKEND_MIGRATION_PATHS="database/migrations"

STATIC_ANALYSIS_CMD="ddev php vendor/bin/phpstan analyse --level=7 --error-format=json"
TEST_CMD="ddev artisan test"

declare -a FRONTENDS=(
  "fe:nextjs:/absolute/path/to/frontend:Customer-facing frontend (Next.js App Router)"
)
FRONTEND_TYPECHECK_CMD="npx tsc --noEmit"

EXISTING_DOCS_PATHS="docs"    # docs Phase I and J check against the code; keep it narrow

# Use tier aliases (sonnet, opus, haiku). Switch CLAUDE_MODEL to opus for
# security-critical modules; it costs several times more.
CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"
SURVEY_MODEL="${SURVEY_MODEL:-haiku}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"
```

Hand-tuned chunks after `discover`: split the large module by layer, keep medium modules to one or two chunks, and add cross-cutting chunks.

```bash
declare -a CHUNKS_BACKEND=(
  "billing-domain|Billing: Domain|Modules/Billing/Domain|Invoices, plans, proration rules, value objects"
  "billing-app|Billing: Application|Modules/Billing/Application|Use cases, commands, queries, handlers"
  "billing-infra|Billing: Infrastructure|Modules/Billing/Infrastructure|Controllers, requests, routes, repositories"
  "accounts|Accounts Module|Modules/Accounts|Customers, organisations, roles and permissions"
  "payments|Payments Module|Modules/Payments|Gateways, webhooks, reconciliation"
  "ledger|Ledger Module|Modules/Ledger|Balances and transactions"
  "notifications|Notifications Module|Modules/Notifications|Every notification: trigger, recipient, channel"
  "shared|Shared Module|Modules/Shared|Base classes, traits, helpers"
  "cross-module|Cross-Module Communication|Modules|Events, listeners, observers. Find direct cross-module calls (violations)."
  "infra-routes|Routing and Middleware|Modules/*/Infrastructure/Routes routes|API versioning, middleware, auth guards"
  "infra-jobs|Jobs and Schedules|app/Jobs Modules/*/Jobs app/Console|Every job: trigger, queue, payload, failure"
  "schema|Database Migrations|database/migrations|ERD, foreign keys, indexes, N+1 risks"
  "infra-config|Config and Environment|config .env.example|App config, cache, queue, mail, services"
)

declare -a CHUNKS_FRONTEND=(
  "fe-pages|Frontend: Pages and Routes|/absolute/path/to/frontend/app|Routes, pages, auth gates, user flows"
  "fe-api|Frontend: API Consumption|/absolute/path/to/frontend|API calls: URL, method, payload, response, error handling"
  "fe-state|Frontend: State and Auth|/absolute/path/to/frontend|Auth flow, token storage, global state, sessions"
)
```

Then `ddev start`, the preflight check, triage, and the overnight run as in the steps above.

## What the pipeline produces

```
be/
├── .ai/
│   ├── review/
│   │   ├── triage/triage-report.md        PHPStan, audits, hotspots, security scan
│   │   ├── survey/*.txt                   RED/YELLOW/GREEN per chunk
│   │   ├── chunks/*.md                    raw adversarial review per chunk
│   │   ├── validated/*.md                 findings marked CONFIRMED or REJECTED
│   │   ├── validation/                    Phase I (when EXISTING_DOCS_PATHS is set)
│   │   │   ├── existing-docs-inventory.md
│   │   │   ├── cross-reference.md         AI rules vs existing docs
│   │   │   ├── VALIDATION-CHECKLIST.md    human sign-off checklist
│   │   │   └── validated-rules.md         final rules after sign-off
│   │   ├── doc-validation/                Phase J
│   │   │   ├── SUMMARY.md                 health score per doc
│   │   │   └── {doc-slug}/                claims.json, verification.json, cleaned.md, source-path.txt
│   │   ├── archive/intermediates-*.tar.gz Phase L archive
│   │   ├── README.md                      Phase L manifest of all output
│   │   └── master/
│   │       ├── bugs-and-risks.md          confirmed bugs by severity
│   │       ├── improvement-backlog.md     quick wins and refactoring ideas
│   │       └── INDEX.md                   master index and execution order
│   └── specs/REVIEW-P1-*/, REVIEW-P2-*/, REVIEW-P3-*/   spec-lite.md + tasks.md by priority
├── docs/
│   ├── architecture/                      architecture.md, business-logic.md, api-contracts.md, background-systems.md
│   ├── context/                           PROJECT-BRAIN.md (read first), business-rules.md, architecture.md
│   └── context-for-ai/                    invariants, common-patterns, change-impact-map, known-gotchas,
│                                          user-stories, admin-capabilities
├── .claude/project-context.md             short session primer
└── CLAUDE.md                              patched with the Project Intelligence section
```

`docs/context/business-rules.md` and `docs/context/architecture.md` are the paths `/deep-review` and the kit's other skills read as ground truth. Phase H also writes `.ai/review/master/knowledge-graph-entities.js`, which is useful only with an external knowledge-graph memory server; the kit no longer ships one.

## Pipeline phases

```
Phase 0  TRIAGE       Free. Static analysis, git hotspots, security scan.
Phase A  INVENTORY    Free. Route, job, event, and email manifests (~30 s).
Phase B  SURVEY       Cheap (haiku). File lists only. RED/YELLOW/GREEN per chunk.
Phase C  REVIEW       Full model. Adversarial, 13-criteria checklist. RED and YELLOW chunks only.
Phase D  VALIDATE     Full model. Semi-blind: reads the code before the report. CONFIRMED/REJECTED.
Phase E  AGGREGATE    Docs and specs from CONFIRMED findings only.
Phase I  RECONCILE    AI rules vs existing docs. Human sign-off gate.
Phase F  SPEC CHECK   Each spec verified against live code, in parallel.
Phase J  DOC VERIFY   Every claim in existing docs checked against code; cleaned docs produced.
Phase K  DOC GEN      Gap analysis: missing business rules, edge cases, API contracts.
Phase G  CONTEXT      Docs /deep-review loads (from validated rules when available).
Phase H  BRAIN        PROJECT-BRAIN.md, CLAUDE.md patch, session primer.
Phase L  CLEANUP      Apply cleaned docs, archive intermediates, write the manifest.
```

**Phase I (human gate).** Runs after E and before G. It cross-references the generated business rules against your existing docs to catch contradictions (AI says X, your spec says Y), gaps (your docs describe something the review missed), and unverifiable claims. The pipeline stops until you sign off:

```bash
# EXISTING_DOCS_PATHS="docs specs .ai/specs README.md"   in review.config.sh
# Edit .ai/review/validation/VALIDATION-CHECKLIST.md: mark each rule CONFIRMED, WRONG, or MISSING CONTEXT
bash scripts/review/review.sh validate-sign-off    # every contradiction must be addressed
bash scripts/review/review.sh run                  # F to H then use the validated rules
```

With `EXISTING_DOCS_PATHS` empty (the default), Phase I is skipped.

**Phase J (doc validation).** J1 extracts up to 50 testable claims per doc ("route /api/X returns Y", "table X has column Y"); J2 reads the referenced code and marks each `VALID`, `OUTDATED`, `INVALID`, or `CANNOT_VERIFY`; J3 rewrites docs with outdated or invalid claims. Phase L applies the cleaned versions over the originals, backing them up to `archive/`.

**Phase K** generates docs for business rules, edge cases, and API contracts that exist in code but nowhere in the docs. **Phase L** applies cleaned docs, archives intermediates into a tarball, and writes `.ai/review/README.md`.

### Cost and time

Figures are from past runs on a mid-size Laravel + Next.js project and drift with pricing; check current pricing ([effort guidelines](../../docs/effort-guidelines.md)) and cap each call with `REVIEW_MAX_BUDGET_USD`.

| Phase | Model | Est. cost | Time |
|-------|-------|-----------|------|
| 0 Triage, A Inventory | none | $0 | 3 min |
| B Survey | haiku | ~$0.20 | 5 min |
| C Review | sonnet | ~$5-8 | 1-2 h |
| D Validate | sonnet | ~$5-8 | 1-2 h |
| E Aggregate | sonnet | ~$3-5 | 20 min |
| I Reconcile | sonnet | ~$1-2 | 10 min |
| F Spec check | sonnet | ~$2-5 | 15-30 min |
| J Doc verify | sonnet | ~$5-15 | 1-3 h |
| K Doc gen | sonnet | ~$2-3 | 15 min |
| G Context, H Brain | sonnet | ~$3-5 | 20 min |
| L Cleanup | none | $0 | 1 min |
| **Total** | | **~$20-40** | **~4-8 h** |

The survey usually marks 20 to 40% of chunks GREEN, which C and D then skip. Phase J scales with `EXISTING_DOCS_PATHS`, so keep it to high-value docs.

## Commands

```bash
./review-setup.sh                 # preflight validation
./review.sh discover [--force]    # generate the chunk registry

./review.sh run                   # full pipeline: 0 A B C D E I F J K G H L
./review.sh triage                # phase 0 only (free)
./review.sh inventory             # phase A only (free)
./review.sh survey                # phase B only (cheap)
./review.sh phase <0|A-L>         # one phase
./review.sh chunk <id>            # re-run one review chunk
./review.sh revalidate <id>       # re-run validation for one chunk
./review.sh validate-sign-off     # sign off the Phase I checklist

./review.sh status                # progress dashboard
./review.sh reset                 # wipe all state, docs, specs, and the CLAUDE.md patch (confirms first)
./review.sh help                  # full help
```

## Supported frameworks

| Framework | Detected by | Static analysis | What gets scanned |
|-----------|-------------|-----------------|-------------------|
| Laravel | `artisan` | PHPStan | `Modules/`, `app/`, routes, jobs, events |
| Laravel + Next.js | `artisan` + `FRONTENDS` in the config | PHPStan + tsc | Backend and every configured frontend |
| Drupal | `web/core/lib/Drupal.php` | PHPStan | `web/modules/custom`, `web/themes/custom` |
| Symfony | `symfony.lock` | PHPStan | `src/` |
| Django | `manage.py` + django | mypy | Detected Django apps |
| Rails | `Gemfile` + rails | RuboCop | `app/`, `lib/` |
| Node | `package.json` | ESLint | `src/`, `lib/` |
| Generic | fallback | configurable | `src/`, `app/`, `lib/` |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MODEL` | `sonnet` | Model for phases C to H. Use a tier alias, or a current full ID for reproducible runs ([effort guidelines](../../docs/effort-guidelines.md)) |
| `SURVEY_MODEL` | `haiku` | Model for phase B |
| `CLAUDE_TIMEOUT` | `720` | Timeout per call, in seconds |
| `MAX_PARALLEL` | `5` | Maximum concurrent calls |
| `REVIEW_BARE` | `auto` | `--bare` on every call: `auto` when `ANTHROPIC_API_KEY` is set, `true` forces it, `false` disables it |
| `REVIEW_PERMISSION_MODE` | `dontAsk` | Tools not pre-approved for a call are denied instead of prompting |
| `REVIEW_MAX_BUDGET_USD` | `3.00` | Per-call spend cap (`--max-budget-usd`); an empty string removes it |

### Headless safety

Every AI call goes through one helper, `run_claude` → `build_claude_args` in `review.sh`:

```bash
claude -p "<prompt>" --model <model> \
  --tools <set> --allowedTools <set> \
  --permission-mode dontAsk \
  --strict-mcp-config --no-session-persistence \
  [--bare] [--max-budget-usd 3.00] < /dev/null
```

- **Minimal tools per call.** Calls that print their result get `Read,Grep,Glob`; the Phase K edge-case and API-contract calls add `Bash`; only the three calls that create files (specs, business-rule docs, context docs) get `Write`. Nothing gets `Edit`.
- **`--bare`** skips the reviewed repo's hooks, plugins, MCP servers, and `CLAUDE.md`, so an untrusted checkout cannot run code through its `.claude/settings.json`. Bare mode authenticates only with `ANTHROPIC_API_KEY`, never with `claude login`, which is why the default is `auto`. Prompts inline the context they need.
- **`dontAsk`** makes a call that reaches for a tool outside its set fail that step (logged to `errors.log`) instead of hanging on a prompt.
- **stdin is `/dev/null`**, so parallel calls inside loops never read the loop's input.

## Resuming and troubleshooting

Every completed step writes a lockfile, so an interrupted run continues where it stopped:

```bash
bash scripts/review/review.sh run          # skips completed steps
bash scripts/review/review.sh chunk wallet          # re-run one chunk
bash scripts/review/review.sh revalidate wallet     # re-run its validation
bash scripts/review/review.sh phase C               # re-run a phase (done chunks are skipped)
bash scripts/review/review.sh reset                 # start over (confirms first)
```

**"may not exist or you may not have access".** The model in `CLAUDE_MODEL` or `SURVEY_MODEL` is mistyped or retired. Use a tier alias, then test with `claude -p "say OK" --model sonnet`.

**A step fails with a budget or permission error.** `errors.log` gives the reason. A budget stop means the call hit `REVIEW_MAX_BUDGET_USD`: raise it or split the chunk. A permission denial means the prompt tried a tool outside its set; that step's output is discarded and it re-runs on resume.

**Bare mode says "not logged in".** `--bare` ignores `claude login`. Export `ANTHROPIC_API_KEY`, or set `REVIEW_BARE=false` on a trusted checkout.

**"AI phases cannot run inside Claude Code".** Expected: phases B to H spawn `claude -p`, which cannot nest. Use a plain terminal.

**"timeout: command not found" on macOS.** Already handled: the script falls back to a background process with kill.

**Rate limit mid-run.** Some chunk files then contain the limit message instead of a review (for example `You've hit your limit · resets 6pm`), and their lockfiles mark them done. Remove those files and lockfiles, then resume:

```bash
for f in $(grep -rl "hit your limit" .ai/review/chunks/ .ai/review/validated/ 2>/dev/null); do
  id=$(basename "$f" .md)
  dir=$(basename "$(dirname "$f")")
  phase=$([[ "$dir" == "chunks" ]] && echo "C" || echo "D")
  echo "Removing: $f + .done/${phase}-${id}"
  rm "$f" ".ai/review/.done/${phase}-${id}" 2>/dev/null
done
nohup bash scripts/review/review.sh run > .ai/review/run.log 2>&1 &
```

## Optional: CodeGraphContext

[CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) builds a queryable code graph with tree-sitter: real call graphs, dead-code detection, and cyclomatic complexity, which are richer than the pipeline's grep-based triage. It is not required.

```bash
pip install codegraphcontext
cd /path/to/your-project && cgc index .
cgc analyze complexity --threshold 10
cgc analyze dead-code
cgc analyze callers MyService
```

To let Claude query the graph during phases C to H, add it to `.mcp.json` (or run `cgc mcp setup`):

```json
{
  "mcpServers": {
    "CodeGraphContext": { "command": "cgc", "args": ["mcp", "start"] }
  }
}
```
