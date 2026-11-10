---
name: health-check
description: Verify system health across the app, database, cache, queues, disk, and external services, and report a pass/warn/fail summary. Use when checking an environment after a deploy or incident, investigating degraded behavior, or confirming infrastructure is ready before a release.
argument-hint: "--full | --quick | --services | --endpoints"
allowed-tools: Bash, Read, Grep
metadata:
  mcp-tools: "datadog, sentry"
  version: "1.1"
  subagents: "ops-analyst"
---

# /health-check

Verify system health, infrastructure status, and service availability.

## Usage

```bash
# Full health check
/health-check --full

# Quick check (critical services)
/health-check --quick

# Check specific services
/health-check --services

# Check API endpoints
/health-check --endpoints
```

## Health Checks

### Application Health
```bash
# Laravel health endpoint
curl -s $APP_URL/api/health | jq

# Response should include:
# {
#   "status": "healthy",
#   "checks": {
#     "database": true,
#     "redis": true,
#     "queue": true
#   }
# }
```

### Database Health
```bash
# MySQL status
php artisan db:monitor

# Check connection
mysql -u $DB_USER -p$DB_PASSWORD -e "SELECT 1"

# Check slow queries
mysql -e "SHOW FULL PROCESSLIST"
```

### Redis Health
```bash
# Redis ping
redis-cli ping

# Redis info
redis-cli info | grep connected_clients

# Memory usage
redis-cli info memory | grep used_memory_human
```

### Queue Health
```bash
# Queue status
php artisan queue:monitor

# Failed jobs
php artisan queue:failed

# Worker processes
ps aux | grep "queue:work"

# Laravel Horizon (if used)
php artisan horizon:status
```

### Storage Health
```bash
# Disk usage
df -h /var/www

# Log size
du -sh storage/logs/

# Cache size
du -sh storage/framework/cache/
```

### External Services
```bash
# Stripe API
curl -s https://api.stripe.com/v1/health

# Email service
php artisan mail:test

# Third-party APIs
curl -s $EXTERNAL_API_URL/health
```

## Health Endpoint Implementation

```php
// routes/api.php
Route::get('/health', function () {
    $checks = [
        'database' => false,
        'redis' => false,
        'queue' => false,
        'storage' => false,
    ];

    // Database check
    try {
        DB::connection()->getPdo();
        $checks['database'] = true;
    } catch (\Exception $e) {
        Log::error('Health check - Database failed', ['error' => $e->getMessage()]);
    }

    // Redis check
    try {
        Redis::ping();
        $checks['redis'] = true;
    } catch (\Exception $e) {
        Log::error('Health check - Redis failed', ['error' => $e->getMessage()]);
    }

    // Queue check
    try {
        $checks['queue'] = Queue::size('default') >= 0;
    } catch (\Exception $e) {
        Log::error('Health check - Queue failed', ['error' => $e->getMessage()]);
    }

    // Storage check
    try {
        $checks['storage'] = is_writable(storage_path());
    } catch (\Exception $e) {
        Log::error('Health check - Storage failed', ['error' => $e->getMessage()]);
    }

    $healthy = !in_array(false, $checks);

    return response()->json([
        'status' => $healthy ? 'healthy' : 'unhealthy',
        'checks' => $checks,
        'timestamp' => now()->toISOString(),
    ], $healthy ? 200 : 503);
});
```

## Monitoring Integration

### Datadog
```bash
# Check metrics
datadog:metrics --service=app

# Check alerts
datadog:alerts --status=triggered
```

### Sentry
```bash
# Check error rate
sentry:errors --last=1h

# Check performance
sentry:performance --service=api
```

## Output Format

```
🏥 System Health Check

═══════════════════════════════════════════════════════════

📊 Core Services:

  Application: ✅ Healthy
    - Response Time: 45ms
    - Status: 200 OK

  Database: ✅ Healthy
    - Connections: 15/100
    - Response Time: 2ms

  Redis: ✅ Healthy
    - Memory: 256MB / 1GB
    - Connections: 8

  Queue: ✅ Healthy
    - Jobs Pending: 12
    - Failed Jobs: 0
    - Workers: 4

═══════════════════════════════════════════════════════════

💾 Storage:

  Disk: ✅ Healthy
    - Used: 45GB / 100GB (45%)

  Logs: ⚠️ Warning
    - Size: 2.5GB (consider rotation)

  Cache: ✅ Healthy
    - Size: 128MB

═══════════════════════════════════════════════════════════

🔌 External Services:

  Stripe: ✅ Operational
  SendGrid: ✅ Operational
  AWS S3: ✅ Operational

═══════════════════════════════════════════════════════════

📈 Performance Metrics (Last Hour):

  API Response Time: 89ms avg
  Error Rate: 0.1%
  Throughput: 1,234 req/min

═══════════════════════════════════════════════════════════

📋 Summary:
  Overall Status: ✅ HEALTHY
  Issues: 1 warning (log rotation)

💡 Recommendations:
  - Rotate log files (storage/logs > 1GB)
```

**Source verification**: follow the `source-verification` skill.

