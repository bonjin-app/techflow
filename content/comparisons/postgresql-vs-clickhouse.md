---
id: postgresql-vs-clickhouse
name: PostgreSQL vs ClickHouse
tagline: Keep whole rows correct under concurrent writes, or scan a few columns of billions
category: decision
tags: [Database, SQL, OLAP, Analytics, Decision]
difficulty: 3
subjects: [postgresql, clickhouse]
related:
  - { to: cqrs, rel: RELATED_TO }
  - { to: change-data-capture, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: materialized-view, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: high }
---

## TL;DR

Both speak SQL, and that is where the resemblance ends. [PostgreSQL](/technology/postgresql)
stores each row together, because transactional work reads and writes whole rows: fetch
order 42, change its status, commit with three other writes or none of them.
[ClickHouse](/technology/clickhouse) stores each column separately, because analytical work
reads two columns of every row: average duration, grouped by day, for a year.

The question is rarely which one to use. It is **when a workload has outgrown asking
PostgreSQL**. A reporting query that scans hundreds of millions of rows in the same
database that serves checkout will eventually slow both; moving it to a columnar store fed
from PostgreSQL makes the report fast and leaves the transactional database alone. Until
then, one database is simpler than two.

## Comparison

```compare
Dimension            | PostgreSQL [postgresql]                          | ClickHouse [clickhouse]
Built for            | Transactions on rows: read, update, commit        | Aggregations over large scans
Storage              | Rows together, in heap pages                      | Columns apart, compressed per column
Reading 3 of 200 cols| Reads whole rows, all 200 columns                 | Reads only those 3
Updating one row     | Cheap, in place under MVCC                        | A mutation that rewrites parts later
Transactions         | Full ACID across tables                           | Atomic per insert; none across tables
Inserts              | Row at a time is normal                           | Batches of thousands; single rows hurt
Indexes              | B-tree and others, one entry per row              | Sparse, one mark per ~8k rows, by sort key
Joins                | Any shape, planned by cost                        | Best as a large table against small ones
Constraints          | Foreign keys, unique, check                       | None enforced; dedup is eventual
Typical role         | Source of truth                                   | Read side fed from the source of truth
```

## Decision

```decision
? Do the queries update individual rows or need transactions across tables?
  YES -> PostgreSQL [postgresql]
  NO -> ? Do they aggregate over tens of millions of rows or more?
    YES -> ? Are those rows mostly appended — events, logs, metrics — rather than edited?
      YES -> ClickHouse [clickhouse]
      NO -> PostgreSQL [postgresql]
    NO -> ? Are reports already slowing the database the product runs on?
      YES -> ClickHouse [clickhouse]
      NO -> PostgreSQL [postgresql]
```

## When PostgreSQL

- The data must be correct and current at every moment: orders, accounts, payments,
  inventory — rows that are created, edited and constrained by other rows.
- Queries look up and change individual records, and several writes must succeed or fail
  together as one [transaction](/concept/transaction).
- Reporting exists but is modest: tens of millions of rows, answered in seconds with a good
  index, [partitioning](/concept/partitioning) by time, or a materialized view refreshed on
  a schedule.
- You would rather run one database well than two. Most products never reach the point
  where the reports need a store of their own.

## When ClickHouse

- The data is a stream of facts that are appended and rarely changed — product events,
  logs, traces, metrics, telemetry — and grows by millions of rows a day.
- Queries aggregate: funnels, retention, percentiles by day, breakdowns across dimensions,
  over months of data, and people expect them to answer while they wait.
- Analytical queries are competing with the product for the transactional database, and
  moving them out is the goal rather than a side effect.
- You can feed it in batches — from [Kafka](/technology/kafka), from
  [change data capture](/concept/change-data-capture) on PostgreSQL, or from files — and
  accept that it is a copy that lags the source by seconds.

## Deep Dive

**The layout decides the cost before any index does.** A row store keeps a row's columns
side by side, so reading one column of a billion rows means reading every column of a
billion rows. A column store keeps each column in its own file, compressed against values
of the same type, so the same query reads a fraction of the bytes — often 5 to 20 times
smaller — and processes them in tight vectorised loops. No index on a row store closes
that gap for a full scan, and no column store makes a single-row update as cheap as a heap
does.

**They are usually both present.** The common shape is [CQRS](/pattern/cqrs) at the storage
layer: PostgreSQL is the write side and the source of truth, and ClickHouse is a read side
fed from it — through the event stream the application already publishes, or through CDC
on the tables themselves. The [analytics pipeline](/architecture/analytics-pipeline)
architecture is built this way. The cost is a second system to run and a copy that is
eventually consistent, which is exactly right for a dashboard and wrong for a balance.

**ClickHouse punishes transactional habits.** Every insert creates a part that is merged
in the background, so row-at-a-time inserts bury the merge scheduler. Updates and deletes
are mutations that rewrite data asynchronously. `ReplacingMergeTree` removes duplicates
only after a merge, so queries must tolerate or collapse them. None of this is a defect:
it is what makes the scans fast. It does mean ClickHouse is the wrong place for data that
changes after it is written.

**PostgreSQL stretches further than people expect.** Time-partitioned tables, BRIN indexes
on append-only timestamps, materialized views refreshed on a schedule, and a read replica
dedicated to reports carry analytics a long way before a second database is needed.
Columnar extensions go further still. The signal to move is not a row count but a symptom:
reports that take minutes, or a report that makes checkout slow.
