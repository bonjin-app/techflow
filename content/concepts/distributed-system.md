---
id: distributed-system
name: Distributed System
tagline: Many machines cooperating over an unreliable network to act like one system
category: architecture
tags: [Architecture, Distributed System, Reliability]
difficulty: 4
prerequisites: [http, backend, database]
learningPath:
  - backend
  - database
  - replication
  - distributed-system
  - cap-theorem
  - eventual-consistency
  - sharding
  - distributed-lock
related:
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A distributed system is a set of processes on different machines that communicate
only by sending messages over a network. That one fact — messages can be delayed,
lost, duplicated or reordered, and a machine can fail without telling anyone —
creates every hard problem in the field: knowing whether a peer is alive, agreeing
on an order of events, keeping copies of data consistent, and doing something
exactly once. Any [Backend](/concept/backend) with two servers and a database is
already a small distributed system.

## Why it matters

Single machines have limits — CPU, memory, disk, and the fact that they eventually
die. Scaling past them and surviving failures both require more machines, and the
moment you have more than one, the comfortable assumptions of a single process
(shared memory, a single clock, a function call either returns or throws) stop
holding. The techniques that make web systems reliable at scale —
[Replication](/concept/replication), [Sharding](/concept/sharding),
[Load Balancing](/concept/load-balancing), [Message Queues](/concept/message-queue),
[Idempotency](/concept/idempotency) — are all responses to this. Engineers who
recognise a distributed-systems problem stop looking for a bug and start looking for
a missing guarantee.

## Visual

```sequence
title: A lost reply — the fundamental ambiguity
participants: Client, Service A [backend], Service B [backend], DB [postgresql]
Client -> Service A: POST /payments
Service A -> Service B: charge(card, 50)
Service B -> DB: INSERT payment; COMMIT
DB --> Service B: ok
Service B --> Service A: 200 OK  (packet lost on the network)
Service A -> Service A: timeout after 2 s — did the charge happen?
Service A -> Service B: charge(card, 50)  retry with same idempotency key
Service B -> DB: SELECT payment WHERE key = …  → already exists
Service B --> Service A: 200 OK  (same result, no second charge)
Service A --> Client: 201 Created
```

## How it works

**Partial failure.** In a single process, a call either completes or the whole
program fails. Across a network a call can succeed on the remote side while the
caller sees a timeout. Every remote call therefore has three outcomes — success,
failure, *unknown* — and code must handle the third. Retries plus
[Idempotency](/concept/idempotency) turn "unknown" into "safe to ask again".

**No global clock.** Machines' clocks drift; two events on different nodes cannot be
ordered by timestamp alone. Systems use logical clocks, sequence numbers from a
single leader, or a log such as [Kafka](/technology/kafka) whose partition order
defines "what happened first".

**Replication** keeps copies of data on several nodes so reads scale and a node can
die without data loss. Synchronous replication waits for a replica to acknowledge
(slower, no lost writes on failover); asynchronous returns immediately (faster,
recent writes may be lost). Readers of an asynchronous replica may see old data —
[Eventual Consistency](/concept/eventual-consistency).

**Partitioning (sharding)** splits data across nodes so no single node holds
everything. Operations touching one shard stay simple; operations spanning shards
need coordination or give up atomicity. See [Sharding](/concept/sharding).

**Consensus and leadership.** Deciding which node is the primary, or agreeing on a
value, requires a consensus protocol (Raft, Paxos) that stays correct when a minority
of nodes fail. This is what coordination services and the control plane of
[Kubernetes](/technology/kubernetes) (etcd) run on. It is also why a
[Distributed Lock](/concept/distributed-lock) on a single non-consensus node is only
best-effort.

**Trade-offs.** The [CAP Theorem](/concept/cap-theorem) formalises the choice during
a network partition: refuse some requests to stay consistent, or answer with
possibly stale data to stay available. Most systems choose per operation, not
globally.

## Deep Dive

**The fallacies.** Classic mistakes: assuming the network is reliable, latency is
zero, bandwidth is infinite, topology does not change, there is one administrator,
transport cost is zero, and the network is homogeneous. Each one shows up as a
production incident eventually.

**Failure detection is guesswork.** A node that does not answer may be dead, slow,
or cut off from you but fine for everyone else. Heartbeats with timeouts are the
standard answer; picking the timeout is a trade-off between detecting failures
quickly and declaring healthy nodes dead under load. Split-brain — two nodes each
believing they are primary — follows from getting this wrong without a quorum.

**Exactly-once does not exist on the wire.** Delivery is at-most-once or
at-least-once; "exactly-once processing" is at-least-once delivery plus idempotent
handling or deduplication. Every [Message Queue](/concept/message-queue) design
reflects this.

**Cascading failure.** One slow dependency exhausts callers' connection pools, which
makes them slow, which exhausts *their* callers. Timeouts, bounded
[Retry](/pattern/retry) with backoff and jitter, and a
[Circuit Breaker](/pattern/circuit-breaker) are the standard containment tools;
retries without backoff amplify outages.

**Observability.** Distributed tracing with a propagated request id is the only way
to reconstruct what happened across nodes; logs from a single machine show one
fragment of a story.

**Cost of distribution.** [Microservices](/architecture/microservices) turn function
calls into network calls and one database into many, importing every problem above.
A [Simple Web App](/architecture/simple-web-app) with one database and stateless
servers behind a load balancer is already distributed enough for most products —
distribute further only for a concrete reason.
