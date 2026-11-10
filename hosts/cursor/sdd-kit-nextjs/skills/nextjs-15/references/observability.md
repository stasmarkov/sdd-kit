# Observability: Next.js

Frontend detail for the core `observability` skill.

## Error tracking (Sentry)

```bash
npm i @sentry/nextjs
```

- Propagate the `sentry-trace` / `traceparent` header from Next.js to the backend so a frontend error links to the backend span.
- Scrub PII with `beforeSend`; keep the trace sample rate low in prod.

## Tracing

- `@vercel/otel`, registered in `instrumentation.ts`.
