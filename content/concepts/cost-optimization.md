---
id: cost-optimization
name: Cost Management
tagline: The cloud bill is an output of your architecture, and it tells you which design you chose
category: operations
tags: [Cloud, Cost, Operations, Capacity, FinOps]
difficulty: 3
prerequisites: [cloud-platform, capacity-planning, observability]
learningPath:
  - cloud-platform
  - capacity-planning
  - observability
  - cost-optimization
  - slo
  - serverless
related:
  - { to: capacity-planning, rel: RELATED_TO }
  - { to: cloud-platform, rel: REQUIRES }
  - { to: serverless, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: cloud-networking, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A cloud bill is not an accounting artefact — it is a readout of your architecture. Idle
capacity, chatty services, retained logs, cross-zone traffic and a database three sizes too
large all show up as line items, and none of them can be negotiated away by procurement. The
practice that works is boring: attribute cost to teams and features, track a **unit cost**
(cost per request, per tenant, per gigabyte processed) rather than a total, and fix the two
or three line items that dominate. The total always grows with the business; the unit cost
is the number that tells you whether engineering is winning.

## Why it matters

Cost arrives late and diffusely. Nobody approves a $40,000 bill; a hundred reasonable
decisions produce one. A staging environment nobody turned off, a retry storm that doubled
request volume, a debug log level left on in production, a table with no lifecycle policy,
an autoscaler with a floor set during an incident and never lowered.

The reason this is an engineering topic rather than a finance one is that the levers are all
architectural. Finance can buy a commitment discount — perhaps 30–50% on steady-state
compute. Engineering can delete the workload entirely. When the two are confused, companies
end up with three-year commitments on capacity they should have removed.

There is also a deadline dynamic worth naming: cost work is never urgent until it is
suddenly the quarter's priority, and by then the cheap structural fixes — a lifecycle policy,
a tag convention, a cache — would have had to be in place months earlier. A small amount of
it, continuously, is much cheaper than a cost programme.

## Visual

```steps
title: Where the money usually is, in the order worth checking
Idle and over-provisioned compute | instances sized for a launch that never came; non-production running at night
Databases sized for peak | the largest single line item in most bills, and the least often revisited
Data transfer | cross-zone chatter, NAT egress, internet egress — invisible until you look
Storage without a lifecycle | every snapshot, every log, every artefact, kept forever by default
Observability volume | logs, metrics and traces are priced per gigabyte and per series
Forgotten resources | orphaned disks, unattached addresses, old load balancers, dead environments
Retries and fan-out | one client bug multiplies requests, and every layer bills for them
Per-request AI and API spend | now a top line item, and the one that scales with usage fastest
Commitment coverage | the discount you have not claimed on the capacity you genuinely keep
Architecture itself | the cache you did not build, the [CDN](/concept/cdn) you did not put in front
```

## Solutions

**Make cost attributable before you try to reduce it.** Mandatory tags for owner, environment
and service, enforced by policy rather than convention, plus per-account or per-project
separation for the big boundaries. Without attribution, every cost conversation is a general
appeal to everyone and nothing changes; with it, a team sees its own number.

**Track unit cost, not total cost.** Cost per thousand requests, per active tenant, per
gigabyte ingested, per order processed. A rising total with a falling unit cost is a company
growing. A flat total with a rising unit cost is a system decaying. Only the unit number
tells an engineer whether a change helped.

**Right-size against observed usage, then automate it.** Most workloads are provisioned for a
peak that was estimated, not measured. Use actual CPU, memory and IOPS percentiles over
weeks, leave genuine headroom, and let autoscaling handle the rest — with a floor low enough
to matter and a ceiling high enough to survive. This is the same measurement discipline as
[Capacity Planning](/concept/capacity-planning), pointed at the bill.

**Turn off what nobody is using.** Non-production environments on a schedule, ephemeral
environments that expire, and a recurring sweep for orphaned disks, idle load balancers and
old snapshots. This is unglamorous and routinely returns 10–20% of a bill on the first pass.

**Put a lifecycle on every byte.** Logs, backups, artefacts and raw event data all need a
retention policy and a tiering rule — hot for days, infrequent access for weeks, archive for
years, deleted after that. Storage is cheap per gigabyte and expensive per forever.

**Buy commitments only for the floor you are certain of.** Savings plans and reserved
capacity are a discount for predictability. Cover the baseline you will keep for the term,
leave variable load on demand or on spot capacity, and never commit to a workload you are
planning to re-architect. Overcommitment is a worse outcome than the discount you missed.

**Design the expensive paths out.** A [cache](/concept/cache) in front of a hot query removes
database capacity, a [CDN](/concept/cdn) removes egress and origin load, a smaller payload
removes transfer, batching removes per-request overhead, and a queue lets you run expensive
work on cheap interruptible capacity. These are architectural savings, they compound, and
they do not expire like a discount.

## Deep Dive

**Choose the pricing model as an architectural decision.** Serverless is priced per request
and per millisecond: excellent for spiky and low-volume workloads, and progressively worse
than a reserved instance as steady load rises. Containers on a shared cluster amortise well
but carry a platform team's cost. Spot capacity is a large discount for accepting
interruption, which suits batch, CI and stateless workers and not a stateful primary. There
is a crossover point for each, and it is worth calculating rather than assuming — see
[Serverless](/concept/serverless).

**Observability is frequently the surprise.** Debug logging at scale, high-cardinality
metrics (one time series per user or per request id) and unsampled traces can rival the
compute they observe. The fix is not to stop measuring: it is to sample traces, keep
cardinality bounded, log at the level the system actually needs, and set retention per
signal — hot for a week, archived after. Decide it deliberately, because the default is to
keep everything.

**Cost and reliability are a trade you should make explicitly.** Multi-region active-active
roughly doubles infrastructure to serve the same traffic. Warm standby costs less and
recovers slower. Backups and a rebuild cost least and recover slowest. The right answer comes
from the recovery objectives the business will actually fund, and belongs in the same
conversation as the [SLO](/concept/slo) — an availability target is a purchase.

**Egress and cross-zone traffic are architecture smells with a price tag.** If data transfer
is a major line, the system is probably chattier than it needs to be, or spread across zones
without zone-aware routing, or serving assets from the origin instead of a
[CDN](/concept/cdn). See [Networking & VPC](/concept/cloud-networking) for where the charges
come from; the cheapest byte is the one not sent.

**Per-token AI spend behaves unlike infrastructure.** It scales linearly with usage, with
almost no economy of scale, and it is controlled by different levers: a smaller model for
easy requests, retrieval instead of a stuffed [context window](/concept/context-window), a
[semantic cache](/pattern/semantic-cache) for repeated questions, and a hard budget per user
and per key. Without a cap, one integration bug is a five-figure day.

**Guardrails beat campaigns.** Budget alerts at a percentage of forecast, an anomaly alert
that fires on a daily jump, a policy that blocks the largest instance types outside
production, and a required tag on creation. These catch the spike in hours rather than on the
invoice, and they keep working when nobody is paying attention — which is the normal state.

**Make the number visible to the people who move it.** A per-service cost line next to the
latency and error dashboards, reviewed in the same meeting, changes behaviour more than any
report sent to a manager. Engineers optimise what they can see; the reason cost is usually
invisible is simply that nobody put it on the dashboard.
