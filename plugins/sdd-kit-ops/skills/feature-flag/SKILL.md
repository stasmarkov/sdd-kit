---
name: feature-flag
description: Create, list, enable, disable, roll out, and clean up feature flags (boolean, percentage, user-targeted) with config, env, and documentation updates. Use when releasing a change gradually, gating unfinished work behind a flag, planning a percentage rollout, or removing stale flags.
argument-hint: "create|list|enable|disable|rollout|cleanup [flag-name]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
disable-model-invocation: true
metadata:
  version: "1.0"
---

# /feature-flag

Create, manage, and document feature flags for gradual rollouts, A/B testing, and safe releases.

---

## Usage

```bash
# Create new feature flag
/feature-flag create "new-payment-flow"
/feature-flag create "dark-mode" --type=boolean
/feature-flag create "checkout-v2" --type=percentage

# List all feature flags
/feature-flag list
/feature-flag list --env=production
/feature-flag list --status=enabled

# Enable/disable flags
/feature-flag enable "new-payment-flow" --env=staging
/feature-flag enable "new-payment-flow" --env=production --percent=10
/feature-flag disable "new-payment-flow" --env=production

# Gradual rollout
/feature-flag rollout "new-payment-flow" 25      # Increase to 25%
/feature-flag rollout "new-payment-flow" 50      # Increase to 50%
/feature-flag rollout "new-payment-flow" 100     # Full rollout

# User-based targeting
/feature-flag enable "beta-features" --users=user1,user2,user3
/feature-flag enable "enterprise-features" --groups=enterprise,premium

# Cleanup stale flags
/feature-flag cleanup                           # Find stale flags
/feature-flag cleanup --remove "old-flag"       # Remove specific flag

# Documentation
/feature-flag docs "new-payment-flow"           # Generate documentation
/feature-flag status "new-payment-flow"         # Show flag status
```

---

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `create` | No | Create new feature flag |
| `list` | No | List all feature flags |
| `enable` | No | Enable a feature flag |
| `disable` | No | Disable a feature flag |
| `rollout` | No | Set rollout percentage |
| `cleanup` | No | Find/remove stale flags |
| `docs` | No | Generate flag documentation |
| `status` | No | Show flag status |
| `--env` | No | Target environment |
| `--percent` | No | Rollout percentage (0-100) |
| `--type` | No | Flag type: boolean, percentage, user-based |
| `--users` | No | Comma-separated user IDs |
| `--groups` | No | Comma-separated group names |

---

## Flag Types

### Boolean Flag
Simple on/off switch:
```php
// Laravel
if (Feature::active('dark-mode')) {
    return view('dark-theme');
}

// Next.js
if (featureFlags.isEnabled('dark-mode')) {
    return <DarkTheme />;
}
```

### Percentage Flag
Gradual rollout to percentage of users:
```php
// Laravel
if (Feature::active('new-checkout', $user)) {
    return redirect()->route('checkout.v2');
}
```

### User-Based Flag
Targeted to specific users or groups:
```php
// Laravel
if (Feature::active('beta-features', $user)) {
    return $this->betaFeatures();
}
```

---

## Workflow Steps

### Step 1: Create Flag

```bash
/feature-flag create "new-payment-flow"
```

**Actions:**
1. Generate unique flag key
2. Add configuration to environment files
3. Create documentation file

**Generated Files:**
- `.env.example` - Flag definition
- `docs/feature-flags/{flag-name}.md` - Documentation, from [references/flag-doc.template.md](references/flag-doc.template.md) (purpose, status and rollout history, implementation in Laravel and Next.js, rollout plan, monitoring, rollback plan, cleanup checklist)
- Config update in `config/features.php` (Laravel)

### Step 2: Implement Flag Checks

**Laravel Implementation:**
```php
// In Controller or Service
use Illuminate\Support\Facades\Feature;

public function checkout(Request $request)
{
    if (Feature::active('new-payment-flow')) {
        return $this->newCheckoutFlow($request);
    }

    return $this->legacyCheckoutFlow($request);
}
```

**Next.js Implementation:**
```typescript
// In Component or Page
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

export function CheckoutPage() {
    const isNewFlow = useFeatureFlag('new-payment-flow');

    if (isNewFlow) {
        return <NewCheckoutFlow />;
    }

    return <LegacyCheckoutFlow />;
}
```

**API Route Protection:**
```typescript
// Next.js API Route
export async function POST(request: Request) {
    if (!isFeatureEnabled('new-payment-flow')) {
        return Response.json({ error: 'Feature not available' }, { status: 404 });
    }

    // New flow logic
}
```

### Step 3: Test in Staging

```bash
/feature-flag enable "new-payment-flow" --env=staging
```

Verify:
- [ ] Feature works as expected
- [ ] No regression in existing functionality
- [ ] Metrics collection working
- [ ] Error handling correct

### Step 4: Gradual Rollout

```bash
# Start small
/feature-flag enable "new-payment-flow" --env=production --percent=10

# Monitor metrics, then increase
/feature-flag rollout "new-payment-flow" 25
/feature-flag rollout "new-payment-flow" 50
/feature-flag rollout "new-payment-flow" 100
```

