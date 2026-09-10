---
id: clickhouse
name: ClickHouse
tagline: Column-oriented OLAP database that scans billions of rows per second
category: database
tags: [Database, OLAP, Analytics, Columnar, SQL]
difficulty: 3
usedFor: [database, sql, indexing, partitioning]
prerequisites: [database, sql, indexing, partitioning]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - indexing
  - partitioning
  - clickhouse
  - cqrs
related:
  - { to: postgresql, rel: ALTERNATIVE_TO }
  - { to: elasticsearch, rel: ALTERNATIVE_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: s3, rel: USED_WITH }
  - { to: cqrs, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: iot-telemetry, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "ClickHouse 25.x/26.x (date-based monthly releases, two LTS lines per year)", confidence: medium }
---

## TL;DR

ClickHouse is an analytical SQL database that stores data by column instead of by row. A
query touching 3 columns of a 200-column table reads only those 3 columns, compressed, in
vectorised batches across all cores — which is how it aggregates billions of rows in under
a second on modest hardware. It speaks SQL and looks familiar, but it is built for
`GROUP BY` over huge scans, not for updating single rows. Treat it as the read side of your
system, fed by an event stream, and it is remarkable; treat it as a general-purpose database
and it will disappoint you.

## Practical

The workloads it is chosen for:

- **Product and user analytics** — event tables with hundreds of millions of rows a day,
  queried by funnels, retention and cohort breakdowns.
- **Observability at scale** — logs, spans and high-cardinality metrics, where per-series
  storage in a time-series database becomes uneconomical. See
  [Observability](/concept/observability).
- **Real-time dashboards** — materialised views keep pre-aggregates current on insert, so a
  dashboard query hits a small rollup instead of raw events.
- **Telemetry warehouses** — device data from an
  [IoT Telemetry](/architecture/iot-telemetry) pipeline, downsampled by retention tier.

```sql
-- Wide event table: sorted by the columns you filter on, partitioned by month.
CREATE TABLE events (
  ts          DateTime64(3),
  tenant_id   UInt32,
  user_id     UInt64,
  name        LowCardinality(String),
  properties  Map(String, String),
  country     LowCardinality(FixedString(2))
) ENGINE = MergeTree
ORDER BY (tenant_id, name, ts)          -- the sparse primary index, in priority order
PARTITION BY toYYYYMM(ts)               -- coarse: dropping old data = dropping partitions
TTL ts + INTERVAL 180 DAY;

-- Pre-aggregate on insert; the dashboard reads this, not `events`.
CREATE MATERIALIZED VIEW events_hourly
ENGINE = SummingMergeTree ORDER BY (tenant_id, name, hour) AS
SELECT tenant_id, name, toStartOfHour(ts) AS hour, count() AS hits
FROM events GROUP BY tenant_id, name, hour;
```

Ingest is almost always **batched**: insert tens of thousands of rows at a time, or let the
Kafka table engine or async inserts batch for you. Row-at-a-time `INSERT` creates a part per
statement and buries the merge scheduler.

## Deep Dive

**Columnar storage plus vectorised execution.** Each column is stored and compressed
separately, so compression ratios of 5–20× are normal and a scan reads only the bytes it
needs. The engine processes blocks of thousands of values through tight loops, using SIMD
where it can. Less I/O plus better instruction throughput is the entire performance story.

**The `ORDER BY` key is the index.** MergeTree keeps a *sparse* primary index: one mark per
granule of roughly 8,192 rows, not one entry per row. Queries filtering on a prefix of the
sort key skip most granules; queries filtering on a column late in the key, or not in it at
all, scan the partition. Choosing the sort key is the equivalent of choosing a partition key
in [Cassandra](/technology/cassandra) — it decides which queries are fast. Skip indexes
help but do not rescue a wrong sort order. See [Indexing](/concept/indexing).

**Merges are background work you must plan for.** Every insert creates an immutable part
and a background scheduler merges parts into larger ones. Too many small parts means slow
queries and eventually a "too many parts" error. `PARTITION BY` should be coarse (month or
week) — partitioning by day on a high-cardinality multi-tenant table is a classic
self-inflicted wound. See [Partitioning](/concept/partitioning).

**Updates and deletes are second-class.** There is no MVCC row update. `ALTER TABLE …
UPDATE/DELETE` is a *mutation* that rewrites parts asynchronously; lightweight deletes mark
rows for later removal. `ReplacingMergeTree` deduplicates by sort key, but only *eventually*
after a merge, so queries need `FINAL` or explicit aggregation to see one version. If your
data mutates constantly, ClickHouse is the wrong shape.

