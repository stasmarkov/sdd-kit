# The Golden Triangle

Three short documents give Claude the business context the code cannot show. The project `CLAUDE.md` lists them under "Always load", so every session starts with them.

| Document | Path | Answers | Starting structure |
|----------|------|---------|--------------------|
| Business rules | `docs/context/business-rules.md` | What the system must enforce: prohibitions, money rules, authorization, data integrity | [business-rules.template.md](business-rules.template.md) |
| Architecture | `docs/context/architecture.md` | How it is built: layers, modules, boundaries, patterns, conventions | [architecture.template.md](architecture.template.md) |
| API contracts | `docs/api/api-contracts.md` | The request and response shapes, status codes, and error codes the frontend relies on | the `api-contracts.md` format in the `write-docs` skill |

The development process is not a fourth document. It lives in the kit itself (`/sdd`, specs, verification gates) and in the project's `AGENTS.md` (commands, red lines).

## Creating them

Generate them from the code, never from memory:

```
/write-docs --type=all                              # all three, every rule and contract cites file:line
/write-docs --type=business                         # one at a time
/write-docs --import <file|url> --as=business       # rules that already live in a wiki, PDF, or ticket
```

`write-docs` starts a missing business-rules or architecture document from the templates in this folder (it ships byte-identical copies in its own `assets/`) and fills it from the code. Generated business rules describe what the code does, which is not always what the business wants: each carries `**Validation**: needs human validation` until someone confirms it. For a new product, `/product-brief` writes the draft rules first (`BR-01`…); once the owner validates them, `docs/context/business-rules.md` keeps the same ids.

## Keeping them useful

- **Short.** One to three pages each. Long context gets skimmed, and skimmed rules are the ones that get broken.
- **One fact, one place.** Commands and red lines go in `AGENTS.md`, area conventions in `.claude/rules/*.md`, and only what is left in these three files.
- **Linked, not copied.** Summarize and link to schema docs (`docs/schemas/`), ADRs (`docs/adr/`), and specs for detail.
- **Checked.** `/write-docs --audit` reports rules that cite code that moved, endpoints missing from the contract, and docs that name removed classes.
- **Re-injected after compaction.** The post-compact hook prints the top of `business-rules.md` and `architecture.md` so a long session keeps the rules. Put the most important rules first.
