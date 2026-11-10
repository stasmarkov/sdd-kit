---
name: observability
description: Observability for web applications - structured logging, error tracking, metrics, and OpenTelemetry tracing. Use when adding logging/monitoring, instrumenting requests, debugging production issues, or wiring alerting. Stack-specific setup comes from the stack add-on's references.
license: Apache-2.0
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Observability

Three pillars: **logs** (what happened), **metrics** (how much/how often), **traces** (where time went across services). Instrument the request path end-to-end, from the browser through the API to background jobs, with a shared correlation id.

## Structured logging

- Log events, not strings: an event name plus a context map (`order.placed`, `{order_id, total}`).
- JSON to stdout in production (container-friendly).
- Never log secrets/PII (tokens, passwords, full card numbers). Redact in a log processor.
- Attach a request id to every line from request middleware.

## Error tracking

- Use one error tracker (for example Sentry) in each app; set the trace sample rate low in prod (0.1-0.2) to control cost.
- Propagate the `sentry-trace` / `traceparent` header from the frontend to the backend so a frontend error links to the backend span.
- Scrub PII: disable default PII sending and add before-send filters.

## Tracing (OpenTelemetry)

- Auto-instrument HTTP, database and queue on the backend; export OTLP to a collector (Tempo/Jaeger/Honeycomb).
- Register the frontend instrumentation hook of your framework.
- The correlation id (W3C `traceparent`) is what stitches a click in the browser to a query in the database. Without it, traces fragment.

## Metrics & SLOs

- Expose `/metrics` (Prometheus) or push to a hosted backend. Key signals (RED): **R**ate, **E**rrors, **D**uration per endpoint.
- Define SLOs (e.g. p95 latency < 300ms, error rate < 1%) and alert on burn rate, not raw spikes.

## Cost discipline

Telemetry volume = bill. Sample traces, drop healthy-path debug logs in prod, set retention. Log at `info`+ in prod, `debug` only behind a flag.

## When to load references

| Task | Load |
|------|------|
| Backend logging, error tracking and tracing setup; request-id propagation across frontend, backend and jobs | the stack add-on's `references/observability.md` and `references/request-correlation.md` (in its conventions skill) |
| OTel collector config | vendor docs (Tempo/Jaeger/Honeycomb) |
