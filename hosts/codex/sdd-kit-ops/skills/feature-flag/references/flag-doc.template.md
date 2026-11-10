# Feature Flag: {{FLAG_NAME}}

## Overview

| Field | Value |
|-------|-------|
| **Key** | `{{FLAG_KEY}}` |
| **Type** | boolean / percentage / user-based |
| **Created** | {{DATE}} |
| **Owner** | {{OWNER_NAME}} |
| **Feature** | {{FEATURE_NAME}} |
| **Requirement** | REQ-{{ID}} |
| **Cleanup Target** | {{CLEANUP_DATE}} |

---

## Purpose

{{Describe what this feature flag controls and why it exists}}

**Business Context:**
{{Why is this being rolled out gradually?}}

**Risk Mitigation:**
{{What risks does the flag help mitigate?}}

---

## Current Status

| Environment | Status | Percentage | Since |
|-------------|--------|------------|-------|
| Development | enabled | 100% | {{DATE}} |
| Staging | enabled | 100% | {{DATE}} |
| Production | enabled | {{PERCENT}}% | {{DATE}} |

### Rollout History

| Date | Action | Details |
|------|--------|---------|
| {{DATE}} | Created | Flag initialized |
| {{DATE}} | Staging enabled | 100% rollout |
| {{DATE}} | Production started | 10% initial rollout |
| {{DATE}} | Production increased | 25% rollout |

---

## Implementation

### Laravel (Backend)

```php
use Illuminate\Support\Facades\Feature;

// Basic check
if (Feature::active('{{FLAG_KEY}}')) {
    // New behavior
}

// With user context (for percentage/user-based)
if (Feature::active('{{FLAG_KEY}}', $user)) {
    // User-specific rollout
}

// In Controller
public function __invoke(Request $request)
{
    if (Feature::active('{{FLAG_KEY}}', $request->user())) {
        return $this->newFlow($request);
    }

    return $this->legacyFlow($request);
}

// In Blade templates
@feature('{{FLAG_KEY}}')
    {{-- New feature UI --}}
@else
    {{-- Legacy UI --}}
@endfeature
```

### Next.js (Frontend)

```typescript
// Hook usage
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

export function Component() {
    const isEnabled = useFeatureFlag('{{FLAG_KEY}}');

    if (isEnabled) {
        return <NewFeature />;
    }

    return <LegacyFeature />;
}

// Server Component
import { isFeatureEnabled } from '@/lib/features';

export async function Page() {
    const enabled = await isFeatureEnabled('{{FLAG_KEY}}');

    return enabled ? <NewPage /> : <LegacyPage />;
}

// API Route
export async function POST(request: Request) {
    if (!isFeatureEnabled('{{FLAG_KEY}}')) {
        return Response.json(
            { error: 'Feature not available' },
            { status: 404 }
        );
    }

    // New API logic
}
```

---

## Configuration

### Environment Variables

```bash
# Development
FEATURE_{{FLAG_KEY_UPPER}}=true
FEATURE_{{FLAG_KEY_UPPER}}_PERCENT=100

# Staging
FEATURE_{{FLAG_KEY_UPPER}}=true
FEATURE_{{FLAG_KEY_UPPER}}_PERCENT=100

# Production
FEATURE_{{FLAG_KEY_UPPER}}=true
FEATURE_{{FLAG_KEY_UPPER}}_PERCENT={{PERCENT}}
```

### Laravel Config

```php
// config/features.php
return [
    '{{FLAG_KEY}}' => [
        'enabled' => env('FEATURE_{{FLAG_KEY_UPPER}}', false),
        'percentage' => env('FEATURE_{{FLAG_KEY_UPPER}}_PERCENT', 0),
    ],
];
```

---

## Affected Components

### Backend

| Component | Location | Impact |
|-----------|----------|--------|
| {{SERVICE}} | `app/Services/{{Service}}.php` | Primary logic change |
| {{CONTROLLER}} | `app/Http/Controllers/{{Controller}}.php` | Route handling |
| {{REPOSITORY}} | `app/Repositories/{{Repository}}.php` | Data access |

### Frontend

| Component | Location | Impact |
|-----------|----------|--------|
| {{COMPONENT}} | `src/components/{{Component}}.tsx` | UI change |
| {{PAGE}} | `src/app/{{page}}/page.tsx` | Page rendering |
| {{HOOK}} | `.codex/hooks/{{hook}}.ts` | State management |

---

## Rollout Plan

### Schedule

| Stage | Target % | Date | Criteria for Next Stage |
|-------|----------|------|-------------------------|
| 1 | 10% | {{DATE}} | Error rate < 0.1%, no critical issues |
| 2 | 25% | {{DATE}} | Stable for 48 hours |
| 3 | 50% | {{DATE}} | Positive user feedback |
| 4 | 75% | {{DATE}} | Metrics match or exceed control |
| 5 | 100% | {{DATE}} | Ready for cleanup |

### Rollout Commands

