---
id: write-behind
name: Write Behind
tagline: Acknowledge the write from the cache and flush it to the database asynchronously
category: data
tags: [Caching, Data, Performance, Asynchronous]
difficulty: 3
prerequisites: [cache, database, write-through, message-queue]
learningPath:
  - cache
  - cache-aside
  - write-through
  - write-behind
  - message-queue
  - eventual-consistency
related:
  - { to: cache, rel: SOLVES }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: write-through, rel: ALTERNATIVE_TO }
  - { to: cache-aside, rel: ALTERNATIVE_TO }
  - { to: message-queue, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

Writes are expensive and bursty. A counter that increments thousands of times per
second, a "last seen" timestamp updated on every request, a game leaderboard or a
shopping-cart that changes on every click — each write, if sent straight to the
database, costs a disk-backed transaction. [Write Through](/pattern/write-through)
makes the client wait for that transaction; [Cache Aside](/pattern/cache-aside) does
too, and then evicts the value. When the write rate exceeds what the database can
commit, latency climbs and the database, not the cache, decides how fast the
application can go.

## Solution

Write to the cache **only** and acknowledge immediately. A background process
collects the dirty entries and writes them to the database later — after a delay,
in batches, or when a buffer fills. The cache becomes the write-ahead copy and the
database catches up asynchronously. Because many updates to the same key can be
coalesced into one database write, the database sees far fewer operations than the
application issued.

```sequence
title: Write path — the client never waits for the database
participants: App [backend], Cache [redis], Writer [backend], DB [postgresql]
App -> Cache: INCR views:post:7
Cache --> App: OK (fast ack)
App -> Cache: INCR views:post:7
Cache --> App: OK
Writer -> Cache: read dirty keys (every 5s)
Cache --> Writer: views:post:7 = 2
Writer -> DB: UPDATE posts SET views = views + 2 WHERE id = 7
DB --> Writer: OK
```

## How it works

```steps
title: Write Behind
Write arrives [http]
Update the cache entry and mark it dirty [redis]
Acknowledge the client immediately
A flusher wakes on a timer or buffer threshold
Coalesce many updates to the same key into one write
Write the batch to the database [postgresql]
Clear the dirty flag; on failure keep it and retry [retry]
```

The dirty set can live in the cache itself (a Redis set of changed keys), in an
in-process buffer, or as events on a [message queue](/concept/message-queue) that a
consumer drains. The queue variant is more robust: if the application crashes, the
events survive. The in-process variant is faster but any buffered write is lost with
the process.

```ts
// write side
async function recordView(postId: number) {
  await cache.incr(`views:post:${postId}`);
  await cache.sadd("dirty:views", String(postId));
}

// flusher, runs every few seconds
async function flush() {
  const ids = await cache.spop("dirty:views", 500);
  for (const id of ids) {
    const n = await cache.getdel(`views:delta:${id}`);
    if (n) await db.posts.incrementViews(Number(id), Number(n));
  }
}
```

Reads hit the cache, so the application always sees its own writes. Anything that
reads the *database* directly — reports, other services, replicas — sees data that
lags by the flush interval. The pattern is a deliberate choice of
[eventual consistency](/concept/eventual-consistency) for the persistent copy.

## Advantages

- Write latency is cache latency, independent of database speed
- Many writes to one key collapse into a single database write
- Smooths bursts: the database receives a steady batched stream instead of spikes
- Database can be briefly unavailable without failing user writes
- Read-your-own-writes holds for readers going through the cache

## Disadvantages

- Writes acknowledged but not yet flushed are lost if the cache (or buffer) dies — durability is weaker than a database commit
- The database is stale by the flush interval; anything reading it directly sees old data
- Ordering across keys is not guaranteed; multi-row invariants can be temporarily violated
- Failures during flush need retry, dead-lettering and alerting — more moving parts
- Debugging is harder: "the write succeeded" no longer means "it is in the database"

## When to use

- High-frequency, low-value writes: counters, metrics, presence, "last active", view counts
- Write bursts that would overwhelm the database if applied one by one
- Data where losing the last few seconds on a crash is acceptable
- Reads and writes both go through the cache so the application stays self-consistent

## When not to use

- Losing an acknowledged write is unacceptable — orders, payments, ledger entries need a real [transaction](/concept/transaction)
- Other systems read the database and need it current
- Cross-key invariants must hold at all times (a transfer between two balances)
- You have not yet built the retry and failure handling — Write Behind without it silently drops data

## Real-world

Write Behind shows up as analytics counters and view counts flushed by a background
job, leaderboards kept in Redis sorted sets and periodically snapshotted, and
shopping-cart state that lives in the cache during a session and is persisted on
checkout. Some caching libraries and in-memory data grids offer it as a built-in
mode. Teams often move a hot counter from Write Through to Write Behind once the
database update rate becomes the visible bottleneck.
