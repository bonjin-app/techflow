---
id: sharding
name: Sharding
tagline: Split one large dataset across many nodes so no single machine must hold or serve it all
category: data
tags: [Data, Scalability, Distributed System]
difficulty: 4
prerequisites: [database, sql, distributed-system, replication]
learningPath:
  - database
  - sql
  - distributed-system
  - replication
  - sharding
  - cap-theorem
related:
  - { to: database, rel: REQUIRES }
  - { to: replication, rel: RELATED_TO }
  - { to: distributed-system, rel: REQUIRES }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: elasticsearch, rel: RELATED_TO }
  - { to: url-shortener, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Sharding (horizontal partitioning) divides a dataset by some key — user id, tenant,
time — and stores each piece on a different node. Each node handles a fraction of
the writes, the storage and the working set, so total capacity grows with node
count. The price is that anything crossing shards — joins, transactions, unique
constraints, rebalancing — becomes hard, and the shard key you choose is very
difficult to change later.

## Why it matters

[Replication](/concept/replication) scales reads and survives failures, but every
replica still holds the whole dataset and every write still passes through one
leader. When the dataset outgrows a machine's disk or RAM, or write throughput
outgrows one node's I/O, sharding is the remaining move. It is how
[MongoDB](/technology/mongodb) clusters, [Redis](/technology/redis) Cluster,
[Kafka](/technology/kafka) partitions and [Elasticsearch](/technology/elasticsearch)
indices scale, and how relational databases are scaled when a bigger box is no
longer an option.

Getting the shard key wrong is one of the costlier mistakes in system design,
which is why it is worth understanding before you need it.

## Visual

```steps
title: Routing a request to a shard
Request arrives with key user_id = 48213 [backend]
Compute the partition | hash(48213) mod 4 = 1 · or range lookup · or directory lookup
Route to shard 1 [database] | the node that owns that key range
Shard 1 executes locally | all rows for this user live here
Replicate within the shard [replication] | each shard has its own followers
Respond to the client | no other shard was involved
```

## How it works

**Choosing a partitioning scheme.**

- *Range* — keys 0–999 on shard A, 1000–1999 on B. Range scans stay local; hot ranges
  (today's timestamps, sequential ids) pile onto one shard.
- *Hash* — `hash(key) mod N`. Even distribution; range queries must hit every shard.
  Adding a node with plain modulo moves nearly every key; *consistent hashing* or
  fixed virtual slots (Redis Cluster's 16,384 hash slots) move only a fraction.
- *Directory* — a lookup table maps each key or tenant to a shard. Fully flexible
  (move one big tenant to its own node), but the directory is another component to
  keep available.

**Choosing a shard key.** The key should appear in almost every query so requests
touch one shard, should distribute load evenly, and should keep related data
together. `user_id` works for a user-centric product; `tenant_id` for a SaaS. A key
that is skewed (one celebrity account, one enormous tenant) creates a *hot shard*
that no amount of added nodes fixes.

**Routing.** Either the client library knows the mapping (Redis Cluster clients,
Kafka producers), a proxy/router tier does (MongoDB `mongos`), or the nodes redirect
(Redis `MOVED`). The mapping must survive node additions and failures.

**Rebalancing.** When a shard grows too large it is split and part of it migrates,
while serving traffic. Systems with pre-split partitions (many small logical shards
mapped onto fewer physical nodes) make this a matter of moving whole partitions
rather than splitting live data.

**Shards plus replicas.** In practice every shard is itself a replica set; a
16-shard cluster with 3 copies is 48 nodes. Failure of one node affects only its
shard's availability.

## Deep Dive

**Cross-shard queries.** A query without the shard key is a scatter-gather: sent to
every shard, merged by the router. Latency becomes the *slowest* shard's latency,
and the total work scales with shard count. Design the data model so that the
common paths are single-shard, and accept scatter-gather only for rare analytics.

**Cross-shard transactions.** A [Transaction](/concept/transaction) spanning two
shards needs two-phase commit or an application-level [Saga](/pattern/saga). Both
are slower and more complex than a local transaction. Many teams shard by an
aggregate boundary (everything for one order on one shard) precisely to avoid this.

**Global uniqueness and secondary indexes.** A `UNIQUE (email)` constraint cannot be
enforced by a single shard unless `email` is the shard key. Options: a separate
lookup index (itself sharded by the indexed value), or accepting a check-then-insert
[Race Condition](/concept/race-condition) window. Secondary indexes are either local
(each shard indexes its own rows; queries scatter) or global (partitioned by the
indexed term; writes touch two shards).

**Joins.** Joins across shards are effectively gone. Either denormalise so the joined
data lives together, or join in the application after fetching from several shards.
This is one reason sharded systems drift toward document models.

**Hot spots.** A time-based shard key sends all current writes to one shard. Mixing
a hash prefix into the key spreads them but destroys range locality. There is no free
lunch; pick based on the query mix.

**Operational complexity.** Schema migrations run N times, backups are N backups
that must be consistent with each other, and monitoring must be per shard. Managed
databases with built-in sharding and sharding-transparent systems hide much of this
— but not the data-modelling consequences.

**Alternatives before sharding.** Vertical scale, read replicas, a
[Cache](/concept/cache), archiving cold data, and moving large blobs to object
storage all postpone sharding. Most systems that think they need sharding at 100 GB
do not; the [URL Shortener](/system-design/url-shortener) design walks through where
it actually becomes necessary.

**Consistency.** Once data is spread and replicated, availability during partitions
is a per-shard decision governed by the [CAP Theorem](/concept/cap-theorem), and
readers may see different shards at different points in time — an
[Eventual Consistency](/concept/eventual-consistency) concern across shards even when
each shard is strongly consistent.