**Transactions and joins.** There are no general multi-table
[transactions](/concept/transaction); an insert into one table is atomic, a distributed
write across shards is not. Joins have improved but remain where ClickHouse is weakest
relative to [PostgreSQL](/technology/postgresql): the pattern that works is a large fact
table joined against small dimension tables held in memory, not two large tables joined
arbitrarily.

**Scaling out.** Shards distribute data and replicas provide redundancy, coordinated by the
built-in ClickHouse Keeper. Cloud deployments instead separate compute from object storage,
so [S3](/technology/s3) holds the data and stateless nodes scale independently.

## Why

Transactional databases store rows contiguously because transactional work reads and writes
whole rows: fetch order 42, update its status. Analytical questions are the opposite shape —
two columns, every row. On a row store, `avg(duration) GROUP BY day` over a year of events
drags every column of every row through memory.

```sequence
title: Before — analytics on the transactional row store
participants: Dashboard, API [backend], OLTP DB [postgresql], Users
Dashboard -> API: p95 duration by day, last 12 months
API -> OLTP DB: SELECT … GROUP BY day (600M rows)
OLTP DB -> OLTP DB: full scan, every column of every row, buffer pool evicted
OLTP DB --> API: result after 90 s
Users -> API: checkout (same database, now cold and slow)
API --> Users: 504 — the report starved the product
```

A columnar read side separates the two workloads and changes the cost of the query itself.
Events flow from [Kafka](/technology/kafka) into ClickHouse, materialised views keep hourly
rollups current on insert, and the dashboard reads a rollup thousands of times smaller than
the raw data.

```sequence
title: After — columnar read side, fed by the event stream
participants: App [backend], Kafka [kafka], ClickHouse [clickhouse], MV [cqrs], Dashboard
App -> Kafka: emit events (also writes its own OLTP rows)
Kafka -> ClickHouse: batched insert (100k rows per part)
ClickHouse -> MV: materialised view updates hourly rollup on insert
Dashboard -> ClickHouse: p95 duration by day, last 12 months
ClickHouse -> ClickHouse: read 2 columns, skip granules by sort key
ClickHouse --> Dashboard: result in ~200 ms
App --> App: OLTP database untouched by reporting load
```

This is [CQRS](/pattern/cqrs) at the storage layer: one system optimised for write
correctness, another for read speed.

## Advantages

- Order-of-magnitude faster analytical scans than a row store, on far less hardware
- Strong compression: low storage cost per event, small I/O
- Full SQL with rich analytical functions, arrays, maps and approximate aggregates
- Materialised views maintain rollups on insert, no external scheduler needed
- Runs well on a single node and scales to shards and replicas without changing SQL

## Trade-offs

- No row-level updates or MVCC; mutations rewrite parts asynchronously
- No general multi-table transactions, and cross-shard writes are not atomic
- Deduplication via `ReplacingMergeTree` is eventual — queries must account for duplicates
- Joins between two large tables remain a weak spot compared with a relational engine
- Small, frequent inserts degrade the merge scheduler; batching is mandatory
- The sort key and partition choice are hard to change later and decide query performance

## When to use

- Event, log, span and metric data queried by aggregation over large ranges
- Dashboards and reports that must stay interactive over hundreds of millions of rows
- Moving analytical queries off a transactional database they are starving
- High-cardinality observability data where per-series storage has become too expensive
- Append-mostly datasets with a retention policy expressible as TTL and partition drops

## When not to use

- Don't use ClickHouse as your primary transactional database — use [PostgreSQL](/technology/postgresql) or [MySQL](/technology/mysql)
- For workloads dominated by single-row reads and writes by primary key; use [Redis](/technology/redis) or a key-value store
- When data mutates frequently and every read must see the latest version
- For full-text relevance ranking and fuzzy search — [Elasticsearch](/technology/elasticsearch) is built for that
- When thousands of concurrent tiny queries are the access pattern
- For a dataset small enough that one more index on your existing database fixes it

## Real-world

ClickHouse almost always appears as the serving layer of an
[Analytics Pipeline](/architecture/analytics-pipeline): events land in
[Kafka](/technology/kafka), raw data is archived to [S3](/technology/s3), and ClickHouse
holds the queryable copy with materialised views feeding dashboards. In
[IoT Telemetry](/architecture/iot-telemetry) it complements a keyed store such as
[Cassandra](/technology/cassandra) — Cassandra answers "the last 200 readings for this
device", ClickHouse answers "p95 across the fleet by firmware version". In a
[Search System](/architecture/search-system) it powers the analytics behind the search box
while [Elasticsearch](/technology/elasticsearch) serves the ranked results. The recurring
lesson: get the `ORDER BY` key, the partition granularity and the insert batching right at
the start, because all three are painful to change once you hold a terabyte.
