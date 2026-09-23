---
id: change-data-capture
name: Change Data Capture
tagline: Read the database's own write log so every change becomes an event
category: data
tags: [Data, Streaming, Integration, Replication]
difficulty: 3
prerequisites: [database, replication, message-queue]
learningPath:
  - database
  - replication
  - message-queue
  - change-data-capture
  - kafka
  - delivery-semantics
related:
  - { to: replication, rel: RELATED_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: outbox, rel: ALTERNATIVE_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: data-quality, rel: RELATED_TO }
  - { to: storage-engine, rel: REQUIRES }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Change data capture reads the log a database already writes for its own [replication](/concept/replication) — the
WAL in [PostgreSQL](/technology/postgresql), the binlog in [MySQL](/technology/mysql) — and turns every insert, update and delete into an
event. Nothing in the application changes, nothing polls, and no write is missed, because the
log is the same source of truth the database's own replicas use. It is how operational data
reaches a warehouse, a search index or a cache without a nightly batch job, and how a
monolith starts emitting events before anyone refactors it. The catch is that you get
*database* events, not *business* events: you learn that a row changed, not what the user
was trying to do.

## Why it matters

The alternatives are all worse in a specific way.

**Polling** a table for `updated_at > last_seen` misses deletes entirely, misses rows updated
twice within a poll, needs an index that the write path pays for, and puts a scanning query
on the primary forever. It also cannot see a row that was updated and reverted.

**Dual writes** — the application writes to the database and then publishes an event — are
the classic distributed-systems bug: the two are not atomic, so a crash between them leaves
the database and the event stream permanently disagreeing. [Outbox](/pattern/outbox) fixes
that by writing the event inside the transaction, and it requires changing the application.

**Nightly batch** is simple and means every downstream consumer is a day behind, which is a
product decision disguised as an engineering one.

CDC avoids all three: it is atomic by construction because the log entry *is* the commit, it
captures deletes, and it requires no application change at all. That last point is why it is
the standard way to get data out of a system nobody wants to modify.

## Visual

```sequence
title: A row changes, and four systems learn about it
participants: App [backend], DB [postgresql], Connector, Kafka [kafka], Warehouse [clickhouse]
App -> DB: UPDATE orders SET status = 'shipped' WHERE id = 42
DB -> DB: write-ahead log entry, then commit
DB --> App: committed — the app is done and knows nothing about the rest
Connector -> DB: read the replication slot from its last position
DB --> Connector: {before: {status: 'paid'}, after: {status: 'shipped'}, lsn: 9F2}
Connector -> Kafka: publish to orders.public.orders, keyed by id
Kafka -> Warehouse: consumer upserts the row
Kafka -> Warehouse: search index and cache invalidation consume the same topic
Connector -> DB: advance the slot only after the publish is acknowledged
```

## Solutions

**Read the log, not the table.** Use logical replication (PostgreSQL) or the binlog (MySQL)
through a connector such as Debezium. The database is already producing this stream for its
replicas; CDC is one more consumer of it. Triggers that write to an audit table are the older
approach and they put the cost on every write in the hot path.

**Key events by the primary key and let the topic compact.** With the row key as the message
key, a log-compacted topic keeps the latest state per row forever — so a new consumer can
rebuild its whole view from the topic without touching the source database. This is the
property that makes CDC a genuine integration backbone rather than a pipe.

**Plan the initial snapshot.** Before the stream is useful, consumers need the rows that
existed before CDC started. Connectors do an initial consistent snapshot and then switch to
streaming; on a large table that snapshot is a long read and it must not block replication or
exhaust the slot. Schedule it, watch replication lag while it runs, and know whether your
connector can do it incrementally.

**Watch the replication slot like a disk.** A slot that stops being consumed makes the
database retain WAL segments indefinitely — the connector goes down on Friday and the primary
runs out of disk on Sunday. Alert on slot lag in bytes, and decide in advance whether you
drop the slot (and re-snapshot) or wake someone.

**Treat schema changes as events too.** A column rename reaches consumers as a changed
message shape. Use a schema registry with compatibility rules, keep the staging layer that
absorbs churn, and add the producer-side check that names the downstream consumers — see
[Data Quality](/concept/data-quality). CDC makes upstream schema changes everybody's problem,
which is an argument for contracts rather than against CDC.

**Expect at-least-once, and make consumers idempotent.** A connector restart replays from its
last committed position, so duplicates are normal. Upsert by key rather than insert, and read
[Delivery Semantics](/concept/delivery-semantics) before assuming otherwise.

## Deep Dive

**CDC gives you rows, the outbox gives you intent** — [the two compared](/compare/outbox-vs-change-data-capture). A CDC event says `status` went from
`paid` to `shipped`. A business event says `OrderShipped`, with the fields that matter and a
contract that survives a schema refactor. Coupling downstream services to your table layout
is coupling them to your migrations — which is why CDC is excellent for analytics, search
indexes and caches, and a poor public contract between services. The common architecture uses
both: CDC into the warehouse, [Outbox](/pattern/outbox) for events other services consume.
One is a copy of your data; the other is a promise about your domain.

**Ordering holds per key, not globally.** Partitioning by primary key gives you every change
to one row in order, which is what an upsert needs. Across rows, and especially across
tables, order is not guaranteed — so a consumer that joins two CDC streams must tolerate the
child arriving before the parent. Designs that assume a global order work in test and fail
under load.

**Deletes are the reason to use CDC and the reason it surprises people.** A delete arrives as
a tombstone — a message with a key and a null value — which log compaction eventually removes.
A consumer that ignores null payloads silently keeps deleted rows forever, which is both a
data-quality bug and, under deletion-rights regimes, a compliance one.

**It reads committed data only, and that is the point.** Because the log is written at
commit, CDC never sees a transaction that rolled back and never sees a partial transaction.
Most connectors also expose the transaction boundary, so a consumer can apply a multi-row
change atomically instead of seeing it in pieces.

**The load is real but small, and it lands in one place.** Logical decoding costs the primary
CPU and WAL retention; it does not cost a scanning query per poll. Run the connector against
a replica where the database supports it. The failure mode to watch is not throughput, it is
the slot: lag is a disk problem before it is a latency problem.

**Know when not to.** If you control the application and want events other teams depend on,
the outbox is the better contract. If a nightly batch genuinely satisfies the consumers,
CDC adds a streaming platform you must operate for no gain. And if the source is not a
database with a readable log — a SaaS API, a file drop — CDC is not available and you are
back to polling a change feed, with all of polling's gaps.
