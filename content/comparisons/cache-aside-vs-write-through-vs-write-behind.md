---
id: cache-aside-vs-write-through-vs-write-behind
name: Cache Aside vs Write Through vs Write Behind
tagline: Fill the cache on a miss, write it with every update, or let it absorb writes and flush
category: decision
tags: [Cache, Consistency, Performance, Data, Decision]
difficulty: 3
subjects: [cache-aside, write-through, write-behind]
related:
  - { to: cache, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: distributed-cache, rel: RELATED_TO }
  - { to: materialized-view-vs-cache, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: high }
---

## TL;DR

All three put a [cache](/concept/cache) in front of a database. They differ in **who writes
to the cache, and when**.

[Cache Aside](/pattern/cache-aside) leaves writes alone: the application writes the
database, deletes the cached key, and the next read fills it again. [Write Through](/pattern/write-through)
writes the cache and the database together on every write, so a read never finds a stale
value. [Write Behind](/pattern/write-behind) writes only the cache, acknowledges, and
flushes to the database later — fastest for the writer, and the only one of the three that
can lose a write you already said was saved.

The default is Cache Aside, because it is the only one that stays correct when something
else writes the database too. Reach for the other two when a specific cost of Cache Aside —
a stale read after a write, or write latency — is the thing actually hurting you.

## Comparison

```compare
Dimension             | Cache Aside [cache-aside]                     | Write Through [write-through]                  | Write Behind [write-behind]
Who fills the cache   | Readers, on a miss                            | Writers, on every write                         | Writers, on every write
Read after own write  | May be stale until the key is dropped         | Always current                                  | Always current, from the cache
Write latency         | One database write                            | Database and cache, both                        | Cache only; the database later
Can lose a write      | No — the database is written first            | No — both are written before the ack            | Yes, if the cache dies before it flushes
Other writers         | Fine; the next miss reads their change        | Cache diverges from writes it did not see       | Cache diverges, and flushes may overwrite theirs
Cold start            | Slow until the hot set is read back in        | Only written keys are warm                      | Only written keys are warm
Cache holds           | What is read                                  | What is written, read or not                    | What is written, read or not
Failure you debug     | Stale values after a missed invalidation      | Two writes that must both succeed               | Lost or reordered writes after a crash
```

## Decision

```decision
? Can losing a write the caller was told succeeded ever be acceptable?
  NO -> ? Must a reader never see a stale value after a write?
    YES -> ? Is this service the only writer to those tables?
      YES -> Write Through [write-through]
      NO -> Cache Aside [cache-aside]
    NO -> Cache Aside [cache-aside]
  YES -> ? Is write latency or write volume the actual bottleneck?
    YES -> Write Behind [write-behind]
    NO -> Cache Aside [cache-aside]
```

## When Cache Aside

- The workload is read-heavy and a value a few seconds old is acceptable — product pages,
  profiles, configuration, most of what a cache is ever asked to hold.
- Other services, batch jobs or a person with a SQL client also write the database. Cache
  Aside is the only one of the three that tolerates writes it never saw, because the next
  miss simply reads them.
- You want the cache to hold what is actually read, not everything that was ever written.
- It is the right starting point in the absence of a measured reason to move: the others
  add correctness conditions you have to keep true.

## When Write Through

- A reader must see its own write immediately, and a delete-then-refill gap has caused real
  bugs — a user edits a setting and the next page shows the old one.
- This service is the only writer to those keys. Write Through keeps the cache current only
  for writes that pass through it.
- Written data is read soon and often, so warming the cache on write is not wasted work.
- You can make the two writes behave as one: write the database first, then the cache, and
  treat a failed cache write as a delete rather than leaving an old value in place.

## When Write Behind

- Write throughput or latency is the measured bottleneck — counters, activity streams, game
  state, telemetry — and the database cannot absorb every write synchronously.
- Many writes to the same key can be coalesced: a counter updated a thousand times a second
  is one database write per flush interval rather than a thousand.
- Losing the last few seconds of writes in a crash is an acceptable, stated outcome, and the
  data is not money, stock or anything a user was promised.
- You have built the parts that make it safe: durable queueing of pending writes, retries,
  ordering per key, and an alert when the backlog grows.

## Deep Dive

**The race Cache Aside is known for.** A reader misses, reads the old value from the
database, and is about to write it into the cache; meanwhile a writer updates the database
and deletes the key; then the reader's stale value lands. The window is small and real.
Short [TTLs](/concept/ttl) bound how long the damage lasts, and deleting rather than
updating on write keeps the window narrow — which is why "update the cache on write" is a
different pattern with different failure modes, not a small improvement on this one.

**Write Through is two writes, not one.** Database and cache do not share a transaction, so
one can succeed and the other fail. Order matters: database first, then cache, so a failure
leaves the cache stale rather than the database missing a row the cache claims exists. And
when the cache write fails, delete the key instead of retrying blindly — a missing key is a
miss; a wrong key is a bug nobody sees.

**Write Behind moves the database's durability into the cache.** Whatever the cache promises
about persistence is now what your writes are worth. A cache configured for speed — no
append-only log, asynchronous replication — acknowledges writes it can lose on a failover.
If that trade is taken, take it knowingly, and never for anything a user would call a
record.

**They compose.** Many systems use Cache Aside for reads and Write Through for a few keys
where read-your-own-write matters. Write Behind is usually a component — a counter service,
a buffer in front of an analytics store — rather than the way a whole application caches.
