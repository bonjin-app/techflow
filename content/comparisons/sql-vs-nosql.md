---
id: sql-vs-nosql
name: SQL vs NoSQL
tagline: A fixed relational schema with joins, or a flexible document model built to shard
category: decision
tags: [Database, SQL, NoSQL, Data Modelling, Decision]
difficulty: 3
subjects: [postgresql, mongodb]
related:
  - { to: database, rel: RELATED_TO }
  - { to: sql, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

"SQL vs NoSQL" is really a question about where your data model lives. A relational
database like [PostgreSQL](/technology/postgresql) makes you declare the shape up front and
then lets you query any combination of it — joins, aggregates, constraints and multi-row
[transactions](/concept/transaction) come free. A document database like
[MongoDB](/technology/mongodb) lets each record carry its own shape and stores related data
together, so the read your application actually performs is a single lookup, and horizontal
[sharding](/concept/sharding) is a first-class operation rather than a migration project.
Neither is faster in general. The relational model wins when queries are unpredictable and
correctness across entities matters; the document model wins when access patterns are known,
stable, and shaped like one aggregate at a time.

## Comparison

```compare
Feature              | SQL / PostgreSQL [postgresql]                        | NoSQL / MongoDB [mongodb]
Schema               | Declared and enforced; migrations are explicit       | Per-document; enforcement optional via validators
Query flexibility    | Rich ad-hoc SQL, joins across any tables             | Fast on modelled paths, joins are awkward
Relationships        | Foreign keys and referential integrity               | Embedding or application-side lookups
Transactions         | ACID across many rows and tables by default          | ACID within a document; multi-document is opt-in
Scaling model        | Scale up first, then read replicas, then shard       | Built-in sharding by shard key from the start
Consistency          | Strong on the primary; replicas may lag              | Tunable read and write concerns per operation
Indexing             | B-tree, GIN, partial and expression indexes          | B-tree, compound, text and geospatial indexes
Analytical queries   | Strong: window functions, CTEs, aggregates           | Aggregation pipeline; heavy work usually exported
Schema change cost   | Migration on a large table needs planning            | Write the new field; old documents stay as they are
Operational maturity | Decades of tooling, backups, query planners           | Mature managed offerings, simpler replica sets
```

## Decision

```decision
? Do read patterns change often, or will analysts query the data in ways nobody planned?
  YES -> PostgreSQL [postgresql]
  NO -> ? Must several entities change together and stay consistent (money, stock, bookings)?
    YES -> PostgreSQL [postgresql]
    NO -> ? Does each request read or write exactly one self-contained aggregate?
      YES -> ? Will one machine plausibly hold the working set for the next two years?
        YES -> PostgreSQL [postgresql]
        NO -> MongoDB [mongodb]
      NO -> ? Are the documents genuinely heterogeneous (per-tenant fields, sparse attributes)?
        YES -> MongoDB [mongodb]
        NO -> PostgreSQL [postgresql]
```

## When SQL

- You cannot enumerate tomorrow's queries. Reporting, admin screens and "can you pull the
  users who did X but not Y" all arrive later and a relational engine answers them without
  a data migration.
- Correctness spans entities: an order, its lines and the stock count must move together.
  A multi-table [transaction](/concept/transaction) is the cheapest way to say that.
- The data is naturally normalised — users, teams, invoices, permissions — and duplicating
  it into documents would mean writing your own consistency logic.
- You want the database to reject bad data. Not-null, unique, check and foreign-key
  constraints are enforcement the application cannot forget.
- The dataset is large but not enormous. A single well-indexed instance with replicas
  serves a great many products for years, and PostgreSQL now has JSONB when a few columns
  really are schemaless.

## When NoSQL

- Access is by key: a product page, a user profile, an event document. Storing the whole
  aggregate together turns several joins into one read.
- Write throughput or dataset size exceeds one machine and you would rather shard by a
  natural key than build sharding yourself on top of a relational store.
- Documents differ from each other by design: per-tenant custom fields, wildly sparse
  attributes, or ingested payloads whose shape you do not control.
- The schema moves fast. Early product iterations add and drop fields weekly, and paying
  the cost of a migration each time slows the team more than the eventual clean-up will.
- You need per-operation control over the consistency/latency trade-off rather than one
  global guarantee — read concerns and write concerns let each call choose.

## Deep Dive

**Joins do not disappear; they move.** A document model removes joins from the database by
either embedding the related data or by fetching it in a second round-trip from the
application. Embedding is fast to read and expensive to update when the embedded copy is
shared (a category name repeated in a million products). Application-side lookups reintroduce
the join without the query planner, the statistics or the transaction that a relational
engine would have used. The real question is not "do I like joins" but "who owns the
duplication and its invalidation".

**Schemas are never optional, only unenforced.** Removing the declared schema does not remove
the implicit one — it relocates it into the code that reads the documents. That is genuinely
cheaper while a handful of engineers hold the shape in their heads, and genuinely more
expensive once several services read the same collection and each tolerates a slightly
different version. Document validators and a version field per document recover most of the
guarantee; most teams eventually add both.

**Scaling is where the models actually diverge.** Relational scaling has a well-worn order:
tune queries and indexes, scale the box, add read replicas, then partition. Sharding a
relational database breaks cross-shard joins and transactions, which is exactly the
functionality you chose it for. Document stores put a shard key in the data model on day
one, so growth is adding nodes — at the price that a poorly chosen shard key (low
cardinality, monotonically increasing, or not present in your common query) creates hot
shards and scatter-gather reads that no amount of hardware fixes. See
[CAP Theorem](/concept/cap-theorem) for why the trade-off cannot be avoided, only chosen.

**Both stores have grown toward the middle.** PostgreSQL stores and indexes JSONB documents;
MongoDB supports multi-document ACID transactions and a schema validator. That convergence
means the decision is rarely "impossible in the other one" and usually "which one makes my
dominant workload the default and my rare workload the awkward case".

## Related

- [Database](/concept/database) — the concept underneath both
- [SQL](/concept/sql) — the query language the relational side is named after
- [Transaction](/concept/transaction) — the guarantee that most often decides this
- [Sharding](/concept/sharding) — the growth path each model takes differently
- [PostgreSQL vs MongoDB](/compare/postgresql-vs-mongodb) — the same choice at product level
