---
id: dynamodb
name: Amazon DynamoDB
tagline: Managed key-value store with single-digit-ms latency, if you know your access patterns
category: database
tags: [Database, NoSQL, Key-Value, Serverless, AWS]
difficulty: 3
usedFor: [database, session, sharding, eventual-consistency, ttl]
prerequisites: [database, distributed-system, sharding, cap-theorem]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - distributed-system
  - sharding
  - replication
  - eventual-consistency
  - dynamodb
related:
  - { to: mongodb, rel: ALTERNATIVE_TO }
  - { to: postgresql, rel: ALTERNATIVE_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: s3, rel: USED_WITH }
  - { to: redis, rel: USED_WITH }
  - { to: social-feed, rel: USED_IN }
  - { to: authentication-system, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "DynamoDB (2026): on-demand/provisioned, Global Tables, Streams, PartiQL", confidence: high }
---

## TL;DR

DynamoDB is AWS's managed NoSQL database: you create a table with a partition key (and
optional sort key), and AWS handles servers, [sharding](/concept/sharding),
[replication](/concept/replication) and scaling. Every item is looked up by key, and
performance stays flat whether the table holds a thousand items or a trillion. The
catch is that you must design the table around your **access patterns** up front — there
are no joins, no ad-hoc queries and no indexes you forgot to plan for.

## Practical

Working with DynamoDB is mostly data modelling, then very simple code:

- List every query the application will make ("get user by id", "list a user's orders
  newest first", "find order by number"), then design keys and indexes to serve each
  with one `GetItem` or `Query`.
- Common shape: **single-table design** where several entity types share a table,
  distinguished by key prefixes (`USER#42`, `ORDER#9001`), with Global Secondary
  Indexes (GSIs) for alternate lookups.
- Choose capacity mode: on-demand (pay per request, scales instantly) or provisioned
  with autoscaling (cheaper at steady load).
- Use conditional writes for optimistic concurrency and idempotency, transactions
  (`TransactWriteItems`) for multi-item atomicity, [TTL](/concept/ttl) for expiring
  items, and Streams to react to changes.
- Keep items small (400 KB hard limit) and spread writes across partition keys; a hot
  key throttles no matter how much capacity the table has.

```ts
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

// Table: PK (string), SK (string). Orders for a user, newest first.
await doc.send(new PutCommand({
  TableName: "app",
  Item: { PK: "USER#42", SK: `ORDER#${isoTimestamp}#${orderId}`, total: 1250, status: "paid" },
  ConditionExpression: "attribute_not_exists(PK)",      // idempotent create
}));

