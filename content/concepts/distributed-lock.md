---
id: distributed-lock
name: Distributed Lock
tagline: Let only one process across many machines hold a resource at a time
category: architecture
tags: [Concurrency, Distributed System, Coordination]
difficulty: 4
prerequisites: [programming-fundamentals, race-condition, distributed-system]
learningPath:
  - programming-fundamentals
  - race-condition
  - distributed-system
  - ttl
  - distributed-lock
  - redis
  - deadlock
related:
  - { to: redis, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: race-condition, rel: REQUIRES }
  - { to: ttl, rel: REQUIRES }
  - { to: deadlock, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A distributed lock is a mutex that works across processes on different machines: before
touching a shared resource, a process acquires a named lock in a shared store, does the
work, and releases it. In-process mutexes cannot coordinate several servers; a lock in
[Redis](/technology/redis), a database row, or a consensus system can. Every
distributed lock needs an **expiry** so that a crashed holder does not block everyone
forever — and that expiry is also the source of its hardest edge cases.

## Why it matters

Once an application runs on more than one instance, any "check then act" sequence is a
[Race Condition](/concept/race-condition) waiting to happen: two servers both see one
seat left and both sell it; two cron workers both send the nightly report. A
distributed lock serialises those sections. It is the blunt instrument of coordination
in [Microservices](/architecture/microservices) — heavy, but often the simplest correct
tool for "exactly one worker should do this right now".

## Visual

```sequence
title: Acquire with SET NX and an expiry
participants: Worker A [backend], Worker B [backend], Redis [redis]
Worker A -> Redis: SET lock:report tokenA NX PX 30000
Redis --> Worker A: OK (acquired)
Worker B -> Redis: SET lock:report tokenB NX PX 30000
Redis --> Worker B: nil (held by someone else)
Worker B --> Worker B: back off, retry later
Worker A -> Worker A: generate report
Worker A -> Redis: EVAL "if GET==tokenA then DEL" lock:report tokenA
Redis --> Worker A: 1 (released)
Worker B -> Redis: SET lock:report tokenB NX PX 30000
Redis --> Worker B: OK (acquired)
```

## How it works

1. **Acquire atomically.** `SET key value NX PX ms` succeeds only if the key does not
   exist and sets an expiry in one command. Two separate commands (`SETNX` then
   `EXPIRE`) leave a window where a crash creates a lock with no expiry.
2. **Use a unique token as the value.** A random per-acquisition token identifies the
   holder. Never store a constant.
3. **Do the work — briefly.** The critical section should be shorter than the expiry
   by a wide margin.
4. **Release only your own lock.** Compare the stored token to yours and delete in one
   atomic step (a Lua script in Redis). A plain `DEL` might remove a lock that expired
   and was re-acquired by someone else.
5. **On failure to acquire,** wait with jittered backoff and retry, or give up and report
   "busy" — spinning on the store hurts everyone.

**Other lock backends:**

- **Relational database.** [PostgreSQL](/technology/postgresql) advisory locks
  (`pg_advisory_lock`) or `SELECT … FOR UPDATE` on a lock row. Ties the lock to a
  [Transaction](/concept/transaction), so a crash releases it automatically. Slower
  than Redis but already consistent with your data.
- **Consensus stores** (ZooKeeper, etcd, Consul). Leases and ephemeral nodes backed by a
  quorum give stronger guarantees under partitions at the cost of latency and
  operational weight.

## Deep Dive

**The expiry paradox.** The [TTL](/concept/ttl) protects against dead holders, but a
*live* holder that is slow — a long GC pause, a stalled network, a swapped-out process —
can still be working when the lock expires. Another process acquires it and two holders
run at once, which is the exact failure the lock was meant to prevent. Mitigations:

- Keep critical sections short and expiry generous.
- **Fencing tokens**: the lock service returns a monotonically increasing number with
  each acquisition; the protected resource rejects writes carrying a token lower than
  one it has already seen. This is the only robust fix, and it requires the resource to
  participate.
- Lock extension ("watchdog") threads that renew the expiry while working help with slow
  work but not with a paused process.

**Single-node Redis is not a consensus system.** With asynchronous
[Replication](/concept/replication), a lock acquired on the primary can be lost on
failover before it replicated, letting a second client acquire it on the new primary.
The Redlock algorithm acquires on a majority of independent nodes to reduce this; its
guarantees under clock drift and pauses are contested. Use Redis locks for
*efficiency* (avoid doing duplicate work) and a consensus system or fencing for
*correctness* (duplicate work would corrupt data).

**Deadlock.** Processes that acquire multiple locks in different orders can wait on
each other. The expiry eventually breaks the cycle, but only after the timeout; acquire
locks in a fixed global order or hold one at a time. See [Deadlock](/concept/deadlock).

**Prefer idempotency when you can.** Many lock uses exist to stop duplicate work. If the
work is [idempotent](/concept/idempotency) — an upsert, a unique constraint, a
conditional update (`UPDATE … WHERE version = 3`) — the database enforces "only once"
without a separate lock and without the expiry problem. Locks are for cases where the
side effect cannot be made idempotent, such as calling an external payment API in an
[E-commerce](/architecture/e-commerce) checkout.

**Operational signals.** Track acquisition latency, contention rate (failed
acquisitions), hold duration versus expiry, and forced-expiry counts. A hold duration
approaching the TTL is a warning that double-holding is about to happen.
