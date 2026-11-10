# Runbook: {{SERVICE/PROCESS NAME}}

## Overview

| Property | Value |
|----------|-------|
| **Service** | {{Service name}} |
| **Owner** | {{Team/Person}} |
| **Criticality** | Critical / High / Medium / Low |
| **Last Updated** | {{DATE}} |
| **On-call** | {{On-call rotation info}} |

---

## Service Description

### Purpose
{{What does this service do? Why does it exist?}}

### Dependencies
| Service | Type | Criticality |
|---------|------|-------------|
| {{Service}} | Upstream / Downstream | Critical / Non-critical |
| {{Database}} | Database | Critical |
| {{Cache}} | Cache | Non-critical |

### Architecture
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │ → │   Service   │ → │  Database   │
└─────────────┘     └─────────────┘     └─────────────┘
                          ↓
                    ┌─────────────┐
                    │    Cache    │
                    └─────────────┘
```

---

## Access & Credentials

### Environments
| Environment | URL | Access |
|-------------|-----|--------|
| Production | {{URL}} | {{How to access}} |
| Staging | {{URL}} | {{How to access}} |
| Development | {{URL}} | {{How to access}} |

### Required Permissions
- {{Permission 1}} - {{How to obtain}}
- {{Permission 2}} - {{How to obtain}}

### Credentials Location
- Production: {{Vault/Secret manager path}}
- Staging: {{Location}}

---

## Monitoring & Alerting

### Dashboards
| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Main Dashboard | {{URL}} | Overall health |
| Performance | {{URL}} | Latency, throughput |
| Errors | {{URL}} | Error rates |

### Key Metrics
| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| Response Time | < 200ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| CPU Usage | < 70% | > 85% |
| Memory Usage | < 80% | > 90% |
| Queue Depth | < 100 | > 1000 |

### Alerts
| Alert | Severity | Response Time | Escalation |
|-------|----------|---------------|------------|
| {{Alert name}} | P1 | 5 min | {{Escalation path}} |
| {{Alert name}} | P2 | 15 min | {{Escalation path}} |

---

## Common Operations

### Health Check
```bash
# Check service health
curl -s https://{{service}}/health | jq

# Expected response
{
  "status": "healthy",
  "database": "connected",
  "cache": "connected"
}
```

### Restart Service
```bash
# Application server
sudo systemctl restart <application server service>
sudo systemctl restart nginx

# Containers
<container compose command> restart {{service}}

# Kubernetes
kubectl rollout restart deployment/{{service}}
```

### View Logs
```bash
# Application logs
tail -f <application log file>

# System logs
journalctl -u {{service}} -f

# Container logs
<container runtime> logs -f {{container}}

# Kubernetes logs
kubectl logs -f deployment/{{service}}
```

### Clear Cache
```bash
# Application caches
<clear application cache command>
<clear configuration cache command>
<clear route cache command>
<clear view cache command>

# Redis
redis-cli FLUSHDB

# After clearing, rebuild
<rebuild configuration cache command>
<rebuild route cache command>
<rebuild view cache command>
```

### Database Operations
```bash
# Check connection
<database connection check command>

# Run migrations
<run migrations command>

# Rollback last migration
<roll back last migration command>
```

---

## Troubleshooting Guide

### Issue: High Response Time

**Symptoms**:
- API responses > 500ms
- Dashboard showing latency spike

**Diagnosis**:
```bash
# Check database connections
<database connection check command>

# Check slow queries
tail -f <slow query log file>

# Check Redis connection
redis-cli ping

# Check queue depth
<queue depth check command>
```

**Resolution**:
1. Check for slow database queries
2. Verify cache is working
3. Check for resource-intensive background jobs
4. Scale horizontally if needed

---

### Issue: High Error Rate

**Symptoms**:
- Error rate > 1%
- 500 errors in logs

**Diagnosis**:
```bash
# Check recent errors
tail -100 <application log file> | grep -i error

# Check PHP-FPM status
sudo systemctl status php-fpm

# Check memory
free -m

# Check disk space
df -h
```

**Resolution**:
1. Identify error pattern in logs
2. Check for recent deployments
3. Verify external service connectivity
4. Consider rollback if caused by deployment

---

### Issue: Service Unavailable

**Symptoms**:
- 502/503 errors
- Health check failing

**Diagnosis**:
```bash
# Check service status
sudo systemctl status {{service}}
sudo systemctl status nginx
sudo systemctl status php-fpm

# Check ports
netstat -tlnp | grep {{port}}

