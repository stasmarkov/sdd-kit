# External Integrations

Patterns for calling third-party APIs, receiving webhooks, and delivering outbound webhooks in Laravel 12.

## Contents
- HTTP client wrapper
- Gateway adapter behind a domain contract
- Receiving webhooks (signature, idempotency, async processing)
- Delivering webhooks (signed, queued, retried)
- Checklist

## HTTP Client Wrapper

Wrap `Http` once per provider so timeouts, retries, auth, and error mapping live in one place.

```php
<?php

declare(strict_types=1);

namespace App\Infrastructure\Http;

use App\Infrastructure\Exceptions\IntegrationException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class ApiClient
{
    public function __construct(
        protected readonly string $baseUrl,
        protected readonly string $apiKey,
        protected readonly int $timeout = 30,
    ) {}

    protected function client(): PendingRequest
    {
        return Http::baseUrl($this->baseUrl)
            ->timeout($this->timeout)
            ->connectTimeout(5)
            // Retry only transient failures; never retry 4xx client errors.
            ->retry(3, 200, fn ($e) => $e instanceof \Illuminate\Http\Client\ConnectionException
                || ($e->response?->serverError() ?? false), throw: false)
            ->withToken($this->apiKey)
            ->acceptJson();
    }

    public function get(string $endpoint, array $query = []): array
    {
        return $this->handle($this->client()->get($endpoint, $query));
    }

    public function post(string $endpoint, array $data = [], ?string $idempotencyKey = null): array
    {
        $request = $this->client();

        if ($idempotencyKey !== null) {
            $request = $request->withHeaders(['Idempotency-Key' => $idempotencyKey]);
        }

        return $this->handle($request->post($endpoint, $data));
    }

    protected function handle(Response $response): array
    {
        if ($response->failed()) {
            throw new IntegrationException(
                message: "Request to {$this->baseUrl} failed with {$response->status()}",
                code: $response->status(),
            );
        }

        return $response->json() ?? [];
    }
}
```

Test with `Http::fake([...])` and `Http::preventStrayRequests()` so no test ever reaches the real provider.

## Gateway Adapter

Domain code depends on a contract and DTOs; the adapter translates provider payloads and exceptions.

```php
final class StripePaymentGateway implements PaymentGatewayInterface
{
    public function __construct(private readonly StripeClient $client) {}

    public function createPaymentIntent(CreatePaymentDTO $dto): PaymentResultDTO
    {
        try {
            $response = $this->client->post('/payment_intents', [
                'amount' => $dto->amount,
                'currency' => strtolower($dto->currency),
            ], idempotencyKey: $dto->idempotencyKey);
        } catch (IntegrationException $e) {
            throw new PaymentGatewayException('Failed to create payment intent', previous: $e);
        }

        return PaymentResultDTO::fromProvider($response);
    }
}
```

Bind the contract in a service provider and swap in a fake implementation for tests. For Stripe specifically, prefer the official SDK and install Stripe's official skills: `./install.sh --project --third-party` adds `stripe-best-practices` and `upgrade-stripe` from a pinned commit of `github.com/stripe/ai` (plugin users: copy `providers/claude/plugin/skills/<name>` from that repo into `.cursor/skills/`, with its LICENSE). The kit's `docs/third-party.md` has the review notes.

## Receiving Webhooks

Rules:
1. Verify the signature against the **raw** request body before parsing.
2. Reject stale timestamps (replay protection, typically 5 minutes).
3. Record the provider event id and skip duplicates (providers deliver at least once).
4. Acknowledge fast (2xx) and process on a queue.

```php
final class ReceiveProviderWebhookController
{
    public function __invoke(Request $request, WebhookSignatureVerifier $verifier): JsonResponse
    {
        if (! $verifier->isValid($request->getContent(), $request->header('X-Signature'))) {
            return response()->json(['error' => 'Invalid signature'], Response::HTTP_UNAUTHORIZED);
        }

        $payload = $request->json()->all();

        $event = WebhookEvent::firstOrCreate(
            ['source' => 'provider', 'event_id' => $payload['id']],
            ['type' => $payload['type'], 'payload' => $payload, 'status' => 'pending'],
        );

        if ($event->wasRecentlyCreated) {
            ProcessWebhookEventJob::dispatch($event);
        }

        return response()->json(['received' => true]);
    }
}
```

```php
final class WebhookSignatureVerifier
{
    public function isValid(string $rawBody, ?string $header): bool
    {
        // Header format: t=<unix>,v1=<hex hmac of "<t>.<body>">
        if ($header === null || ! preg_match('/t=(\d+),v1=([a-f0-9]+)/', $header, $m)) {
            return false;
        }

        if (abs(time() - (int) $m[1]) > 300) {
            return false;
        }

        $expected = hash_hmac('sha256', "{$m[1]}.{$rawBody}", config('services.provider.webhook_secret'));

        return hash_equals($expected, $m[2]);
    }
}
```

When the provider ships a verifier (Stripe `Webhook::constructEvent`, GitHub, Slack), use it instead of hand-rolled HMAC.

The processing job maps event types to domain events with a `match`, logs unhandled types, and marks the `WebhookEvent` row processed or failed.

## Delivering Webhooks

```php
final class DeliverWebhookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;
    public array $backoff = [60, 300, 900, 3600];

    public function __construct(public readonly WebhookDelivery $delivery) {}

    public function handle(): void
    {
        $body = json_encode([
            'id' => $this->delivery->event_id,
            'type' => $this->delivery->event_type,
            'data' => $this->delivery->payload,
        ], JSON_THROW_ON_ERROR);

        $timestamp = time();
        $signature = hash_hmac('sha256', "{$timestamp}.{$body}", $this->delivery->endpoint->signing_secret);

        // Sign and send the identical byte string so receivers can verify it.
        $response = Http::timeout(15)
            ->withHeaders(['X-Signature' => "t={$timestamp},v1={$signature}"])
            ->withBody($body, 'application/json')
            ->post($this->delivery->webhook_url);

        $this->delivery->increment('attempt_count');
        $this->delivery->update([
            'response_code' => $response->status(),
            'status' => $response->successful() ? 'delivered' : 'failed',
            'delivered_at' => $response->successful() ? now() : null,
        ]);

        if (! $response->successful()) {
            throw new WebhookDeliveryException("Delivery failed with {$response->status()}");
        }
    }

    public function failed(\Throwable $e): void
    {
        $this->delivery->update(['status' => 'exhausted']);
    }
}
```

A `WebhookDeliveryService` creates the `WebhookDelivery` row (endpoint, event id, payload, expiry) and dispatches the job; trigger it from a domain event listener so the originating transaction is not coupled to delivery.

## Checklist

- [ ] Credentials in config/env, never in code or logs
- [ ] Timeouts on every outbound call; retries only on transient failures
- [ ] Idempotency keys on outbound writes; event-id dedupe on inbound webhooks
- [ ] Signature + timestamp verified on the raw body
- [ ] Webhook work runs on a queue with backoff and a `failed()` handler
- [ ] Provider responses mapped to DTOs; provider exceptions mapped to domain exceptions
- [ ] Circuit breaker or rate limiter around flaky providers (see `laravel-12` → `references/error-retry-resilience.md`)
- [ ] `Http::fake()` + `Http::preventStrayRequests()` in tests
