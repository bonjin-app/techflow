---
id: incident-response
name: Incident Response
tagline: Restore service first, diagnose second, and turn the outage into a blameless postmortem
category: operations
tags: [Reliability, Operations, SRE, Process]
difficulty: 3
prerequisites: [observability, slo]
learningPath:
  - observability
  - slo
  - incident-response
  - chaos-engineering
  - canary-release
related:
  - { to: observability, rel: REQUIRES }
  - { to: slo, rel: REQUIRES }
  - { to: chaos-engineering, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: prometheus, rel: USED_WITH }
  - { to: observability-stack, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Incident response is the practice of getting a degraded system back to acceptable service
quickly and predictably, and then learning from it. It has four moving parts: **detection**
that is tied to user impact, **roles** so nobody is simultaneously debugging and briefing
executives, **mitigation before diagnosis** — roll back, fail over, shed load, flip the
flag — and a **blameless postmortem** whose action items are the actual product of the
whole exercise. Everything else is theatre.

## Why it matters

Every non-trivial system fails. What separates teams is not failure frequency but the time
between "something is wrong" and "users are fine again", and whether the same failure
returns next quarter. Without a process, an incident becomes a crowded chat channel where
six engineers investigate the same hypothesis, nobody tells support anything, someone
restarts a service and destroys the evidence, and the conclusion is "network blip".

A process turns that into something boring. It also protects the organisation from its own
worst instinct after an outage: finding a person to blame. That instinct is
counterproductive in the exact, mechanical sense that it makes the next outage longer,
because engineers who expect blame report late, hedge, and stop volunteering what they
actually did.

## Visual

```steps
title: Alert to postmortem
1. Detect | a burn-rate alert on a user-facing SLI, or a customer report you treat as a signal
2. Declare early | an incident with a severity, a channel and a timestamp; standing it down is cheap
3. Assign roles | incident commander, operations lead, communications lead, scribe
4. Assess impact | which journeys, which users, since when, how much error budget is burning
5. Communicate first status | internal channel and status page within minutes, even with nothing known
6. Mitigate | roll back, fail over, disable the feature flag, shed load, scale out
7. Confirm recovery | the same SLI that alerted must come back, not a proxy metric
8. Hand over or stand down | explicit handoff if it crosses a shift boundary
9. Write the timeline | from logs, deploys and chat, while memory is fresh
10. Blameless postmortem | contributing factors, what made detection slow, dated action items with owners
11. Track the actions | unfinished postmortem items are the reason incidents repeat
```

## How it works

**Detection must be about users.** An alert on CPU wakes someone for a condition that may
harm no one; an alert on error-budget burn rate wakes someone precisely when the
[SLO](/concept/slo) is at risk. Two or three burn-rate alerts per service beat forty
threshold alerts, and they beat them mostly by ending alert fatigue, which is the single
largest cause of slow detection.

**Declare sooner than feels justified.** The cost of declaring an incident that turns out
to be minor is a few minutes of process. The cost of not declaring is that the response
starts twenty minutes late with the wrong people. Make the severity definitions concrete —
tied to journeys and user counts rather than adjectives — so declaring is a lookup, not a
judgement call under stress.

**Separate the roles.** The **incident commander** owns the incident, not the fix: they
maintain the state of the world, decide what is tried next, and prevent parallel
uncoordinated changes. The **operations lead** is the only person making changes to the
system. The **communications lead** handles the status page, support and stakeholders. The
**scribe** timestamps what happened. In a small incident one person may hold several roles,
but the commander should never also be the one typing commands — as soon as they are deep
in a terminal, coordination stops.

**Mitigate before you diagnose.** Understanding the root cause is a separate activity from
restoring service, and it is usually the slower one. If the last deploy correlates with the
onset, roll it back and investigate afterwards — that is the argument for
[Canary Release](/pattern/canary-release), [Blue-Green Deployment](/pattern/blue-green-deployment)
and [Feature Flags](/pattern/feature-flag): they make mitigation a single reversible action
rather than a debugging session. Fail over the region, drain the bad instance, disable the
expensive endpoint. Curiosity is the enemy of mean time to recovery.

**One change at a time, and write it down.** Concurrent untracked changes make the system
unexplainable and can turn a partial outage into a full one. The scribe's log is also what
makes the postmortem possible; reconstructing a timeline from memory a week later produces
fiction.

## Deep Dive

**The postmortem is the deliverable.** An incident that is mitigated and never analysed has
bought you nothing but a return visit. A useful postmortem contains: a factual timeline
with timestamps, user impact quantified (requests failed, budget consumed, duration),
contributing factors rather than a single root cause, what went well, what made detection
or mitigation slow, and action items with owners and dates. Distinguish the items that
prevent recurrence from those that shorten the next response — the second category is
often more valuable, because the next failure will be different.

**Blameless means specific, not vague.** The point is not to avoid naming actions; it is to
treat every human action as the reasonable output of the information and tooling available
at that moment. "An engineer ran the migration without a dry run" is not a finding. "The
migration tool had no dry-run mode and the runbook did not mention the lock it takes" is a
finding, and it generates work. If the postmortem's conclusion is that someone should be
more careful, the analysis stopped too early.

**Practice, because process degrades.** Runbooks rot, dashboards break, and the on-call
engineer at 3 a.m. is not the person who wrote either. [Chaos Engineering](/concept/chaos-engineering)
game days exercise the response itself — paging, escalation, runbook accuracy, whether the
status page can even be updated — and reliably find gaps that no code review would.

**On-call is a system with a load limit.** Alert volume, rotation size, handover quality
and compensation determine whether the process survives contact with a bad month. A rotation
where the on-call engineer is regularly woken by non-actionable alerts will produce slower
detection within weeks, no matter how good the written process is.

**Instrument the process, not only the system.** Track time to detect, time to declare,
time to mitigate and postmortem action completion rate. Those four numbers tell you which
part of the response to invest in — and completion rate is usually the one that is quietly
terrible.
