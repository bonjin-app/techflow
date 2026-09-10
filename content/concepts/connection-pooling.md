---
id: connection-pooling
name: Connection Pooling
tagline: Reuse a small set of open database connections instead of opening one per request
category: data
tags: [Database, Performance, Backend, Concurrency]
difficulty: 3
prerequisites: [tcp, backend, database]
learningPath:
  - tcp
  - database
  - backend
  - connection-pooling
  - transaction
  - backpressure
related:
  - { to: postgresql, rel: RELATED_TO }
  - { to: mysql, rel: RELATED_TO }
  - { to: database, rel: REQUIRES }
  - { to: transaction, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: bulkhead, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A connection pool keeps a fixed number of already-established database connections open
and lends them to requests for the duration of a query or transaction. Opening a
connection costs a [TCP](/concept/tcp) handshake, a [TLS](/concept/tls) handshake,
authentication and — in [PostgreSQL](/technology/postgresql) — a new backend process,
which is far more expensive than the query itself. The pool turns that per-request cost
into a one-time cost, and its **size caps concurrency**, which is what protects the
database from being overwhelmed.

## Why it matters

Databases are the scarcest resource in most systems, and their concurrency limit is much
lower than an application's. A Node.js or Go service can happily have 5,000 requests in
flight; a PostgreSQL instance sized for that would spend its time context-switching, not
querying. The pool is the deliberate boundary between the two: it makes the application
wait in a queue you control instead of piling work onto the database, and it converts
"the database fell over" into "requests waited 40 ms for a connection". Getting the size
and timeouts wrong is one of the most common causes of a latency cliff under load.

## Visual

```sequence
title: Acquire, release, and exhaustion
participants: Req A [nodejs], Req B [nodejs], Pool, DB [postgresql]
Pool -> DB: open 10 connections at startup (min = max = 10)
Req A -> Pool: acquire()
Pool --> Req A: conn #3 (idle → in use)
Req A -> DB: BEGIN; SELECT …; COMMIT
Req A -> Pool: release(conn #3) — back to idle, session reset
Req B -> Pool: acquire() — all 10 in use
Pool -> Pool: enqueue waiter, start acquire timeout (2s)
Req A -> Pool: release(conn #7)
Pool --> Req B: conn #7 (waited 40ms)
Req B -> DB: SELECT …
Req B -> Pool: release(conn #7)
Pool -> Pool: burst continues, wait queue exceeds 2s
Pool --> Req A: TimeoutError: pool exhausted → return 503, shed load
Pool -> DB: idle connection older than maxLifetime → close and reopen
```

## How it works

**The pool's state machine.** Each connection is *idle*, *in use*, or being validated. A
request calls `acquire()`, gets a connection, and must `release()` it in a `finally` block
or equivalent — a leaked connection is permanently lost from the pool and shrinks
capacity until restart.

**The knobs that matter:**

- **max size** — the hard concurrency limit against the database. Total across *all*
  application instances is what the database sees: 20 pods × 20 connections = 400
  connections, which is far past a default PostgreSQL `max_connections` of 100.
- **min / idle size** — connections kept warm so a traffic ramp does not pay handshake
  costs. Frequently set equal to max for predictable behaviour.
- **acquire timeout** — how long a caller waits before failing. Short is better: failing
  in 1 s and returning 503 is [Backpressure](/concept/backpressure); waiting 30 s ties up
  a request thread and hides the problem.
- **idle timeout / max lifetime** — recycle connections so that server-side restarts,
  DNS changes, failovers and slow memory growth in a long-lived session are cleaned up.
- **validation** — a cheap liveness check (or a fast-fail on use) so a connection killed
  by a proxy or failover is not handed to a request.

**Where the pool lives.** In-process pools (HikariCP, `pg` Pool, `database/sql`) are
simplest and most common. An external pooler such as PgBouncer sits between many
application instances and one database, multiplexing thousands of client connections onto
a few server ones — necessary for serverless and high-pod-count deployments where each
instance would otherwise hold its own pool.

## Deep Dive

**Sizing: smaller than you think.** Throughput is bounded by the database's cores and
disks, not by how many callers wait. A pool much larger than the number of queries the
server can actually execute in parallel only adds queueing *inside* the database, where
you cannot see or prioritise it. A common starting point is a small multiple of the
database's CPU count, then measure: if queue wait time is near zero and CPU is saturated,
a bigger pool cannot help. Right-sizing usually *lowers* p99 latency.

**Pooling modes change semantics.** An external pooler in *transaction* mode returns the
server connection to the pool after each transaction, so anything with session state
breaks: prepared statements, `SET` parameters, temporary tables, advisory locks, `LISTEN`
/`NOTIFY`. Session mode preserves them but loses most of the multiplexing benefit. Know
which mode you are on before relying on session-scoped features — including
[Distributed Lock](/concept/distributed-lock) implementations built on advisory locks.

**Transactions hold a connection.** A [Transaction](/concept/transaction) occupies its
connection from `BEGIN` to `COMMIT`. Any HTTP call, message publish or `sleep` inside a
transaction multiplies connection hold time and shrinks effective pool capacity — and
holds row locks for the same duration, inviting [Deadlock](/concept/deadlock) and lock
wait timeouts. Keep transactions short and do external I/O outside them.

**Deadlock by pool.** Code that acquires a second connection while holding the first —
a nested repository call, or a parallel query fan-out inside a request — can consume
every connection with holders all waiting for one more. Symptom: total stall with an idle
database. Fix: pass the connection down explicitly, never nest acquisitions, and size
pools per workload with separate pools ([Bulkhead](/pattern/bulkhead)) for background
jobs, migrations and interactive traffic so a batch job cannot starve users.

**Serverless and short-lived instances.** Function-per-request platforms defeat pooling:
each cold start builds its own pool and each scale-out multiplies connections. Use an
external pooler or an HTTP-based driver, and keep per-instance pool size at 1–2.

**What to monitor.** Pool utilisation, wait time to acquire (the leading indicator),
timeouts, active versus idle counts, connection creation rate, and leak detection
warnings. On the server side watch total connections against `max_connections`, and
reserve a few slots for superuser access so an operator can still get in when the pool
has consumed everything.

**Reuse beyond databases.** The same pattern applies to HTTP keep-alive clients, Redis
clients, gRPC channels and broker producers, with the same failure modes: unbounded
clients, leaked handles, no acquire timeout.
