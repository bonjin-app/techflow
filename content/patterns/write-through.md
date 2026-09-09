---
id: write-through
name: Write Through
tagline: Every write goes to the cache and the database together, so reads never see stale data
category: data
tags: [Caching, Data, Consistency]
difficulty: 2
prerequisites: [cache, database, cache-aside]
learningPath:
  - cache
  - cache-aside
  - write-through
  - cache-invalidation
  - redis
related:
  - { to: cache, rel: SOLVES }
  - { to: cache-invalidation, rel: SOLVES }
  - { to: redis, rel: RELATED_TO }
  - { to: memcached, rel: RELATED_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: cache-aside, rel: ALTERNATIVE_TO }
  - { to: write-behind, rel: ALTERNATIVE_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

With [Cache Aside](/pattern/cache-aside) a write deletes the cached entry and the next
reader pays a miss. Two things go wrong at scale. First, popular keys are re-read a
moment after every write, so a write-heavy hot key produces a constant stream of
misses. Second, there is a window between "database updated" and "next read fills
the cache" where a slow, concurrent reader can repopulate the cache with the value
it read *before* the write — a classic [race condition](/concept/race-condition) that
leaves stale data behind until the TTL expires. Some data — prices shown at checkout,
feature flags, permission sets — must not be stale for even a few seconds.

## Solution

Route every write **through** the cache layer. The application (or a cache library)
writes the new value to the cache and to the database as one operation, and only
reports success once both have accepted it. Reads are served from the cache, which
is always populated with the latest written value.

```sequence
title: Write path — cache and database updated together
participants: App [backend], Cache [redis], DB [postgresql]
App -> Cache: SET product:42 {price: 19}
Cache --> App: OK
App -> DB: UPDATE products SET price = 19 WHERE id = 42
DB --> App: OK
App --> App: report success only when both succeeded
```

```sequence
title: Read path — the cache is the fast, current copy
participants: App [backend], Cache [redis], DB [postgresql]
App -> Cache: GET product:42
Cache --> App: HIT {price: 19}
```

## How it works

```steps
title: Write Through
Write request arrives [http]
Write the new value to the cache [redis]
Write the same value to the database [postgresql]
Both succeeded → return success
Either failed → roll back / retry so the two do not diverge [retry]
Reads hit the cache; misses fall back to the database and refill [cache]
```

The write is synchronous and the client waits for both stores, so write latency is
the *sum* of the cache and database round-trips. Order matters: many teams write
the database first and the cache second, so a failure leaves the cache empty (a
miss) rather than holding a value the database never accepted. If the cache write
fails after the database succeeded, delete the key so the next read repopulates it.

A cache miss is still possible — after a restart, eviction or a key that was never
written since deployment — so the read side keeps the Cache Aside fallback.

```ts
async function updatePrice(id: number, price: number) {
  const row = await db.products.update(id, { price });    // source of truth first
  try {
    await cache.set(`product:${id}`, JSON.stringify(row), "EX", 3600);
  } catch {
    await cache.del(`product:${id}`).catch(() => {});     // never leave a stale copy
  }
  return row;
}
```

Write Through is often combined with a long [TTL](/concept/ttl): because every write
refreshes the entry, the TTL only has to cover the case where an invalidation was
missed, not the normal update path.

## Advantages

- Reads are never stale for keys that are written through the cache
- No post-write miss storm — the cache already holds the new value
- Removes the read-then-write race that Cache Aside can suffer
- Simple mental model: "the cache is a mirror of what was just written"
- Pairs well with long TTLs, which raise the hit rate

## Disadvantages

- Higher write latency — the client waits for two stores
- Every written key is cached whether or not anyone reads it ("cache pollution")
- Two writes are not atomic; a partial failure needs compensation logic
- Data written by other paths (batch jobs, other services, direct SQL) bypasses the cache and can still be stale
- Cache memory grows with the write rate, not the read rate

## When to use

- Read-after-write consistency matters: a user edits their profile and expects to see the change immediately
- Hot keys that are updated frequently and read even more frequently
- Data that must not be stale while still needing sub-millisecond reads (prices, flags, permissions)
- A single application owns all writes to the data

## When not to use

- Write-heavy data that is rarely read — you pay cache writes with no hits; use [Cache Aside](/pattern/cache-aside)
- Write latency is the bottleneck — consider [Write Behind](/pattern/write-behind), which acknowledges the write before the database sees it
- Several systems write the same tables — the cache will silently diverge from writes it did not see
- The cache cannot hold the whole written set — evictions will make the "always current" promise false

## Real-world

Write Through is common wherever a cache fronts a user-facing configuration or
profile store: session and permission data in [Redis](/technology/redis), catalogue
prices that must change everywhere at once, and feature-flag services. The
[E-commerce](/architecture/e-commerce) architecture uses Cache Aside for bulk
catalogue reads but writes prices through the cache so a price change is visible on
the next page load, not after a TTL.
