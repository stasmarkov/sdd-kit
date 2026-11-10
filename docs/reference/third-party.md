# Third-Party Skills and Plugins

Skills, plugins, and MCP servers run with your privileges, and their payload is often plain English instructions that static scanners miss (Snyk's 2026 ToxicSkills scan found critical issues in 13.4% of public skills). SDD Kit therefore **recommends** third-party components but never vendors them. Each one is listed in a manifest with its source, license, pinned commit, and risk notes.

- Manifest: `src/settings/third-party.json`
- Installer: `src/scripts/install-third-party.sh` (or `./install.sh --project --full --third-party`)

## Policy

1. **No vendoring.** `src/skills/` contains only skills owned by this kit, with one recorded exception: the Vendored section below. `verify.sh` fails if a manifest entry appears there.
2. **Pinned or nothing.** An entry is installable only with `status: "pinned"`, a full 40-character commit SHA, a source URL, and a license. `verify.sh` enforces this. Tags and branches move; commits don't.
   A `manual` entry is reviewed, licensed, and pinned for reference, but the installer leaves it to the user (it pre-approves risky tools or sits outside the kit's scope).
3. **Unlicensed means unverified.** Without a license we have no right to redistribute, and without a source we can't review updates. Such entries stay listed (so people know they exist and what they cost) but are never installed by the kit.
4. **Install into the project, not globally.** Global skills load into every session of every project. Prefer `.claude/skills/` in the projects that need design work.
5. **Decline in-skill self-updates.** Update by changing the pinned ref in the manifest after review.
6. **Review quarterly** (`reviewed` date in the manifest): re-read the diff since the pinned ref, check network calls and pre-approved tools, then move the pin.

## Review checklist (before pinning or moving a pin)

- [ ] License file present upstream and compatible with your use
- [ ] `allowed-tools` in SKILL.md: what does it pre-approve? (`Bash(npx …)` runs unpinned remote code)
- [ ] Bundled scripts: list them; grep for `fetch`, `http`, `curl`, `child_process`, `spawn`, and environment-variable reads
- [ ] Instructions telling the agent to fetch and run something, to disable permissions, or to send data anywhere
- [ ] SKILL.md size: anything over ~500 lines costs context every time it triggers
- [ ] Hooks, status lines, or MCP servers shipped by plugins

## Current status (reviewed 2026-10-19)

| Component | Status | Notes |
|---|---|---|
| `impeccable` (skill) | pinned `skill-v4.6.0` | Apache-2.0. **High risk:** Node scripts pre-approved in `allowed-tools`; contacts impeccable.style (version check that prompts an unpinned `npx impeccable update`, and it sends your concept choice back); image generation sends prompts to OpenAI using `OPENAI_API_KEY`. The globally installed copy matched no tagged release: it had been updated in place. |
| 13 design skills (taste-skill, soft, minimalist, brutalist, redesign, output, gpt-taste, stitch, brandkit, imagegen-web/mobile, image-to-code, taste-skill-v1) | unverified | No license, no author, no source in the files. Not installable from the kit. Four have 800–1,465-line SKILL.md files. Replace with licensed alternatives, or pin them once an upstream with a license is identified. |
| Plugins: figma, frontend-design, postman, context7 | recommended | Official marketplace; versions recorded in the manifest. |
| Plugins: phpstorm-plugin, caveman | recommended | Third-party marketplaces, pinned commits recorded. Both ship hooks; caveman also adds a status line. |
| Stripe skills: `stripe-best-practices`, `upgrade-stripe` (skills) | pinned `a8813a70` | Published by Stripe (MIT, `github.com/stripe/ai`, path `providers/claude/plugin/skills/<name>`). No `allowed-tools`, no scripts; `upgrade-stripe` looks up the current API version live. Earlier versions of this kit vendored copies in `src/skills`, which broke policy 1 and pinned a dated API version that goes stale. `./install.sh --project --third-party` installs Stripe's own copy. The kit keeps the generic payment-gateway and webhook-verification guidance in `laravel-12` → `references/external-integrations.md`. |
| `stripe-projects` (skill) | manual | Same repo and license. Reviewed but not installed by `--third-party`: it pre-approves `Bash(stripe *)` and `brew install` of the Stripe CLI, and provisioning a stack overlaps `greenfield-build`. To use it, copy `providers/claude/plugin/skills/stripe-projects` from the pinned commit into `.claude/skills/stripe-projects` together with the repo's `LICENSE`. |
| Playwright MCP (`@playwright/mcp`, MCP server) | shipped by default, pinned by version | Microsoft, Apache-2.0. Unlike the other entries it ships with the kit: it is pinned by version in the plugin's `.mcp.json`, `src/mcp-configs/development.json`, and the installer, and runs `--headless --isolated` (no window, no profile kept between runs). **Risk:** it drives a real browser against the URLs a workflow is given, so it can submit forms and reach anything that browser can reach. Give workflows a local or staging dev URL, never production. |
| Plugin: skill-creator | recommended | Anthropic's official skill authoring and eval plugin (Apache-2.0), from `claude-plugins-official`. Useful when you write or tune your own skills; not needed to build products. Earlier versions of this kit vendored a copy without its LICENSE. |

## Vendored

| Skill | Source | Pinned commit | License |
|---|---|---|---|
| `security-audit` | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) | `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` | MIT, Copyright (c) 2025-2026 Cloudflare, Inc. (`src/skills/security-audit/LICENSE`) |

It is copied, not recommended, because the `security-audit` workflow checks its validators and references against pinned hashes, which only works for files the kit ships. Changes from upstream are path-only and listed in `src/skills/security-audit/references/upstream-changes.md`. It is not in `src/settings/third-party.json`. Rationale: ADR 0005.

The installer prints the plugin commands. It never runs them: installing a plugin is a decision for each user or team.
