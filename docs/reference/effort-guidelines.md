# Effort Scaling Guidelines

How much model, how many agents, and how many tool calls a task deserves in SDD Kit. This is the one place that covers model tiering, effort scaling, token budgets, and checkpointing; other docs link here instead of repeating it.

Based on Anthropic's multi-agent research system recommendations.

---

## Effort Levels

### Simple Tasks

| Metric | Value |
|--------|-------|
| **Agent Count** | 1 |
| **Tool Calls** | 3-10 |
| **Context Size** | < 10K tokens |
| **Typical Duration** | < 1 minute |

**Examples**:
- Fix a typo in documentation
- Add a simple field to a model
- Update a configuration value
- Write a single unit test
- Rename a variable
- Add a simple validation rule

**Characteristics**:
- Single file or few files affected
- Clear, unambiguous requirements
- No architectural decisions needed
- Immediate feedback on success/failure

---

### Medium Tasks

| Metric | Value |
|--------|-------|
| **Agent Count** | 2-4 |
| **Tool Calls** | 10-25 |
| **Context Size** | 10K-50K tokens |
| **Typical Duration** | 1-5 minutes |

**Examples**:
- Implement a new API endpoint
- Add a feature with tests
- Refactor a service class
- Create a database migration with seeder
- Build a React component with state
- Implement form validation

**Characteristics**:
- Multiple files affected (3-10)
- Some design decisions required
- May need to explore existing patterns
- Tests should be written
- Code review recommended

---

### Complex Tasks

| Metric | Value |
|--------|-------|
| **Agent Count** | 5-10+ |
| **Tool Calls** | 25-50+ |
| **Context Size** | 50K-200K tokens |
| **Typical Duration** | 5-30 minutes |

**Examples**:
- Implement a complete module
- Major refactoring across codebase
- Build a multi-step workflow feature
- Create a new domain with entities
- Implement authentication system
- Build real-time features (WebSocket)

**Characteristics**:
- Many files affected (10+)
- Architectural decisions required
- Cross-cutting concerns
- Multiple subagents with specializations
- Checkpointing recommended
- Multi-phase implementation

---

## Agent Allocation Guide

### By Task Type

| Task Type | Recommended Agents |
|-----------|-------------------|
| **Research/Discovery** | 1 (`code-explorer`) |
| **Comparison / decision** | the `tech-research` workflow (one research agent per option, then adversarial verification) |
| **Bug Fix** | 1-2 (`code-explorer` + stack dev) |
| **New Feature** | 3-4 (`code-explorer` + `api-architect` + stack dev + `test-writer`) |
| **Refactoring** | 2-3 (`code-explorer` + stack dev + `code-quality`) |
| **Full Module** | 5+ (full lifecycle, e.g. the `ship-feature` workflow) |
| **Security Audit** | single pass: 2-3 (`security-auditor` + `code-explorer` + `adversarial-reviewer`). Deep: the `security-audit` workflow runs recon on the standard tier, planning, critics and verifiers on deep, and hunters on standard. `budget` counts audit-agent invocations (4 recon, critics, one hunter per unit, verifiers), `maxUnits` caps hunters (default 12), and spend grows with hunters, so hand-offs use the quick profile |
| **Performance** | 2-3 (`performance-tester` + `code-explorer` + stack dev) |

"Stack dev" is the specialist the workflow's Detect phase picks from the stack registry, for example `laravel-backend-dev` or `nextjs-frontend-dev`. Schema work goes to `database-designer`; production log and monitoring analysis goes to `ops-analyst` in the `sdd-kit-ops` add-on. The full list is in the [agent index](agents.md).

### Subagent Specialization

For complex tasks, allocate specialized subagents:

```
Lead Orchestrator (1)
├── Discovery Subagent (1-2)
│   └── Explores codebase, finds patterns
├── Implementation Subagents (2-4)
│   └── laravel-backend-dev, nextjs-frontend-dev, database-designer
├── Quality Subagent (1-2)
│   └── test-writer, adversarial-reviewer, security-auditor
└── Documentation Subagent (0-1)
    └── Updates docs (doc-creator)
```

---

## Token Budget Guidelines

### By Complexity

