# Team marketplace

How a team or organization rolls this framework out through its own plugin marketplace: one catalog repo you control, the core plugin plus the add-ons you approve, each pinned to a reviewed version, enabled per project, and optionally enforced with managed settings.

Why a team marketplace instead of pointing everyone at this repository:

- **Pinned, reviewed versions.** Everyone runs the release you tested, not whatever was pushed last.
- **One place to approve add-ons.** The catalog lists only what the team has vetted (core, `ops`, `design`, ...), alongside your own internal plugins.
- **Policy.** Managed settings can allow only your marketplace and force-enable the core plugin.

Key names and source formats below follow the Claude Code docs: [Create a marketplace](https://code.claude.com/docs/en/plugins/create-marketplace), [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), and [Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org).

This page covers Claude Code. For other hosts, see [hosts.md](hosts.md) for what each supports:

- **Codex** reads `.agents/plugins/marketplace.json`, which the distribution repo ships beside the Claude marketplace. Add it with `codex plugin marketplace add <owner>/<repo>`, and have each developer approve the kit's hooks through `/hooks`.
- **Cursor** team marketplaces need a Teams or Enterprise plan and are set up in the dashboard: Plugins & MCPs, Add Marketplace, Import from Repo. There is no CLI step for this. Without a team plan, use `install.sh --host cursor` per project.

Both hosts are an unverified preview.

## 1. Create the marketplace repo

```
your-org/claude-marketplace/
└── .claude-plugin/
    └── marketplace.json
```

The catalog points at the kit's public distribution repository, `stasmarkov/sdd-kit`; it does not copy it. Every plugin there lives in `plugins/<name>/` (the core in `plugins/sdd-kit/`, add-ons in `plugins/sdd-kit-<addon>/`), so each entry uses a `git-subdir` source. Pin every entry with `ref` (a release tag) and `sha` (the full 40-character commit of that tag). When both are set, Claude Code checks out `sha`, so a moved or deleted tag cannot change what your team installs.

```json
{
  "name": "your-org-claude",
  "description": "Approved Claude Code plugins for Your Org",
  "owner": { "name": "Platform Team", "email": "platform@your-org.example" },
  "plugins": [
    {
      "name": "sdd-kit-laravel-nextjs",
      "description": "Preset: the core plus the Laravel, Next.js and devenv add-ons.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-laravel-nextjs",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit",
      "description": "Spec-driven core: /sdd, workflows, agents, skills, hooks.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit-laravel",
      "description": "Laravel agent, skills, rules and hooks.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-laravel",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit-nextjs",
      "description": "Next.js agent, skills, rules and hooks.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-nextjs",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit-devenv",
      "description": "docker and ddev skills.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-devenv",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit-ops",
      "description": "Deploy, rollback, feature flags, health checks, incident response.",
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-ops",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    },
    {
      "name": "sdd-kit-design",
      "description": "UI design add-on: ui-ux-advisor agent and design-ui skill.",
      "defaultEnabled": false,
      "source": {
        "source": "git-subdir",
        "url": "stasmarkov/sdd-kit",
        "path": "plugins/sdd-kit-design",
        "ref": "v4.1.1",
        "sha": "<40-char commit sha of v4.1.1>"
      }
    }
  ]
}
```

Notes:

- Keep each entry's `name` identical to the `name` in that plugin's own `.claude-plugin/plugin.json`; the entry name is the install id (`<name>@your-org-claude`) and the key written to `enabledPlugins`.
- Get the commit for a tag with `git ls-remote https://github.com/stasmarkov/sdd-kit refs/tags/v4.1.1` (use the `^{}` line for annotated tags).
- If you fork the framework, point `repo` / `url` at your fork. A fork is the right choice when you carry local changes; otherwise reference upstream.
- Stack add-ons are separate entries (`plugins/sdd-kit-laravel`, `plugins/sdd-kit-nextjs`, `plugins/sdd-kit-devenv`) that the preset resolves from your catalog. The preset `sdd-kit-laravel-nextjs` (`plugins/sdd-kit-laravel-nextjs`) is the first entry above: it only declares dependencies on the core and those three add-ons, so list all of them in your catalog too, pinned like the preset.
- List only the add-ons you approve. `ios` and `drupal` can be added the same way (`path: plugins/sdd-kit-ios`, `plugins/sdd-kit-drupal`).
- `defaultEnabled: false` makes an add-on opt-in even after install.

Validate before pushing:

```bash
claude plugin validate ./claude-marketplace
```

Then test the full loop on your machine:

```bash
claude plugin marketplace add ./claude-marketplace
claude plugin install sdd-kit-laravel-nextjs@your-org-claude
claude plugin details sdd-kit-laravel-nextjs
```

Push the repo. Teammates register it with `claude plugin marketplace add your-org/claude-marketplace`. For a private repo, each user needs read access through their git credentials; CI needs a token (on GitHub Actions: export `GH_TOKEN` and run `gh auth setup-git`).

## 2. Enable plugins per project

Commit this to each application repo's `.claude/settings.json`. Contributors get the marketplace registered after they accept the workspace trust dialog, and the listed plugins enabled for that project only:

```json
{
  "extraKnownMarketplaces": {
    "your-org-claude": {
      "source": { "source": "github", "repo": "your-org/claude-marketplace" }
    }
  },
  "enabledPlugins": {
    "sdd-kit-laravel-nextjs@your-org-claude": true,
    "sdd-kit-ops@your-org-claude": true
  }
}
```

Because the plugin entries point at an external source (this framework's repo), each contributor installs once per project:

```bash
claude plugin install sdd-kit-laravel-nextjs@your-org-claude --scope project
```

Until then Claude Code reports `Plugin "<name>" is enabled in project settings but isn't installed`.

Choose add-ons per project: a backend-only service might enable only the core plugin; a project with a production on-call rotation adds `-ops`; a design-heavy frontend adds `-design`. To switch a plugin off for one project when it is on elsewhere, set it to `false`.

In headless runs (`claude -p`, CI), `extraKnownMarketplaces` from a repo's settings applies only in a folder whose trust was accepted. Installs run in the background, so set `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` if the first turn needs the plugin. For containers that cannot clone at runtime, pre-build a seed with `CLAUDE_CODE_PLUGIN_CACHE_DIR` and point `CLAUDE_CODE_PLUGIN_SEED_DIR` at it.

## 3. Enforce with managed settings (organization rollout)

Managed settings apply to every machine and cannot be overridden by users. Deliver them from the claude.ai admin console (server-managed settings), MDM, or a `managed-settings.json` at the platform's system path.

This policy allows only the official marketplace and your org's repositories, registers your marketplace, force-enables the core plugin, and blocks sideloading:

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "anthropics/claude-plugins-official" },
    { "source": "github", "repo": "your-org/*" },
    { "source": "skills-dir" }
  ],
  "extraKnownMarketplaces": {
    "your-org-claude": {
      "source": { "source": "github", "repo": "your-org/claude-marketplace" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "sdd-kit@your-org-claude": true
  },
  "disableSideloadFlags": true
}
```

What each key does:

| Key | Effect |
|-----|--------|
| `strictKnownMarketplaces` | Allowlist of marketplace **sources**. Anything else fails with `is blocked by enterprise policy`. `[]` blocks every source, including the official one. It does not register anything by itself. Entries match exactly on `repo`, `ref`, and `path`; `your-org/*` matches every repo under that owner; `hostPattern` covers a GitHub Enterprise or GitLab host |
| `{ "source": "skills-dir" }` | Keeps plugins under `~/.claude/skills/` and `.claude/skills/` loading while an allowlist is set. Drop it to block them |
| `extraKnownMarketplaces` | Registers the marketplace on every machine. Its source must pass the allowlist. `autoUpdate` set here overrides the user's toggle |
| `enabledPlugins` | `true` force-enables (users cannot disable it), `false` blocks the plugin at every scope and hides it. Use `false` to block one plugin inside an allowed marketplace |
| `disableSideloadFlags` | Rejects `--plugin-dir`, `--plugin-url`, and similar flags, which the allowlist does not cover |

The allowlist matches the **marketplace** source (`your-org/claude-marketplace`), not the plugin sources inside it, so the catalog may reference this framework's public repository while users can only add your org's marketplaces.

To roll out to a single repository's contributors instead of the whole fleet, use the project settings from section 2.

## 4. Update and pinning policy

Recommended policy:

1. **Pin every entry** to a release tag plus its commit `sha`. Never point entries at a branch (`main`) in the team catalog.
2. **Upgrade through a pull request to the marketplace repo.** The PR bumps `ref` and `sha` for the plugins being upgraded and links the framework's CHANGELOG for that range.
3. **Gate the PR on evidence.** Before merging, run the framework's eval suite at the new version (see evals.md): median of at least 5 runs per case, compared against the current pinned version and the no-plugin baseline. A lower median blocks the upgrade until explained.
4. **Pilot first.** For larger upgrades, run two marketplaces — e.g. `your-org-claude-latest` (new ref) for a pilot group and `your-org-claude` (current ref) for everyone else — and assign them per group with separate endpoint-managed settings. Promote by moving the stable catalog to the new ref.
5. **Upgrade core and add-ons together.** The add-ons are released from the same repository and version; keep their `ref` equal to the core's.
6. **Rerun evals on every model release**, not only framework releases: a model change can regress behavior under an unchanged pin.
7. **Review quarterly.** Remove add-ons nobody enabled in the last two months.

How users receive an upgrade once the catalog changes:

- With `autoUpdate: true` on the marketplace, Claude Code refreshes it in the background and installs the new pinned version; a restart applies it.
- Manually: `claude plugin marketplace update your-org-claude`, then `claude plugin update sdd-kit@your-org-claude`, then restart.
- Turning off all auto-updates for a fleet: set `"env": { "DISABLE_AUTOUPDATER": "1" }` in managed settings (add `"FORCE_AUTOUPDATE_PLUGINS": "1"` to keep plugin updates while freezing Claude Code itself).

The plugin's own `version` in `plugin.json` also pins: users stay on a version until it changes, so every framework release must bump it (the tag and `version` should agree; `claude plugin tag` creates a `{name}--v{version}` tag and checks that `plugin.json` and the marketplace entry match).

## Verify the rollout

- Interactive: run `/plugin`; your marketplace and the enabled plugins are listed.
- CI: `claude -p "ok" --output-format stream-json --verbose` and check the `plugins` list in the `init` event.
- Policy problems: `/status` should list `Enterprise managed settings` under setting sources; blocked sources show `is not in the allowed marketplace list` or `is blocked by enterprise policy`.
