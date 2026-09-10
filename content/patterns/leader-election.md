---
id: leader-election
name: Leader Election
tagline: Pick exactly one instance to do the work that must not run twice
category: distributed
tags: [Distributed System, Coordination, Reliability]
difficulty: 4
prerequisites: [distributed-system, distributed-lock, ttl]
learningPath:
  - distributed-system
  - race-condition
  - distributed-lock
  - ttl
  - leader-election
  - consistency
related:
  - { to: distributed-system, rel: SOLVES }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: replication, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

You run five identical instances of a service for availability. Most of what they
do is stateless and parallel-safe. But some work must happen exactly once: a
nightly billing job, compacting a table, consuming a partition that must be read
in order, assigning shards to workers, sending the daily digest email.

Run it on every instance and customers get five invoices. Run it on one
hard-coded instance and you have reintroduced a single point of failure — when
that host dies, billing silently stops. Coordinate by "whoever wakes up first"
and you have a [race condition](/concept/race-condition).

The requirement is therefore: exactly one instance holds the role, and if it
dies another takes over within a bounded time — without human intervention and
without two instances both believing they lead.

## Solution

Have the instances **compete for a lease** on a shared, strongly consistent
store. One wins and becomes the leader; the others wait as followers. The lease
expires after a short TTL, so the leader must keep renewing it. If the leader
crashes, hangs, or is partitioned away, the lease expires and a follower wins the
next round.

```sequence
title: Election, renewal and failover
participants: A [backend], B [backend], Store [redis]
A -> Store: SET leader=A NX EX 15
Store --> A: OK — A is leader
B -> Store: SET leader=B NX EX 15
Store --> B: nil — B stays follower
A -> Store: renew lease (every 5s)
Store --> A: OK
A -> A: crash — no more renewals
B -> Store: SET leader=B NX EX 15 (after expiry)
Store --> B: OK — B is leader
B -> B: resume leader duties
```

```steps
title: Lease lifecycle
Every instance tries to acquire the lease [distributed-lock]
Exactly one write succeeds — that instance is leader
Leader renews well before the TTL expires [ttl] | renew at TTL/3
Followers poll or watch for the lease to become free
Leader loses the store, hangs, or is stopped — it stops renewing
The TTL expires and a follower acquires the lease
The old leader must stop acting before its lease expires — it fences itself
```

## How it works

The whole pattern rests on one property of the store: a compare-and-set that
either succeeds or fails, with no ambiguity. [Redis](/technology/redis) `SET NX
EX`, a `UNIQUE` row in PostgreSQL, a Kubernetes `Lease` object, or a consensus
store (etcd, ZooKeeper, Consul) all provide it.

```ts
const TTL = 15_000, RENEW = 5_000;

async function campaign(id: string) {
  const got = await redis.set("leader", id, "NX", "PX", TTL);
  if (!got) return false;
  setInterval(async () => {
    // renew only if we still own it — never blindly extend
    const ok = await redis.eval(RENEW_IF_MINE, 1, "leader", id, TTL);
    if (!ok) stopLeaderDuties();           // we lost it; step down immediately
  }, RENEW);
  return true;
}
```

The uncomfortable truth is that **leader election alone does not give
exactly-once execution.** A leader can be paused (GC pause, VM freeze, network
partition) past its TTL, wake up believing it is still leader, and write while a
new leader is also writing. No TTL is short enough to prevent this, only to make
it rarer.

The fix is **fencing**: every acquisition increments a monotonic token, the
leader stamps it on every side-effecting write, and the resource rejects stale
tokens — so the zombie's writes fail even though it thinks it is in charge. If
the resource cannot check tokens, the work must instead be
[idempotent](/concept/idempotency).

Choosing the store is a [CAP](/concept/cap-theorem) decision. A consensus store
(etcd, ZooKeeper) is CP: during a partition it refuses to answer rather than
elect two leaders. Redis is faster and simpler, but a failover of its own primary
can lose the lease — fine for a nightly digest job, not for a ledger writer.

## Advantages

- Turns a set of identical instances into a highly available singleton with no manual failover
- Failover is automatic and bounded by the TTL, typically seconds
- The application stays symmetric — same image, same config, no special "primary" host
- Reuses infrastructure you probably already run (Redis, PostgreSQL, Kubernetes leases)
- Composes well: shard assignment, scheduled jobs and ordered consumption all use the same primitive

## Disadvantages

- Correctness depends entirely on the store's consistency guarantees, which are easy to overestimate
- Zombie leaders are real; without fencing tokens you get "mostly once", not exactly once
- A gap of up to one TTL with no leader after every failure — the work pauses
- Clock skew and long GC pauses break naive renewal logic
- Followers are idle capacity for the leader's workload
- Flapping under load: a leader too busy to renew loses the lease, which makes the next leader busy too

## When to use

- Work that must not run concurrently: scheduled jobs, compaction, reconciliation loops
- Assigning [shards](/concept/sharding) or partitions to workers from one coordinator
- A hot-standby [replication](/concept/replication) setup that must promote automatically
- You have a strongly consistent store and can tolerate a short leaderless gap

## When not to use

- The work is naturally partitionable — give each instance a key range and skip coordination entirely
- The job is idempotent and cheap to repeat; letting all instances run it is simpler
- A queue with per-message acknowledgement already guarantees one consumer per message
- Money or data integrity depends on it and the resource cannot enforce fencing tokens
- You would build consensus yourself — use etcd, ZooKeeper or your platform's lease API instead

## Real-world

Kubernetes controllers elect a leader through a `Lease` object so only one
replica of a controller reconciles at a time. Database clusters use it for
automatic primary promotion. Job schedulers use it so a cron-like task fires once
across a fleet, and stream consumers use it to assign partitions. In the
[Microservices](/architecture/microservices) architecture it is the mechanism
behind "only one instance runs the outbox relay", which is why relay consumers
must still be idempotent.
