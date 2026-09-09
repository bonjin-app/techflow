---
id: mongodb
name: MongoDB
tagline: Document database for flexible JSON-like records with built-in replication and sharding
category: database
tags: [Database, NoSQL, Document Store, Distributed System]
difficulty: 3
usedFor: [database, replication, sharding, eventual-consistency]
prerequisites: [programming-fundamentals, database, backend]
learningPath:
  - programming-fundamentals
  - database
  - backend
  - sql
  - mongodb
  - replication
  - sharding
  - cap-theorem
  - eventual-consistency
related:
  - { to: postgresql, rel: ALTERNATIVE_TO }
  - { to: redis, rel: USED_WITH }
  - { to: elasticsearch, rel: USED_WITH }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "MongoDB 8.x", confidence: high }
---

## TL;DR

MongoDB stores data as documents — BSON objects that look like JSON — grouped in
collections instead of rows in tables. A document can hold nested objects and arrays, so
an order with its line items is one record rather than a join. Schema is enforced by the
application (or optional validation rules), replication and automatic sharding are part
of the server, and reads and writes address a single document atomically. It fits data
that is naturally hierarchical and read whole; it fits poorly when the same facts must be
combined in many different ways with strong relational guarantees.

## Practical

Teams usually meet MongoDB through a driver or ODM (Mongoose, Spring Data, Motor) in a
service that stores user profiles, product catalogues, content, events or device data.

What you will actually do:

