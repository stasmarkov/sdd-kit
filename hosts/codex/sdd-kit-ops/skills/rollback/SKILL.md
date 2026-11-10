---
name: rollback
description: "Roll back a deployment safely: capture current state, identify the known-good target, revert code and migrations under maintenance mode, and verify health afterwards. Use when a deploy caused a regression, when reverting to a specific commit or N steps, or during an emergency recovery."
argument-hint: "[environment] | --staging | --production | --steps=[n]"
allowed-tools: Bash, Read, Grep
disable-model-invocation: true
metadata:
  mcp-tools: "datadog, sentry"
  version: "1.2"
  subagents: "rollback-specialist"
---

# /rollback

Safely rollback deployments with verification and recovery procedures.

## Usage

```bash
# Rollback staging
/rollback --staging

# Rollback production
/rollback --production

# Rollback specific steps
/rollback --production --steps=2

# Rollback to specific commit
/rollback --production --commit=abc123

# Emergency rollback
/rollback --emergency
```

## Rollback Process

### Step 1: Assessment
```bash
echo "🔍 Assessing rollback requirements..."

# Get current state
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "Current commit: $CURRENT_COMMIT"

# List recent deployments
git log --oneline -10

# Identify target state
echo "Available rollback points:"
git tag -l --sort=-createddate | head -5
```

### Step 2: Database Assessment
```bash
echo "🗄️ Checking database migrations..."

# List recent migrations
php artisan migrate:status | tail -10

# Check for destructive migrations
DESTRUCTIVE=$(grep -l "dropColumn\|dropTable\|dropIndex" database/migrations/*.php | head -5)
if [ -n "$DESTRUCTIVE" ]; then
    echo "⚠️ Warning: Some migrations contain destructive operations"
    echo "$DESTRUCTIVE"
fi
```

### Step 3: Rollback Execution

#### Standard Rollback
```bash
echo "🔄 Executing rollback..."

# Enter maintenance mode
php artisan down --retry=60

# Rollback code
git checkout $TARGET_COMMIT

# Rollback migrations (if needed)
php artisan migrate:rollback --step=$MIGRATION_STEPS

# Clear caches
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Reinstall dependencies
composer install --no-dev --optimize-autoloader

# Rebuild caches
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Restart services
php artisan queue:restart
sudo systemctl reload php-fpm

# Exit maintenance mode
php artisan up
```

#### Emergency Rollback
```bash
echo "🚨 EMERGENCY ROLLBACK"

# Immediate switch to known-good state
git checkout $LAST_KNOWN_GOOD_TAG

# Skip non-essential steps
php artisan down --retry=60
composer install --no-dev
php artisan up

echo "⚠️ Emergency rollback complete - manual verification required"
```

### Step 4: Verification
```bash
echo "✅ Verifying rollback..."

# Health check
curl -f $APP_URL/api/health || exit 1

# Check critical endpoints
curl -f $APP_URL/api/v1/status || exit 1

# Verify database connectivity
php artisan db:monitor

# Check queue processing
php artisan queue:monitor

echo "✅ Rollback verification complete"
```

## Rollback Strategies

### Code-Only Rollback
When database schema unchanged:
1. Git checkout previous commit
2. Reinstall dependencies
3. Clear and rebuild caches
4. Restart services

### Code + Database Rollback
When migrations need reverting:
1. Enter maintenance mode
2. Rollback migrations
3. Checkout previous code
4. Reinstall dependencies
5. Exit maintenance mode

### Blue-Green Rollback
When using blue-green deployment:
1. Switch load balancer to previous environment
2. Verify previous environment healthy
3. Debug current environment offline

## Recovery Procedures

### If Rollback Fails
```bash
# 1. Restore from backup
mysql -u root database < /backups/database_$(date +%Y%m%d).sql

# 2. Restore code from backup
rsync -av /backups/app/ /var/www/production/

# 3. Verify and restart
php artisan config:cache
sudo systemctl restart php-fpm
```

### Post-Rollback Actions
1. Notify team of rollback
2. Document incident
3. Create bug ticket
4. Plan fix deployment

## Output Format

```
🔄 Rollback Report

═══════════════════════════════════════════════════════════

📋 Pre-Rollback Assessment:
  Environment: Production
  Current: abc123 (v2.1.0)
  Target: def456 (v2.0.5)
  Migrations to Rollback: 2

═══════════════════════════════════════════════════════════

🔄 Rollback Execution:

  1. ✅ Maintenance mode enabled
  2. ✅ Code rolled back to def456
  3. ✅ 2 migrations reverted
  4. ✅ Dependencies reinstalled
  5. ✅ Caches cleared and rebuilt
  6. ✅ Services restarted
  7. ✅ Maintenance mode disabled

═══════════════════════════════════════════════════════════

✅ Verification:

  Health Check: ✅ 200 OK
  API Status: ✅ Responding
  Database: ✅ Connected
  Queue: ✅ Processing

═══════════════════════════════════════════════════════════

📊 Summary:
  Status: ✅ ROLLBACK SUCCESSFUL
  Duration: 3m 12s
  From: v2.1.0 → v2.0.5

⚠️ Post-Rollback Actions:
  1. Notify team on Slack
  2. Create incident report
  3. Schedule fix deployment
```

**Source verification**: follow the `source-verification` skill.

