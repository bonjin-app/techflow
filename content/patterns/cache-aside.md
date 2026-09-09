---
id: cache-aside
name: Cache Aside
tagline: The application reads the cache first and fills it on a miss
category: data
tags: [Caching, Data, Performance]
difficulty: 2
prerequisites: [cache, database]
learningPath:
  - cache
  - cache-aside
  - ttl
  - cache-invalidation
  - redis
related:
  - { to: cache, rel: SOLVES }
  - { to: redis, rel: RELATED_TO }
  - { to: memcached, rel: RELATED_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: write-through, rel: ALTERNATIVE_TO }
  - { to: write-behind, rel: ALTERNATIVE_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

Reads of the same data dominate traffic, and every one of them costs a database
round-trip. The database becomes the bottleneck long before the application
servers do, and latency is bounded by disk and query time rather than by network.
You want to serve repeated reads from memory without changing how writes reach the
source of truth.

## Solution

Put a cache *beside* the database and make the **application** responsible for
both lookups. On every read: check the cache; on a miss, read the database and
store the result in the cache with a TTL. On every write: update the database, then
**delete** (not update) the cached entry so the next read repopulates it.

```sequence
title: Read path — miss then hit
participants: App [backend], Cache [redis], DB [postgresql]
App -> Cache: GET product:42
Cache --> App: MISS
App -> DB: SELECT * FROM products WHERE id = 42
DB --> App: row
App -> Cache: SET product:42 EX 300
App -> Cache: GET product:42
Cache --> App: HIT
```

```sequence
title: Write path — invalidate, don't update
participants: App [backend], DB [postgresql], Cache [redis]
App -> DB: UPDATE products SET price = 19 WHERE id = 42
DB --> App: OK
App -> Cache: DEL product:42
Cache --> App: OK
```

## How it works

```steps
title: Read
Request arrives [http]
Look up key in cache [redis]
HIT → return cached value | fast path, sub-millisecond
MISS → query database [postgresql] | slow path
Write result to cache with TTL [ttl]
Return value
```

Only data that is actually read gets cached ("lazy loading"), so memory is spent on
hot keys. The TTL bounds staleness even when an invalidation is missed. Deleting on
write instead of updating avoids a race where two writers set the cache in the
wrong order.

```ts
async function getProduct(id: number) {
  const key = `product:${id}`;
  const hit = await cache.get(key);
  if (hit) return JSON.parse(hit);

  const row = await db.products.findById(id);
  if (row) await cache.set(key, JSON.stringify(row), "EX", 300);
  return row;
}

async function updatePrice(id: number, price: number) {
  await db.products.update(id, { price });
  await cache.del(`product:${id}`);   // invalidate; next read repopulates
}
```

## Advantages

- Simple to add to an existing system — no change to the database or write model
- Only requested data is cached; memory follows actual access patterns
- Cache failure degrades to "slower", not "broken" — the app still reads the database
- Works with any cache (Redis, Memcached, in-process map)
- TTL gives a safety net when invalidation is missed

## Disadvantages

- First read of every key is a miss (cold start / after eviction)
- Data can be stale between a write and TTL expiry if invalidation fails
- Read-then-write race: a slow reader can repopulate the cache with an old value right after a delete
- Every miss costs an extra round-trip (cache + database)
- Hot-key expiry causes stampedes without request coalescing

## When to use

- Read-heavy data that tolerates seconds-to-minutes of staleness
- You already have a database and want a quick, low-risk performance win
- Access patterns are skewed — a small set of keys receives most reads

## When not to use

- Data must always be current (balances, inventory at checkout) — read from the source
- Write-heavy keys that are invalidated faster than they are read — the cache never pays off
- The cache must never be stale for written keys — consider [Write Through](/pattern/write-through)
- Everything is read once — caching adds cost without hits

## Real-world

Cache Aside is the default way Redis is used in web backends: product pages,
user profiles, configuration and permission lookups. The
[E-commerce](/architecture/e-commerce) architecture shows it in front of PostgreSQL
for catalogue reads while checkout bypasses the cache.
