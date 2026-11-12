---
name: write-docs
description: Generate documentation from code (business rules, API contracts, architecture overview), import external docs into the context paths CLAUDE.md loads (--import), or audit docs and code against the project's conventions and report drift (--audit) - always with lowercase filenames and file:line citations. Use when a project needs docs derived from the actual code, when business rules or architecture notes from a wiki, PDF or ticket should become project context, or to check whether docs and code still follow CLAUDE.md, AGENTS.md and .claude/rules. For a traceable QA plan plus docs for shipped features, use /qa-and-docs instead.
argument-hint: "[--type=business|api|architecture|all] [--source=path] [--output=path] | --import <file|url> [--as=business|architecture|api] | --audit [--source=path|url]"
allowed-tools: Agent, Skill, Read, Write, Edit, Bash, Grep, Glob, WebFetch, AskUserQuestion
effort: medium
metadata:
  version: "1.3"
  encoding: "UTF-8"
  subagents: "code-explorer, doc-creator"
  response_format: "concise"
  checkpoint_enabled: "false"
  last_verified: "2026-11-11"
  next_review: "2027-02-11"
---

# /write-docs

Three modes, one owner for project documentation:

| Mode | What it does |
|------|--------------|
| generate (default) | Derives business rules, API contracts, and architecture docs from the code |
| `--import <file\|url>` | Reformats an external document into the context paths `CLAUDE.md` loads |
| `--audit` | Compares docs and code against the project's conventions and reports drift |

Code reading goes to the `code-explorer` agent and prose writing to the `doc-creator` agent. Filenames are always lowercase.

## Where docs go

These are the paths the project `CLAUDE.md` (from `CLAUDE.template.md`) loads, so a doc written anywhere else is never read by later sessions:

| Doc | Path |
|-----|------|
| Business rules | `docs/context/business-rules.md` |
| Architecture | `docs/context/architecture.md` |
| API contracts | `docs/api/api-contracts.md` |
| Table docs | `docs/schemas/{table}.md` (the `schema-first` format) |

---

## Usage

```bash
# Generate business rules documentation
/write-docs --type=business --source=<business logic directory>

# Generate API documentation
/write-docs --type=api --source=<route definitions file>

# Generate architecture overview
/write-docs --type=architecture

# Generate all three Golden Triangle docs
/write-docs --type=all

# Import external docs into the context paths
/write-docs --import ~/Downloads/Refund_Policy.pdf --as=business
/write-docs --import https://wiki.example.com/architecture --as=architecture
/write-docs --import docs/LEGACY_API.md --as=api

# Audit docs and code against CLAUDE.md, AGENTS.md and .claude/rules
/write-docs --audit
/write-docs --audit --source=docs/api/
```

