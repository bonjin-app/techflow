---
id: ttl
name: TTL (Time To Live)
tagline: Attach a lifetime to data so it disappears on its own instead of waiting to be cleaned up
category: fundamentals
tags: [Cache, Fundamentals, Data Lifecycle]
difficulty: 2
prerequisites: [cache]
learningPath:
  - cache
  - ttl
  - cache-invalidation
  - redis
  - session
  - distributed-lock
related:
  - { to: cache, rel: REQUIRES }
  - { to: redis, rel: RELATED_TO }
  - { to: memcached, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A TTL is an expiry attached to a piece of data: after the time elapses the entry is
treated as gone. It is the simplest form of [Cache Invalidation](/concept/cache-invalidation)
— you do not have to know *when* the source changed, you accept that a copy is never
older than N seconds. TTLs also bound the lifetime of sessions, locks, rate-limit
counters and DNS records, making the system self-cleaning.

## Why it matters

Any copy of data drifts from the original, and any accumulating state eventually fills
memory. TTLs solve both with one number. They are why a [Cache](/concept/cache) can be
"wrong" but only briefly, why a crashed process cannot hold a
[Distributed Lock](/concept/distributed-lock) forever, why an abandoned
[Session](/concept/session) does not live in Redis for a year, and why a DNS change
propagates within a known window. Choosing the number is a business decision disguised
as a technical one: it states how stale is acceptable.

## Visual

```steps
title: Life of a cached entry with a 60-second TTL
Write | SET product:42 {…} EX 60 — expiry recorded at t+60s
Read at t+10s | HIT — entry returned, 50s remaining
Source changes at t+30s | cache still serves the OLD value (staleness window)
Read at t+45s | HIT — stale but within tolerance
Expiry at t+60s | entry becomes invisible; lazy or active deletion frees memory
Read at t+61s | MISS — reload from source, SET again with a fresh TTL
```

```sequence
title: TTL as a safety net on a lock
participants: Worker [backend], Redis [redis]
Worker -> Redis: SET lock:job token NX PX 30000
Redis --> Worker: OK
Worker -> Worker: crashes mid-work ❌
Redis -> Redis: 30s later — key expires automatically
Worker -> Redis: (new instance) SET lock:job token2 NX PX 30000
Redis --> Worker: OK — no manual cleanup needed
```

## How it works

1. **Set.** The store records an absolute expiry timestamp with the key
   (`SET k v EX 60` in [Redis](/technology/redis), `exptime` in
   [Memcached](/technology/memcached), `Cache-Control: max-age=60` in
   [HTTP](/concept/http)).
2. **Check on read.** A read compares now against the timestamp; an expired key is
   reported as missing even if still physically present.
3. **Reclaim.** Storage is freed either *lazily* (when the expired key is touched) or
   *actively* (a background sampler deletes expired keys). Redis does both; Memcached
   relies mostly on lazy expiry plus a crawler.
4. **Refresh.** On a miss the application reloads from the source and sets a new TTL.
   Some systems extend the TTL on access (sliding expiry) — right for sessions, wrong for
   caches where it lets stale data live forever.

**Where TTLs appear:**

- Application caches — [Cache Aside](/pattern/cache-aside) entries.
- [CDN](/concept/cdn) and browser caches — `max-age`, `s-maxage`, `stale-while-revalidate`.
- Sessions and tokens — idle and absolute lifetimes.
- [Rate Limiting](/concept/rate-limiting) — counters that reset each window.
- Locks and leases — the crash safety net.
- DNS — how long resolvers may reuse an answer.
- Database rows — MongoDB TTL indexes and similar features delete documents after a
  time; useful for logs and one-time codes.

## Deep Dive

**Picking the value.** Short TTLs give freshness but lower hit ratio and more load on the
source; long TTLs do the opposite. Ask two questions per data type: how quickly must a
change be visible, and how expensive is a miss? Product descriptions tolerate minutes;
inventory counts tolerate seconds or nothing; static assets with hashed filenames can
live for a year because the URL changes when content does.

**Synchronised expiry (stampede).** If a deploy warms 10,000 keys at once with the same
TTL, they all expire in the same second and the source takes 10,000 misses. Add random
**jitter** (±10–20%) to each TTL so expiries spread out. For very hot keys, refresh
before expiry (probabilistic early expiration) or serve the stale value while one
request refreshes in the background.

**TTL is not invalidation.** A TTL bounds staleness; it does not remove it. Reads between
a source change and expiry return old data. When that matters, pair the TTL with an
explicit delete on write — the TTL then becomes a backstop for events that were missed,
not the primary mechanism.

**Clock dependence.** Expiry is computed from the server's clock. A store whose clock
jumps forward expires everything early; a replica applying an absolute timestamp from a
primary with a skewed clock behaves inconsistently. Redis replicates expiry as
`DEL` from the primary to avoid replicas making independent decisions.

**Memory accounting.** Expired-but-unreclaimed keys still occupy memory until lazy or
active deletion runs. A store that is "full" of expired keys may still evict live ones
under memory pressure; monitor expired-key counts and memory fragmentation, not just
key count.

**Short TTL as a coordination shortcut.** Some teams use a very short TTL (1–5 s) instead
of invalidation logic. It works for read-heavy, change-tolerant data and is far simpler
than event-driven invalidation — but it keeps the source under constant reload traffic
and provides no guarantee stronger than "eventually within 5 seconds", which is a form
of [Eventual Consistency](/concept/eventual-consistency) that must be acceptable to
every reader.
