---
id: memcached
name: Memcached
tagline: Simple, multi-threaded in-memory key/value cache with LRU eviction and no persistence
category: database
tags: [Cache, In-memory, Distributed System]
difficulty: 2
usedFor: [cache, session, ttl]
prerequisites: [http, backend, database, cache]
learningPath:
  - programming-fundamentals
  - http
  - database
  - backend
  - cache
  - cache-aside
  - memcached
  - redis
related:
  - { to: cache-aside, rel: IMPLEMENTS }
  - { to: postgresql, rel: USED_WITH }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Memcached 1.6.x", confidence: high }
---

## TL;DR

Memcached is a cache and nothing else: it stores byte blobs under string keys in RAM,
returns them in well under a millisecond, evicts the least recently used items when
memory is full, and forgets everything on restart. It is multi-threaded, so one
process saturates a large machine, and the protocol is small enough to read in an
afternoon. Servers do not talk to each other; the *client* decides which server holds
a key by hashing it.

## Practical

Memcached almost always sits in front of a relational database as a
[Cache Aside](/pattern/cache-aside) layer: the application asks Memcached first,
falls back to [PostgreSQL](/technology/postgresql) or MySQL on a miss, and writes the
result back with an expiry.

What you actually do with it:

- **Cache query results and rendered fragments** — serialised rows, JSON API
  responses, HTML partials. Anything expensive to compute and safe to be slightly stale.
- **Session storage** for a stateless web tier, when losing sessions on a restart is
  acceptable (users log in again). See [Session](/concept/session).
- **Set a TTL on every item** (`exptime` in seconds) so nothing lives forever without a
  reason. See [TTL](/concept/ttl).
- **Scale by adding nodes**; clients use consistent hashing so adding a server only
  remaps a fraction of keys instead of flushing the whole cache.
- **Keep values small** — the default item size limit is 1 MB and large values hurt
  the slab allocator; compress or split.
- **Use `gets`/`cas`** (check-and-set) when several servers may update the same key.

```bash
# The text protocol is simple enough to drive from a shell
printf 'set user:42 0 60 27\r\n{"id":42,"name":"Ada Lovelace"}\r\n' | nc localhost 11211
# STORED
printf 'get user:42\r\n' | nc localhost 11211
# VALUE user:42 0 27
# {"id":42,"name":"Ada Lovelace"}
# END
printf 'stats\r\nquit\r\n' | nc localhost 11211 | grep -E 'get_hits|get_misses|evictions'
```

Operationally: give each node a fixed `-m` memory budget, watch `evictions` and the
hit ratio, and enable TLS or keep it strictly on a private network — there is no
authentication in the core protocol (SASL exists but is rarely used).

## Deep Dive

**Slab allocator.** Memory is carved into pages of fixed-size chunks (slab classes:
96 B, 120 B, … up to the item limit). An item goes into the smallest class that fits.
This avoids fragmentation and makes allocation O(1), but memory pinned to one slab
class cannot serve another unless the automover rebalances it — a workload whose value
sizes change over time can show evictions while total memory looks free.

**LRU per slab class.** Since 1.5 the LRU is segmented (hot / warm / cold) with a
background crawler that reclaims expired items, so eviction cost stays constant and
one-off scans do not flush genuinely hot keys as easily as a plain LRU would.

**Threads, not events alone.** A worker-thread pool handles connections in parallel;
item access is guarded by fine-grained locks. This is why Memcached often out-performs
single-threaded caches on raw GET/SET throughput per box, and why it scales with cores
without running several processes.

**No server-side distribution.** Servers are unaware of each other. The client library
hashes the key (usually with consistent hashing / ketama) onto the server list. This
is simple and fast, but it means no replication, no failover and no rebalancing:
when a node dies, its keys are simply gone and the database absorbs the misses. See
[Sharding](/concept/sharding) for why consistent hashing matters here.

**Protocols.** The classic text protocol, and the newer *meta* protocol (`mg`, `ms`,
`md`) which adds flags for stale-while-revalidate style behaviour (serve a stale
value to everyone while one client recomputes) — a built-in answer to cache stampedes.
The binary protocol is deprecated. Recent 1.6 releases also ship a built-in proxy that
can route and replicate requests across pools.

