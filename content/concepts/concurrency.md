---
id: concurrency
name: Concurrency
tagline: Making progress on many tasks at once without letting them corrupt each other
category: fundamentals
tags: [Concurrency, Fundamentals, Performance]
difficulty: 3
prerequisites: [programming-fundamentals, backend]
learningPath:
  - programming-fundamentals
  - backend
  - concurrency
  - race-condition
  - deadlock
  - transaction
  - distributed-lock
related:
  - { to: programming-fundamentals, rel: REQUIRES }
  - { to: race-condition, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: nodejs, rel: RELATED_TO }
  - { to: bulkhead, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Concurrency is structuring a program so that several tasks are *in progress* at the
same time — interleaved on one core, or truly simultaneous on many. It is how a server
handles ten thousand connections while most of them wait on I/O. The price is shared
state: once two tasks can touch the same data, you need a coordination model (locks,
message passing, single-threaded event loops, immutability) or you get
[Race Conditions](/concept/race-condition) and [Deadlocks](/concept/deadlock).

## Why it matters

A backend that handles one request at a time wastes almost all of its hardware,
because a typical request spends most of its life waiting — for the database, for
another service, for the network. Concurrency fills those gaps with other requests.
Every web framework, database and message broker is a concurrency design; choosing a
runtime ([Node.js](/technology/nodejs) event loop, Go goroutines, JVM thread pools,
Python asyncio) is choosing a concurrency model.

It is also the most common source of bugs that pass tests and fail in production:
intermittent, load-dependent and impossible to reproduce on a laptop. Knowing the
models and their failure modes lets you pick the one whose bugs you can live with.

## Visual

```timeline
title: Two threads sharing one core — I/O overlap and a shared counter
Thread A                          | Thread B
accept request 1                  |
send SQL query (wait for DB)      |
                                  | accept request 2
                                  | send SQL query (wait for DB)
DB reply → build response         |
lock(counter); counter = 41 → 42  |
unlock(counter)                   |
                                  | DB reply → build response
                                  | lock(counter); counter = 42 → 43 ✓
                                  | unlock(counter)
```

While A waits on the database, B runs — that is the throughput win. The shared
counter is safe only because the read-modify-write is inside a lock; without it both
threads could read 41 and write 42.

## How it works

Concurrency models differ in *who* is allowed to run and *how* tasks share data.

- **Threads and locks** — the OS schedules threads pre-emptively; shared memory is
  protected with mutexes, read/write locks, semaphores and atomics. Maximum
  flexibility, maximum room for error. Java, C#, C++ and Go (when using shared memory)
  live here.
- **Event loop + callbacks/async** — one thread runs tasks to completion between
  awaits; I/O is non-blocking. No data races between tasks because only one runs at a
  time, but a CPU-heavy task blocks everyone. Node.js, browser JavaScript, Python
  asyncio.
- **Lightweight threads** — goroutines, Kotlin coroutines, Java virtual threads,
  Erlang processes: millions of cheap tasks multiplexed onto a few OS threads by the
  runtime. Blocking-style code with event-loop efficiency.
- **Message passing / actors** — tasks own their state and communicate only through
  queues or channels (CSP in Go, actors in Erlang and Akka). "Do not communicate by
  sharing memory; share memory by communicating."
- **Immutability** — data that never changes can be shared freely. Functional-style
  designs sidestep locking by producing new values instead of mutating.
- **Processes** — separate memory spaces (workers, containers) coordinate through the
  OS or a [Message Queue](/concept/message-queue). Isolation is total; sharing is
  expensive.

## Deep Dive

**Concurrency is not parallelism.** Concurrency is about *structure* (many tasks in
flight); parallelism is about *execution* (many running at the same instant). A
single-core event loop is highly concurrent and not parallel at all. I/O-bound work
needs concurrency; CPU-bound work needs parallelism, which means multiple threads or
processes — and in runtimes with a global interpreter lock, processes.

**The shared-state trilogy.** *Atomicity*: a read-modify-write must not be
interleaved (the [Race Condition](/concept/race-condition)). *Visibility*: a write on
one core may not be seen by another without a memory barrier — the reason `volatile`
and atomics exist. *Ordering*: compilers and CPUs reorder instructions unless told not
to. Locks handle all three at once; lock-free code must handle them explicitly.

**Deadlock and its cousins.** Two tasks each holding a lock the other needs wait
forever — see [Deadlock](/concept/deadlock). Livelock: both keep retrying and neither
progresses. Starvation: a task never gets scheduled. Priority inversion: a low-priority
holder blocks a high-priority waiter. Consistent lock ordering and timeouts on
acquisition are the standard defences.

**Pools and backpressure.** Unbounded concurrency is a denial-of-service against your
own dependencies: 10,000 concurrent requests become 10,000 database connections.
Bound work with pools and semaphores, queue the excess, and shed load when the queue
is full. A [Bulkhead](/pattern/bulkhead) gives each dependency its own bounded pool so
one slow backend cannot consume every thread. A [Chat System](/architecture/chat-system)
holding a million idle [WebSocket](/technology/websocket) connections is the canonical
case for an event loop or lightweight threads rather than one OS thread per connection.

**Beyond one process.** Once state is shared across machines, in-process locks no
longer help; a [Transaction](/concept/transaction) makes the database the arbiter, and
a [Distributed Lock](/concept/distributed-lock) coordinates work that spans systems.
Partitioning by key — all updates for one user go to one worker — removes the shared
state altogether and is often the simplest correct design.

**Structured concurrency.** Modern APIs (Kotlin, Swift, Java's structured concurrency,
Trio) tie child tasks to a scope so they cannot outlive their parent, cancellation
propagates, and errors are not silently dropped. Fire-and-forget tasks are the
concurrency equivalent of a memory leak.

**Testing.** Run concurrency tests with real parallelism and randomised scheduling,
assert invariants rather than exact outputs, and use race detectors (Go `-race`,
ThreadSanitizer) in CI.

## Related

- [Race Condition](/concept/race-condition) — the defining concurrency bug
- [Deadlock](/concept/deadlock) — what locks can turn into
- [Bulkhead](/pattern/bulkhead) — bounding concurrency per dependency
