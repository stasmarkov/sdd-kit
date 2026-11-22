# Skill Template Guide

This directory contains templates for creating new skills following the [official Claude Code skills spec](https://code.claude.com/docs/en/skills).

## Skill Directory Structure

```
.claude/skills/{skill-name}/
├── SKILL.md                    # Required: Core instructions (loaded when triggered)
├── references/                 # Optional: Detailed docs (loaded on demand)
│   ├── advanced-usage.md
│   ├── api-reference.md
│   └── troubleshooting.md
├── scripts/                    # Optional: Executable code
│   ├── generate.sh
│   └── validate.py
└── assets/                     # Optional: Output files (NOT loaded into context)
    └── templates/
        ├── component.tsx
        └── service.<ext>
```

## Official Frontmatter Fields

Only use fields from the official Claude Code spec:

```yaml
---
name: skill-name              # Lowercase, hyphens only (max 64 chars)
description: What it does...  # Include "Use when..." for discovery
user-invocable: false          # false = background knowledge only
disable-model-invocation: true # true = manual /invoke only
allowed-tools: Read, Grep, Glob
model: sonnet                  # Optional: model override
context: fork                  # Optional: run in subagent
agent: Explore                 # Optional: subagent type (with context: fork)
argument-hint: "[filename]"   # Optional: autocomplete hint
---
```

### Invocation Control

| Setting | You invoke | Claude invokes | Use for |
|---------|-----------|----------------|---------|
| (default) | Yes | Yes | General skills |
| `disable-model-invocation: true` | Yes | No | Workflows with side effects |
| `user-invocable: false` | No | Yes | Background knowledge |

### Additional Optional Fields (Anthropic Skills Spec)

These fields are valid per the official Anthropic "Complete Guide to Building Skills for Claude":
- `license` - License identifier for open-source skills (MIT, Apache-2.0)
- `compatibility` - Environment requirements (1-500 chars)
- `metadata` - Custom key-value pairs (author, version, mcp-server, category, tags)

### Fields NOT in the Official Spec (Do Not Use)

These fields are silently ignored by Claude Code:
- `dependencies` - Not supported (use `compatibility` instead)

## Creating a New Skill

### 1. Create Directory
```bash
mkdir -p .claude/skills/{skill-name}
mkdir -p .claude/skills/{skill-name}/references
```

### 2. Copy Template
```bash
cp .claude/templates/skills/_templates/SKILL.template.md .claude/skills/{skill-name}/SKILL.md
```

### 3. Edit SKILL.md
- Replace all `{{placeholders}}`
- Keep description under 1024 characters (include WHAT + WHEN + trigger phrases)
- Keep body under 500 lines
- Move detailed content to `references/`

### 4. Add Resources (if needed)
- `references/` - Markdown files with detailed documentation
- `scripts/` - Shell/Python scripts for automation
- `assets/templates/` - Code templates for scaffolding

## Best Practices

### Description Writing
```yaml
# Good (specific trigger + action)
description: Billing API patterns. Use for services, models, controllers.

# Bad (too long, vague)
description: This skill provides comprehensive patterns including
layered service architecture, ORM best practices, single-action controllers,
and modern language patterns for building API backends.
```

### Token Efficiency
> "The context window is a public good. Only add information Claude doesn't already possess."

- Don't explain basic language syntax
- Don't repeat framework documentation
- Focus on YOUR team's specific patterns
- Keep SKILL.md concise, use references for depth

### Progressive Disclosure

| Level | Location | When Loaded |
|-------|----------|-------------|
| 1 | Description in frontmatter | Always (in skill list) |
| 2 | SKILL.md body | When skill is invoked |
| 3 | `references/` files | When Claude determines need |
| 4 | `assets/` files | Never (used for output only) |

### Dynamic Context

Skills support string substitutions:
- `$ARGUMENTS` - All arguments passed when invoking
- `$ARGUMENTS[N]` or `$N` - Specific argument by index
- `${CLAUDE_SESSION_ID}` - Current session ID
- `` !`command` `` - Shell command output (preprocessing)

## What NOT to Include

Per official guidelines, do NOT create:
- `README.md` in skill directories (use SKILL.md)
- Version/date footer metadata
- Non-standard frontmatter fields
- Basic syntax Claude already knows

Include only files that directly support skill functionality.

---

**Spec**: Official Claude Code Skills (https://code.claude.com/docs/en/skills)