**Extstore.** An optional flash-backed tier keeps hot keys in RAM and spills large
cold values to SSD. It stretches capacity cheaply, but it is still a cache — a restart
still loses everything.

**Consistency.** The cache is a second copy of the truth. Invalidation on writes, TTLs
and the race between "read from DB" and "someone else wrote" are the application's
responsibility. See [Cache Invalidation](/concept/cache-invalidation).

## Why

A web page often needs the same handful of rows thousands of times per minute. Each
repeated query costs the database CPU, I/O and connections that could serve genuinely
new work, and latency stays pinned to disk speed.

```sequence
title: Without a cache — identical queries repeat against the database
participants: Browser, App [backend], DB [postgresql]
Browser -> App: GET /profile/42
App -> DB: SELECT … (15 ms)
DB --> App: row
App --> Browser: 200 OK
Browser -> App: GET /profile/42 (another visitor)
App -> DB: SELECT … (15 ms, same rows)
DB --> App: row
App --> Browser: 200 OK
```

Placing Memcached between the application and the database lets the first request pay
for everyone else's for the next N seconds. The database sees one query per key per
TTL instead of one per visitor.

```sequence
title: With Memcached — one miss, many hits
participants: Browser, App [backend], Memcached [memcached], DB [postgresql]
Browser -> App: GET /profile/42
App -> Memcached: get profile:42
Memcached --> App: MISS
App -> DB: SELECT … (15 ms)
DB --> App: row
App -> Memcached: set profile:42 (TTL 60)
App --> Browser: 200 OK
Browser -> App: GET /profile/42 (another visitor)
App -> Memcached: get profile:42
Memcached --> App: HIT (0.2 ms)
App --> Browser: 200 OK
```

Memcached deliberately stops there. It does not try to be a queue, a lock service or a
database, which is exactly why it is easy to reason about and hard to misuse.

## Advantages

- Extremely simple model: `get`, `set`, `delete`, `incr`, `cas` — very little to learn or misconfigure
- Multi-threaded, so a single node uses every core; very high GET/SET throughput per machine
- Predictable memory use and O(1) eviction thanks to the slab allocator and segmented LRU
- Horizontal scale by adding nodes with client-side consistent hashing
- Mature client libraries in every major language; standard in PHP, Python and Rails ecosystems
- Small footprint and no moving parts: no persistence, replication or cluster state to operate

## Trade-offs

- Values are opaque blobs — no lists, sets, sorted sets or atomic operations beyond counters and CAS
- No persistence and no replication: a node restart or failure means a cold cache and a database load spike
- No built-in pub/sub, scripting or transactions; anything beyond caching needs another tool
- No authentication or encryption by default — must live on a trusted network or behind TLS
- Item size limit (1 MB default) and slab-class memory pinning can surprise you
- Cache invalidation, stampede protection and consistency remain application concerns

## When to use

- Straightforward read-through caching of database rows, API responses or HTML fragments
- A shared cache tier for many stateless application servers where throughput per node matters
- Session storage that may be lost without serious consequences
- Stacks where Memcached is already the framework default and richer structures are not needed
- When you want the smallest possible operational surface for a cache

## When not to use

- You need data structures (queues, sets, sorted sets), Pub/Sub or Lua scripting — use [Redis](/technology/redis)
- The cached data must survive restarts or be replicated for availability
- You need distributed locks, rate-limit counters with expiry semantics beyond `incr`, or streams
- A single process could hold the cache in local memory (one server, no sharing needed)
- The data is the source of truth — that belongs in a [Database](/concept/database)

## Real-world

Memcached is the classic cache in front of a relational database in a
[Simple Web App](/architecture/simple-web-app): one or two nodes absorb repeated reads
of profiles, product pages and configuration while the database handles writes. In
larger systems it is often the pure-cache tier next to Redis, which takes the roles
that need data structures — the split behind the
[Redis vs Memcached](/technology/redis) comparison.
