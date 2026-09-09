---
id: eventual-consistency
name: Eventual Consistency
tagline: Replicas may disagree for a while, but with no new writes they converge to the same state
category: architecture
tags: [Distributed System, Consistency, Replication]
difficulty: 4
prerequisites: [database, replication, cap-theorem]
learningPath:
  - database
  - replication
  - cap-theorem
  - eventual-consistency
  - cache-invalidation
  - cqrs
related:
  - { to: cap-theorem, rel: REQUIRES }
  - { to: replication, rel: REQUIRES }
  - { to: cache, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: saga, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Eventual consistency is a guarantee about *convergence*, not timing: if writes stop,
every replica will eventually hold the same value. Until then, a reader may see old data
or see two replicas disagree. It is the consistency model you get from asynchronous
[Replication](/concept/replication), from every [Cache](/concept/cache), and from any
architecture where a change is propagated by events rather than applied in a single
[Transaction](/concept/transaction).

## Why it matters

Strong consistency requires coordination on every write, which costs latency and
limits availability — the trade the [CAP Theorem](/concept/cap-theorem) describes.
Most large systems therefore accept eventual consistency for most data and reserve
strong guarantees for the few operations that need them. That choice leaks into
product behaviour: a user updates their profile and the old name is still on a page a
second later; a follower count is slightly off; a search index lags a new listing.
Engineers must know which reads can be stale, by how much, and what the user will see
when they are.

## Visual

```sequence
title: Read-after-write lag on an async replica
participants: User, Primary [postgresql], Replica [postgresql], Reader [backend]
User -> Primary: UPDATE profile SET name='Ana'
Primary --> User: committed
Primary -> Replica: replicate (async, in flight)
Reader -> Replica: SELECT name  (routed to replica)
Replica --> Reader: 'Anna'  ❌ stale
Replica -> Replica: applies UPDATE 40 ms later
Reader -> Replica: SELECT name
Replica --> Reader: 'Ana'  ✓ converged
```

## How it works

1. **Write is acknowledged locally.** The primary (or the node that received the write)
   commits and responds without waiting for other copies.
2. **Change propagates asynchronously.** Via replication streams, change-data-capture,
   or domain events on [Kafka](/technology/kafka). The delay — replication lag — is
   usually milliseconds but grows under load, during failover, or across regions.
3. **Readers may hit any copy.** A read routed to a replica, a cache, a search index or
   a downstream service's projection sees whatever has arrived so far.
4. **Conflicts are resolved.** If two copies accepted concurrent writes to the same item
   (multi-primary, offline clients), a rule decides the outcome: last-writer-wins by
   timestamp, version vectors that surface the conflict to the application, or
   mergeable data types (CRDTs) where every order of application yields the same result.
5. **Convergence.** Once propagation and resolution finish, all copies agree — until the
   next write.

**Where it appears in ordinary systems:**

- Primary/replica databases with reads scaled out to replicas.
- Caches and [CDNs](/concept/cdn) — the cached copy converges when the TTL expires or an
  invalidation arrives.
- Search indexes and analytics stores fed from the operational database.
- [CQRS](/pattern/cqrs) read models built from an event stream.
- Cross-service workflows coordinated by a [Saga](/pattern/saga), where each step commits
  locally and the whole business operation is consistent only when the saga completes.
- Document stores such as [MongoDB](/technology/mongodb) when reading from secondaries.

## Deep Dive

**Intermediate models that users actually need.** Pure eventual consistency permits
surprising anomalies; most systems add guarantees that cost little:

- *Read-your-writes*: a user always sees their own updates. Implement by routing a
  user's reads to the primary for a short period after they write, or by carrying a
  version and waiting until the replica has it.
- *Monotonic reads*: a client never sees time go backwards. Pin a session to one
  replica.
- *Causal consistency*: if event B was caused by A, nobody sees B without A. A reply
  should never appear before the comment it answers.

**Measuring staleness.** Replication lag is a first-class metric: seconds behind
primary, or the offset gap on a consumer group. Alert on it; a replica that falls
minutes behind is serving materially wrong answers, and a failover to it loses writes.

**Conflict resolution is a product decision.** Last-writer-wins silently discards one
user's change. That is fine for a "last seen" timestamp and unacceptable for a shopping
cart — the classic example merges both versions and may resurrect a deleted item. Choose
per data type; do not let the store's default choose for you.

**Idempotency and reordering.** Change events can arrive twice or out of order.
Consumers building projections need [idempotent](/concept/idempotency) handlers and a
per-entity version so an older event cannot overwrite a newer state.

**Where eventual is not enough.** Uniqueness (one username), non-negative balances,
inventory decrements and anything that must be checked-then-acted needs a single point
of serialisation: a strongly consistent store, a leader, or a
[Distributed Lock](/concept/distributed-lock). Trying to enforce these constraints across
eventually consistent copies produces double-spends and duplicate accounts.

**Designing the UI around it.** Because the lag is unavoidable, good systems hide it:
optimistic updates that show the user's change immediately from local state; "your
changes may take a minute to appear" for known-slow paths; and idempotent retries so a
user who refreshes does not create duplicates. Eventual consistency is a contract with
the user as much as with the database — state it and design for it rather than
discovering it in bug reports.
