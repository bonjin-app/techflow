---
id: two-phase-commit
name: Two-Phase Commit
tagline: A coordinator asks every participant to prepare, then tells them all to commit
category: distributed
tags: [Distributed System, Consistency, Transaction, Reliability]
difficulty: 4
prerequisites: [database, transaction, acid, distributed-system]
learningPath:
  - database
  - transaction
  - acid
  - distributed-system
  - cap-theorem
  - two-phase-commit
  - saga
related:
  - { to: saga, rel: ALTERNATIVE_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: distributed-system, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: consistency, rel: SOLVES }
  - { to: outbox, rel: ALTERNATIVE_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A single database gives you [ACID](/concept/acid): either every write in the
[transaction](/concept/transaction) lands or none does. The moment the work spans two
resources — an order database and a payment database, a database and a message broker,
two shards after [sharding](/concept/sharding) — that guarantee disappears.

You are left with a **dual write**. Commit A then commit B: a crash in between leaves A
applied and B lost. Commit B first: same problem mirrored. Neither ordering is safe,
retries can double-apply, and there is no local rollback for a commit that already
succeeded elsewhere. The system now has states its invariants say are impossible.

## Solution

Introduce a **coordinator** that drives an atomic commit protocol across all
participants, in two phases. In the *prepare* phase every participant does the work,
makes it durable, and promises it can commit — but does not. Only if all vote yes does
the coordinator issue *commit* in phase two. One "no" turns it into a global abort.

```sequence
title: Happy path — prepare, then commit
participants: Coordinator [backend], Orders DB [postgresql], Payments DB [mysql]
Coordinator -> Orders DB: PREPARE txn-42
Coordinator -> Payments DB: PREPARE txn-42
Orders DB --> Coordinator: VOTE YES (locks held, log flushed)
Payments DB --> Coordinator: VOTE YES (locks held, log flushed)
Coordinator -> Coordinator: write COMMIT to its own log | decision point
Coordinator -> Orders DB: COMMIT txn-42
Coordinator -> Payments DB: COMMIT txn-42
Orders DB --> Coordinator: ACK (locks released)
Payments DB --> Coordinator: ACK (locks released)
```

The decision becomes real when the coordinator makes it durable, before any participant
hears it. That log is what lets recovery finish an interrupted transaction correctly.

## How it works

```steps
title: The protocol, and where it hurts
Coordinator assigns a transaction id
Phase 1 — PREPARE sent to every participant [distributed-system]
Each participant does the work, flushes its log, holds locks | it can no longer decide alone
Votes collected — any NO or timeout means global ABORT
Coordinator durably records the decision | this is the point of no return
Phase 2 — COMMIT (or ABORT) sent to all participants
Participants apply and release locks [deadlock] | must retry until acknowledged
Coordinator forgets the transaction once everyone has acknowledged
```

Between the vote and the decision, a participant is **in doubt**: it holds locks and is
not allowed to commit or abort on its own. If the coordinator crashes there, participants
block — indefinitely. That is not an implementation flaw; it is a proven property.
Two-phase commit is *not* fault-tolerant against coordinator failure, and no variant of it
can be. Three-phase commit reduces the blocking window but adds assumptions about network
timing that real networks do not honour; consensus protocols such as Raft solve a
different problem (agreeing on a value with a replicated, self-healing leader) and are
what a modern distributed database uses internally, sometimes as the commit coordinator
itself.

In practice you rarely implement this. XA is the standard interface, exposed by
[PostgreSQL](/technology/postgresql) (`PREPARE TRANSACTION`), MySQL and message brokers,
and driven by a transaction manager:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 7;
PREPARE TRANSACTION 'txn-42';   -- durable, locks held, awaiting the coordinator
-- later, from the coordinator:
COMMIT PREPARED 'txn-42';       -- or ROLLBACK PREPARED 'txn-42'
```

An orphaned prepared transaction pins locks and blocks vacuum until an operator finds it —
a common and unpleasant production incident.

## Advantages

- True atomicity across resources: no partial state, no compensating logic to write
- Strong consistency, so application code keeps its familiar invariants
- Standardised (XA) and supported by mainstream relational databases and brokers
- Correct isolation across participants, not just eventual agreement
- Recovery is well defined: the coordinator's log determines every outcome

## Disadvantages

- **Blocking on coordinator failure.** In-doubt participants hold locks until the
  coordinator returns; throughput can collapse while an operator intervenes.
- The coordinator is a single point of failure and its log must be as durable as the data
- Locks are held for at least two network round trips, slashing concurrency under load
- Availability is the *product* of all participants' availability — more parts, worse uptime
- Cross-service [deadlocks](/concept/deadlock) become possible and are hard to diagnose
- Poor fit for HTTP services: a request cannot politely hold a database lock while another
  team's service decides
- Most cloud-native stores (DynamoDB, Cassandra, Kafka, S3) do not offer XA at all

## When to use

- Two or more resources inside one trust and latency boundary must be atomic — typically
  a legacy transaction manager, an app server plus JMS broker, or two schemas on the same engine
- Correctness genuinely cannot tolerate a temporary inconsistency and no compensation exists
- Transaction volume is low and short, so held locks are not the bottleneck
- The database itself is the coordinator (many sharded SQL engines commit across shards this way)

## When not to use

- Between [microservices](/architecture/microservices) over the internet — this is the
  common case, and the answer is almost always no
- High throughput or long-running business processes (hours, human approval steps)
- Any participant lacking XA support, which includes most modern managed services
- Availability matters more than instant consistency — prefer a
  [Saga](/pattern/saga) with compensating actions, or the
  [Outbox](/pattern/outbox) pattern to make a single local commit plus a reliable event

## Real-world

Two-phase commit lives on where it was born: enterprise Java and .NET applications with a
transaction manager coordinating a relational database and a message queue in the same
data centre, and inside distributed SQL engines, which run it between their own shards
where they control the network, the timeouts and the recovery. Almost every service-oriented
system built in the last decade avoids it deliberately — the
[Payment System](/architecture/payment-system) architecture reserves funds, records intent
locally and reconciles asynchronously rather than holding a lock across a payment
provider, accepting a short window of inconsistency in exchange for staying available.
