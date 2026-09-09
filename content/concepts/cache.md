---
id: cache
name: Cache
tagline: Keep a copy of expensive data close to where it is needed
category: fundamentals
tags: [Performance, Data, Fundamentals]
difficulty: 2
prerequisites: [http, backend, database]
learningPath:
  - http
  - database
  - cache
  - cache-aside
  - redis
  - cache-invalidation
related:
  - { to: redis, rel: RELATED_TO }
  - { to: memcached, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: write-through, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: database, rel: REQUIRES }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A cache stores the result of expensive work — a database query, an API call, a
rendered page — somewhere faster and closer so the next request can reuse it.
Caches trade **freshness** for **speed**: the copy may be out of date, and deciding
when to refresh or discard it (invalidation) is the hard part. Caches exist at
every layer: CPU, browser, CDN, application memory, Redis, database buffer pool.

## Why it matters

Almost every performance and scaling problem in web systems is first attacked with
a cache. Reads usually outnumber writes 10:1 to 1000:1, and most reads ask for the
same small set of hot data. Serving those from memory removes the majority of load
from the slowest component (the database) and cuts latency from tens of
milliseconds to fractions of one.

```steps
title: Where caches live on a single request
Browser cache [http] | HTTP Cache-Control headers
CDN [cdn] | edge servers near the user
Application memory | per-process, fastest, not shared
Redis [redis] | shared across servers
Database buffer pool [database] | pages already in RAM
Disk | the slow path everything above tries to avoid
```

## Visual

```sequence
title: Hit vs miss
participants: App [backend], Cache [redis], DB [postgresql]
App -> Cache: GET key
Cache --> App: MISS
App -> DB: query
DB --> App: result
App -> Cache: SET key (TTL)
App -> Cache: GET key
Cache --> App: HIT
```

## Solutions

How data gets into and out of the cache is a design decision, not an accident:

- [Cache Aside](/pattern/cache-aside) — the application checks the cache, then the
  database, then fills the cache. Simplest and most common.
- [Write Through](/pattern/write-through) — writes go to cache and database together,
  so the cache is never stale for written keys.
- [Write Behind](/pattern/write-behind) — writes hit the cache first and are flushed to
  the database asynchronously. Fast, but risks data loss.
- [TTL](/concept/ttl) — every entry expires after a fixed time; the simplest
  invalidation strategy.
- [Cache Invalidation](/concept/cache-invalidation) — explicit deletes/updates when the
  source changes.

## Deep Dive

**Hit ratio** is the metric. A cache with a 50% hit ratio halves database reads; 95%
removes 20× the load. Watch hit ratio per key prefix — a cache that stores rarely
re-read items wastes memory without helping.

**Eviction.** Memory is finite, so a cache drops entries when full. LRU (least
recently used) is the usual default; LFU (least frequently used) protects genuinely
hot keys from being pushed out by one-off scans.

**Stampede / thundering herd.** When a hot key expires, hundreds of concurrent
requests all miss and all hit the database at once. Mitigations: request
coalescing (one request refreshes, others wait), probabilistic early expiration,
or serving stale data while refreshing in the background.

**Consistency.** A cache is a second copy, so the system is now eventually
consistent for cached reads. Decide how much staleness each piece of data can
tolerate — a product description can be a minute old; an account balance often
cannot be cached at all.

**Negative caching.** Caching "not found" results protects the database from
repeated lookups of missing keys, but must use a short TTL so newly created items
appear quickly.
