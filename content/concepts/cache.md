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
  - { to: tail-latency, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
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

It is worth being suspicious of that reflex, though, because a cache is also a
second copy of your data and therefore a second thing that can be wrong. A
surprising number of caches exist because a query has no
[index](/concept/indexing), or because a page fetches the same row eleven times in
one request. Those are cheaper to fix than to hide, and fixing them leaves you with
one source of truth instead of two. Add a cache when the work is genuinely
expensive and genuinely repeated — not as the first response to a slow endpoint.

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

**Key design is the part that gets skipped.** A key has to identify everything that
changes the value: the entity id, the version or tenant, the locale, the currency,
and the shape of the response if it varies by client. Miss one and two different
answers collide on one key, which is a correctness bug that looks like a caching
bug. Include a schema version in the prefix (`v3:order:8f21`) so a format change is
a new namespace rather than a deploy that reads old values with new code.

## Deep Dive

**Hit ratio is the metric, and the aggregate lies.** A cache with a 50% hit ratio
halves database reads; 95% removes 20× the load. But one prefix at 99% can hide
another at 5%, and the 5% is the one filling memory and evicting the keys that
matter. Measure per prefix, and measure what a miss *costs* — a 90% hit ratio on
a 500ms query beats 99% on a 5ms one.

**Eviction is a policy, and the wrong one is invisible.** Memory is finite, so a
cache drops entries when full. LRU (least recently used) is the usual default and is
defeated by a scan: one batch job reading a million rows evicts everything hot on
its way through. LFU (least frequently used) survives that, at the cost of being
slow to adapt when what is popular changes. The
[cache simulator](/playground/cache) makes the difference visible in about thirty
seconds — run Zipf traffic against LRU, then switch the pattern to a sequential
scan and watch the hit ratio collapse.

**Stampede is the failure mode that takes systems down.** When a hot key expires,
every concurrent request misses at the same moment and they all hit the database
together — so the cache, which existed to protect the database, hands it a
thousand simultaneous copies of the same query. The mitigations are request
coalescing (one request refreshes, the others wait on it), probabilistic early
expiration (refresh slightly before the TTL, with jitter so instances do not
synchronise), or serving the stale value while a background task refreshes. The
same arithmetic applies to a cold start: an empty cache after a deploy is a
stampede on every key at once, which is why large caches are warmed rather than
switched on.

**Consistency.** A cache is a second copy, so the system is now eventually
consistent for cached reads. Decide how much staleness each piece of data can
tolerate — a product description can be a minute old; an account balance often
cannot be cached at all.

**Negative caching.** Caching "not found" results protects the database from
repeated lookups of missing keys — which is also what turns an id-enumeration
attack from a database problem into a cache problem — but it must use a short TTL
so newly created items appear quickly.

**Layers do not agree with each other.** A single request may pass a browser cache,
a [CDN](/concept/cdn), an application's in-process map and
[Redis](/technology/redis), each with its own TTL. Invalidating the deepest one
does nothing about the three in front of it, so a "stale page" report usually means
the wrong layer was cleared. Keep the number of layers small, make TTLs shorter as
you move outward, and know which layer you can actually purge on demand.

**What not to cache.** Anything a user must see immediately after they change it,
anything where a stale read has financial or safety consequences, anything
personalised enough that the hit ratio will be near zero, and anything cheap enough
that the round trip to the cache costs more than recomputing it. A cache in front of
a 2ms query is usually slower than the query.

**A cache changes your latency distribution, not just its middle.** Hits are fast and
misses now pay the cache round trip *plus* the original work, so the p50 improves
while the p99 gets slightly worse. That is normally a good trade and it is worth
knowing before someone reports it as a regression — see
[Tail Latency](/concept/tail-latency).
