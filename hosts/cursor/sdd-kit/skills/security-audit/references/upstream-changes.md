# Changes from upstream

Source: https://github.com/cloudflare/security-audit-skill at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (MIT, Cloudflare). `LICENSE` is byte-identical to upstream. The method text is unchanged; only paths and the frontmatter differ.

## Layout

| Upstream | Here |
|----------|------|
| `SKILL.md` | `SKILL.md` |
| `HUNTING.md`, `RECONNAISSANCE.md`, `VALIDATION-AND-REPORTING.md`, `ATTACK-CLASSES.md` | `references/hunting.md`, `references/reconnaissance.md`, `references/validation-and-reporting.md`, `references/attack-classes.md` |
| `AI-AND-LLM.md`, `CLIENT-SIDE.md`, `CLOUD-AND-DEPLOYMENT.md`, `DATA-ISOLATION-AND-LIFECYCLE.md`, `DESKTOP-MOBILE-AND-LOCAL-IPC.md`, `MEMORY-SAFETY-AND-BINARY.md`, `PROTOCOLS-RPC-AND-MESSAGING.md`, `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md`, `SUPPLY-CHAIN-AND-RELEASE.md`, `WEB-PROTOCOL-AND-AUTH.md` | the same names, lowercase, under `references/` |
| `report-schema.json`, `validate-findings.cjs`, `validate-coverage-ledger.cjs` | the same files under `scripts/` |
| `validate-findings.test.cjs`, `validate-coverage-ledger.test.cjs` | the same files under `test/` |
| `LICENSE` | `LICENSE` (verbatim) |

## Edited files

- `SKILL.md`: frontmatter replaced (`name`, shortened `description`, `license`, `user-invocable: false`, string `metadata` with `upstream`, `upstream_commit`, `version`); links to companions point at `references/<lowercase>.md`.
- `references/*.md` (the 14 companions): links and backticked names to other companions use the lowercase names; block references in fenced examples read `references/attack-classes.md#Access control`; `<skill-dir>/validate-*.cjs` became `<skill-dir>/scripts/validate-*.cjs`.
- `test/*.test.cjs`: requires and `__dirname` paths point at `../scripts/`.
- `scripts/*`: unchanged.
