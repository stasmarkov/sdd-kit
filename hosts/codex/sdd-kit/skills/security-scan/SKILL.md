---
name: security-scan
description: Use for a security check before a release or after new dependencies or auth code. Audits dependencies, scans for injection, XSS, secrets and missing authorization.
argument-hint: "--full | --quick | --dependencies | --code | --owasp"
allowed-tools: Bash, Read, Grep, Glob
metadata:
  version: "2.2"
  subagents: "security-auditor"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /security-scan

Run security scans: dependency vulnerability audits, code analysis, and OWASP compliance. `--dependencies` also lists outdated and unused packages; they are not security findings on their own, so they go in their own table, not in the severity counts. Everything here is read-only: nothing is installed, updated, or removed.

In a polyrepo project, run each repo's checks in that repo and report per repo. Resolve each repo's stack data (the `audit` list) with the recipe in the `verification-gates` skill; for a manifest from the project, the user config or a third-party plugin, run an `audit` command only when `node ../stack-trust/scripts/trust-store.mjs --host codex check <manifest file>` reports it trusted, otherwise print `not run (untrusted manifest). Fix: run /stack-trust.`

## Usage

```bash
# Full security scan (dependencies + code + OWASP)
/security-scan --full

# Quick dependency scan
/security-scan --quick

# Dependency vulnerabilities only
/security-scan --dependencies

# Code analysis only
/security-scan --code

# OWASP compliance check
/security-scan --owasp
```

## Dependency Analysis

### Audit (Vulnerabilities)

Run each entry of the stack manifest's `audit` list (`{name, command}`) in its repo, with the package manager the lockfile names (the `verification-gates` rule). With no manifest (`stack manifest not found`), run the audit command the repo's package manager offers and say so. An audit tool that is not installed is reported as not run, never as "none found".

### Outdated and unused packages (`--dependencies`)

Use the package manager's `outdated` listing in JSON form (direct dependencies only), plus an unused-dependency tool when the repo has one installed. Report one table: package, current → latest, type (patch / minor / major), advisory (Y/N), and a separate list of unused direct dependencies with the tool's evidence. A tool that is not installed is reported as not run, never as "none found". Acting on the table is `/upgrade-deps` (`--patch`, `--minor`, `--major=<package>`).

### Code Analysis

Scan the changed and entry-point code for these classes. The stack add-on's `references/quality-tools.md` lists the exact grep patterns for its framework.

- **SQL injection**: raw queries built from input; check that every raw query uses bindings.
- **XSS**: unescaped template or HTML output, including the UI framework's raw-HTML escape hatch.
- **CSRF**: state-changing routes without the framework's CSRF or token protection.
- **Authentication**: hardcoded credentials in config and example env files; middleware or guard bypasses.
- **Server-side handlers** (server actions, route handlers, API controllers): each is a public endpoint reachable without the UI. Hiding a button is not authorization. Each must re-verify the session and the caller's role or ownership on the server before it reads or changes data, and must validate its input. Report every handler that changes data without a server-side session and role check as HIGH; one that relies on route middleware alone as MEDIUM (middleware matchers miss handlers posted to other routes). The rule that prevents this at write time lives in the project's path-scoped `.codex/rules` (installed by the stack add-on).

### OWASP Top 10 Checks

#### A01: Broken Access Control
- [ ] Authorization policies on all endpoints
- [ ] Role-based access control implemented
- [ ] Resource ownership verification

#### A02: Cryptographic Failures
- [ ] Strong password hashing (bcrypt/argon2)
- [ ] Encrypted sensitive data at rest
- [ ] TLS for data in transit

#### A03: Injection
- [ ] Parameterized queries used
- [ ] Input validation via DTOs
- [ ] No raw SQL execution

#### A04: Insecure Design
- [ ] Rate limiting implemented
- [ ] Input length limits
- [ ] Secure session management

#### A05: Security Misconfiguration
- [ ] Debug mode disabled in production
- [ ] Error messages don't leak info
- [ ] Security headers configured

#### A06: Vulnerable Components
- [ ] Dependencies up to date
- [ ] No known vulnerabilities
- [ ] Regular security patches

#### A07: Authentication Failures
- [ ] Multi-factor authentication option
- [ ] Account lockout after failures
- [ ] Secure password requirements

#### A08: Data Integrity Failures
- [ ] Signed JWTs/tokens
- [ ] Integrity checks on data
- [ ] Audit logging enabled

#### A09: Logging & Monitoring
- [ ] Security events logged
- [ ] Log injection prevented
- [ ] Monitoring alerts configured

#### A10: SSRF
- [ ] URL validation on external requests
- [ ] Allowlist for external services
- [ ] Network segmentation

## Security Report

### Severity Levels
```
🔴 CRITICAL - Immediate action required
🟠 HIGH - Fix within 24 hours
🟡 MEDIUM - Fix within 1 week
🟢 LOW - Fix in next release
```

## Output Format

```
Security Scan Report

Dependency Vulnerabilities:
  api: 0 critical, 1 high, 2 medium, 3 low
  web: 0 critical, 0 high, 1 medium, 4 low

Code Analysis:
  SQL Injection:    PASS
  XSS Prevention:   2 warnings (files listed)
  CSRF Protection:  PASS
  Authentication:   PASS
  Server-side handlers: 1 HIGH (app/jobs/actions.ts:12 deletes without a role check)

OWASP Compliance: 8/10 (A05 Misconfiguration, A06 Components need review)

Priority Actions:
  1. [severity] Description + fix command
  2. ...
```

With `--dependencies`, add the outdated and unused tables after the severity summary. To act on them, the user runs `/upgrade-deps`.

For a deeper, coverage-led audit with verified findings, see the security-audit workflow and the comparison in USAGE-EXAMPLES section 10 (`/sdd` routes there).

**Source Verification**: Follow the `source-verification` skill.

