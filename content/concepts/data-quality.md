---
id: data-quality
name: Data Quality, Tests & Contracts
tagline: Pipelines fail silently — the job succeeds, the numbers are wrong, and nobody is paged
category: data
tags: [Data, Quality, Testing, Contracts, Reliability]
difficulty: 3
prerequisites: [sql, database, testing]
learningPath:
  - sql
  - database
  - testing
  - data-quality
  - dbt
  - observability
related:
  - { to: dbt, rel: USED_WITH }
  - { to: contract-testing, rel: RELATED_TO }
  - { to: airflow, rel: USED_WITH }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: dimensional-modeling, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A service that breaks returns a 500 and pages someone. A pipeline that breaks usually
returns success: the job ran, rows were written, and a join quietly dropped 12% of them
because an upstream team renamed a column. Data quality work is about making those failures
loud. Three layers do it: **tests** that assert what must be true of the output, **freshness
and volume checks** that catch the absence of data rather than its wrongness, and
**contracts** that turn "the producer changed something" from a discovery into a rejected
pull request.

## Why it matters

The cost of a data bug is measured in the time before anyone notices, and that is usually
weeks.

A dashboard drifts 4% low and nobody questions it. A finance report is rebuilt from a table
where duplicates crept in after a retry. A machine learning model is retrained on a feature
that has silently been null since a mobile release, and accuracy decays over a quarter.
Each of these was written by a job that reported success.

The asymmetry matters: in a service, the blast radius of a bug is bounded by the request.
In a pipeline, wrong data propagates downstream into every model, dashboard, export and
model that reads it, and the backfill to correct it is often larger than the original
build. Worse, trust is the real product of a data platform — once analysts start
double-checking numbers in a spreadsheet, the platform has failed even when it is working.

## Visual

```steps
title: The silent failure, step by step
Producer ships a release | `user_type` becomes `account_type`; nobody tells the data team
Ingestion succeeds | it copies whatever columns exist — no schema assertion
Staging model runs | the old column is selected as NULL; the job reports success
Join in a downstream model | rows with NULL type fail the join condition and vanish
Fact table is built | 12% smaller than yesterday, and nothing compares the two
Dashboard renders | revenue is down; it looks like a business story, not a bug
Analyst investigates | three days later, starting from the dashboard, not the pipeline
Root cause found | in the producer's release notes, two weeks and one backfill ago
With a contract | the producer's CI fails on the rename, before the release ships
With tests | the pipeline aborts on a null-rate and row-count anomaly, before the dashboard
```

## Solutions

**Assert what must be true, in the pipeline.** Every meaningful table gets assertions that
run as part of the build: primary keys unique and not null, foreign keys resolving,
enumerations within their accepted set, numbers within plausible ranges, no unexpected
duplicates. In [dbt](/technology/dbt) these live beside the model; in an
[Airflow](/technology/airflow) DAG they are a task that gates the downstream ones. The
important property is not the tool — it is that a failing assertion *stops* the run rather
than annotating it.

**Check for absence, not just for wrongness.** The most common production incident is data
that never arrived: a source that stopped, a partition that is late, a file half-written.
Freshness (how old is the newest row?), volume (how many rows arrived, against the same
weekday last week?) and null-rate per column catch nearly all of these, and they need no
domain knowledge to configure.

**Distinguish the two severities.** Some failures should stop the pipeline — a duplicate
primary key, a broken referential integrity check. Others should warn — a 5% volume dip, a
slightly late source. Wiring everything to "stop" trains people to rerun with tests
disabled; wiring everything to "warn" means nobody reads them. Decide per assertion, and
route alerts to the team that owns the model, not to whoever built the platform.

**Write contracts at the producer boundary.** A data contract states the schema, semantics,
nullability and freshness a producer promises. Enforced in the producer's CI, it turns the
rename above into a failing build with a message naming the consumers. This is
[contract testing](/concept/contract-testing) applied to data instead of APIs, and it is
the only mechanism that moves the failure *before* the release rather than after.

**Version schemas and treat changes like migrations.** Additive changes are safe; renames,
type changes and semantic changes are breaking and need a deprecation window in which both
old and new exist. The discipline is the same as
[schema migration](/concept/schema-migration) and
[API versioning](/pattern/api-versioning) — a consumer you cannot deploy in lockstep needs
a transition period.

**Make every pipeline safe to re-run.** Quality work produces backfills, so a model that
cannot be re-run over a date range without duplicating rows makes every incident worse. Key
your writes and merge rather than append; see [Idempotency](/concept/idempotency).

**Publish ownership and lineage.** Every dataset needs a named owner and a documented
downstream graph. Without lineage, the question "what breaks if I change this column" takes
a day; with it, the answer is in the tooling and the producer can see the cost of a change
before making it.

## Deep Dive

**The six dimensions are a checklist, not a theory.** Completeness (is anything missing?),
uniqueness (are there duplicates?), validity (does it match the expected format and range?),
consistency (do related tables agree?), timeliness (is it fresh enough for the decision?)
and accuracy (does it match reality?). The first five are testable in SQL. Accuracy is the
hard one — it usually requires reconciliation against an independent system, such as
comparing a revenue mart against the payment provider's own totals, and that reconciliation
is worth building for exactly the tables people make decisions from.

**Anomaly detection helps and over-promises.** Statistical monitoring of row counts, null
rates and distributions catches problems nobody thought to assert, which is its real value.
It also produces false positives on seasonality, marketing campaigns and legitimate product
changes. Use it as a second layer to generate investigations, and keep explicit assertions
as the layer that gates the pipeline — a threshold you chose is debuggable; a model's alarm
is an argument.

**Where tests should live is a trade-off, not a preference.** Testing after the build is
easy and detects late. Testing on ingestion — rejecting or quarantining bad rows at the
boundary — prevents propagation but needs somewhere to put the rejects and a process for
draining that quarantine, or it silently becomes data loss. The usual working combination is
a schema check at ingestion, assertions after each transformation layer, and reconciliation
on the tables that feed money or models.

**Data SLAs make the trade-offs explicit.** "The orders mart is complete for yesterday by
07:00, with less than 0.1% late-arriving corrections" is a promise a consumer can plan
against and an engineer can measure. It is the same instrument as an
[SLO](/concept/slo) for a service: it defines what "working" means, and it makes the cost
of a stricter guarantee visible before someone promises it in a meeting.

**Late and out-of-order data is the correctness problem underneath most quality bugs.**
Events arrive after their window closed, rows are updated retroactively, and a mobile client
uploads yesterday's batch. A pipeline that assumes "processed once, done" will disagree with
a source system forever. The answers are a lookback window on incremental models, watermarks
that define how long a window stays open, and a periodic full refresh to correct drift — and
a reconciliation check that tells you when the drift exceeds what you agreed to tolerate.

**Quality is organisational before it is technical.** Most root causes are a producer who
did not know they had consumers. Contracts, an owner per dataset, a changelog for schemas
and a review step that names downstream consumers do more than any monitoring tool. The
platform's job is to make the consequences of a change visible to the person making it,
early enough that the change is still cheap.