**Rollout Schedule Example:**
| Day | Percentage | Action |
|-----|------------|--------|
| 1 | 10% | Initial rollout, monitor closely |
| 3 | 25% | Expand if metrics stable |
| 5 | 50% | Half of users |
| 7 | 100% | Full rollout |
| 14 | - | Begin cleanup |

### Step 5: Monitor

Watch for:
- Error rate increases
- Latency changes
- User feedback
- Conversion metrics

**Rollback Trigger:**
```bash
# If issues detected
/feature-flag disable "new-payment-flow" --env=production
```

### Step 6: Cleanup

After successful full rollout:

```bash
# Find stale flags
/feature-flag cleanup

# Remove old flag
/feature-flag cleanup --remove "new-payment-flow"
```

**Cleanup Checklist:**
- [ ] Flag at 100% for 2+ weeks
- [ ] No issues reported
- [ ] Remove flag checks from code
- [ ] Remove config entries
- [ ] Archive documentation

---

## Output Formats

### Flag Creation

```
Feature Flag Created: new-payment-flow
======================================

Key: new_payment_flow
Type: percentage
Created: 2025-01-15

Status by Environment:
  Development: disabled (0%)
  Staging: disabled (0%)
  Production: disabled (0%)

Configuration Added:
  .env.example: FEATURE_NEW_PAYMENT_FLOW=false
  config/features.php: 'new_payment_flow' => env('FEATURE_NEW_PAYMENT_FLOW', false)

Documentation:
  docs/feature-flags/new-payment-flow.md

Next Steps:
  1. Add flag checks in code
  2. Enable in staging: /feature-flag enable "new-payment-flow" --env=staging
  3. Test thoroughly
  4. Begin production rollout
```

### Flag List

```
Feature Flags Status
====================

Active Flags (3):

  new-payment-flow
    Type: percentage
    Created: 2025-01-10 (5 days ago)
    Status:
      Development: enabled (100%)
      Staging: enabled (100%)
      Production: enabled (50%)

  dark-mode
    Type: boolean
    Created: 2025-01-01 (15 days ago)
    Status:
      Development: enabled
      Staging: enabled
      Production: enabled
    Note: Consider cleanup (100% for 2 weeks)

  beta-features
    Type: user-based
    Created: 2024-12-15 (30 days ago)
    Status:
      Production: enabled for 12 users
    Groups: beta-testers

Stale Flags (1):

  old-checkout-flow
    Type: boolean
    Created: 2024-10-01 (100+ days ago)
    Status: All environments enabled
    Recommendation: CLEANUP - 100% for 3+ months
```

### Rollout Status

```
Feature Flag Rollout: new-payment-flow
======================================

Current Status:
  Production: 50% enabled

Rollout History:
  2025-01-15 10:00: Created (0%)
  2025-01-16 09:00: Staging enabled (100%)
  2025-01-17 14:00: Production enabled (10%)
  2025-01-18 10:00: Production increased (25%)
  2025-01-19 10:00: Production increased (50%) ← Current

Metrics (last 24h):
  Users exposed: 12,450
  Users in control: 12,380
  Error rate (exposed): 0.12%
  Error rate (control): 0.11%

  → No significant difference detected

Recommendations:
  ✓ Safe to increase to 75%
  Next step: /feature-flag rollout "new-payment-flow" 75
```

---

## Configuration

### Laravel Configuration

```php
// config/features.php
return [
    'new_payment_flow' => [
        'enabled' => env('FEATURE_NEW_PAYMENT_FLOW', false),
        'percentage' => env('FEATURE_NEW_PAYMENT_FLOW_PERCENT', 0),
    ],
];
```

### Environment Variables

```bash
# .env
FEATURE_NEW_PAYMENT_FLOW=true
FEATURE_NEW_PAYMENT_FLOW_PERCENT=50
```

### Next.js Configuration

```typescript
// lib/features.ts
export const featureFlags = {
  newPaymentFlow: process.env.NEXT_PUBLIC_FEATURE_NEW_PAYMENT_FLOW === 'true',
  newPaymentFlowPercent: parseInt(process.env.FEATURE_NEW_PAYMENT_FLOW_PERCENT || '0'),
};
```

---

## Rollback Criteria

Automatic rollback triggers:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Error rate | >1% increase | Disable flag |
| Latency | >50ms increase | Disable flag |
| Conversion | >5% decrease | Disable flag |
| Customer complaints | >10 in 1 hour | Disable flag |

```bash
# Emergency disable
/feature-flag disable "new-payment-flow" --env=production
```

---

## Best Practices

### Naming Conventions
- Use kebab-case: `new-payment-flow`
- Be descriptive: `checkout-v2-experiment` not `test-1`
- Include context: `mobile-dark-mode` not `dark`

### Flag Hygiene
- Set cleanup date when creating
- Review flags monthly
- Remove flags after 100% rollout
- Document all flags

### Testing
- Test both flag states
- Include flag in integration tests
- Verify rollback works
- Test percentage distribution

### Monitoring
- Track metrics by flag state
- Set up alerts for anomalies
- Log flag evaluations
- Monitor performance impact

---

**Source verification**: follow the `source-verification` skill.

---

## Related Skills

- `/write-spec` - Requirements that flags implement
- `/deploy` - Deployment (checks flag status)
- `/simple-task` - Implementation behind flags
- `/health-check` - Monitor flag impact

