---
id: cap-theorem
name: CAP Theorem
tagline: During a network partition a distributed store must choose consistency or availability
category: architecture
tags: [Distributed System, Consistency, Theory]
difficulty: 4
prerequisites: [database, distributed-system, replication]
learningPath:
  - database
  - distributed-system
  - replication
  - cap-theorem
  - eventual-consistency
  - sharding
related:
  - { to: distributed-system, rel: REQUIRES }
  - { to: replication, rel: REQUIRES }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

The CAP theorem states that a replicated data system cannot provide all three of
**Consistency** (every read sees the latest write), **Availability** (every request to a
live node gets a non-error response) and **Partition tolerance** (the system keeps
working when nodes cannot talk to each other). Since network partitions are not
optional in a real network, the practical statement is: *when a partition happens,
choose C or A*. Everything else is about how often partitions occur and how much you
give up the rest of the time.

## Why it matters

Once data lives on more than one machine — [Replication](/concept/replication) for
failover, [Sharding](/concept/sharding) for scale, services with their own databases in
[Microservices](/architecture/microservices) — you are inside CAP whether you decided to
be or not. It explains why a database that "never goes down" can return stale data, why
a strongly consistent store rejects writes during an outage, and why configuration
options such as write acknowledgement levels exist. Reading a datastore's consistency
guarantees is reading its CAP choice.

## Visual

```decision
? Can nodes currently communicate (no partition)?
  YES -> Serve reads and writes normally — CAP does not force a trade-off right now
  NO -> ? Is returning stale or divergent data acceptable for this operation?
    YES -> AP: keep serving on both sides, reconcile later [eventual-consistency]
    NO -> ? Can the minority side afford to reject requests?
      YES -> CP: only the side with a quorum serves; others return errors or block
      NO -> Reconsider the design — you are asking for CA, which no network can provide
```

## How it works

**The three properties, precisely.** *Consistency* here is linearizability — the system
behaves as if there were a single copy — not the C of [ACID](/concept/acid).
*Availability* means every non-failed node answers every request, not "high uptime".
*Partition tolerance* means correctness survives dropped or delayed messages between
nodes.

**Why you cannot have all three.** Two replicas lose contact. A client writes to
replica 1. A second client reads from replica 2. To be consistent, replica 2 must
either return the new value (impossible — it never heard about it) or refuse to answer
(not available). To be available, it must answer with the old value (not consistent).
There is no third option while the partition lasts.

**CP systems** favour consistency: a node that cannot reach a quorum stops serving.
Consensus-based stores (ZooKeeper, etcd), a single-primary database that refuses writes
without a confirmed primary, and [MongoDB](/technology/mongodb) with majority write
concern and primary reads behave this way. Users see errors or timeouts during a
partition, never stale data.

**AP systems** favour availability: every node keeps accepting reads and writes and
copies are merged when connectivity returns. Dynamo-style stores (Cassandra, Riak) with
low consistency levels, DNS, and multi-primary replication setups are AP. Users always
get an answer; two users may briefly disagree. See
[Eventual Consistency](/concept/eventual-consistency).

**A single node** — one [PostgreSQL](/technology/postgresql) instance — is not subject
to CAP at all: there is nothing to partition. It is simply unavailable when it is down.
CAP starts with the second copy.

## Deep Dive

**It is a spectrum per operation, not a label per database.** Most systems let you pick
per request: Cassandra's `QUORUM` vs `ONE`, MongoDB's read and write concerns,
[Kafka](/technology/kafka)'s `acks=all` vs `acks=1`. A product catalogue read can be AP
while the payment ledger write is CP, in the same store.

**PACELC: the normal case matters more.** Partitions are rare; the common state is a
healthy network, and there the trade-off is between **L**atency and **C**onsistency.
Synchronous replication to a remote region gives consistency at the cost of a
round-trip on every write; asynchronous replication is fast but opens a window in
which a failover loses acknowledged writes. Most real design discussions are about
this "else" case, not about partitions.

**Consistency is expensive even without partitions.** Achieving linearizability
requires coordination — a quorum round-trip or a single leader — which caps throughput
and adds latency. Systems that advertise "strong consistency" pay for it on every
operation, which is why many deliberately offer weaker models (read-your-writes,
monotonic reads, causal consistency) that cover the cases users notice without global
coordination.

**Common misreadings.**

- "We chose CA" — meaningless for a distributed system; the network will partition, and
  the system will then behave as CP or AP whether or not that was designed.
- "AP means no consistency" — AP systems still converge; the question is how quickly and
  how conflicts are resolved (last-writer-wins, vector clocks, CRDTs, application merge).
- "CP means down often" — CP systems with a quorum stay available to the majority side;
  only the minority partition rejects requests, and well-designed clients fail over.

**Practical guidance.** Identify the few operations where stale data is unacceptable
(balances, inventory decrements, uniqueness checks) and make those CP with quorum
writes or a single writer. Let everything else be AP with a bounded staleness. Then
design for what happens when a CP operation *cannot* proceed — a queue, a retry, an
honest error to the user — because that is the availability you are giving up.
