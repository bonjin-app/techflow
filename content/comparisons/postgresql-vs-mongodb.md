---
id: postgresql-vs-mongodb
name: PostgreSQL vs MongoDB
tagline: Relational tables with strict schema and joins, or flexible documents that shard natively
category: decision
tags: [Database, SQL, NoSQL, Decision]
difficulty: 3
subjects: [postgresql, mongodb]
related:
  - { to: database, rel: RELATED_TO }
  - { to: sql, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

[PostgreSQL](/technology/postgresql) stores rows in tables with a declared schema, joins
them with [SQL](/concept/sql) and guarantees [ACID](/concept/acid) across any number of
rows. [MongoDB](/technology/mongodb) stores JSON-like documents whose shape can differ per
record, is queried by a document-oriented API and spreads data across shards as a built-in
feature. The old framing "SQL vs NoSQL" is mostly obsolete: PostgreSQL has excellent JSONB,
MongoDB has multi-document transactions. What remains is a difference in centre of
gravity — PostgreSQL is optimised for related data queried in many ways; MongoDB is
optimised for self-contained documents read and written whole, at horizontal scale.

## Comparison

```compare
Feature                  | PostgreSQL                                        | MongoDB
Data model               | Tables, rows, foreign keys; JSONB columns          | Collections of BSON documents, nested arrays
Schema                   | Declared and enforced; migrations to change        | Flexible per document; optional JSON Schema validation
Query language           | SQL with joins, window functions, CTEs             | Query API and aggregation pipeline
Relationships            | Joins are the normal case                          | Embed, or reference and $lookup
Transactions             | Full ACID across tables, default                   | Multi-document ACID available, adds cost
Horizontal write scaling | Manual: partitioning, Citus, application sharding | Native sharding with a chosen shard key
Read scaling             | Streaming replicas, read-only                      | Replica sets with configurable read preference
Consistency default      | Strong on the primary                              | Strong on primary; tunable via read/write concern
Indexing                 | B-tree, GIN, GiST, partial, expression, full-text  | Single, compound, multikey, text, geospatial
Typical sweet spot       | Business data, reporting, anything relational      | Catalogues, profiles, events, content with variable shape
```

## Decision

```decision
? Is the data strongly relational — many entities referencing each other, queried by joins and aggregates?
  YES -> PostgreSQL [postgresql]
  NO -> ? Do records vary in shape and get read and written as whole documents?
    YES -> ? Do you need to scale writes across many nodes soon, with minimal engineering?
      YES -> MongoDB [mongodb]
      NO -> ? Do you need multi-row ACID transactions or ad-hoc reporting across entities?
        YES -> PostgreSQL [postgresql]
        NO -> MongoDB [mongodb]
    NO -> PostgreSQL [postgresql]
```

## When PostgreSQL

- Orders, customers, invoices, inventory: entities that reference each other and are queried every which way.
- Correctness across rows matters — money moves, stock decrements — and you want [transactions](/concept/transaction) by default.
- Analysts and product teams will write ad-hoc SQL; joins, window functions and views pay for themselves.
- Part of the data is semi-structured: a JSONB column with a GIN index covers it without a second database.
- Dataset fits one strong primary with read replicas (which, in practice, is very large).
- See the [E-commerce](/architecture/e-commerce) architecture for the relational core of a shop.

## When MongoDB

- Documents are naturally self-contained: a product with variable attributes, a user profile, a game state, a form submission.
- The shape changes frequently and per tenant; forcing it into migrations would slow the team down.
- You need to spread writes across shards from early on and would rather choose a shard key than build sharding.
- Access patterns are known and few: fetch by id, query by a couple of indexed fields, no cross-collection reporting.
- Geographic distribution with zone-aware sharding is a requirement.

## Deep Dive

**Modelling is the real decision.** In PostgreSQL you normalise: an order is a row, its
lines are rows in another table, joined at query time. In MongoDB you embed: the order
document contains its lines array, so one read returns everything and one write updates
it atomically. Embedding is fast and simple until the same data is needed from another
angle — "all orders containing product X" is a query PostgreSQL answers with an index on
the lines table and MongoDB answers with a multikey index, but "revenue per product per
month across all orders" is a natural SQL aggregate and a more involved aggregation
pipeline. Choose the database after listing the queries, not before.

**Transactions and consistency.** PostgreSQL is [ACID](/concept/acid) by construction:
MVCC gives snapshot isolation, and constraints (foreign keys, unique, check) reject bad
data at write time. MongoDB updates to a single document are atomic, which covers most
document-centric workloads; multi-document transactions exist since 4.0 (and across shards
since 4.2) but hold locks longer and cost throughput, so designs avoid them where possible.
Both are strongly consistent when reading from the primary; MongoDB additionally lets you
trade consistency for latency per operation through read preference and write concern —
which is where [CAP theorem](/concept/cap-theorem) and
[eventual consistency](/concept/eventual-consistency) become practical questions.

**Scaling writes.** A single PostgreSQL primary handles a great deal, and
[replication](/concept/replication) scales reads. Beyond that you partition tables,
adopt an extension such as Citus, or shard in the application — all of which change how
you write queries. MongoDB was designed around [sharding](/concept/sharding): a shard key
distributes documents across replica sets and a router (`mongos`) hides it from clients.
The catch is the same as everywhere: a poor shard key creates hot shards, and queries that
do not include the key hit every shard.

**Schema flexibility versus schema drift.** MongoDB's flexibility is a productivity boost
early and a liability later if nothing enforces shape — three versions of the same
document coexisting is common. Use schema validation and versioned documents. PostgreSQL's
migrations are friction but they keep the data honest; JSONB gives you an escape hatch
for the genuinely variable parts.

**Ecosystem.** PostgreSQL has decades of tooling, extensions (PostGIS, pgvector, TimescaleDB)
and is available from every cloud. MongoDB's managed service (Atlas) and drivers are polished,
and its aggregation framework is powerful once learned. Both are mature; neither is a risky
choice for its intended workload.

## Related

- [Database](/concept/database) and [SQL](/concept/sql) — foundations
- [Transaction](/concept/transaction) and [ACID](/concept/acid) — what "consistent" means here
- [Sharding](/concept/sharding) and [Replication](/concept/replication) — how each scales
- [URL Shortener](/system-design/url-shortener) — a design that grows from one PostgreSQL to sharded storage