---

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--source` | No | `.` | Source path (code files), or the docs to audit |
| `--type` | No | `all` | Doc type: `business`, `api`, `architecture`, `all` |
| `--output` | No | the paths in "Where docs go" | Override the output location |
| `--format` | No | `markdown` | Output format: `markdown`, `json` |
| `--import` | No | - | External file (`.md`, `.txt`, `.pdf`, `.docx`, `.html`) or URL to import |
| `--as` | No | inferred, then asked | Import target: `business`, `architecture`, `api` |
| `--audit` | No | - | Run the convention audit instead of generating |

---

## File Naming Rules

**CRITICAL**: All generated files use lowercase filenames.

| Generated File | Purpose |
|----------------|---------|
| `docs/context/business-rules.md` | Business logic documentation |
| `docs/api/api-contracts.md` | API endpoint documentation |
| `docs/context/architecture.md` | System architecture docs |
| `docs/schemas/{table}.md` | Database schema documentation |
| `validation-rules.md` | Input validation documentation (supporting doc) |

Transformation for imported or legacy names: lowercase, underscores and spaces to dashes, special characters removed, extension `.md` (`BUSINESS_RULES.md` → `business-rules.md`).

**Exceptions**: only `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` and `AGENTS.md` may use uppercase.

---

## Workflow

### Step 0: Stack exploration recipe

Find each repo's stack entry with the `verification-gates` skill's "Repos and stack keys" rule and its recipe (the kit's `workflows/lib/stacks.json`, or a trusted project `.claude/stacks/*.json`). Among the skills its manifest names in `skills.conventions` and `skills.scaffold`, load the one that ships `references/exploration-recipes.md` with the Skill tool, read that file from the skill's base directory, and paste the recipe into the `code-explorer` prompt (the subagent cannot reach an add-on's files itself). With no stack, no installed add-on or no recipe, say so once and let `code-explorer` infer the layout from the repo.

### Step 1: Source Analysis

1. If the source is code: analyze structure and patterns
2. If the source is existing docs: parse and extract content
3. Identify documentation gaps
4. Determine output structure

**Output**: documentation plan with sections to generate.

### Step 2: Content Extraction

#### Business rules (`--type=business`)

Extract from business-logic classes or functions, input validation, access checks, domain events and their handlers, and comments tagged `@business-rule`.

```markdown
# Business Rules

## Domain: {DomainName}

### BR-{NN}: {RuleName}
**Source**: `{file:line}`
**Description**: {What the rule enforces}
**Conditions**: {When it applies}
**Actions**: {What happens}
**Validation**: needs human validation
```

Ids continue the file's existing `BR-NN` numbering; an existing rule keeps its id. The `**Validation**` line is written exactly as shown and stays until someone confirms the rule, who then replaces it with `**Validation**: confirmed {YYYY-MM-DD}`.

#### API documentation (`--type=api`)

Extract from the route registry, the handler for each route, request validation, response serializers, and OpenAPI annotations. When there is no route registry or API handler, do not write `docs/api/api-contracts.md`; report "no API surface found".

```markdown
# API Contracts

## Endpoint: {METHOD} {path}

**Handler**: `{file:line}` (plus `Class@method` where the stack has one)
**Authentication**: {Required|Optional|None}
**Rate Limit**: {limit/period}

### Request
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|

### Response
{JSON schema or example}

### Errors
| Code | Description |
|------|-------------|
```

#### Architecture (`--type=architecture`)

Extract from the directory layout, dependency-injection or service configuration, declarative configuration files, and module boundaries.

```markdown
# Architecture Overview

## System Structure
{High-level diagram description}

## Modules
### {ModuleName}
**Purpose**: {Description}
**Dependencies**: {List}
**Key Classes**: {List}

## Data Flow
{Request lifecycle description}

## Integration Points
{External services and APIs}
```

### Step 3: Format Generation

Hand the extracted, cited content to the `doc-creator` agent to write:

1. Apply consistent heading structure
2. Generate tables for structured data
3. Include code examples where helpful
4. Add cross-references between docs
5. Ensure lowercase filenames

When `docs/context/business-rules.md` or `docs/context/architecture.md` does not exist yet, start it from `${CLAUDE_SKILL_DIR}/assets/business-rules.template.md` or `${CLAUDE_SKILL_DIR}/assets/architecture.template.md` (the assets/ folder of this skill), keep the sections the code gives content for, and drop the rest. These three files (business-rules, architecture, api-contracts) are the Golden Triangle CLAUDE.md loads: one fact, one place. If a target file already exists, merge into it section by section and show the diff; never overwrite human-written rules silently. Generated business rules describe what the code does, which is not always what the business wants: each carries the `**Validation**: needs human validation` line until someone confirms it.

---

## Import Mode (`--import <file|url>`)

Brings business rules, architecture notes, or API docs from outside the repo into the paths `CLAUDE.md` loads.

1. **Read the source.**
   - Local `.md`, `.txt`, `.html`: read directly. `.pdf`: Read handles PDFs (use `pages` for long ones). `.docx`: convert with `pandoc -t gfm` when installed, otherwise ask the user to export it as PDF or markdown.
   - URL: WebFetch. For pages behind a login or rendered by JavaScript, use Claude in Chrome when it is connected, or ask the user to paste the content. Do not use BrowserMCP.
2. **Pick the target** from `--as`, or infer it from the content and confirm with AskUserQuestion: rules and policies → `docs/context/business-rules.md`; system design → `docs/context/architecture.md`; endpoints and payloads → `docs/api/api-contracts.md`.
3. **Reformat** (doc-creator): GitHub-flavored markdown, consistent headings, preserved code blocks, normalized fence languages. Give each imported rule an id in the existing scheme (`BR-NN`) so specs can cite it. Add front matter:
   ```markdown
   ---
   title: {Document Title}
   source: {original filename or URL}
   imported: {YYYY-MM-DD, from `date +%F`}
   type: business|architecture|api
   ---
   ```
4. **Merge, don't append blindly.** If the target exists, add new sections, flag contradictions between the import and the existing doc (or the code) for the user to resolve, and never drop existing content.
5. **Check the load path.** Confirm the project `CLAUDE.md` references the target file; if not, propose the one-line addition.

Do not invent content that is not in the source (`source-verification`). A claim in the import that the code contradicts is reported, not "fixed" in either direction.

## Audit Mode (`--audit`)

Checks whether docs and code still follow the project's own conventions.

1. **Collect the rules** from `CLAUDE.md`, `AGENTS.md`, and `.claude/rules/*.md` (each rule file applies only to its `paths:` globs). These are the conventions; do not import conventions from anywhere else. With `--source=<url>`, an external document is compared against the same rules (WebFetch, or Claude in Chrome for rendered pages).
2. **Check the code** (code-explorer): for each rule, find the files its globs cover and record compliant and violating examples with `file:line`. Typical rules: thin request handlers, typed data at layer boundaries, an access check on every endpoint, schema docs before schema changes, lowercase doc filenames.
3. **Check the docs**: every endpoint in the route definitions appears in `docs/api/api-contracts.md` and vice versa; every table or entity type the code defines has `docs/schemas/{table}.md`; business rules cite code that still exists at the cited line; docs reference no removed classes or paths.
4. **Report drift**, prioritized:

```
Docs and code audit (rules: CLAUDE.md, AGENTS.md, 5 rule files)

Critical
  1. Missing authorization: src/controllers/jobs/delete-job-controller:18 has no access check (rule: api-controllers.md "every endpoint authorizes")
High
  2. Doc-code mismatch: docs/api/api-contracts.md:44 says POST /api/jobs returns 200; the handler returns 201 (src/controllers/jobs/store-job-controller:31)
  3. Undocumented endpoints: DELETE /api/jobs/{job} (src/routes/api:27)
Medium
  4. Missing schema doc: job_applications (schema defined at src/schema/job-applications:1)
Low
  5. Uppercase doc filename: docs/API_NOTES.md

Rules checked: 14   passing: 10   failing: 4
Next: fix 1 via /sdd (bug route); regenerate the contracts with /write-docs --type=api
```

The audit only reports. Code fixes go through `/sdd`; doc fixes through generate or import mode.

---

## Quality Rules

- Follow the `source-verification` skill: every rule, endpoint, or claim cites a real `file:line`.
- Follow the `verification-gates` skill before reporting completion.

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Source not found` | Invalid path provided | Verify the source path exists |
| `No content extracted` | Source has no documentable content | Try a different source or type |
| `Uppercase filename detected` | Legacy naming attempted | Automatically converted to lowercase |

**Recovery**: check generated files for completeness, re-run with `--type` for specific sections, edit generated docs by hand where needed.

---

## Examples

### Quick business rules doc
```bash
/write-docs --type=business
```
Output: `docs/context/business-rules.md` with extracted rules.

### Full documentation suite
```bash
/write-docs --type=all
```
Output: `docs/context/business-rules.md`, `docs/context/architecture.md`, `docs/api/api-contracts.md`.

### Import a legacy doc
```bash
/write-docs --import docs/LEGACY_API.md --as=api
```
Output: merged into `docs/api/api-contracts.md` (lowercase, reformatted, front matter added).

---

## Output Examples

### business-rules.md
```markdown
# Business Rules

## Domain: Orders

### BR-01: Minimum Order Amount
**Source**: `src/services/order-service:45`
**Description**: Orders must meet minimum amount threshold
**Conditions**: Applied to all new orders
**Actions**: Reject orders below $10.00 with validation error
**Validation**: needs human validation

### BR-02: Inventory Check
**Source**: `src/services/order-service:78`
**Description**: Verify stock availability before order confirmation
**Conditions**: Applied during checkout process
**Actions**: Reserve inventory or show out-of-stock message
**Validation**: needs human validation
```

### api-contracts.md
````markdown
# API Contracts

## Endpoint: POST /api/orders

**Handler**: `src/orders/create-order:12`
**Authentication**: Required (Bearer token)
**Rate Limit**: 60/minute

### Request
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Order line items |
| shipping_address_id | integer | Yes | Delivery address |

### Response (201 Created)
```json
{
  "data": {
    "id": 123,
    "status": "pending",
    "total": "99.99"
  }
}
```
````

---

## Related Skills

- `/qa-and-docs` - Traceable QA plan and docs for already-shipped code
- `/sync-obsidian` - Publish verified docs to an Obsidian vault

## Best Practices

1. **Generate incrementally**: use `--type` for focused documentation
2. **Review and refine**: generated docs are starting points, not final
3. **Keep in sync**: re-run after significant code changes

---

## Subagent Orchestration

Use the Agent tool to delegate extraction to `code-explorer` (Steps 1-2 and the audit's code check), then hand the cited content to `doc-creator` to write the document:

```
Use the Agent tool with:
- subagent_type: "code-explorer"
- prompt: |
    Task: Extract documentable content from [SOURCE_PATH]

    Context:
    - Source: [file or directory path]
    - Doc type: [business|api|architecture]
    - Stack exploration recipe: [the recipe pasted by Step 0, or "none: infer the layout"]

    For business rules, extract:
    - Business-logic classes or functions
    - Input validation rules
    - Access checks
    - Domain events and their handlers

    For API docs, extract:
    - The route registry
    - The handler for each route
    - Request validation
    - Response serializers and structures

    Cite file:line for every item.
    Return: Structured content ready for documentation
```

```
Use the Agent tool with:
- subagent_type: "doc-creator"
- prompt: |
    Write [docs/context/business-rules.md | docs/api/api-contracts.md | ...] from this extracted content.
    Keep every file:line citation. Merge into the existing file if present; list contradictions instead of resolving them.
```