```bash
# Stage 1
/feature-flag enable "{{FLAG_NAME}}" --env=production --percent=10

# Stage 2
/feature-flag rollout "{{FLAG_NAME}}" 25

# Stage 3
/feature-flag rollout "{{FLAG_NAME}}" 50

# Stage 4
/feature-flag rollout "{{FLAG_NAME}}" 75

# Stage 5
/feature-flag rollout "{{FLAG_NAME}}" 100
```

---

## Monitoring

### Key Metrics

| Metric | Baseline | Threshold | Alert |
|--------|----------|-----------|-------|
| Error rate | {{BASELINE}}% | +1% | Disable flag |
| Latency (p95) | {{BASELINE}}ms | +50ms | Investigate |
| Conversion rate | {{BASELINE}}% | -5% | Investigate |
| User complaints | 0 | 10/hour | Disable flag |

### Monitoring Queries

```sql
-- Error rate by flag status
SELECT
    feature_flag_enabled,
    COUNT(*) as total,
    SUM(CASE WHEN error THEN 1 ELSE 0 END) as errors,
    SUM(CASE WHEN error THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as error_rate
FROM requests
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY feature_flag_enabled;
```

### Dashboards

- {{DATADOG_DASHBOARD_URL}}
- {{GRAFANA_DASHBOARD_URL}}
- {{CUSTOM_DASHBOARD_URL}}

---

## Rollback Plan

### Automatic Rollback Triggers

| Condition | Action |
|-----------|--------|
| Error rate increases >1% | Automatic disable |
| P95 latency increases >50ms | Alert + investigate |
| Customer complaints >10/hour | Manual disable |

### Manual Rollback

```bash
# Disable flag immediately
/feature-flag disable "{{FLAG_NAME}}" --env=production

# Or via environment variable
FEATURE_{{FLAG_KEY_UPPER}}=false
```

### Post-Rollback Actions

1. [ ] Notify stakeholders
2. [ ] Create incident ticket
3. [ ] Investigate root cause
4. [ ] Document findings
5. [ ] Plan remediation

---

## Cleanup Checklist

After successful 100% rollout for {{CLEANUP_WAIT_PERIOD}}:

### Code Cleanup

- [ ] Remove flag checks from backend code
- [ ] Remove flag checks from frontend code
- [ ] Remove legacy code paths
- [ ] Update tests to remove flag conditions
- [ ] Remove flag from configuration

### Configuration Cleanup

- [ ] Remove from `.env.example`
- [ ] Remove from `config/features.php`
- [ ] Remove from CI/CD configs
- [ ] Remove from infrastructure configs

### Documentation Cleanup

- [ ] Archive this document
- [ ] Update feature documentation
- [ ] Update API documentation

### Cleanup Commands

```bash
# Verify flag is at 100%
/feature-flag status "{{FLAG_NAME}}"

# Remove flag
/feature-flag cleanup --remove "{{FLAG_NAME}}"
```

---

## Dependencies

### Blocking Flags

| Flag | Status | Notes |
|------|--------|-------|
| {{BLOCKING_FLAG}} | {{STATUS}} | Must be at 100% first |

### Related Flags

| Flag | Relationship | Notes |
|------|--------------|-------|
| {{RELATED_FLAG}} | Depends on | Share rollout schedule |

---

## Testing

### Test Scenarios

| Scenario | Flag State | Expected Behavior |
|----------|------------|-------------------|
| New user flow | enabled | Uses new implementation |
| Legacy user flow | disabled | Uses legacy implementation |
| Edge case: {{CASE}} | enabled | {{EXPECTED}} |
| Error handling | enabled | Graceful degradation |

### Test Commands

```bash
# Test with flag enabled
FEATURE_{{FLAG_KEY_UPPER}}=true php artisan test

# Test with flag disabled
FEATURE_{{FLAG_KEY_UPPER}}=false php artisan test
```

---

## Stakeholders

| Role | Name | Notification |
|------|------|--------------|
| Product Owner | {{NAME}} | Major rollout changes |
| Tech Lead | {{NAME}} | All changes |
| On-Call | {{TEAM}} | Incidents only |
| Support | {{TEAM}} | Full rollout + incidents |

---

## Knowledge Graph Entity

```javascript
{
  name: "FLAG_FeatureFlag_{{FLAG_NAME_PASCAL}}",
  entityType: "feature-flag",
  observations: [
    "Key: {{FLAG_KEY}}",
    "Type: {{FLAG_TYPE}}",
    "Created: {{DATE}}",
    "Owner: {{OWNER}}",
    "Status: Production {{PERCENT}}%",
    "Requirement: REQ-{{REQ_ID}}"
  ]
}
```

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| {{DATE}} | {{NAME}} | Flag created |
| {{DATE}} | {{NAME}} | Rollout started |
| {{DATE}} | {{NAME}} | {{CHANGE}} |

---

*Template Version: 1.0*
*Last Updated: December 2025*
