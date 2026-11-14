---
name: investigate
description: Research a technical problem or evaluate a technology inline - searches the codebase and framework docs, compares options in a pros/cons table, ends with a recommendation, implementation steps and a testing strategy. Use for a quick answer to "how should we do X" or "which library fits" before coding. For a verified decision with an ADR, use /tech-research.
argument-hint: "[problem-or-topic] | --tech | --compare --options=A,B,C | --approach=options"
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch
metadata:
  mcp-tools: "context7"
  version: "2.0"
---

# /investigate

Research technical solutions, evaluate technologies, and compare implementation approaches in the current session.

## Usage

```bash
# Investigate a problem
/investigate "how to implement rate limiting"

# Research a technology
/investigate --tech "Redis caching strategies"

# Compare alternatives
/investigate --compare "queues" --options="Redis,SQS,RabbitMQ"

# Framework-specific research
/investigate --laravel "queue job batching"
/investigate --nextjs "server actions vs api routes"
```

## Investigation Process

### Step 1: Problem/Topic Analysis
- Understand requirements and constraints
- Define success criteria
- Identify whether this is a problem investigation or technology evaluation

### Step 2: Research Phase
```bash
# Search documentation (context7 MCP)
# Search codebase for existing solutions
grep -r "relevant_pattern" . --include="*.<ext>"

# For --tech mode: check official docs, community adoption, compatibility
```

### Step 3: Comparison (if --compare or --tech)

| Approach | Pros | Cons | Complexity | Compatibility |
|----------|------|------|------------|---------------|
| Option A | ... | ... | Low | Framework native |
| Option B | ... | ... | Medium | Via package |

### Step 4: Recommendation
- Concrete recommendation with rationale
- Implementation steps
- Code examples where helpful
- Testing strategy
- Migration path (for --tech)

## MCP Integration

### Context7 (Documentation)
- Search the framework and package documentation

### Web pages
- WebFetch first, for URL references and static docs.
- For JavaScript-rendered docs, interactive examples, or pages behind a login, use Claude in Chrome when it is connected; otherwise ask the user to paste the relevant part.

### Codebase
- Grep, Glob and Read are the default. The optional Serena MCP server, when the session has it, can resolve symbols and references faster; nothing here depends on it.

## Output Format

```
Investigation: {Topic}

Requirements: {bulleted list}

Research Findings:
  1. {finding with source}
  2. ...

Approaches Compared: (if multiple options)
  A. {approach} - Recommended
  B. {approach}

Recommendation: {concrete choice with rationale}

Implementation: {steps or code example}

Testing Strategy: {how to verify}
```

**Source Verification**: Follow the `source-verification` skill.