| Complexity | Input Budget | Output Budget | Total |
|------------|-------------|---------------|-------|
| Simple | 5K | 2K | 7K |
| Medium | 20K | 10K | 30K |
| Complex | 80K | 40K | 120K |

### Optimization Strategies

1. **Use concise response format** by default
2. **Preload only relevant skills** through the agent's `skills:` frontmatter
3. **Return summaries** from subagents, not full transcripts
4. **Use checkpointing** for tasks exceeding 100K tokens
5. **Filter tool outputs** before returning to context

The `token-budget` hook enforces part of this: it always blocks `find` from the filesystem root, and once context usage (hinted via `CLAUDE_CONTEXT_USAGE`) reaches `CLAUDE_BUDGET_THRESHOLD` (default 75%) it also blocks unbounded reads of huge files, unscoped repo-wide greps, open-ended globs, and dumping full logs. See the [hooks reference](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/share/hooks/README.md).

---

## Model Tier Selection

Workflow phases name a **tier**, never a model. The tiers live in one place — `MODEL_TIERS` in `tools/stacks/runtime.template.js`, generated into `src/workflows/lib/stacks.js` and every workflow's registry region by `node tools/gen-stacks.mjs` (`verify.sh` fails if they are stale):

| Tier | Model | Effort | Use for |
|------|-------|--------|---------|
| `deep` | `opus` | `high` | Investigation, specs, adversarial review, acceptance, architecture and technology decisions |
| `standard` | `sonnet` | `medium` | Implementation, fixes, gate auto-fix, verification votes, test plans |
| `light` | `haiku` | `low` | Inventory and other mechanical work |

Each workflow maps its phases to tiers (`const MODELS = phaseModels({ detect: 'standard', review: 'deep', … })`) and every `agent()` call receives **both** `model` and `effort`. Without that, an `agentType` agent inherits its own frontmatter model, and effort falls back to the session default — both change silently between releases.

Agent frontmatter follows the same split: `haiku` + `effort: low` for mechanical agents (`changelog-writer`, `ops-analyst`), `opus` + `effort: high` for architects and reviewers.

### Per-host model mapping

The tier and effort are host-neutral; each host turns them into its own model choice, and this is the only page that does.

| Host | How a tier is applied |
|------|-----------------------|
| Claude Code | `MODEL_TIERS` above: the tier names a model alias and an effort on every `agent()` call |
| Codex | The bridge job packet carries the tier and effort as guidance; the subagent runs on the session's model, and the agent TOML files set no `model` |
| Cursor | The bridge job packet carries the tier and effort as guidance; installed agents use `model: inherit`, so the subagent runs on the model selected in the session |

To use a stronger model for `deep` jobs on Codex or Cursor, select it for the session before starting the run.

### Pinning: aliases vs. full IDs

- **Aliases** (`opus`, `sonnet`, `haiku`) re-point to the newest model of a tier on every release, and default effort can change with them. Fine for personal use — you pick up improvements with no edits.
- **Full IDs** (`claude-opus-5-5`, `claude-sonnet-5-5`, …) make runs reproducible across a team. Pin them in the plugin version you distribute by editing `MODEL_TIERS`, or per run without editing anything:

  ```js
  Workflow({ name: 'ship-feature', args: { spec: 'spec-PROJ-123-checkout', models: { deep: 'claude-opus-5-5', standard: { model: 'claude-sonnet-5-5', effort: 'high' } } } })
  ```

