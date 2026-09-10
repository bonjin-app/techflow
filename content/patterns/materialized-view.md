---
id: materialized-view
name: Materialized View
tagline: Precompute an expensive query and store its result as a table you can read cheaply
category: data
tags: [Data, Performance, Database, Scalability]
difficulty: 3
prerequisites: [database, sql, indexing]
learningPath:
  - database
  - sql
  - indexing
  - cache
  - cache-aside
  - materialized-view
  - cqrs
related:
  - { to: indexing, rel: SOLVES }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: clickhouse, rel: RELATED_TO }
  - { to: cqrs, rel: USED_WITH }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: social-feed, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

One query on the dashboard joins six tables, groups by month and scans two years of rows.
It takes eleven seconds. Adding an [index](/concept/indexing) does not help much, because
the cost is not finding rows — it is *aggregating millions of them*. And the query runs
hundreds of times a minute, because every user who opens the page asks the same question
with the same parameters.

Two bad options present themselves. Leave it slow, and the page is unusable while the
database burns CPU on identical work. Or denormalise by hand: add counter columns that
every write path must remember to update, and watch them drift out of sync the first time
someone deletes a row in a migration script.

## Solution

Run the expensive query **once**, store its result as a physical table, and let readers
query that instead. The view is derived data: it can always be recomputed from the base
tables, so correctness lives in the refresh, not in scattered write-path updates.

```steps
title: Read path with a materialized view
Client requests the monthly revenue report [http]
API queries the view table — a single indexed scan [sql] | milliseconds, no joins
Base tables change as orders are placed [postgresql]
A refresh recomputes the view (schedule, trigger or event) [eventual-consistency]
Readers see the new numbers after the refresh completes | staleness window = refresh interval
```

The refresh strategy is the real design decision. **Full refresh** recomputes everything
on a schedule — simple, and fine when the query takes seconds and hourly numbers are
acceptable. **Incremental refresh** applies only the rows that changed, using a change
log or a watermark column; much cheaper at scale but you must handle late-arriving and
deleted rows. **Event-driven refresh** updates the view when a domain event arrives,
which is exactly what a [CQRS](/pattern/cqrs) projector does.

## How it works

In [PostgreSQL](/technology/postgresql) the feature is built in:

```sql
CREATE MATERIALIZED VIEW revenue_by_month AS
SELECT date_trunc('month', o.placed_at) AS month,
       o.tenant_id,
       count(*)        AS orders,
       sum(l.price * l.qty) AS revenue
FROM orders o JOIN order_lines l ON l.order_id = o.id
GROUP BY 1, 2;

CREATE UNIQUE INDEX ON revenue_by_month (tenant_id, month);
REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_by_month;
```

`CONCURRENTLY` is what makes it usable in production: without it the refresh takes an
exclusive lock and readers block for the whole rebuild. It requires a unique index, and it
is slower overall — a deliberate trade of throughput for availability.

Systems built for analytics do this differently. [ClickHouse](/technology/clickhouse)
materialized views are *insert triggers*: rows arriving in the source table are
transformed and appended to the target immediately, giving continuously fresh rollups
without a scheduled rebuild — at the cost of only ever seeing inserts, never updates.

When the database has no such feature, the same pattern is hand-rolled: a worker writes a
summary table, or a projector consumes events. A view kept fresh by
[event sourcing](/pattern/event-sourcing) is a materialized view whose refresh trigger is
a fact rather than a clock.

## Advantages

- Turns a multi-second aggregate into an indexed lookup
- One computation serves every reader, instead of repeating identical work per request
- Correctness is centralised in the refresh, not spread across write paths
- Fully rebuildable from base tables — a bug in the view is not data loss
- Read and write shapes can diverge: the view may be denormalised, pre-joined, pre-sorted
- Unlike an in-memory cache, it survives restarts and can be queried with SQL

## Disadvantages

- The data is stale by design; the refresh interval *is* the consistency guarantee
- Refresh has real cost, and a full refresh on a large table can be heavier than the queries it replaces
- Storage duplication — a wide view over a big table can rival the table itself
- Incremental refresh is fiddly: deletes, late data and backfills all need explicit handling
- Schema changes mean rebuilding the view, which may take a long maintenance window
- Easy to accumulate views nobody reads, each still paying refresh cost forever
- A refresh that fails silently leaves confidently wrong numbers on a dashboard

## When to use

- The same expensive aggregate or join is read far more often than its inputs change
- Seconds-to-hours of staleness is acceptable to the consumer (reports, dashboards, feeds, leaderboards)
- The query cost comes from volume of rows, not from a missing index
- You want reads served by a database rather than an extra cache tier

## When not to use

- Readers need exactly-current values (account balances, stock levels at checkout)
- Query parameters are highly variable per user — precomputing every combination explodes
- Writes vastly outnumber reads, so most refresh work is wasted
- A plain index, a better query or a read replica already solves it — try those first
- The result is small and cheap to recompute; [Cache Aside](/pattern/cache-aside) with a
  [TTL](/concept/ttl) is less machinery

## Real-world

Materialized views back almost every "analytics" screen in a product: daily active users,
revenue by plan, per-tenant usage counters. In the
[Analytics Pipeline](/architecture/analytics-pipeline) architecture the stream processor
writes per-minute rollups that are exactly this pattern, with the raw event archive as the
rebuild source. Social products use them for counts and timelines — a
[Social Feed](/architecture/social-feed) precomputes each user's home timeline instead of
joining follower tables at read time, which is the same trade: cheap reads, extra write
work, and a small window where a brand-new post has not landed yet.
