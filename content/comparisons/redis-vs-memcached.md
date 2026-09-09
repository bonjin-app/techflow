---
id: redis-vs-memcached
name: Redis vs Memcached
tagline: Rich data structures and persistence, or a lean multi-threaded key/value cache
category: decision
tags: [Cache, In-memory, Database, Decision]
difficulty: 3
subjects: [redis, memcached]
related:
  - { to: cache, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: e-commerce, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Both are in-memory stores that answer in well under a millisecond, and for the plain
"cache a serialised row for 60 seconds" job they are interchangeable. The difference is
what happens beyond that job. [Redis](/technology/redis) is a data-structure server:
hashes, sorted sets, streams, Pub/Sub, Lua scripts, optional persistence and replication.
[Memcached](/technology/memcached) deliberately does one thing — store opaque byte values
under a key — and uses every CPU core to do it. Choose Memcached when the workload is
*only* a cache and simplicity matters; choose Redis when you need any operation richer
than get/set, or when the same box will also hold sessions, counters or locks.

## Comparison

```compare
Feature                  | Redis                                             | Memcached
Data model               | Strings, hashes, lists, sets, sorted sets, streams | Opaque byte strings only
Threading                | Single-threaded commands, multi-threaded I/O      | Multi-threaded end to end
Persistence              | Optional RDB snapshots and AOF log                | None — a restart empties the cache
Replication / failover   | Replicas, Sentinel, Cluster built in              | None; clients shard with consistent hashing
Eviction                 | LRU, LFU, TTL-based or reject writes              | Slab-allocator LRU per size class
Atomic operations        | INCR, MULTI/EXEC, Lua scripts, multi-key          | INCR/DECR and compare-and-swap
Messaging                | Pub/Sub and Streams                               | Not available
Max value size           | 512 MB                                            | 1 MB by default
Memory per small item    | Higher overhead per key                           | Very lean, predictable
Operational surface      | Many knobs: persistence, eviction, cluster        | Almost none to configure
```

## Decision

```decision
? Do you need operations richer than get/set/delete (counters, sets, sorted sets, queues)?
  YES -> Redis [redis]
  NO -> ? Must the data survive a restart or fail over to a replica?
    YES -> Redis [redis]
    NO -> ? Is it a pure cache of small, uniform values under very high concurrency per node?
      YES -> Memcached [memcached]
      NO -> ? Do you already run Redis for sessions, locks or Pub/Sub?
        YES -> Redis [redis]
        NO -> Memcached [memcached]
```

## When Redis

- The cached object is not a blob: you increment a counter, add to a set, rank by score or pop from a queue.
- The same store will also hold [sessions](/concept/session), [distributed locks](/concept/distributed-lock),
  [rate-limit](/concept/rate-limiting) counters or a [Pub/Sub](/concept/pub-sub) channel — one system instead of three.
- A cold cache after restart would overload the database, so snapshots or a replica to fail over to are worth having.
- You need atomic multi-step updates (`WATCH`/`MULTI` or a Lua script) without a lock in the application.
- Values can be large (session payloads, rendered fragments over 1 MB).

## When Memcached

- The workload is exactly [Cache Aside](/pattern/cache-aside): read, miss, fill, expire. Nothing else.
- You have millions of small, similarly sized items and want the lowest memory overhead per key.
- One node must saturate many cores; Memcached's fully multi-threaded design scales vertically with no cluster setup.
- Losing the whole cache on restart is acceptable because the database can absorb the warm-up.
- You want a component with almost no configuration and no failure modes beyond "it is full".

## Deep Dive

**Threading model.** Redis executes commands on a single thread (network I/O has been
multi-threaded since 6.0). Every command is therefore atomic without locks, and latency is
predictable — until one slow command (`KEYS *`, a huge `SMEMBERS`) stalls every client.
Scaling a Redis node beyond one core means running several processes (Cluster). Memcached
spreads connections across worker threads with fine-grained locking on its hash table, so a
single large instance can use 16 or 32 cores. For a workload of tiny get/set operations this
is a real throughput advantage.

**Memory allocation.** Memcached uses a slab allocator: memory is carved into size classes
(64 B, 80 B, 100 B …) and an item lands in the smallest class that fits. This avoids
fragmentation and makes eviction cheap (LRU per class), but wastes space when item sizes
are skewed and can evict items in one class while another has free memory. Redis uses
jemalloc and stores type metadata per key, so per-item overhead is higher, but encodings
such as listpacks keep small hashes and sets compact. Neither is "more efficient" in
general — it depends on the item-size distribution.

**Durability and replication.** Memcached has no persistence and no replication: if a node
dies its keys are gone and clients simply rehash to the surviving nodes. That is a feature
for a cache — the database is the source of truth — but a cold restart of a large cache
can produce a stampede of database reads. Redis can snapshot (RDB) or append every write
(AOF), replicate asynchronously to replicas and fail over via Sentinel or Cluster. This is
what makes Redis usable for data that is *not* reconstructible (sessions, queues,
counters), and it is also what makes it heavier to operate. See
[Cache Invalidation](/concept/cache-invalidation) for why a persistent cache is not
automatically a correct cache.

**Scaling out.** With Memcached, sharding is entirely client-side: the library hashes the
key onto a ring of nodes (consistent hashing). Adding a node remaps a fraction of keys and
those simply miss. Redis Cluster moves sharding into the server (16,384 hash slots,
resharding while live) but restricts multi-key commands to keys in the same slot. If your
cache is "many independent keys", client-side sharding is simpler; if you rely on
multi-key operations, Redis Cluster's hash tags are the price.

**Time to live.** Both support per-key expiry ([TTL](/concept/ttl)). Redis additionally
lets you observe expiry (keyspace notifications) and choose between lazy and active
expiration; Memcached expires lazily on access or via its LRU crawler.

## Related

- [Cache](/concept/cache) — the concept both tools implement
- [Cache Aside](/pattern/cache-aside) — the pattern where they are interchangeable
- [Write-Through](/pattern/write-through) — a caching strategy that leans on Redis' richer semantics
- [E-commerce](/architecture/e-commerce) — a system where the cache sits in front of the catalogue database
