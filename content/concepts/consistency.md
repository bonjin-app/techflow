---
id: consistency
name: Consistency
tagline: What "reading the latest write" means when data lives in more than one place
category: fundamentals
tags: [Distributed System, Data, Fundamentals]
difficulty: 3
prerequisites: [database, transaction, distributed-system, replication]
learningPath:
  - database
  - transaction
  - acid
  - distributed-system
  - replication
  - consistency
  - cap-theorem
  - eventual-consistency
related:
  - { to: replication, rel: REQUIRES }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: availability, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: dynamodb, rel: RELATED_TO }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Consistency describes the guarantees a system gives about which value a read returns
after writes have happened. In a single-node database it is the "C" of
[ACID](/concept/acid): every transaction leaves the data valid. In a distributed system
it is a spectrum — from **strong** (every read sees the latest write, as if there were
one copy) through causal and session guarantees down to
[Eventual Consistency](/concept/eventual-consistency) (replicas converge, eventually).
Stronger guarantees cost latency and [Availability](/concept/availability).

## Why it matters

The moment data is replicated — a read replica, a cache, a second region — there are
multiple copies and they cannot all change at the same instant. A user updates their
profile, refreshes, and sees the old value. A payment is confirmed on one node and
rejected on another. A stock count is decremented twice. These are consistency
problems, and they surface as bugs that "cannot happen" according to the code.

Choosing a consistency model is a product decision as much as a technical one. A
[Payment System](/architecture/payment-system) balance must be strongly consistent; a
like count can lag by seconds. Paying for strong consistency everywhere makes systems
slow and fragile; assuming it where you have not paid for it makes them wrong.

## Visual

```sequence
title: Stale read after asynchronous replication
participants: Client, Primary [postgresql], Replica [postgresql]
Client -> Primary: UPDATE profile SET name='Ada'
Primary --> Client: COMMIT OK
Primary -> Replica: replicate (async, in flight)
Client -> Replica: SELECT name FROM profile
Replica --> Client: 'Ada Lovelace' (stale ❌)
Primary -> Replica: replicated write applied
Client -> Replica: SELECT name FROM profile
Replica --> Client: 'Ada' (converged)
```

The write succeeded, yet the next read returned old data because it hit a replica the
change had not reached. Nothing failed; the system simply offered a weaker guarantee
than the client assumed.

## Solutions

Pick the weakest model each piece of data can tolerate, then enforce it deliberately.

- **Strong consistency (linearizability)** — reads and writes appear to happen
  instantaneously in one global order. Achieved by reading from the leader, by
  synchronous replication to a quorum, or by consensus protocols (Raft, Paxos).
  Highest latency; unavailable if the quorum cannot be reached.
- **Read-your-writes** — a client always sees its own updates. Route a session's reads
  to the primary for a few seconds after it writes, or carry the write's log position
  and wait until a replica has caught up to it.
- **Monotonic reads** — a client never sees time go backwards. Pin a session to one
  replica rather than round-robining.
- **Causal consistency** — if B was written after seeing A, no one sees B without A.
  Needed for comment threads and chat; implemented with version vectors or per-key
  ordering.
- **Eventual consistency** — replicas converge once writes stop. Cheapest and most
  available; the application must tolerate stale reads and resolve conflicting
  concurrent writes (last-writer-wins, merge functions, CRDTs).
- **Quorums** — with N replicas, writing to W and reading from R such that R + W > N
  guarantees overlap, so a read sees at least one up-to-date copy. Tune W and R per
  operation.
- **Tunable per request** — many stores expose the choice: [DynamoDB](/technology/dynamodb)
  offers eventually consistent reads by default and strongly consistent reads on
  request at higher cost; [PostgreSQL](/technology/postgresql) lets you choose
  synchronous or asynchronous replicas per commit.

## Deep Dive

**Two meanings, one word.** ACID consistency is about *invariants*: after a
[Transaction](/concept/transaction), constraints hold (balances sum correctly, foreign
keys resolve). Distributed consistency is about *replica agreement*: which copy's
value you see. A system can satisfy one and not the other — a single strongly
consistent node can still accept a transaction that breaks a business rule, and a
perfectly ACID database with an asynchronous replica still serves stale reads.

**The trade-off is real.** The [CAP Theorem](/concept/cap-theorem) says that during a
network partition a system must choose between answering (availability) and
answering correctly (consistency). PACELC adds that even without a partition you trade
consistency against latency: waiting for a remote quorum is what makes strong
consistency slow. Cross-region strong consistency means every write pays a
cross-region round trip.

**Isolation is consistency within a node.** Even on a single database, weaker
isolation levels let concurrent transactions observe intermediate states — the
non-repeatable reads and lost updates behind many [Race Conditions](/concept/race-condition).
Serializable isolation is single-node strong consistency for transactions.

**Caches are replicas.** A [Cache](/concept/cache) in front of a database is an
eventually consistent replica with an explicit staleness bound (its TTL) and its own
invalidation problem. Treat it with the same reasoning: what is the worst stale read
this data can tolerate?

**Design for the model you chose.** If reads may be stale, make the UI say so or make
the operation idempotent so a retry on stale data is harmless. If writes may conflict,
model data so conflicts merge (append-only events, counters as increments, sets as
unions) rather than overwrite. If you need strong consistency, keep that data set
small and local — one region, one leader — and let everything else be eventual.

**Testing it.** Consistency bugs need replication lag to appear. Inject delay into
replication in staging, run reads against replicas immediately after writes, and use
tools like Jepsen-style checkers for stores that claim strong guarantees.

## Related

- [CAP Theorem](/concept/cap-theorem) — why you cannot have everything during a partition
- [Eventual Consistency](/concept/eventual-consistency) — the weak end of the spectrum in depth
- [Availability](/concept/availability) — what strong consistency trades away
