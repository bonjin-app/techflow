---
id: cassandra
name: Apache Cassandra
tagline: Masterless wide-column store that trades joins for linear write scalability
category: database
tags: [Database, NoSQL, Wide Column, Distributed System, High Availability]
difficulty: 4
usedFor: [database, replication, partitioning, eventual-consistency, availability]
prerequisites: [database, distributed-system, replication, partitioning, cap-theorem]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - distributed-system
  - replication
  - partitioning
  - cap-theorem
  - cassandra
related:
  - { to: dynamodb, rel: ALTERNATIVE_TO }
  - { to: mongodb, rel: ALTERNATIVE_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: iot-telemetry, rel: USED_IN }
  - { to: social-feed, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Cassandra 5.x (SAI indexes, vector search, trie memtables)", confidence: high }
---

## TL;DR

Cassandra is a distributed wide-column database with **no primary node**: every replica
accepts reads and writes, data is spread by hash of a partition key, and replication can
span racks and regions. That buys very high write throughput and survival of whole-node or
whole-datacentre loss, paid for by giving up joins, ad-hoc queries and strong consistency by
default. You design the table for the query, not the query for the table — and if the
partition key is wrong, no amount of hardware will save you.

## Practical

Cassandra fits workloads that are append-heavy and keyed:

- **Time series and telemetry** — sensor readings, one partition per device per time
  bucket. See [IoT Telemetry](/architecture/iot-telemetry).
- **Message and event history** — per-conversation timelines written once, read in order.
- **Feeds and inboxes** — precomputed fan-out rows, as in a
  [Social Feed](/architecture/social-feed).
- **Notification and audit ledgers** — high-volume, immutable, read by key. See
  [Notification System](/architecture/notification-system).

Data modelling comes first: enumerate the queries, then create one table per query and
duplicate the data across them — denormalisation is the design, not a smell.

```sql
-- One partition per device per day; clustered newest-first so the hot read is a slice.
CREATE TABLE sensor_reading (
  device_id   uuid,
  day         date,
  reading_at  timestamp,
  celsius     float,
  battery_pct tinyint,
  PRIMARY KEY ((device_id, day), reading_at)
) WITH CLUSTERING ORDER BY (reading_at DESC)
  AND default_time_to_live = 2592000        -- 30 days, rows expire on their own
  AND compaction = { 'class': 'TimeWindowCompactionStrategy',
                     'compaction_window_unit': 'DAYS',
                     'compaction_window_size': 1 };

-- The only cheap read shape: exact partition, bounded slice.
SELECT reading_at, celsius FROM sensor_reading
 WHERE device_id = ? AND day = ? AND reading_at > ?
 LIMIT 200;
```

Per query you also choose a **consistency level** — `ONE`, `QUORUM`, `LOCAL_QUORUM`, `ALL` —
trading latency and availability against freshness. `LOCAL_QUORUM` is the usual default.

## Deep Dive

**Ring, tokens and replication.** Every node owns a set of token ranges; the partition key
is hashed to a token, which selects the replica set. `RF=3` per datacentre is standard, with
a topology-aware strategy that puts replicas in different racks. There is no leader, so any
node can coordinate any request. Adding nodes redistributes token ranges and throughput
grows close to linearly — the property Cassandra is actually bought for.

**Tunable consistency, and what it does not give you.** With `RF=3`, reads and writes at
`QUORUM` (2 of 3) overlap, so a read sees the latest acknowledged write — the classic
`R + W > RF` rule. Anything weaker is
[eventual consistency](/concept/eventual-consistency), repaired in the background by hinted
handoff and read repair. In [CAP](/concept/cap-theorem) terms Cassandra chooses
availability under partition. Compare-and-set exists as lightweight transactions over
Paxos, but costs several round trips and does not compose into multi-row transactions.

**LSM storage: writes are cheap, deletes are not.** A write appends to a commit log and a
memtable, then flushes to an immutable SSTable — no read-before-write, which is why write
latency is low and steady. Reads may touch several SSTables, filtered by bloom filters.
Compaction merges SSTables in the background and is the main source of I/O and CPU
surprise; the strategy (size-tiered, leveled, time-window, unified) must match the workload.

**Tombstones are the classic outage.** A delete writes a tombstone that lives until
`gc_grace_seconds` has passed and compaction removes it. A queue-shaped table — insert,
read, delete, repeat in the same partition — accumulates tombstones that every read must
scan, until reads time out. Use TTLs and time-bucketed partitions instead of deletes.

**Partition sizing is the whole game.** Aim for partitions in the low hundreds of megabytes
and tens of thousands of rows. An unbounded partition key (`country`, `status`) creates a
hot partition that pins one replica set while the rest of the ring idles; bucketing by time
or a synthetic shard suffix is the fix. See [Partitioning](/concept/partitioning) and
[Sharding](/concept/sharding).

**What 5.x changed.** Storage-Attached Indexing widens where secondary indexes are usable,
vector search supports approximate nearest-neighbour queries, and trie-based memtables cut
memory and read overhead. General multi-partition transactions are still arriving; do not
plan around them yet.

## Why

A single relational node is easy to reason about and has a hard ceiling. Writes all land on
one primary; replicas help reads but not write throughput, and a primary failure means a
failover window during which writes stop. Scaling means bigger hardware until there is none,
then manual sharding — at which point you have built a distributed database by hand, without
the repair and rebalancing machinery.

```sequence
title: Before — one primary absorbs every write
participants: Ingest [backend], Primary [postgresql], Replica A, Replica B
Ingest -> Primary: 200k sensor writes/s
Primary -> Primary: WAL + index maintenance, disk saturated
Primary -> Replica A: async replication
Primary -> Replica B: async replication
Primary --> Ingest: timeouts under peak — writes have one home
Primary -> Primary: node fails → failover window, writes rejected
```

Cassandra spreads both the data and the write path. The driver knows the ring and sends each
write to a replica that owns the key; the coordinator writes to `RF` replicas and
acknowledges as soon as the requested consistency level is met. Losing a node removes
capacity, not availability, and adding nodes adds write throughput.

```sequence
title: After — every node accepts writes, capacity scales with the ring
participants: Ingest [backend], Node 1 [cassandra], Node 2, Node 3, Node 4
Ingest -> Node 2: write device:7 (token-aware driver picks an owner)
Node 2 -> Node 3: replicate (RF=3)
Node 2 -> Node 4: replicate
Node 3 --> Node 2: ack
Node 2 --> Ingest: ack at LOCAL_QUORUM (2 of 3)
Ingest -> Node 1: write device:8 — different partition, different owners
Node 4 -> Node 4: node 4 dies → reads/writes continue on 1–3, hints replayed later
```

The cost is written into the second diagram: no join or global `ORDER BY` can happen
cheaply, because no node holds the whole dataset.

## Advantages

- Very high, steady write throughput thanks to the LSM write path
- Masterless: no failover window, no single write bottleneck, no leader election to operate
- Near-linear horizontal scaling by adding nodes to the ring
- Multi-datacentre and multi-region replication is a first-class, configured feature
- Per-query tunable consistency, so critical and cheap reads can differ
- Native TTL per row and time-window compaction make expiring data operationally easy

## Trade-offs

- No joins, no real aggregates, no ad-hoc querying — model per query
- Data is duplicated across tables, and keeping duplicates consistent is application work
- Eventual consistency by default; lightweight transactions are expensive and limited
- Tombstones from delete-heavy or queue-shaped usage cause read timeouts
- Compaction and repair are ongoing operational work with real I/O cost
- A bad partition key is close to unfixable without a migration and rewrite
- Operating a cluster well takes distributed-systems skill; managed offerings mitigate this

## When to use

- Write-heavy, append-mostly workloads: telemetry, events, messages, audit logs
- Queries that are always "this key, in this order, over this range"
- Multi-region deployments needing local low-latency writes and no single primary
- Datasets far larger than one machine where availability outranks strong consistency
- Data with a natural expiry that TTLs clean up without delete storms

## When not to use

- Don't use Cassandra for ad-hoc analytics or reporting — use [ClickHouse](/technology/clickhouse) or a warehouse
- When you need multi-row [transactions](/concept/transaction) and [ACID](/concept/acid) guarantees; use [PostgreSQL](/technology/postgresql). See [SQL vs NoSQL](/compare/sql-vs-nosql)
- For relational data with many-to-many joins and evolving query patterns
- As a work queue or a mutable state store — that is what tombstones punish
- For small datasets, where one relational node with replicas is simpler and cheaper
- When the team cannot invest in data modelling up front; the model is not refactorable

## Real-world

Cassandra's natural home is the ingest and history layer of high-volume systems. In
[IoT Telemetry](/architecture/iot-telemetry) it stores per-device readings written straight
off a [Kafka](/technology/kafka) consumer, with TTLs handling retention, while a columnar
store answers the analytical queries. In a
[Social Feed](/architecture/social-feed) built with fan-out-on-write, each user's timeline
is one partition — exactly the shape Cassandra reads fastest. In a
[Notification System](/architecture/notification-system) it holds delivery history and
device tokens at a volume that would dominate a relational primary. The pattern repeats:
Cassandra (or [DynamoDB](/technology/dynamodb), which trades similarly with less operational
surface) for keyed high-volume writes, plus a relational database for the transactional core.
