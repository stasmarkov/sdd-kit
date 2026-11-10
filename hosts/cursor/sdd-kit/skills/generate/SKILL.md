---
name: generate
description: Generate code scaffolding that follows project conventions - controllers, services, data objects, repositories, models, CRUD and API resource sets, pages, components, hooks, route handlers and test stubs - from the templates of the stack's scaffold skills (the manifest's skills.scaffold). Use when starting a new component or entity and you want boilerplate that already matches the project's patterns instead of writing it by hand.
argument-hint: "[type] [name] | --crud=[entity] | --api=[resource] | --frontend [page|component|hook|route] [name]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
metadata:
  version: "2.0"
  last_verified: "2026-10-22"
  next_review: "2027-01-22"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /generate

Generate scaffolding that matches the project's patterns. The templates live in one place, the scaffold skills' assets; this skill picks the right one, fills the placeholders, and adapts it to what the project already does.

## Usage

```bash
# Backend components
/generate controller CreateUser
/generate service User
/generate dto CreateUser
/generate repository User
/generate model User

# CRUD scaffolding (model, migration, factory, data objects, repository, service, controllers, resource, policy, tests)
/generate --crud=Order

# API resource set (controllers, resource, data objects, routes)
/generate --api=Product

# Frontend
/generate --frontend page Dashboard
/generate --frontend component ProductCard
/generate --frontend hook Orders
/generate --frontend route Orders

# Test stub
/generate test UserService
```

## Template sources

1. **Resolve the stack data** with the recipe in the `verification-gates` skill, for the repo the artifact belongs to. The manifest's `skills.scaffold` lists the skills whose `assets/templates/` hold the templates (and `scaffold.command` the project generator). A manifest from the project, the user config or a third-party plugin that is not trusted (`node ../stack-trust/scripts/trust-store.mjs --host cursor check <manifest file>`) is not used: print `not run (untrusted manifest). Fix: run /stack-trust.`
2. **Read the stack add-on's `references/generate-templates.md`** (in its scaffold skill) for the artifact-to-template table, namespaces or paths, the CRUD file set and the wiring steps.
3. No manifest (`stack manifest not found`) or no scaffold skill: say so, suggest `/new-stack`, and generate only by copying the closest existing file in the repo.

Paths are relative to the kit's skills directory (`.cursor/skills/` in file-copy installs, `skills/` in the plugin).

## How to generate

1. **Read the project first.** Grep for an existing service, data object, and controller. If the project already uses different namespaces or a module layout, follow the project, not the template. The project's `.cursor/rules/` files, when present, win over both.
2. **Read the template**, replace the placeholders (`{{Entity}}`, `{{entity}}`, `{{entities}}`, `{{Module}}`, `{{Action}}`), and delete the sections that do not apply.
3. **Use the project's generator where it adds wiring** (the manifest's `scaffold.command` or the framework CLI), then replace the generated bodies with the template's.
4. **Wire it**: register bindings, routes and authorization checks as the stack's reference describes.
5. **Schema first**: for a new table, write `docs/schemas/{table}.md` (the `schema-first` skill) before the migration; `/design-schema` helps.
6. **Run the gates** (`verification-gates`) for every repo touched.

## CRUD set (`--crud=Order`)

A full CRUD set is a model, migration, factory, data objects, repository, service, one controller per action, a resource, a policy and tests on the backend, plus types, an API client, pages and components on the frontend. The exact file list per stack is in the add-on's `references/generate-templates.md`. It is several layers and usually more than three files: for anything beyond scaffolding (business rules, authorization per role), plan it with `/write-spec` first.

## Output

```
Generated: CRUD scaffolding for Order

Created
  <model, migration, factory>
  <data objects, repository, service, controllers, resource, policy, tests>
Wired
  <bindings and routes>
Gates
  [PASS] format  [PASS] types  [PASS] tests (5 stubs, marked todo)

Next
  1. Fill the schema doc and migration columns
  2. Add the business rules to the service and the data objects' validation
  3. Run /run-tests --filter=Order
```

**Source Verification**: Follow the `source-verification` skill.
