---
name: deploy
description: Deploy the application to staging or production with pre-deploy gates (tests, lint, build), confirmation for production, and post-deploy health and smoke checks. Use when shipping a release to an environment, doing a dry run of a deployment, or deploying a specific branch.
argument-hint: "[environment] | --staging | --production | --dry-run"
allowed-tools: Bash, Read, Grep
disable-model-invocation: true
metadata:
  mcp-tools: "datadog, sentry"
  version: "1.2"
  subagents: "deployment-specialist"
---

# /deploy

Deploy application to staging or production environments with comprehensive pre/post checks.

## Usage

```bash
# Deploy to staging
/deploy --staging

# Deploy to production
/deploy --production

# Dry run (check without deploying)
/deploy --dry-run

# Deploy specific branch
/deploy --staging --branch=feature/new-feature

# Skip confirmations
/deploy --staging --force
```

## Deployment Workflow

### Step 1: Pre-Deployment Checks
```bash
echo "🔍 Running pre-deployment checks..."

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Uncommitted changes detected"
    exit 1
fi

echo "✅ Working tree clean"
```

Then run the project's detected gate commands for every repo being deployed (the `verification-gates` skill; the `code-quality` agent runs them and reports per gate). Use the commands the project actually has and its own environment wrapper; never assume DDEV or npm. Any failing or unreachable gate stops the deploy.

### Step 2: Build Assets
```bash
echo "🔨 Building assets..."

# Install dependencies
npm ci

# Build for production
npm run build

# Verify build output
if [ ! -d "public/build" ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Assets built successfully"
```

### Step 3: Deploy to Environment

#### Staging Deployment
```bash
echo "🚀 Deploying to staging..."

# Push to staging branch
git push origin $CURRENT_BRANCH:staging

# SSH deploy script
ssh $STAGING_HOST << 'EOF'
    cd /var/www/staging
    git pull origin staging
    composer install --no-dev --optimize-autoloader
    php artisan migrate --force
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
    php artisan queue:restart
    sudo systemctl reload php-fpm
EOF

echo "✅ Deployed to staging"
```

#### Production Deployment
```bash
echo "🚀 Deploying to production..."

# Require confirmation
read -p "Deploy to PRODUCTION? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

# Enter maintenance mode
ssh $PRODUCTION_HOST "cd /var/www/production && php artisan down --retry=60"

# Deploy
ssh $PRODUCTION_HOST << 'EOF'
    cd /var/www/production
    git pull origin main
    composer install --no-dev --optimize-autoloader
    php artisan migrate --force
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
    php artisan queue:restart
    php artisan up
    sudo systemctl reload php-fpm
EOF

echo "✅ Deployed to production"
```

### Step 4: Post-Deployment Verification
```bash
echo "✅ Running post-deployment checks..."

# Health check
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $APP_URL/api/health)
if [ "$HEALTH_STATUS" != "200" ]; then
    echo "❌ Health check failed"
    exit 1
fi

# Smoke tests
curl -s $APP_URL/api/v1/status

echo "✅ Post-deployment verification passed"
```

## Environment Configuration

### Environment Variables
```bash
# .env.staging
APP_ENV=staging
APP_DEBUG=true
APP_URL=https://staging.example.com

# .env.production
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com
```

### Server Requirements
- PHP 8.3+
- MySQL 8.0+
- Redis
- Node.js 20+
- Nginx

## Deployment Strategies

### Rolling Deployment
- Deploy to servers one at a time
- No downtime
- Easy rollback

### Blue-Green Deployment
- Two identical environments
- Switch traffic between them
- Instant rollback

### Zero-Downtime Deployment
- Use maintenance mode briefly
- Database migrations during low traffic
- Queue workers graceful restart

## Output Format

```
🚀 Deployment Report

═══════════════════════════════════════════════════════════

📋 Pre-Deployment:
  Branch: feature/user-auth
  Tests: ✅ All passing (156 tests)
  Pint: ✅ No style issues
  PHPStan: ✅ Level 8 passed

═══════════════════════════════════════════════════════════

🔨 Build:
  Dependencies: ✅ Installed
  Assets: ✅ Built (2.3 MB)
  Time: 45s

═══════════════════════════════════════════════════════════

🚀 Deployment:
  Environment: Staging
  Server: staging.example.com
  Method: Git pull + Composer

  Steps:
    ✅ Code pulled
    ✅ Dependencies installed
    ✅ Migrations run (2 new)
    ✅ Caches cleared
    ✅ Queue workers restarted
    ✅ PHP-FPM reloaded

═══════════════════════════════════════════════════════════

✅ Post-Deployment:
  Health Check: ✅ 200 OK
  API Status: ✅ Responding
  Queue: ✅ Processing

═══════════════════════════════════════════════════════════

📊 Summary:
  Status: ✅ SUCCESS
  Duration: 2m 34s
  URL: https://staging.example.com
```

**Source verification**: follow the `source-verification` skill.

