---
id: replication
name: Replication
tagline: Keep copies of the same data on several machines for durability, availability and reads
category: data
tags: [Data, Distributed System, Availability]
difficulty: 3
prerequisites: [database, transaction, distributed-system]
learningPath:
  - database
  - sql
  - transaction
  - distributed-system
  - replication
  - eventual-consistency
  - sharding
related:
  - { to: database, rel: REQUIRES }
  - { to: distributed-system, rel: REQUIRES }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Replication keeps the same data on multiple nodes. It protects against losing a
machine (durability), keeps the service up when one fails (availability) and lets
reads be served from several places (scale, geography). The hard part is keeping the
copies in agreement while the data changes: synchronous replication is consistent
but slow and fragile; asynchronous replication is fast but lets replicas lag and can
lose the most recent writes on failover.

## Why it matters

A single database is a single point of failure and a single point of read capacity.
Almost every production [Database](/concept/database) — [PostgreSQL](/technology/postgresql),
[MongoDB](/technology/mongodb), [Redis](/technology/redis), [Kafka](/technology/kafka),
[Elasticsearch](/technology/elasticsearch) — ships with replication because operators
need both "the disk died and we lost nothing" and "the primary is down and we are
still serving". Understanding replication lag is also what explains the most common
"I just wrote it and cannot read it back" bug in scaled systems.

## Visual

```steps
title: Life of a write under leader-based replication
Client writes to the leader [database] | only the leader accepts writes
Leader appends to its log | WAL / oplog / replication stream
Leader ships log entries to followers | over the network, in order
Followers apply the entries | each becomes a copy at some offset
Leader acknowledges to client | sync: after followers confirm · async: immediately
Followers serve reads [load-balancing] | possibly slightly behind the leader
```

## How it works

**Leader-based (primary/replica).** One node accepts writes and streams its change
log to followers. Followers apply changes in the same order, so each is a consistent
snapshot from some point in the past. Reads can go to any node; writes must reach
the leader. This is the model in PostgreSQL streaming replication, MongoDB replica
sets, Redis replicas and Kafka partition leaders.

**Synchronous vs asynchronous.** Synchronous: the leader waits for at least one
follower to confirm before acknowledging the client. No committed write is lost on
failover, but a slow or dead follower slows or blocks writes. Asynchronous: the
leader acknowledges immediately. Fast and resilient to follower failure, but a
leader crash loses writes that had not yet reached a follower. *Semi-synchronous*
(one sync follower, the rest async) is the common compromise.

**Multi-leader.** Several nodes accept writes, typically one per region, and
exchange changes. Writes are local and fast; conflicting writes to the same record
must be resolved (last-writer-wins, merge, application logic). Used for
geo-distributed systems and offline-first clients.

**Leaderless (quorum).** Any node accepts writes; a write is successful when W of N
replicas confirm, a read consults R replicas, and W + R > N guarantees overlap.
Dynamo-style stores use this. Conflicts are detected with version vectors and
repaired via read-repair or anti-entropy.

**Failover.** When the leader dies, a follower is promoted. Automatic failover needs
failure detection (timeouts — which can misfire during a network partition), an
election, and clients that rediscover the new leader. The old leader, if it comes
back, must not accept writes ("split brain") — this is where fencing and consensus
come in.

## Deep Dive

**Replication lag and read-your-writes.** A user updates their profile (write to
leader), the page reloads and reads from a follower that has not yet applied the
change: the update appears to vanish. Options: read from the leader for a short
window after a write, route a user's reads to the leader for their own data, or
carry a log position with the session and wait for the follower to catch up.
This is [Eventual Consistency](/concept/eventual-consistency) in its most everyday
form.

**Monotonic reads.** Two successive reads that hit different followers can go
*backwards* in time. Pinning a session to one replica prevents it.

**Failover data loss.** With async replication, promoting a follower that is 200 ms
behind discards 200 ms of acknowledged writes. Applications that treat every
acknowledgement as durable (payments) need synchronous replication or a consensus
log for that data. Redis explicitly documents this: replicas are asynchronous and a
failover can lose the last writes.

**Consistency vs availability.** During a partition, a follower cut off from the
leader can either keep serving possibly stale reads (available, inconsistent) or
refuse (consistent, unavailable). This is the practical face of the
[CAP Theorem](/concept/cap-theorem).

**Replication is not backup.** A `DROP TABLE` replicates just as faithfully as an
insert. Point-in-time recovery and separate backups remain necessary.

**Replication vs sharding.** Replication copies *all* data to each node; it scales
reads and availability, not write throughput or dataset size. When one node can no
longer hold or write the data, you [Shard](/concept/sharding) — and usually
replicate each shard, giving N shards × M replicas.

**Log shipping formats.** Physical replication (copying WAL blocks) is exact but ties
replicas to the same version and storage layout; logical replication (row-level
changes) can feed different versions, subsets of tables, or entirely different
systems — which is how change-data-capture pipelines feed Kafka and search indexes.

**Where you meet it.** Read replicas behind an [E-commerce](/architecture/e-commerce)
catalog, Kafka's replicated partitions in a
[Notification System](/architecture/notification-system), and every managed database
offering "multi-AZ" — which is synchronous replication to a standby in another
availability zone.