- Re-run your eval set before moving a team to a new pinned ID.
- Current IDs and prices change monthly — check the [models overview](https://docs.claude.com/en/docs/about-claude/models/overview) and [pricing](https://www.anthropic.com/pricing) pages rather than copying them into docs.

### Premium tiers (Fable) — opt-in only

Do **not** hardcode `fable` in agents, workflows, or `MODEL_TIERS`. It breaks portability:

- **Zero-data-retention (ZDR) orgs get `400` on every Fable request.** EU / regulated organizations commonly run ZDR for GDPR — a hardcoded `fable` stage fails for them. Availability is gated by retention config, not geography.
- **A premium price over the `opus` tier** (see the pricing page), on stages the framework already fans out in parallel.
- **Minutes-long turns** can trip workflow timeouts and fan-out assumptions.

If one hardest stage genuinely benefits, opt in per run (`args.models = { deep: 'claude-fable-5-1' }`) and document that ZDR orgs must leave it off.

---

## Cost Considerations

Multi-agent systems use approximately **15x more tokens** than single-agent chats, so the extra cost has to be justified. Use multi-agent approaches only when:

1. Task genuinely requires multiple specializations
2. Parallel exploration provides significant speedup
3. Quality requirements justify the additional cost
4. Task complexity warrants coordination overhead

### Cost-Effective Patterns

| Pattern | When to Use | Token Multiplier |
|---------|-------------|------------------|
| Single Agent | Simple tasks, clear requirements | 1x |
| Sequential Agents | Dependent tasks, handoffs | 2-3x |
| Parallel Agents | Independent exploration | 3-5x |
| Full Swarm | Complex research, major features | 10-20x |

### What a ship-feature run spends

Every ship-feature report ends with a Cost table: the agents each phase started and, when the run has a token budget, the tokens spent while that phase ran (`tokens: n/a` without one, as on the Codex and Cursor bridge). The same numbers are in the result's `cost` field, with the failed agent-name lookups. The phases that cost the most are bounded:

| Phase | Bound |
|-------|-------|
| Review | Two verifier votes per finding (`standard` tier), a third only when they split; a minor design finding gets one |
| Fix | At most 2 rounds, each a stack-agent fix, the gates on the changed files and a re-vote on the fixed findings |
| Converge | At most 2 audits; round-2 gaps are built once without a third audit |
| Gates | At most 3 auto-fix attempts per repo, scoped to the files the run changed |

Compare runs by the Cost table, not by wall time alone: a slow run that spent most of its agents in Fix points at the review findings, one that spent them in Gates at the build.

---

## Checkpointing Thresholds

Enable checkpointing when:

- Estimated context exceeds 50K tokens
- Task has 5+ distinct phases
- Multiple agents are coordinating
- Task may take > 10 minutes
- Recovery from failure is important

### How to checkpoint

1. **Summarize completed work** - keep architectural decisions and bugs found, drop the transcript
2. **Store it outside the context window** - in a file, not in conversation
3. **Spawn fresh agents** - start a new context with the checkpoint as input
4. **Resume without repetition** - build on prior work instead of redoing it

### Checkpoint Content

Save at each major phase:
1. **Progress summary** - What's been completed
2. **Key decisions** - Architectural choices made
3. **Files modified** - List with change descriptions
4. **Remaining work** - Outstanding tasks
5. **Context to preserve** - Important findings/constraints

### Where the kit stores checkpoints

| Source | Location |
|--------|----------|
| `/execute-task` session state | `.ai/session/<spec-folder>-state.json` (includes a `resume_hint`) |
| `pre-compact-save` hook | `.ai/session/pre-compact-<timestamp>.json` (active spec, task counts), written for manual recovery only; nothing reads it back. After compaction the `post-compact-context` hook (SessionStart, `compact` matcher) re-injects the top of the `docs/context/` files, the number of specs with pending tasks and the name of the latest `spec-*-state.json` |
| `fix-bug`, `greenfield-build` workflows | Git commits (failing regression test, scaffold) |

Durable lessons belong in Claude Code auto memory or agent memory (`memory: project`), not in checkpoints.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFORT SCALING                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  SIMPLE (1 agent, 3-10 calls)                               │
│  → Typos, single field, config changes                      │
│                                                              │
│  MEDIUM (2-4 agents, 10-25 calls)                           │
│  → New endpoint, component, refactor                        │
│                                                              │
│  COMPLEX (5-10+ agents, 25-50+ calls)                       │
│  → Full module, major feature, system redesign              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  - Default to SIMPLE, escalate only when needed             │
│  - Multi-agent = 15x tokens, use wisely                     │
│  - Checkpoint when > 50K tokens expected                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Documentation

- Framework Design Rules - Core principles
- [Agent index](agents.md) - Available agents
- [Skill index](skills.md) - Available skills
- [Hooks reference](https://github.com/stasmarkov/sdd-kit/blob/v4.1.0/share/hooks/README.md) - `token-budget`, `pre-compact-save`, and the rest

Source: Anthropic Engineering, "How we built our multi-agent research system".