const { Items } = await doc.send(new QueryCommand({
  TableName: "app",
  KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
  ExpressionAttributeValues: { ":pk": "USER#42", ":prefix": "ORDER#" },
  ScanIndexForward: false,                               // newest first
  Limit: 20,
}));
```

Reads are eventually consistent by default (cheaper); pass `ConsistentRead: true` when
you need read-your-writes on the base table. GSIs are always eventually consistent.

## Deep Dive

**Partitions.** The partition key is hashed to choose a storage partition; items with
the same partition key are stored together and ordered by sort key. Each partition has
fixed throughput and size limits, and AWS splits partitions automatically as data or
traffic grows. Throughput is therefore only as good as your key distribution — a
"celebrity" key that receives a disproportionate share of traffic becomes a hot
partition. Adaptive capacity softens this but does not remove it.

**Consistency model.** Each partition is replicated across three Availability Zones.
Writes are acknowledged after a majority; a default read may hit a replica that has not
yet applied the latest write, hence eventual consistency. Strongly consistent reads
route to the leader and cost twice as much. Global Tables replicate across regions
asynchronously with last-writer-wins by default, and a multi-region strong-consistency
option exists at higher latency. See [CAP Theorem](/concept/cap-theorem) and
[Eventual Consistency](/concept/eventual-consistency).

**Cost model.** You pay per read/write request unit (sized by item KB) plus storage.
`Scan` reads the whole table and is priced accordingly; a design that requires scans is
a design that will be expensive. Modelling to minimise request units — small items,
sparse GSIs, projected attributes — is the main optimisation lever.

**Transactions and Streams.** `TransactWriteItems` gives ACID across up to 100 items in
one region at double the write cost. Streams expose an ordered change log per partition
for 24 hours, which drives fan-out, search indexing and [CQRS](/pattern/cqrs) style
read models via Lambda consumers.

**Schema evolution.** Items in one table can have different attributes, but the keys
and indexes are fixed once traffic exists. Adding a new access pattern usually means a
new GSI (backfilled online) or, worst case, a migration to a new key design.

## Why

A relational database handles growth by scaling up, then by adding read replicas, then
by sharding — each step is a project, each requires people who understand the failure
modes, and the last one breaks joins and cross-shard transactions anyway. For workloads
that are really key-value lookups at very high volume (sessions, user profiles, device
state, feed items), the relational machinery is overhead and the operational ceiling is
real.

```sequence
title: Before — relational store under a key-value workload
participants: API [backend], MySQL [mysql]
API -> MySQL: SELECT * FROM sessions WHERE id=? (100k/s across 5 replicas)
MySQL --> API: row (replica lag varies)
API -> MySQL: INSERT INTO feed_items … (single primary saturates)
MySQL --> API: OK (p99 climbs as write volume grows)
API -> API: team plans a sharding project ❌ (months, cross-shard queries break)
```

DynamoDB removes the ceiling by making the shard the unit of storage from day one and
hiding it behind a managed service. The application never sees a node; it sees a table
that answers key lookups in a few milliseconds at whatever request rate it pays for.

```sequence
title: After — DynamoDB partitions automatically, latency stays flat
participants: API [backend], DynamoDB [dynamodb]
API -> DynamoDB: GetItem PK=SESSION#abc (100k/s)
DynamoDB --> API: item (~2 ms, spread across partitions)
API -> DynamoDB: PutItem PK=USER#42 SK=FEED#… (writes scale with key spread)
DynamoDB --> API: OK
API -> DynamoDB: Query PK=USER#42 begins_with(SK, "FEED#") Limit 50
DynamoDB --> API: 50 items in order, no join needed
```

The price is paid earlier: you commit to access patterns before writing code, and
questions you did not plan for are expensive or impossible without a new index.

## Advantages

- Consistent single-digit-millisecond latency regardless of table size
- Fully managed: no servers, patches, replication setup or manual sharding
- Scales writes and reads horizontally with on-demand or autoscaled capacity
- Native TTL, conditional writes, transactions, change Streams and multi-region Global Tables
- Pay-per-request pricing suits spiky and serverless workloads
- Tight integration with the AWS ecosystem (Lambda, IAM, Kinesis, S3 export)

## Trade-offs

- Access patterns must be designed up front; ad-hoc queries, joins and aggregations do not exist
- Eventual consistency by default; GSIs are always eventually consistent
- Hot partition keys throttle regardless of provisioned capacity
- Costs scale with request volume and item size; scans and large items get expensive fast
- 400 KB item limit and 100-item transaction limit constrain modelling
- AWS-only; migrating away later means re-modelling the data (local emulators exist but are not production)

## When to use

- Key-value and simple key-range access at high volume: sessions, profiles, carts, device state, feature flags
- Serverless architectures where a connection-pooled relational database is awkward
- Workloads with unpredictable spikes where on-demand capacity avoids pre-provisioning
- Time-series-like data partitioned by entity and sorted by time (activity feeds, event logs) with TTL expiry
- Multi-region active-active applications that can tolerate last-writer-wins or pay for strong consistency

## When not to use

- Don't use DynamoDB when the access patterns are still unknown or evolving quickly — a relational database such as [PostgreSQL](/technology/postgresql) tolerates that far better
- For reporting, analytics or anything needing joins and aggregations across entities
- When strong consistency across many items and complex invariants is central (ledgers with cross-account constraints)
- For document workloads that need rich secondary queries on nested fields — compare [MongoDB](/technology/mongodb)
- Outside AWS, or when avoiding provider lock-in is a hard requirement

## Real-world

DynamoDB appears where a system needs predictable latency at high request rates on
simple keys. In a [Social Feed](/architecture/social-feed) it stores per-user
timelines as `USER#id` partitions sorted by time, written by fan-out workers and read
with a single `Query`; in an [Authentication System](/architecture/authentication-system)
it holds sessions and refresh tokens with TTL doing the expiry; in a
[Notification System](/architecture/notification-system) it tracks device tokens and
delivery state. A [URL Shortener](/system-design/url-shortener) is the textbook fit:
one key, one value, enormous read volume. Media bytes and large blobs live next door in
[S3](/technology/s3), with DynamoDB holding the metadata.
