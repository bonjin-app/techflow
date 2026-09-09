---
id: programming-fundamentals
name: Programming Fundamentals
tagline: Data structures, complexity, concurrency and networking basics every other topic builds on
category: fundamentals
tags: [Fundamentals, Data Structures, Concurrency]
difficulty: 1
prerequisites: []
learningPath:
  - programming-fundamentals
  - http
  - backend
  - database
  - race-condition
related:
  - { to: http, rel: RELATED_TO }
  - { to: backend, rel: RELATED_TO }
  - { to: database, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: deadlock, rel: RELATED_TO }
  - { to: sql, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Four ideas underpin everything else on this site: **data structures** (how data is
arranged in memory determines what is fast), **complexity** (how cost grows with input
size), **concurrency** (what happens when two things run at once), and **networking**
(what changes when a call leaves the machine). Every database index, cache, lock,
queue and protocol is one of these ideas applied at a larger scale.

## Why it matters

A [Database](/concept/database) index is a B-tree; a [Cache](/concept/cache) is a hash
map with eviction; a [Message Queue](/concept/message-queue) is a queue with
persistence; a [Race Condition](/concept/race-condition) between two servers is the
same bug as between two threads; and an [HTTP](/concept/http) request is a function
call that can fail halfway and take a million times longer than a local one. Engineers
who know the primitives can reason about a system they have never seen. Those who do
not end up learning each tool as a bag of unrelated rules.

## Visual

```steps
title: From primitive to production system
Hash map | O(1) lookup by key → Redis, application caches, session stores
Balanced tree (B-tree) | ordered O(log n) lookup and range scan → database indexes
Queue (FIFO) | producer/consumer buffering → message queues, task workers
Log (append-only array) | sequential writes, replay by offset → WAL, Kafka
Mutex / lock | one holder at a time → transactions, distributed locks
Socket | bytes over a network, may fail or delay → HTTP, RPC, replication
```

## How it works

### Data structures

- **Array / list.** Contiguous memory; O(1) index access, O(n) insert in the middle.
  Cache-friendly because neighbours are loaded together.
- **Hash map.** Key → bucket via a hash function; average O(1) get/put, no ordering.
  The backbone of [Redis](/technology/redis) strings/hashes, in-memory caches and
  deduplication sets.
- **Balanced search tree (B-tree, red-black).** Keeps keys sorted; O(log n) lookup,
  insert, and *range queries* (`WHERE created_at > …`), which hash maps cannot do.
  Database indexes are B-trees because disk pages favour wide nodes.
- **Queue and stack.** FIFO and LIFO; queues model waiting work, stacks model nested
  calls and undo.
- **Graph.** Nodes and edges; dependency resolution, routing, and the knowledge graph
  you are reading.
- **Append-only log.** Writes go to the end only; readers keep a position. Fast on disk
  (sequential I/O) and trivially replicable — the shape of a database's write-ahead log
  and of [Kafka](/technology/kafka).

### Complexity

Big-O describes how time or memory grows with input size n, ignoring constants. O(1)
constant, O(log n) tree lookup, O(n) full scan, O(n log n) sorting, O(n²) nested loops
over the same collection. The practical lessons: a full table scan is O(n) and an index
lookup is O(log n), so the gap widens as the table grows; an O(n²) algorithm that works
on 1,000 items fails on 1,000,000; and the "n+1 query" problem — one query per item in
a loop — is an O(n) network round trips disguised as O(1) code.

Constants still matter at the system level: an O(1) network call (~1 ms) is a thousand
times slower than an O(log n) memory lookup (~1 µs). Memory beats disk beats network by
roughly an order of magnitude each; this ordering explains why caches exist.

### Concurrency

Two units of execution sharing state need coordination.

- **Threads and processes.** Threads share memory (fast, dangerous); processes do not
  (safer, need IPC).
- **Race condition.** Two operations interleave in an order nobody designed for —
  read-modify-write on a shared counter loses updates. See
  [Race Condition](/concept/race-condition).
- **Mutex / lock.** Guarantees one holder at a time. Introduces the possibility of
  [Deadlock](/concept/deadlock) when two holders wait on each other.
- **Atomic operations.** Hardware-supported compare-and-swap lets counters and flags
  update without locks; databases expose the same idea as `UPDATE … WHERE version = n`.
- **Async / event loop.** One thread multiplexes many waiting I/O operations. Great for
  network-bound servers, useless for CPU-bound work.

Every distributed-systems problem — [Transaction](/concept/transaction) isolation,
[Distributed Lock](/concept/distributed-lock), [Idempotency](/concept/idempotency) — is
concurrency with the extra rule that the other party may have crashed.

### Networking

A local function call returns or throws. A network call can also **time out**, arrive
**twice**, arrive **out of order**, or succeed on the server while the response is
lost. Key facts:

- TCP gives an ordered, reliable byte stream per connection; UDP gives unordered
  datagrams. HTTP/1.1 and HTTP/2 run on TCP, HTTP/3 on QUIC over UDP.
- Latency is dominated by round trips, not bandwidth: fetching 100 small resources
  serially is slow no matter how fast the link.
- DNS resolves names to addresses and is itself cached with a [TTL](/concept/ttl).
- Ports identify the process; a firewall or [Load Balancer](/concept/load-balancing)
  sits between the client and it.

## Deep Dive

**Choosing structures by access pattern.** Ask what operations dominate: lookups by key
→ hash; range or sorted → tree; append and sequential read → log; expiry by time → a
tree or heap keyed by timestamp (how [TTL](/concept/ttl) sweepers work). Most
performance problems are a structure that does not match the access pattern, at the
level of a variable or an entire database.

**Memory hierarchy.** Register → L1/L2 cache → RAM → SSD → network → spinning disk,
each step 10–100× slower. Algorithms with good *locality* (touch neighbouring data) run
faster than their Big-O suggests; pointer-chasing structures run slower.

**Failure is normal.** A single machine fails rarely; a thousand fail daily. Code that
assumes a call will return, a write will be seen by the next read, or a clock is
accurate is code that will be wrong somewhere in the graph above. Timeouts, retries with
[Idempotency](/concept/idempotency), and explicit consistency choices are how these
fundamentals become production engineering.