# Check processes
ps aux | grep {{process}}
```

**Resolution**:
1. Restart the service
2. Check for crashed workers
3. Verify configuration
4. Check for full disk/memory

---

### Issue: Database Connection Errors

**Symptoms**:
- "Connection refused" errors
- Timeout errors

**Diagnosis**:
```bash
# Test database connection
mysql -h {{host}} -u {{user}} -p -e "SELECT 1"

# Check connection pool
<application console command>
>>> DB::connection()->getPdo()

# Check max connections
mysql -e "SHOW STATUS LIKE 'Threads_connected'"
```

**Resolution**:
1. Verify database is running
2. Check connection limits
3. Verify credentials
4. Check network connectivity

---

## Incident Response

### Severity Definitions
| Severity | Impact | Response Time | Examples |
|----------|--------|---------------|----------|
| P0 | Complete outage | Immediate | Service down, data loss |
| P1 | Major degradation | 15 min | High error rate, slow |
| P2 | Minor degradation | 1 hour | Feature unavailable |
| P3 | Low impact | Next business day | UI issues |

### Incident Workflow
1. **Acknowledge** the alert
2. **Assess** severity and impact
3. **Communicate** status to stakeholders
4. **Investigate** root cause
5. **Resolve** or mitigate
6. **Document** in incident report
7. **Schedule** postmortem (P0/P1)

### Communication Templates

**Initial Notification**:
```
[{{SEVERITY}}] {{SERVICE}} - {{BRIEF DESCRIPTION}}
Impact: {{USER IMPACT}}
Status: Investigating
Next update: {{TIME}}
```

**Resolution Notification**:
```
[RESOLVED] {{SERVICE}} - {{BRIEF DESCRIPTION}}
Duration: {{DURATION}}
Root cause: {{BRIEF ROOT CAUSE}}
Postmortem: {{LINK}}
```

---

## Deployment

### Pre-deployment Checklist
- [ ] All tests passing
- [ ] Code review approved
- [ ] Database migrations ready
- [ ] Feature flags configured
- [ ] Monitoring alerts updated
- [ ] Rollback plan documented

### Deployment Steps
```bash
# 1. Enable maintenance mode
<enable maintenance mode command>

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
<install production dependencies command>

# 4. Run migrations
<run migrations command>

# 5. Clear and rebuild caches
<optimize application command>

# 6. Restart workers
<restart queue workers command>

# 7. Disable maintenance mode
<disable maintenance mode command>
```

### Rollback Procedure
```bash
# 1. Enable maintenance mode
<enable maintenance mode command>

# 2. Revert to previous release
git checkout {{previous_tag}}

# 3. Rollback migrations (if applicable)
<roll back {{N}} migrations command>

# 4. Restore dependencies
<install production dependencies command>

# 5. Clear caches
<clear optimized caches command>
<optimize application command>

# 6. Disable maintenance mode
<disable maintenance mode command>
```

---

## Maintenance

### Scheduled Maintenance
| Task | Frequency | Procedure |
|------|-----------|-----------|
| Log rotation | Daily | Automatic via logrotate |
| Database backup | Hourly | Automatic via {{tool}} |
| Certificate renewal | Quarterly | {{Procedure}} |
| Dependency updates | Monthly | {{Procedure}} |

### Capacity Planning
| Resource | Current | Threshold | Scale Action |
|----------|---------|-----------|--------------|
| CPU | {{%}} | 80% | Add instance |
| Memory | {{GB}} | 85% | Increase RAM |
| Disk | {{GB}} | 80% | Expand volume |
| Database | {{GB}} | 75% | Scale up |

---

## Contacts

### Team Contacts
| Role | Name | Contact |
|------|------|---------|
| On-call | Rotation | {{PagerDuty/Slack}} |
| Tech Lead | {{Name}} | {{Contact}} |
| Product Owner | {{Name}} | {{Contact}} |

### External Contacts
| Vendor | Contact | For |
|--------|---------|-----|
| {{Vendor}} | {{Contact}} | {{Service issues}} |

---

## Appendix

### Useful Commands Cheatsheet
```bash
# Quick health check
curl -s localhost/health

# Tail all logs
tail -f storage/logs/*.log

# Database stats
<database status command>

# Queue status
<queue depth check command>

# Cache stats
<cache table inspection command>
```

### Related Documentation
- [Architecture Docs]({{link}})
- [API Documentation]({{link}})
- [Security Runbook]({{link}})

---

*Last reviewed: {{DATE}}*
*Next review: {{DATE + 3 months}}*
