---
id: backfill
name: Backfill
tagline: Reprocessing history against a system that is still serving traffic
category: data
tags: [Data, Operations, Migration, Reliability]
difficulty: 3
prerequisites: [idempotency, schema-migration, message-queue]
learningPath:
  - idempotency
  - schema-migration
  - message-queue
  - backfill
  - data-quality
  - delivery-semantics
related:
  - { to: idempotency, rel: REQUIRES }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: data-quality, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: airflow, rel: USED_WITH }
  - { to: change-data-capture, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

A backfill applies a change to data that already exists: a new column that needs values for
ten million rows, a bug fixed today whose wrong outputs are still in the warehouse, a new
consumer that needs the last year of events. The work itself is simple. What makes it a
distinct skill is that the system is *live* while it runs — so a backfill must be resumable
after it dies at 70%, idempotent because you will run it twice, throttled so it does not
starve the traffic paying the bills, and ordered carefully against the writes still arriving.
Every backfill that goes badly goes badly in one of those four ways.

## Why it matters

Backfills are unusual among engineering tasks: they are large, they are one-off, and they
touch production data directly. That combination produces incidents.

A migration script updates ten million rows in one transaction, holds locks for twenty
minutes, and takes the application down. A reprocessing job saturates the database and the
user-facing p99 quadruples while it runs. A job crashes at 70%, nobody knows which rows were
done, and the safe option is to start again — except starting again double-counts because the
work was not idempotent. A backfill and the live write path both update the same row, and
the backfill's older value wins, silently reverting a customer's change.

The last one is the worst because it is invisible: no error, no alert, just data that quietly
disagrees with what the user did.

## Visual

```steps
title: A backfill that survives contact with production
Decide the boundary | which rows, by what key, up to what point in time — write it down
Make the work idempotent | keyed by row, safe to apply twice; this is the precondition for everything else
Order against live writes | the backfill must never overwrite a newer value — compare timestamps or skip touched rows
Chunk by key range | a thousand rows at a time, never one transaction over the whole table
Record the cursor durably | after each chunk, so a crash resumes instead of restarting
Throttle against a live signal | watch replica lag or p99 and slow down when it rises
Dry run on a copy | count what would change; a backfill that changes 10× the expected rows is a bug
Run it, watch the signal | the first 1% tells you the shape of the remaining 99%
Verify with a query | reconcile counts and spot-check rows, not "the job exited 0"
Leave the audit trail | which rows, when, by which run — the question will be asked
```

## Solutions

**Chunk, and keep a durable cursor.** Process a bounded range at a time — by primary key, by
date partition, by shard — and commit the position after each chunk. This makes the job
resumable, makes progress observable, and keeps each transaction short enough not to block
anyone. A single large transaction is the most common backfill mistake and the most
expensive.

**Make it idempotent before you make it fast.** You will run it twice: once when it fails
halfway, once when someone discovers the first run used the wrong parameter. Upsert by key,
use a deterministic transformation, and never write "increment by one" logic in a job that
may be replayed. See [Idempotency](/concept/idempotency).

**Decide who wins against live writes.** The two workable rules are: skip any row modified
after the backfill started, or write only if the backfill's value is newer. The rule you must
not use is "last writer wins by accident". For a new column, the cleanest shape is
expand-and-contract — add the column nullable, have the application write it for new rows
immediately, backfill the old ones, then make it required once no nulls remain. That is
[Schema Migration](/concept/schema-migration) applied to data rather than structure.

**Throttle on a signal, not on a guess.** A fixed sleep is a guess that is wrong at 3am and
wrong again at peak. Read replica lag, database CPU or the service's p99 and slow down when
it rises. A backfill that takes twelve hours and harms nobody beats one that takes two and
pages the on-call.

**Run it somewhere that is not the critical path.** A separate connection pool, a lower
priority, a read replica for the scan portion, and a worker fleet that is not serving users.
The goal is that the backfill can be paused or killed at any moment with no user-visible
effect.

**Verify, and define what "done" means before starting.** Row counts before and after, a
reconciliation query against the expected invariant, and a sample checked by hand. An exit
code proves the process finished, not that the data is right — the same argument as
[Data Quality](/concept/data-quality).

## Deep Dive

**Streaming backfills are a different problem from table backfills.** Replaying a year of
events into a new consumer means the consumer sees a year of history at a rate thousands of
times faster than real time. Anything with a time-based assumption breaks: windows close
instantly, rate limiters trip, downstream APIs are hammered, and "recent" means nothing. Run
the replay on a separate consumer group with its own throttle, and make sure side effects —
emails, webhooks, payments — are disabled for the replay, because the fastest way to send a
year of notifications in an hour is to backfill without checking.

**The dual-track pattern is worth knowing.** Start the new path running forward on live data
first, then backfill history behind it, then switch readers over once the two meet. This
bounds the work — history is finite and stops growing the moment the forward path is live —
and gives you a consistent point to cut over. Backfilling first and switching later means
chasing a moving target.

**Partitioned tables make it dramatically easier.** If data is partitioned by date, a
backfill is a partition at a time: a natural chunk, an independent transaction, an easy
cursor, and a trivially parallelisable job. This is a strong argument for partitioning
tables you expect to reprocess, and a reason [dbt](/technology/dbt) models default to
incremental with a date predicate.

**Parallelism has a sweet spot and a cliff.** Splitting by key range across a handful of
workers is usually a large win; pushing further turns the backfill into the dominant load and
starves production. Ramp up while watching the throttle signal rather than choosing a
concurrency in advance, and make the worker count adjustable while the job runs.

**Deletes and corrections are backfills too.** Removing a user's data under a deletion right,
or correcting a miscalculation that has propagated into derived tables, has the same shape
and a stricter requirement: it must be complete, and you must be able to prove it. Track
which rows were visited, not only that the job ran.

**Write it as a job, not a script.** A backfill run from someone's laptop has no logs, no
retry, no visibility and dies when the laptop sleeps. Running it under the orchestrator you
already have — [Airflow](/technology/airflow), a Kubernetes job, your queue's worker fleet —
gives you retries, observability and a record of what happened, which is exactly what you
will want when the question arrives three weeks later.
