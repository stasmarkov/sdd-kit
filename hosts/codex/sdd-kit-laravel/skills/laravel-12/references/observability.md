# Observability: Laravel

Backend detail for the core `observability` skill. The request-id and Sentry wiring across both apps is in `request-correlation.md`.

## Structured logging

```php
// config/logging.php — JSON to stdout in production (container-friendly)
'stderr' => [
    'driver' => 'monolog',
    'handler' => StreamHandler::class,
    'formatter' => Monolog\Formatter\JsonFormatter::class,
    'with' => ['stream' => 'php://stderr'],
],
```

- Log events, not strings: `Log::info('order.placed', ['order_id' => $id, 'total' => $total])`.
- Never log secrets/PII (tokens, passwords, full card numbers). Redact in a Monolog processor.
- Attach a request id to every line: middleware sets `Log::withContext(['request_id' => $id])`.

## Error tracking (Sentry)

```bash
composer require sentry/sentry-laravel
```

- Set `traces_sample_rate` low in prod (0.1-0.2) to control cost.
- Scrub PII: `send_default_pii => false`, add `before_send` filters.

## Tracing

- `open-telemetry/opentelemetry-php` auto-instruments HTTP, DB and queue. Export OTLP to a collector (Tempo/Jaeger/Honeycomb).
