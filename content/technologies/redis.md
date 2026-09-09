---
id: redis
name: Redis
tagline: In-memory data structure store used as cache, message broker and shared state
category: database
tags: [Database, Cache, Distributed System, In-memory]
difficulty: 3
usedFor: [cache, session, distributed-lock, pub-sub, rate-limiting, message-queue]
prerequisites: [http, backend, database, cache]
learningPath:
  - programming-fundamentals
  - http
  - database
  - sql
  - backend
  - cache
  - redis
  - distributed-system
related:
  - { to: cache, rel: RELATED_TO }
  - { to: cache-aside, rel: IMPLEMENTS }
  - { to: memcached, rel: ALTERNATIVE_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: websocket, rel: USED_WITH }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: distributed-system, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, version: "Redis 8.x", confidence: high }
---

## TL;DR

Redis keeps data in memory and exposes it through simple commands over a network
socket. Because every read and write touches RAM instead of disk, a single instance
answers in well under a millisecond. It is not a general-purpose database: you use it
*next to* your primary database as a cache, a shared state store, a lock service, a
message bus or a counter. Data structures (strings, hashes, lists, sets, sorted sets,
streams) let you model those use cases directly instead of serialising blobs.

## Practical

Most teams meet Redis as a **cache** in front of PostgreSQL or MySQL. Reads are
served from Redis when present ("hit") and from the database when not ("miss");
the miss result is written back with a time-to-live so it expires on its own.

Typical patterns you will actually ship:

- **Cache Aside** — application reads Redis first, falls back to the database, then
  populates Redis. See [Cache Aside](/pattern/cache-aside).
- **Session store** — a web tier with many servers keeps user sessions in Redis so any
  server can handle any request. See [Session](/concept/session).
- **Rate limiting** — `INCR` + `EXPIRE` on a key per user/IP gives a sliding or fixed
  window counter in two commands. See [Rate Limiting](/concept/rate-limiting).
- **Distributed lock** — `SET key value NX PX 30000` gives a lock that expires even if
  the holder crashes. See [Distributed Lock](/concept/distributed-lock).
- **Pub/Sub** — chat servers publish messages to a channel and every subscribed server
  fans them out to its WebSocket clients. See [Pub/Sub](/concept/pub-sub).
- **Leaderboards / counters** — sorted sets keep ranked scores updated in `O(log N)`.

```ts
// Cache Aside with a TTL — the 80% case
async function getUser(id: string) {
  const key = `user:${id}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);          // HIT

  const user = await db.query("select * from users where id = $1", [id]); // MISS
  await redis.set(key, JSON.stringify(user), "EX", 60);                   // TTL 60s
  return user;
}
```

Operationally you will run it as a managed service or a container, watch memory,
set an eviction policy (`allkeys-lru` for pure caches), and decide whether you need
persistence (RDB snapshots, AOF log) or accept losing everything on restart.

## Deep Dive

**Single-threaded command execution.** Redis executes commands on one thread (I/O can
be multi-threaded since 6.0). This makes every command atomic without locks and keeps
latency predictable, but one slow command (`KEYS *`, a huge `SMEMBERS`) blocks every
client. Use `SCAN`, keep values small, and prefer `O(1)`/`O(log N)` operations.

**Memory is the budget.** All data must fit in RAM. When `maxmemory` is reached,
the eviction policy decides what to drop (LRU, LFU, TTL-based, or reject writes).
A cache that silently evicts hot keys under memory pressure produces a spike of
database load — the classic "cache stampede".

**Persistence is optional and secondary.** RDB writes point-in-time snapshots;
AOF appends every write (fsync every second by default). Neither gives the
durability guarantees of a transactional database; treat Redis data as
reconstructible unless you have deliberately configured otherwise.

**Replication and Cluster.** Replicas are asynchronous — a failover can lose the
last few writes. Redis Cluster shards keys across nodes by hash slot (16,384 slots);
multi-key commands only work when keys hash to the same slot (`{user:1}:profile`
hash tags). This is where Redis becomes a distributed system with all the usual
consistency questions. See [Distributed System](/concept/distributed-system).

**Distributed locks are hard.** The simple `SET NX PX` lock is fine for
"best effort" mutual exclusion. If correctness depends on the lock (money moves),
you need fencing tokens or a consensus system; a single Redis node with async
replication cannot guarantee exclusivity across a failover.

## Why

The database is usually the slowest, most expensive and least scalable part of a
web system. Many requests ask the same questions over and over — the same product
page, the same profile, the same configuration. Answering them from disk every time
wastes the database's capacity on repeated work.

```sequence
title: Without a cache — every request hits the database
participants: Client, API [backend], DB [postgresql]
Client -> API: GET /product/42
API -> DB: SELECT … (20 ms)
DB --> API: row
API --> Client: 200 OK
Client -> API: GET /product/42 (again)
API -> DB: SELECT … (20 ms, same work)
DB --> API: row
API --> Client: 200 OK
```

Adding Redis puts an in-memory copy between the application and the database.
The first request still pays the database cost; every following request within the
TTL is answered from memory.

```sequence
title: With Redis — repeated reads never reach the database
participants: Client, API [backend], Redis [redis], DB [postgresql]
Client -> API: GET /product/42
API -> Redis: GET product:42
Redis --> API: MISS
API -> DB: SELECT … (20 ms)
DB --> API: row
API -> Redis: SET product:42 EX 60
API --> Client: 200 OK
Client -> API: GET /product/42 (again)
API -> Redis: GET product:42
Redis --> API: HIT (0.3 ms)
API --> Client: 200 OK
```

The same property — fast, shared, in-memory state reachable from every server —
is why Redis also ends up holding sessions, locks, counters and pub/sub channels.

## Advantages

- Sub-millisecond latency for reads and writes; hundreds of thousands of ops/s per node
- Rich data structures (hash, list, set, sorted set, stream, bitmap, HyperLogLog) model real problems directly
- Atomic single commands and Lua scripts without client-side locking
- Built-in TTL per key — caches clean themselves
- Pub/Sub and Streams for lightweight messaging
- Simple protocol, clients for every language, easy to run locally

## Trade-offs

- Everything must fit in memory — RAM is far more expensive than disk
- Cache invalidation is your problem: stale data, stampedes and consistency with the source of truth
- Persistence exists but is not the primary design goal; treat it as a cache, not a system of record
- Single-threaded execution: one slow command stalls everyone
- Replication is asynchronous — failover can lose recent writes
- Cluster adds operational complexity and limits multi-key operations

## When to use

- Read-heavy workloads where the same data is requested repeatedly
- Shared state across many stateless servers (sessions, feature flags, presence)
- Counters, rate limits and leaderboards that need atomic increments
- Low-latency pub/sub between services (chat fan-out, cache invalidation signals)
- Short-lived data with a natural expiry (OTP codes, temporary tokens)

## When not to use

- As the only copy of data you cannot afford to lose
- When your dataset is far larger than affordable RAM
- For complex queries, joins or reporting — that is what your database is for
- When a durable, replayable event log is required — use [Kafka](/technology/kafka)
- When a single-process in-memory map would do (one server, no sharing needed)

## Real-world

In a typical web or mobile backend Redis appears in three or four roles at once:
a Cache Aside layer in front of the relational database, the session store behind
the load balancer, the counter behind API rate limits, and the Pub/Sub bus that lets
several chat or notification servers share events. See how those roles fit together
in the [Chat System](/architecture/chat-system) and
[E-commerce](/architecture/e-commerce) architectures.
