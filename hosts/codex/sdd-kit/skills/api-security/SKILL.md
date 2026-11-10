---
name: api-security
description: API security best practices. Use for auth, CORS, rate limiting, validation, and OWASP compliance.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# API Security Best Practices

Knowledge module for securing web APIs in any stack. Framework-specific code (middleware, policies, CORS configuration, validation classes) lives in the stack add-on's skill references; this module holds the rules.

## When to Load References

| Task | Load |
|------|------|
| Framework-specific auth middleware, CORS, rate limiting, validation, injection and XSS code | the stack add-on's skill references, when a stack add-on is installed |

---

## Quick Reference

### Authentication & Authorization

- Protect every route by default; make public routes an explicit exception
- Use scope-based access for granular permissions
- Authorize at the resource level (policies or equivalent), not only at the route level
- For stateless token APIs, CSRF protection comes from the token; for cookie-based SPAs, use the framework's CSRF mechanism

### CORS Configuration

- Configure explicit allowed origins; never combine a wildcard origin with credentials
- Read origins from environment configuration
- Allow credentials only for cookie-based auth
- Expose rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

### Rate Limiting

- Default API limit per minute, keyed by user ID or IP
- Auth endpoints need stricter limits (a few per minute plus a daily cap per IP)
- Use per-endpoint limits for expensive operations (exports, reports)

### Input Validation

- Validate every input with typed rules at the boundary
- Enforce a password policy: minimum length, mixed character classes, breached-password check
- Validate email format and domain
- Sanitize HTML, strip tags for plain text fields
- Cast inputs to expected types explicitly

---

## SQL Injection Prevention

- Always use the ORM or query builder (parameterized by default)
- Never interpolate user input into raw SQL strings
- For raw queries, use bound parameters
- Escape LIKE wildcards in user-supplied search terms

## XSS Protection

- Use the template engine's auto-escaping; opt out only for trusted content
- JSON responses must be encoded by the serializer, never concatenated
- Add a Content-Security-Policy header via middleware
- Set `default-src 'self'` as the CSP baseline

## Security Headers

Required headers for all API responses:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |

## Sensitive Data Protection

- Hide secrets and credentials on serialized models (password hashes, tokens, API secrets)
- Response serializers must explicitly whitelist returned fields
- Mask sensitive data in logs (card numbers, passwords, tokens)
- Never commit secrets to git; use a local env file in development and environment variables in production

---

## OWASP Top 10 Checklist

| Vulnerability | Protection |
|--------------|------------|
| **Injection** | ORM or query builder, parameterized queries |
| **Broken Auth** | Token or session auth, rate limiting on auth endpoints |
| **Sensitive Data** | HTTPS, encrypted at rest, hidden fields |
| **XXE** | Disable external entities in XML parsing |
| **Broken Access Control** | Policies, gates, middleware |
| **Security Misconfig** | Debug off in production, security headers |
| **XSS** | Template auto-escaping, CSP headers |
| **Insecure Deserialization** | Never deserialize untrusted input with native object serializers |
| **Vulnerable Components** | Regular dependency audit (the manifest `audit` commands) |
| **Insufficient Logging** | Structured logging, failed auth tracking |

---

## Security Testing

### Automated Checks
```bash
<audit command>                   # Dependency vulnerabilities (the stack manifest `audit` field)
<static analysis command>         # Static analysis security rules (the stack's types or lint gate)
git secrets --scan                # Exposed credentials
```

### Manual Testing Points
- [ ] Authentication bypass attempts
- [ ] Authorization boundary testing
- [ ] Rate limit verification
- [ ] Input validation edge cases
- [ ] SQL injection probing
- [ ] XSS payload testing
- [ ] CORS misconfiguration
- [ ] Token expiration/refresh

---
