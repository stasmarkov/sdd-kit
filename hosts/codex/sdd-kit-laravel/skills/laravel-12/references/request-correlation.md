# Request Correlation: Next.js → Laravel

One user action crosses two apps: a Server Component, Server Action, or Route Handler in Next.js calls the Laravel API, which may queue a job. Without a shared id, the frontend error, the API log line, and the failed job are three unrelated events. This reference wires one id through all of them, plus error tracking, a health endpoint, and queue alerting.

## 1. One request id, generated at the edge

Next.js creates (or accepts) the id once per incoming request and forwards it on every API call.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', requestId);
  return response;
}
```

```ts
// lib/api.ts — the single API client every Server Component, Server Action and Route Handler uses
import { headers } from 'next/headers';

export async function api(path: string, init: RequestInit = {}) {
  const requestId = (await headers()).get('x-request-id') ?? crypto.randomUUID();
  const response = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, 'x-request-id': requestId, accept: 'application/json' },
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'api.error', path, status: response.status, request_id: requestId }));
  }
  return response;
}
```

Accept an incoming `x-request-id` only from your own load balancer or CDN; strip it at the edge otherwise, so clients cannot forge ids into your logs.

## 2. Laravel adopts the id

```php
// app/Http/Middleware/AssignRequestId.php
final class AssignRequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->header('X-Request-Id');
        $id = is_string($id) && preg_match('/^[A-Za-z0-9-]{8,64}$/', $id) ? $id : (string) Str::uuid();

        Log::withContext(['request_id' => $id]);
        Context::add('request_id', $id);   // Laravel 11+: carried into queued jobs automatically

        $response = $next($request);
        $response->headers->set('X-Request-Id', $id);

        return $response;
    }
}
```

Register it first in the `api` middleware group (`bootstrap/app.php`). `Context` values are dehydrated into every job dispatched during the request and restored when the job runs, so a failed job's log lines carry the same `request_id` as the request that queued it.

Return the id in error responses (`"request_id": "..."` in the error envelope from `api-design`), so a user report or a support ticket leads straight to the logs.

## 3. Sentry in both apps

```bash
composer require sentry/sentry-laravel
npx @sentry/wizard@latest -i nextjs   # or install @sentry/nextjs with the lockfile's package manager
```

- Tag every event with the request id: Laravel `\Sentry\configureScope(fn ($scope) => $scope->setTag('request_id', $id))` in the middleware above; Next.js `Sentry.setTag('request_id', requestId)` in the API client.
- Distributed tracing: with both SDKs on, Next.js sends `sentry-trace` and `baggage` on server-side `fetch`, and sentry-laravel continues the trace. Allow those headers in Laravel CORS (`config/cors.php` `allowed_headers`) when the browser calls the API directly.
- Same `release` and `environment` in both apps (the commit SHA from CI), so one deploy groups errors from both sides.
- `send_default_pii` off in both, with `before_send` scrubbing tokens and emails.

## 4. Health endpoint

Laravel ships `/up` (application boots). Add a readiness check that touches each dependency and returns 503 when one fails, for load balancers and `/health-check`:

```php
Route::get('/health', function () {
    $checks = [
        'database' => rescue(fn () => DB::select('select 1') !== null, false, false),
        'cache' => rescue(fn () => Cache::store()->put('health', 1, 5), false, false),
        'queue' => rescue(fn () => Queue::size() >= 0, false, false),
    ];
    $ok = ! in_array(false, $checks, true);

    return response()->json(['status' => $ok ? 'ok' : 'degraded', 'checks' => $checks], $ok ? 200 : 503);
})->withoutMiddleware('throttle:api');
```

Keep it cheap (no external API calls) and unauthenticated but uninformative: booleans only, no versions or hostnames. The Next.js app gets its own `app/api/health/route.ts` that also calls the Laravel `/health`, so one probe covers the whole path.

## 5. Queue and failed-job alerting

- **Failed jobs**: alert on every insert into `failed_jobs` (or Horizon's failed list) for jobs that move money, send email, or sync external systems. `Queue::failing(fn (JobFailed $event) => Log::error('job.failed', [...]))` in a service provider gives one structured line per failure with the restored `request_id`.
- **Backlog**: `php artisan queue:monitor redis:default --max=100` on the scheduler (every minute) fires `QueueBusy` events; notify on them.
- **Horizon**: `horizon:snapshot` every five minutes for wait-time metrics; alert when wait time exceeds the job's SLO.
- **Stuck work**: alert when the oldest pending job is older than its expected runtime, not only on queue length.

## Checklist

- [ ] Next.js middleware sets `x-request-id`; the API client forwards it on every call
- [ ] Laravel middleware validates or generates the id, adds it to log context and `Context`, echoes it in the response and error envelope
- [ ] Sentry in both apps, tagged with the request id, same release and environment, PII scrubbed
- [ ] `/health` returns 503 when a dependency fails; the frontend health route covers the API too
- [ ] Failed-job and queue-backlog alerts wired
