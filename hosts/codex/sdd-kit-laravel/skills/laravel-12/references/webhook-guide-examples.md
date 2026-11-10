# Webhook Guide Examples

Framework code examples moved out of the core skill.

### 1. Create Webhook Endpoint

```php
// routes/api.php (Laravel)
Route::post('/webhooks/{{service}}', [WebhookController::class, 'handle']);
```

### 2. Verify Signature (CRITICAL)

```php
$signature = $request->header('X-{{Service}}-Signature');
$payload = $request->getContent();
$secret = config('services.{{service}}.webhook_secret');

if (!hash_equals(hash_hmac('sha256', $payload, $secret), $signature)) {
    return response('Invalid signature', 401);
}
```

### 3. Handle Events

```php
$event = json_decode($payload, true);

switch ($event['type']) {
    case '{{event_type}}.succeeded':
        // Handle success
        break;
    case '{{event_type}}.failed':
        // Handle failure
        break;
}

return response('OK', 200); // ALWAYS return 200
```

### Step 1: Create Webhook Controller

```php
<?php
declare(strict_types=1);

namespace App\Http\Controllers\Webhooks;

use Illuminate\Http\Request;
use Illuminate\Http\Response;

class {{Service}}WebhookController extends Controller
{
    public function handle(Request $request): Response
    {
        // 1. Verify signature
        if (!$this->verifySignature($request)) {
            return response('Invalid signature', 401);
        }

        // 2. Parse event
        $event = json_decode($request->getContent(), true);

        // 3. Check idempotency (prevent duplicate processing)
        if ($this->isEventProcessed($event['id'])) {
            return response('Already processed', 200);
        }

        // 4. Dispatch to handler
        $this->dispatchEvent($event);

        // 5. Mark as processed
        $this->markEventProcessed($event['id']);

        return response('OK', 200);
    }

    private function verifySignature(Request $request): bool
    {
        $signature = $request->header('X-{{Service}}-Signature');
        $payload = $request->getContent();
        $secret = config('services.{{service}}.webhook_secret');

        $expectedSignature = hash_hmac('sha256', $payload, $secret);

        return hash_equals($expectedSignature, $signature);
    }

    private function dispatchEvent(array $event): void
    {
        match($event['type']) {
            '{{event}}.succeeded' => dispatch(new Handle{{Event}}Succeeded($event['data'])),
            '{{event}}.failed' => dispatch(new Handle{{Event}}Failed($event['data'])),
            default => logger()->info('Unhandled webhook event', ['type' => $event['type']]),
        };
    }
}
```

### Step 2: Create Event Handler Job

```php
<?php
declare(strict_types=1);

namespace App\Jobs\Webhooks;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class Handle{{Event}}Succeeded implements ShouldQueue
{
    use InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(
        private array $eventData
    ) {}

    public function handle(): void
    {
        // Process the event
        $entity = {{Entity}}::find($this->eventData['id']);

        if (!$entity) {
            logger()->error('Entity not found for webhook', $this->eventData);
            return;
        }

        // Update status
        $entity->update([
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        // Trigger any follow-up actions
        event(new {{Entity}}Completed($entity));
    }

    public function failed(\Throwable $exception): void
    {
        logger()->error('Webhook processing failed', [
            'event_data' => $this->eventData,
            'error' => $exception->getMessage(),
        ]);
    }
}
```

### 1. Always Verify Signatures

```php
// Use timing-safe comparison
hash_equals($expected, $provided);

// Never use regular comparison
// $expected === $provided // WRONG - timing attack vulnerable
```

### 2. Use HTTPS Only

```php
// Verify request is HTTPS in production
if (app()->isProduction() && !$request->secure()) {
    return response('HTTPS required', 426);
}
```

### 3. Implement Idempotency

```php
// Store processed event IDs
Schema::create('processed_webhooks', function (Blueprint $table) {
    $table->string('event_id')->primary();
    $table->timestamp('processed_at');
    $table->index('processed_at'); // For cleanup
});
```

### 4. Validate Payload

```php
// Validate expected structure
$validator = Validator::make($event, [
    'id' => 'required|string',
    'type' => 'required|string',
    'data' => 'required|array',
]);

if ($validator->fails()) {
    return response('Invalid payload', 400);
}
```

### 5. Return 200 Quickly

```php
// Process asynchronously to respond quickly
dispatch(new ProcessWebhook($event));

return response('OK', 200);
```

### Automated Tests

```php
it('processes webhook successfully', function () {
    $payload = ['id' => 'evt_123', 'type' => '{{event}}.succeeded', 'data' => []];
    $signature = hash_hmac('sha256', json_encode($payload), config('services.{{service}}.webhook_secret'));

    $response = $this->postJson('/webhooks/{{service}}', $payload, [
        'X-{{Service}}-Signature' => $signature,
    ]);

    $response->assertStatus(200);
});

it('rejects invalid signature', function () {
    $response = $this->postJson('/webhooks/{{service}}', [], [
        'X-{{Service}}-Signature' => 'invalid',
    ]);

    $response->assertStatus(401);
});
```
