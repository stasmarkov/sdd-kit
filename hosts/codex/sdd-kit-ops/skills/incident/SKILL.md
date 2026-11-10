---
name: incident
description: "Run an incident response workflow: open an incident record, triage by severity, investigate logs and recent deploys, mitigate, resolve, and draft a postmortem with action items. Use when production is broken or degraded, when updating or resolving an active incident, or when writing a postmortem."
argument-hint: "[severity] | --start | --update | --resolve"
allowed-tools: Bash, Read, Grep, Write
metadata:
  mcp-tools: "sentry, datadog"
  version: "1.1"
  subagents: "incident-responder"
---

# /incident

Start and manage incident response workflows with structured triage and resolution.

## Usage

```bash
# Start new incident
/incident --start --severity=high "API returning 500 errors"

# Update incident status
/incident --update INC-001 "Identified root cause"

# Resolve incident
/incident --resolve INC-001

# View active incidents
/incident --list

# Generate postmortem
/incident --postmortem INC-001
```

## Incident Severity Levels

### SEV-1 (Critical)
- Complete service outage
- Data loss or corruption
- Security breach
- Response: Immediate (< 15 min)

### SEV-2 (High)
- Major feature unavailable
- Significant performance degradation
- Data integrity issues
- Response: < 30 min

### SEV-3 (Medium)
- Minor feature issues
- Non-critical errors
- Response: < 2 hours

### SEV-4 (Low)
- Minor bugs
- Cosmetic issues
- Response: Next business day

## Incident Workflow

### Step 1: Detection & Triage
```bash
echo "🚨 INCIDENT DETECTED"

# Create incident record
INCIDENT_ID="INC-$(date +%Y%m%d%H%M)"

cat > incidents/$INCIDENT_ID.md << EOF
# Incident $INCIDENT_ID

**Severity**: $SEVERITY
**Status**: INVESTIGATING
**Started**: $(date -Iseconds)
**Commander**: $(whoami)

## Description
$DESCRIPTION

## Timeline
- $(date '+%H:%M') - Incident detected
EOF

echo "Incident created: $INCIDENT_ID"
```

### Step 2: Initial Assessment
```bash
echo "🔍 Running initial assessment..."

# Check error logs
tail -100 storage/logs/laravel.log | grep -i error

# Check application status
curl -s $APP_URL/api/health

# Check recent deployments
git log --oneline -5

# Check Sentry for errors
sentry:errors --last=1h
```

### Step 3: Impact Analysis
```bash
echo "📊 Analyzing impact..."

# Check affected users
mysql -e "SELECT COUNT(*) FROM users WHERE last_active > NOW() - INTERVAL 1 HOUR"

# Check failed requests
grep "500\|502\|503" /var/log/nginx/access.log | tail -100

# Check queue failures
php artisan queue:failed | wc -l
```

### Step 4: Resolution Actions
```bash
echo "🔧 Resolution actions..."

# Common fixes
case $ISSUE_TYPE in
    "database")
        mysql -e "SHOW FULL PROCESSLIST"
        # Kill long-running queries if needed
        ;;
    "memory")
        sudo systemctl restart php-fpm
        ;;
    "queue")
        php artisan queue:restart
        ;;
    "cache")
        php artisan cache:clear
        ;;
esac
```

### Step 5: Verification
```bash
echo "✅ Verifying resolution..."

# Health check
curl -s $APP_URL/api/health

# Monitor for new errors
tail -f storage/logs/laravel.log | head -20

# Confirm user impact resolved
```

### Step 6: Documentation

Record the resolution in the incident file, then write the follow-up documents from the kit's templates (`.codex/sdd-kit/templates/docs/` in file-copy installs, `src/templates/docs/` in the core plugin):

- **Postmortem** (`--postmortem INC-001`): fill `postmortem.template.md` into `docs/postmortems/<YYYY-MM-DD>-<slug>.md`. Blameless; timeline from the incident record; root cause backed by evidence (log lines, commits, `file:line`); each action item has an owner and a due date.
- **Runbook**: when the incident exposed a missing or wrong procedure, create or update `docs/runbooks/<service>.md` from `runbook.template.md` (symptoms, diagnosis commands, mitigation steps, escalation).

```bash
# Update incident record
cat >> incidents/$INCIDENT_ID.md << EOF

## Resolution
- Root cause: $ROOT_CAUSE
- Fix applied: $FIX_DESCRIPTION
- Verified: $(date '+%H:%M')

## Timeline (Completed)
- $(date '+%H:%M') - Incident resolved

## Action Items
- [ ] Schedule postmortem
- [ ] Create follow-up tickets
- [ ] Update runbooks
EOF
```

## Communication Templates

### Initial Notification
```
🚨 INCIDENT: [SEVERITY] - [Title]

Status: Investigating
Impact: [Description of user impact]
ETA: Assessing

Updates will follow.
```

### Update Notification
```
📊 INCIDENT UPDATE: [Title]

Status: [Status]
Progress: [What was done]
Next: [Next steps]
ETA: [Estimated resolution]
```

### Resolution Notification
```
✅ INCIDENT RESOLVED: [Title]

Duration: [Time]
Root Cause: [Brief description]
Resolution: [What was done]

Full postmortem to follow.
```

## Output Format

```
🚨 Incident Management

═══════════════════════════════════════════════════════════

📋 Incident: INC-202501150930
Severity: SEV-2 (High)
Status: INVESTIGATING
Commander: @developer

═══════════════════════════════════════════════════════════

📝 Description:
API returning 500 errors for /api/v1/orders endpoint

📊 Impact:
- Affected Users: ~500
- Failed Requests: 1,234
- Duration: 15 minutes

═══════════════════════════════════════════════════════════

🕐 Timeline:

09:30 - Alert triggered (Datadog)
09:32 - Incident created, commander assigned
09:35 - Initial assessment: database connection timeout
09:40 - Root cause identified: long-running query
09:42 - Fix applied: killed query, added index
09:45 - Verification complete, all checks passing
09:48 - Incident resolved

═══════════════════════════════════════════════════════════

✅ Resolution:

Root Cause: Missing database index caused query timeout
Fix: Added index on orders.created_at column
Prevention: Scheduled query optimization review

═══════════════════════════════════════════════════════════

📋 Action Items:
- [ ] Schedule postmortem (within 48h)
- [ ] Add query monitoring alert
- [ ] Update incident runbook
```

## Hand-off

An incident ends with two follow-ups, never a hot fix left without a test:
- **Root-cause fix** → `/sdd` (bug route): the `fix-bug` workflow reproduces the failure, writes the regression test, and fixes it minimally. Pass the incident record as the bug report.
- **Recurring class** (the same kind of failure has happened before, or the postmortem names a gap such as a missing index check, alert, or guard) → `/learn` with the postmortem action item, so the guard becomes a test, a static rule, a path rule, or a documented invariant.

**Source verification**: follow the `source-verification` skill.

