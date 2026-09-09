---
id: cache-invalidation
name: Cache Invalidation
tagline: Deciding when a cached copy is no longer trustworthy and what to do about it
category: fundamentals
tags: [Cache, Consistency, Fundamentals]
difficulty: 3
prerequisites: [http, backend, database, cache]
learningPath:
  - database
  - cache
  - cache-aside
  - ttl
  - cache-invalidation
  - eventual-consistency
related:
  - { to: cache, rel: REQUIRES }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: write-through, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A cache holds a copy; the source of truth keeps changing. Cache invalidation is the
set of rules that decides when that copy must be refreshed or thrown away. Every
strategy is a trade between **freshness** (how stale a reader may see), **cost**
(how much extra work the write path does) and **complexity** (how many places must
agree). There is no universally correct answer — only an acceptable staleness budget
per piece of data.

## Why it matters

Adding a [Cache](/concept/cache) is easy; keeping it honest is where most cache bugs
live. A stale product price can charge the wrong amount, a stale permission check
can leak data, a stale session can keep a logged-out user logged in. Invalidation
also sits on the write path, so a slow or failing invalidation step can turn a fast
write into a fragile one.

The problem gets harder as copies multiply: browser cache, [CDN](/concept/cdn) edge,
application memory, [Redis](/technology/redis) and database replicas can each hold a
different version of the same row. Invalidation is really a small
[Eventual Consistency](/concept/eventual-consistency) problem inside your own system.

## Visual

```sequence
title: Write invalidates, next read repopulates
participants: Client, API [backend], Redis [redis], DB [postgresql]
Client -> API: PUT /product/42 (price 19.99)
API -> DB: UPDATE products SET price = 19.99
DB --> API: ok
API -> Redis: DEL product:42
Redis --> API: 1
API --> Client: 200 OK
Client -> API: GET /product/42
API -> Redis: GET product:42
Redis --> API: MISS
API -> DB: SELECT … WHERE id = 42
DB --> API: row (19.99)
API -> Redis: SET product:42 EX 300
API --> Client: 200 OK (19.99)
```

## Solutions

The strategies are usually combined rather than chosen exclusively:

- **Time-based expiry** — every entry carries a [TTL](/concept/ttl). Nothing is ever
  explicitly invalidated; staleness is bounded by the TTL. Simplest, and the only
  option when the writer cannot reach the cache (third-party data, CDN edges).
- **Delete on write** — the write path removes the key after updating the source, as
  in the sequence above. Used with [Cache Aside](/pattern/cache-aside). Prefer delete
  over update: computing the new cached value inside the write path duplicates read
  logic and races with concurrent reads.
- **Write-through** — [Write Through](/pattern/write-through) updates cache and
  database together, so cached keys are never stale for data written through this
  path. Costs write latency and does not help keys that other writers touch.
- **Event-driven invalidation** — the writer publishes a "product 42 changed" message
  over [Pub/Sub](/concept/pub-sub) or a [Message Queue](/concept/message-queue);
  every cache holder (each API instance's local cache, the CDN purge API) reacts.
  Decouples writers from the number of caches, at the price of a delivery delay.
- **Versioned keys** — instead of deleting, change the key: `product:42:v17`. Readers
  look up the current version number, old entries expire naturally. Avoids the delete
  race and makes rollbacks trivial.
- **HTTP validators** — `ETag` / `Last-Modified` let a browser or CDN ask "has this
  changed?" and receive `304 Not Modified` instead of the full body. See
  [HTTP](/concept/http).

## Deep Dive

**The delete/read race.** With Cache Aside, a reader can miss, read the *old* row
from the database, be paused, and then write that old value into the cache *after*
the writer already deleted the key. The cache now holds stale data until the TTL
fires. Mitigations: keep a TTL even when you delete explicitly, delete again after a
short delay ("delayed double delete"), or use versioned keys so the late writer fills
a key nobody reads any more.

**Order of operations.** Deleting the cache *before* the database write opens a
window where a concurrent reader repopulates the old value. Deleting *after* the
commit shrinks that window to the race above. Neither is airtight without versioning
or a [Transaction](/concept/transaction)-coupled outbox that publishes the
invalidation only when the commit succeeds (see [Outbox](/pattern/outbox)).

**Fan-out cost.** One logical change may invalidate many derived entries: a user
rename touches the profile, every comment header, every search result snippet.
Tracking these dependencies precisely is expensive; most systems accept either
coarse invalidation (drop a whole prefix) or bounded staleness via TTL for derived
views.

**Stampede after invalidation.** Invalidating a hot key sends every concurrent reader
to the database at once. Request coalescing (one loader, others wait), or refreshing
the value in the background and swapping it in, keeps the origin safe.

**Negative results.** If "not found" is cached, a newly created record is invisible
until that entry expires. Either skip negative caching for creatable keys or
invalidate the negative entry on create.

**Multi-layer reality.** A CDN purge, a Redis delete and a local in-process cache
clear happen at different speeds. Design so the *shortest* TTL in the chain bounds
the worst-case staleness, and make the outermost layer (browser) the most
conservative. Part of this shows up in the
[E-commerce](/architecture/e-commerce) architecture, where catalog data tolerates
minutes of staleness but stock and price do not.

## Related

- [Cache](/concept/cache) — the thing being invalidated
- [TTL](/concept/ttl) — the fallback every strategy should keep
- [Eventual Consistency](/concept/eventual-consistency) — the model you are living in once copies exist
- [Redis](/technology/redis), [Memcached](/technology/memcached) — where application-level caches usually live
