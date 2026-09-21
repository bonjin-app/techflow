---
id: feature-store
name: Feature Store
tagline: One definition of a model's inputs, served identically to training and to production
category: data
tags: [ML, Data, Infrastructure, Consistency]
difficulty: 4
prerequisites: [database, machine-learning, cache]
learningPath:
  - database
  - machine-learning
  - feature-store
  - model-serving
related:
  - { to: machine-learning, rel: REQUIRES }
  - { to: model-serving, rel: USED_WITH }
  - { to: redis, rel: USED_WITH }
  - { to: data-quality, rel: RELATED_TO }
  - { to: change-data-capture, rel: USED_WITH }
  - { to: materialized-view, rel: RELATED_TO }
  - { to: dimensional-modeling, rel: RELATED_TO }
  - { to: backfill, rel: USED_WITH }
meta: { lastReviewed: 2026-09-21, confidence: medium }
---

## TL;DR

A model is a function of its features — "orders in the last 30 days", "seconds since last
login", "median basket value". A feature store is the one place those are defined, computed,
stored and served: as a table of historical values for training, and as a low-latency lookup
for inference.

It exists because those two paths are usually written twice, by different people, in
different languages — and then the model performs worse in production than it did in the
notebook, for reasons nobody can find.

## Why it matters

**Training/serving skew is the failure it prevents.** The training pipeline computes
`orders_last_30d` with a SQL window over the warehouse. The serving path recomputes it in
application code against the operational database. One counts cancelled orders; the other
does not. Nothing errors. The model is simply a little wrong, all the time, in a way that
looks like model quality rather than a data bug.

**Point-in-time correctness is the subtler half.** Training rows must contain the feature
values *as they were when the event happened*, not as they are now. Join a label from March
against a feature computed today and you have leaked the future into training. The model
scores beautifully offline and fails in production — the most expensive way to discover a
data bug.

**Reuse is the ordinary benefit.** `user_ltv` is wanted by the recommender, the fraud model
and the churn model. Without a shared definition, three teams write three versions, and any
statement about "the" feature is meaningless.

## Visual

```sequence
title: One definition, two paths
participants: Source [change-data-capture], Store [feature-store], Training [machine-learning], API [model-serving]
Source -> Store: events and table changes
Store -> Store: compute feature from one definition
Store -> Training: point-in-time correct history
Training --> Store: model trained on these exact values
API -> Store: get features for user 42
Store --> API: same definition, single-digit ms
API --> API: predict
```

## Solutions

**The offline store** holds full history, usually in the warehouse or a lakehouse. It answers
"what was this feature worth at these timestamps" for millions of rows at once. Its query is
an *as-of* join: for each label row, the last feature value strictly before that row's event
time.

**The online store** holds only the latest value per entity, in something built for lookups —
[Redis](/technology/redis), DynamoDB, Cassandra. Inference reads it on the request path, so
the budget is single-digit milliseconds for possibly hundreds of features.

**One definition feeds both.** The feature is declared once — a transformation plus an entity
plus a freshness requirement — and the store materialises it to both places. That single
declaration is the entire point; everything else is plumbing.

**Freshness is a per-feature decision.** Some features are fine computed nightly. Some must
reflect the last thirty seconds, which means streaming computation and a much larger bill.
Writing the requirement down next to the feature is what stops the question being rediscovered
during an incident.

```steps
title: What a feature declaration pins down
Entity | what it is keyed by — user, merchant, session
Transformation | the computation, written once
Source | which tables or streams it reads
Freshness | how stale the online value may be
Backfill window [backfill] | how much history to materialise for training
Owner | who is called when it drifts
```

**Monitoring closes the loop.** Feature distributions drift — an upstream schema change, a
broken job, a genuine shift in behaviour. Because the store is the choke point, it is also
the natural place to detect that today's values no longer look like the ones the model was
trained on.

## Deep Dive

**The as-of join is the hard engineering.** Naively, for every label row you scan the feature
history for the latest value before its timestamp. At millions of rows this has to become a
sorted merge, which is why feature stores lean on engines that can do it and why an in-house
version usually starts by getting this wrong and leaking future data.

**You may not need one.** A feature store earns its keep when several models share features,
when online inference needs low latency, and when point-in-time correctness is not obvious to
get right. A single model, batch-scored nightly, with features computed by one dbt model, has
none of those problems — and adding a store buys infrastructure instead of solving anything.

**Build versus buy is really build versus operate.** The components are not exotic: a
warehouse, a key-value store, a scheduler, a registry. Teams routinely assemble them. What
they underestimate is the long tail — backfills, schema evolution of a feature, freshness
monitoring, and the as-of join staying correct as the definition changes.

**It overlaps with things you already have.** The offline store is a
[materialized view](/pattern/materialized-view) with time travel; the online store is a cache
with a well-defined writer; the pipeline is ordinary
[change data capture](/concept/change-data-capture) and stream processing. Recognising that
keeps the decision honest: the value on offer is the shared definition and the correctness
guarantee, not novel machinery.
