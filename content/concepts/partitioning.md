---
id: partitioning
name: Partitioning
tagline: Split one large dataset into smaller pieces by key so each piece stays manageable
category: data
tags: [Database, Distributed System, Scalability, Data]
difficulty: 4
prerequisites: [database, sql, distributed-system]
learningPath:
  - database
  - indexing
  - partitioning
  - sharding
  - replication
related:
  - { to: cassandra, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: dynamodb, rel: RELATED_TO }
  - { to: clickhouse, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Partitioning divides one logical dataset into disjoint pieces, each holding a subset of
rows chosen by a **partition key**. The three common schemes are **range** (ordered
boundaries, great for time), **hash** (uniform spread, great for point lookups) and
**list** (explicit membership, e.g. per region). Partitioning within one node buys
maintenance and pruning benefits;
[Sharding](/concept/sharding) is the same idea applied *across* nodes for capacity. The
key choice is the whole design: it determines balance, which queries stay cheap, and which
become fan-outs.

## Why it matters

Everything about a table degrades with size: indexes stop fitting in memory, vacuum and
statistics jobs take hours, deleting a year of history locks a table for minutes, and a
single hot table becomes the write bottleneck for the whole system. Partitioning bounds
those costs per piece. It is also how distributed systems achieve parallelism at all — a
[Kafka](/technology/kafka) topic's throughput is the sum of its partitions, and a
[Cassandra](/technology/cassandra) or [DynamoDB](/technology/dynamodb) cluster routes every
request by partition key. Choosing that key badly is expensive to undo, because it decides
data placement.

## Visual

```steps
title: Range, hash and time partitioning of the same orders table
Unpartitioned | 2 billion rows, one 4 TB index, DELETE of old data runs for hours
Range by key | PARTITION BY RANGE (order_id): p0 = 1–10M, p1 = 10M–20M … sequential ids write only to the last partition
Range hotspot | all new inserts land in the newest partition — ordered scans are fast, writes are not spread
Hash by key | PARTITION BY HASH (customer_id) WITH 16 PARTITIONS: bucket = hash(key) mod 16
Hash effect | writes and storage spread evenly; a single customer's rows stay together in one bucket
Hash cost | range queries on customer_id must fan out to all 16 partitions
Time range + hash | PARTITION BY RANGE (created_at) then subpartition by hash(customer_id)
Partition pruning | WHERE created_at >= '2026-09-01' reads 1 partition instead of 60
Retention becomes cheap | DROP PARTITION for last September — instant, no row-by-row delete
Rebalancing | hash mod N reshuffles everything when N changes; consistent hashing or many virtual buckets avoid that
```

## How it works

**Range partitioning** assigns contiguous key intervals to partitions. Ordered scans and
`BETWEEN` queries touch only the relevant partitions, and time-based ranges make retention
a metadata operation. The weakness is skew: monotonically increasing keys (timestamps,
auto-increment ids) send every write to the last partition, so write load is not
distributed at all.

**Hash partitioning** applies a hash function to the key and takes the remainder over the
partition count. Distribution is even and point lookups are one hop, but ordering is
destroyed — range scans and `ORDER BY` on the key become fan-out-and-merge operations.

**List partitioning** places explicitly enumerated values together (`region IN
('eu','us')`), which is useful for data-residency requirements and for tenants that must
be physically separated.

**Composite / subpartitioning** combines them, most commonly range by time then hash by
entity: recent data is prunable and retention is cheap, while write load spreads across
buckets inside each time range.

**Local versus global indexes.** In most systems each partition carries its own local
index, so a query without the partition key must search every partition's index. Global
secondary indexes (as in DynamoDB) solve that by maintaining a second, differently
partitioned copy — at the cost of extra storage and asynchronous, eventually consistent
updates.

## Deep Dive

**Choosing the partition key.** Three properties, usually in tension: high cardinality
(enough distinct values to fill every partition), even access distribution (no key
receives a disproportionate share of traffic), and alignment with your dominant query
predicate (so pruning applies and joins stay local). Rank your top queries by volume and
pick the key that keeps the highest-volume ones single-partition; accept fan-out for the
rest, or maintain a second copy partitioned differently.

**Hotspots are the standard failure.** A tenant a thousand times larger than the median, a
celebrity account, or a `status = 'pending'` key with only three values will overload one
partition while the rest idle — and in a distributed store the whole cluster's throughput
is then capped by that one node. Mitigations: compose the key with something
high-cardinality (`tenant_id:bucket`), *salt* the hot key across *n* sub-keys and read all
*n*, cache the hot item, or give the outlier its own dedicated partition or shard.

**Unbounded partitions.** In wide-column stores, all rows sharing a partition key live
together, so `partition = user_id` with an ever-growing event list eventually produces a
partition too large to read or compact. Add a time bucket to the key
(`user_id:2026-09`) so partitions stay bounded by construction.

**Cross-partition operations are where the cost shows up.** Aggregations must scatter and
gather; joins across partition boundaries either ship data or require a co-partitioned
layout; and a [Transaction](/concept/transaction) spanning partitions needs distributed
coordination, which many stores simply do not offer. Design so that the common unit of
work — one order, one tenant's page — lives in one partition; that is what keeps
[ACID](/concept/acid) semantics available where they matter.

**Rebalancing and repartitioning.** Naive `hash mod N` remaps almost every key when *N*
changes. The standard answers are consistent hashing (only neighbouring keys move) or a
fixed large number of virtual partitions distributed over physical nodes, so growth means
moving whole virtual partitions rather than rehashing. In Kafka, partition count is
effectively one-way: increasing it changes key-to-partition mapping and breaks per-key
ordering guarantees for existing keys, so pick a count with headroom.

**Operational reality.** Automate partition creation ahead of time — a missing future time
partition means failed inserts at midnight. Keep partition counts moderate; thousands of
partitions inflate planning time and metadata overhead. Watch per-partition size, request
rate and lag rather than cluster averages, because averages are exactly what hide skew.
And confirm pruning actually happens: a predicate on a wrapped or type-mismatched
partition column silently scans everything, the same trap as an unusable
[index](/concept/indexing).