- **Design documents around access patterns.** Embed what is read together (order +
  items); reference what is shared or unbounded (a user's thousands of events). The
  16 MB document limit is a design guardrail, not a target.
- **Index deliberately.** Every query shape that matters gets a compound index; check
  `explain()` for `COLLSCAN`. Unindexed queries work in development and fall over at scale.
- **Run a replica set** (three members) even for small deployments — it gives failover,
  and single-node deployments cannot use transactions or change streams. See
  [Replication](/concept/replication).
- **Pick read/write concerns.** `writeConcern: majority` makes a write survive a
  primary failover; `readConcern: majority` avoids reading data that may be rolled back.
- **Use the aggregation pipeline** (`$match`, `$group`, `$lookup`, `$unwind`) for
  reporting inside the database instead of pulling collections into application code.

```js
// Orders embed their items; one write is atomic, one read returns everything
await db.collection("orders").insertOne({
  _id: "ord_9f2",
  userId: "u_17",
  status: "paid",
  items: [{ sku: "A1", qty: 2, price: 1999 }, { sku: "B7", qty: 1, price: 4900 }],
  createdAt: new Date(),
});

// Compound index matching the hot query: a user's recent orders
await db.collection("orders").createIndex({ userId: 1, createdAt: -1 });
const recent = await db.collection("orders").find({ userId: "u_17" }).sort({ createdAt: -1 }).limit(20).toArray();
```

Operationally you will run it as a managed cluster or a self-hosted replica set, watch
the working set versus RAM (WiredTiger cache), and only shard when a single replica set
genuinely cannot hold the data or the write rate.

## Deep Dive

**Storage engine and atomicity.** WiredTiger stores documents compressed on disk with
document-level concurrency control and a write-ahead journal. A single-document write —
even one touching several nested fields — is atomic and isolated. Multi-document
[transactions](/concept/transaction) exist (since 4.0 on replica sets, 4.2 across shards)
with snapshot isolation, but they are slower, time-limited by default and meant for the
cases embedding cannot cover, not for everyday use.

**Replica sets.** One primary accepts writes; secondaries replicate the oplog
asynchronously and elect a new primary within seconds when it fails. A write acknowledged
only by the primary can be rolled back after a failover — hence `w: majority` for anything
you cannot regenerate. Reads from secondaries are eventually consistent; reads from the
primary with `readConcern: majority` are not. This is [CAP theorem](/concept/cap-theorem)
in configuration form: durability and consistency are knobs with latency prices.

**Sharding.** A sharded cluster splits a collection across replica sets by a shard key
(ranged or hashed); `mongos` routers direct queries. A good shard key spreads writes and
lets the common queries target one shard; a bad one (monotonic timestamps, low
cardinality) creates hot shards and scatter-gather queries. Changing the key later is
possible in recent versions but expensive — choose it from real access patterns. See
[Sharding](/concept/sharding).

**Indexes and memory.** B-tree indexes on any field or array element, compound,
partial, TTL, text, geospatial and (in Atlas, and arriving in the community server)
vector indexes. Performance depends on indexes and the frequently accessed documents
fitting in the WiredTiger cache; when the working set exceeds RAM, latency jumps.

**Schema flexibility is not schema absence.** Documents in a collection may differ, but
the application still depends on shapes. Without JSON-schema validation or disciplined
migrations, a collection accumulates five versions of the same record and every reader
carries compatibility code. The flexibility pays off during rapid iteration and for
heterogeneous data (product attributes that differ by category); it costs when many
services read the same collection.

## Why

Application objects are trees — a user with addresses, an order with items, an article
with tags and comments. Relational modelling flattens each tree into several tables and
reassembles it with joins on every read. For simple CRUD on whole objects, that is
overhead in query complexity, round trips and schema migrations for every new field.

```sequence
title: Before — one order, several tables, several round trips
participants: API [backend], DB [postgresql]
API -> DB: BEGIN
API -> DB: INSERT INTO orders …
API -> DB: INSERT INTO order_items … (×N)
API -> DB: INSERT INTO shipping_addresses …
API -> DB: COMMIT
API -> DB: SELECT … orders JOIN order_items JOIN addresses WHERE id = ?
DB --> API: rows (one per item, reassembled in code)
```

A document database stores the tree as it is. The write is one atomic operation, the
read returns the object ready to serialise, and adding a field is a code change, not a
migration.

```sequence
title: After — one document per order
participants: API [backend], MongoDB [mongodb]
API -> MongoDB: insertOne({ …order, items: [...], address: {...} })
MongoDB --> API: acknowledged (w: majority)
API -> MongoDB: findOne({ _id })
MongoDB --> API: complete order document
API -> MongoDB: updateOne({ _id }, { $set: { status: "shipped" } })
MongoDB --> API: acknowledged
```

The same model has a mirror-image cost: the moment you need the data sliced a different
way — all items of SKU A1 across orders — you are querying inside arrays or duplicating
data, which is where relational databases are comfortable.

## Advantages

- Documents map directly to application objects; no ORM impedance mismatch for tree-shaped data
- Atomic single-document writes cover many cases that would need a transaction elsewhere
- Replication with automatic failover and horizontal sharding are built into the server
- Flexible schema speeds early iteration and handles heterogeneous records
- Rich secondary indexes and an expressive aggregation pipeline
- Change streams provide a database-native event feed for reactive designs

## Trade-offs

- Cross-document relationships are weak: `$lookup` is slower than a relational join and there are no foreign-key constraints
- Multi-document transactions exist but are costlier and more limited than in a relational database
- Schema discipline moves into application code; without it collections drift
- Duplicated (embedded) data must be kept consistent by you when the source changes
- Shard key choice is critical and hard to undo; poor keys cause hot spots
- Performance is very sensitive to indexes and to the working set fitting in RAM
- Server licensing (SSPL) is not OSI-approved open source; check compatibility with your policy

## When to use

- Records are naturally hierarchical and mostly read and written as a whole (profiles, catalogues, content, orders)
- Schema changes are frequent or records are heterogeneous (product attributes per category, event payloads)
- Write throughput or data volume needs horizontal scaling and access patterns allow a good shard key
- Each service owns its data and rarely joins across domains — common in [Microservices](/architecture/microservices)
- Time-series, logging and IoT streams with TTL expiry (time-series collections)

## When not to use

- The data is highly relational and queried in many different join shapes — reporting, finance, inventory with strict constraints; use [PostgreSQL](/technology/postgresql)
- You depend on multi-row invariants (balances, stock levels) that need frequent multi-document [ACID](/concept/acid) transactions
- The team lacks the discipline to version document shapes — a relational schema is a cheaper form of governance
- Full-text or relevance search is the main workload — [Elasticsearch](/technology/elasticsearch) is built for it
- The dataset is small and a single relational database with JSONB columns already covers the "flexible fields" need

## Real-world

MongoDB commonly appears as the per-service database in a [Microservices](/architecture/microservices)
system — a catalogue service or a user-profile service owning its collections while the
order and payment services stay relational. In a [Simple Web App](/architecture/simple-web-app)
built on a JavaScript stack it is often the only database, with [Redis](/technology/redis)
added later for caching and sessions. The relational-versus-document choice is examined in
[PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb).
