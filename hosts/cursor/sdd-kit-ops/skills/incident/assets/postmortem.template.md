# Incident Postmortem: {{INCIDENT_TITLE}}

## Incident Summary

| Field | Value |
|-------|-------|
| **Incident ID** | INC-{{ID}} |
| **Date** | {{YYYY-MM-DD}} |
| **Duration** | {{X hours Y minutes}} |
| **Severity** | P0 / P1 / P2 |
| **Services Affected** | {{List of services}} |
| **Users Affected** | {{Number or percentage}} |
| **Incident Commander** | {{Name}} |
| **Postmortem Author** | {{Name}} |
| **Postmortem Date** | {{YYYY-MM-DD}} |

---

## Executive Summary

{{2-3 sentence summary of what happened, impact, and resolution}}

---

## Impact

### User Impact
- {{Impact description 1}}
- {{Impact description 2}}

### Business Impact
- {{Financial impact if applicable}}
- {{SLA/SLO violations}}
- {{Reputation impact}}

### Metrics During Incident
| Metric | Normal | During Incident | Peak |
|--------|--------|-----------------|------|
| Error Rate | 0.1% | {{X%}} | {{Y%}} |
| Response Time | 200ms | {{Xms}} | {{Yms}} |
| Availability | 99.9% | {{X%}} | - |
| Affected Users | 0 | {{X}} | {{Y}} |

---

## Timeline

*All times in {{timezone}}*

| Time | Event |
|------|-------|
| {{HH:MM}} | **Detection**: {{How incident was detected}} |
| {{HH:MM}} | **Alert**: {{Alert fired}} |
| {{HH:MM}} | **Response**: {{First responder acknowledged}} |
| {{HH:MM}} | **Investigation**: {{Initial investigation started}} |
| {{HH:MM}} | **Identification**: {{Root cause identified}} |
| {{HH:MM}} | **Mitigation**: {{Mitigation action taken}} |
| {{HH:MM}} | **Recovery**: {{Service started recovering}} |
| {{HH:MM}} | **Resolution**: {{Incident fully resolved}} |
| {{HH:MM}} | **Monitoring**: {{Confirmed stable operation}} |

### Key Moments
- **Time to Detect (TTD)**: {{X minutes}}
- **Time to Respond (TTR)**: {{X minutes}}
- **Time to Mitigate (TTM)**: {{X minutes}}
- **Time to Resolve (MTTR)**: {{X minutes}}

---

## Root Cause Analysis

### What Happened
{{Detailed technical explanation of what went wrong}}

### Why It Happened
{{Use the 5 Whys technique}}

1. **Why did the service fail?**
   {{Answer}}

2. **Why did that happen?**
   {{Answer}}

3. **Why did that happen?**
   {{Answer}}

4. **Why did that happen?**
   {{Answer}}

5. **Why did that happen?**
   {{Root cause}}

### Contributing Factors
- {{Factor 1}}
- {{Factor 2}}
- {{Factor 3}}

---

## Detection

### How Was It Detected?
- [ ] Automated monitoring/alerting
- [ ] Customer report
- [ ] Internal team member
- [ ] Other: {{specify}}

### Detection Gap
{{If detection was delayed, explain why and what could improve it}}

---

## Response

### What Went Well
- {{Positive aspect 1}}
- {{Positive aspect 2}}
- {{Positive aspect 3}}

### What Didn't Go Well
- {{Issue 1}}
- {{Issue 2}}
- {{Issue 3}}

### Where We Got Lucky
- {{Lucky break 1}}
- {{Lucky break 2}}

---

## Resolution

### Immediate Actions Taken
1. {{Action 1}}
2. {{Action 2}}
3. {{Action 3}}

### Code Changes Made
- PR #{{number}}: {{description}}
- PR #{{number}}: {{description}}

### Configuration Changes Made
- {{Change 1}}
- {{Change 2}}

---

## Prevention

### Action Items

| Priority | Action | Owner | Due Date | Status |
|----------|--------|-------|----------|--------|
| P0 | {{Action item}} | {{Name}} | {{Date}} | Open |
| P1 | {{Action item}} | {{Name}} | {{Date}} | Open |
| P1 | {{Action item}} | {{Name}} | {{Date}} | Open |
| P2 | {{Action item}} | {{Name}} | {{Date}} | Open |

### Categories of Improvements

#### Detection
- [ ] {{Monitoring improvement}}
- [ ] {{Alert improvement}}

#### Prevention
- [ ] {{Code change to prevent recurrence}}
- [ ] {{Process change}}

#### Response
- [ ] {{Runbook update}}
- [ ] {{Training need}}

#### Recovery
- [ ] {{Faster recovery mechanism}}
- [ ] {{Rollback improvement}}

---

## Lessons Learned

### Technical Lessons
1. {{Lesson 1}}
2. {{Lesson 2}}

### Process Lessons
1. {{Lesson 1}}
2. {{Lesson 2}}

### Communication Lessons
1. {{Lesson 1}}
2. {{Lesson 2}}

---

## Communication

### Internal Communication
| Time | Channel | Message |
|------|---------|---------|
| {{HH:MM}} | {{Slack/Email}} | {{Summary of message}} |

### External Communication
| Time | Channel | Message |
|------|---------|---------|
| {{HH:MM}} | {{Status page/Email}} | {{Summary of message}} |

### Communication Effectiveness
{{What worked? What could be improved?}}

---

## Related Incidents

| Incident | Date | Similarity |
|----------|------|------------|
| INC-{{XX}} | {{Date}} | {{How it's related}} |

---

## Supporting Data

### Relevant Logs
```
{{Key log entries}}
```

### Relevant Metrics
{{Link to dashboards or screenshots}}

### Relevant Code
<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Appendix

### Participants
| Name | Role During Incident |
|------|---------------------|
| {{Name}} | Incident Commander |
| {{Name}} | Technical Lead |
| {{Name}} | Communications |

### References
- [Incident Ticket]({{link}})
- [Slack Thread]({{link}})
- [Related PRs]({{link}})
- [Monitoring Dashboard]({{link}})

---

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Postmortem Author | {{Name}} | {{Date}} | ✅ |
| Technical Reviewer | {{Name}} | {{Date}} | ⬜ |
| Team Lead | {{Name}} | {{Date}} | ⬜ |

---

*This postmortem follows a blameless culture. The goal is to learn and improve, not to assign blame.*

*Document created: {{DATE}}*
*Last updated: {{DATE}}*
