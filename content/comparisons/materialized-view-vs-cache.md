---
id: materialized-view-vs-cache
name: Materialized View vs Cache
tagline: Precomputed and kept consistent by the writer, or filled lazily and evictable
category: decision
tags: [Data, Performance, Caching, Decision]
difficulty: 4
subjects: [materialized-view, cache]
related:
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Both make an expensive read cheap by storing an answer instead of computing it. A
[materialized view](/pattern/materialized-view) is *derived data you own*: a table the
system maintains deliberately from the source of truth, complete for every key, refreshed
on a schedule or by an event stream, and queryable like any other table. A
[cache](/concept/cache) is *an optimisation you can throw away*: entries appear on demand,
expire by [TTL](/concept/ttl), and get evicted when memory runs short, so every read must
have a working path when the entry is not there. The practical split is completeness and
who owns freshness — a view is always populated and stale by a bounded amount you control;
a cache is sometimes populated and stale by whatever your invalidation misses.

## Comparison

```compare
Feature             | Materialized View [materialized-view]                | Cache [cache]
Coverage            | Complete — every key has a row                        | Partial — only what has been asked for recently
Population          | Written by a refresh job or an event consumer         | Written lazily on the first miss, or on write
On a miss           | Cannot miss; a missing row means a bug or a gap       | Normal — fall through to the source and backfill
Freshness owner     | The writer, by refresh cadence or stream lag          | The reader, by TTL and invalidation on write
Staleness bound     | Explicit and measurable (last refresh time)           | Best effort; a missed invalidation is silent
Eviction            | Never — it is durable state you manage                | Always possible under memory pressure
Query shape         | Arbitrary SQL: filter, sort, join, aggregate          | Key lookup only, by whatever key you cached under
Where it lives      | Alongside the data store, on disk                     | In memory beside the service, or in Redis
Cost profile        | Storage plus refresh compute, paid on every write cycle | Memory plus a miss penalty, paid per unique read
Rebuild             | Replay from the source; slow but deterministic        | Warms itself back up from traffic
```

## Decision

```decision
? Is the expensive part an aggregation, join or sort rather than a single-row fetch?
  NO -> ? Are the same few keys read far more often than the underlying data changes?
    YES -> Cache [cache]
    NO -> Neither — fix the query plan or add an index [indexing]
  YES -> ? Must every key be answerable fast, including keys nobody asked for yet?
    NO -> Cache [cache]
    YES -> ? Can readers tolerate a known, bounded lag behind the source of truth?
      NO -> Query the source of truth directly [database]
      YES -> ? Do you need to filter, sort or paginate the precomputed result?
        YES -> Materialized View [materialized-view]
        NO -> Materialized View behind a cache [materialized-view]
```

## When Materialized View

- Dashboards, reports and leaderboards: a `GROUP BY` over millions of rows that many users request with different filters.
- Read models in [CQRS](/pattern/cqrs) — the write side stores events or normalised rows, the read side is a shaped table per query.
- The result must be sortable and paginable. A cache can hand you page one under a key; only a table can answer "page 40 ordered by score".
- Long-tail access, where most keys are read rarely: a cache would miss almost every time and you would pay the expensive query anyway.
- Predictable p99 matters more than average latency, because a view has no miss path and therefore no bimodal response time.
- You need the derived data to survive a restart and be queryable by other jobs, not just by the service that filled it.

## When Cache

- Point lookups by id — sessions, profiles, feature flags, rendered fragments — where the source query is already cheap and the win is avoiding the round trip.
- A hot subset dominates traffic: a small share of keys serves most reads, so a small amount of memory buys a large hit rate.
- Read-your-writes matters and you can invalidate precisely on write; see [Cache Aside](/pattern/cache-aside) and [Cache Invalidation](/concept/cache-invalidation).
- The keyspace is huge or unbounded (search queries, generated images) and precomputing all of it is not possible.
- You want to add it without owning new durable state: a [Redis](/technology/redis) instance you can flush is far less commitment than a table with a refresh pipeline.
- The workload is spiky and you would rather pay per unique read than run a refresh job continuously.

## Deep Dive

**The real distinction is derived data versus disposable data.** Deleting a cache costs
latency for a few minutes. Deleting a materialized view costs a rebuild, and until it
finishes some product surface is wrong or empty. That makes the view part of your data
model: it needs schema migrations, backfill scripts, monitoring for refresh lag and a
documented rebuild procedure. Budget for that before choosing it — the query speedup is
the easy part.

**Three ways to refresh, with three different costs.** Full recomputation is simplest and
scales with total data, so it fits nightly reporting where a few minutes of downtime on
the view is acceptable (a concurrent refresh avoids blocking readers at the price of
double storage). Incremental refresh recomputes only affected groups, which is far cheaper
but requires the source to tell you what changed — usually an updated-at column or a
change log. Streaming maintenance consumes an event stream or change-data-capture feed and
updates the view continuously, giving seconds of lag; this is the strongest option and the
most machinery, because you now own consumer lag, replay and out-of-order events. Whichever
you pick, expose the refresh timestamp to readers so "as of 14:32" is visible rather than
implied.

**Consistency you can reason about.** A view's staleness is a number you can alarm on:
refresh lag. A cache's staleness is a distribution shaped by TTL, write patterns and
whichever invalidation paths you remembered to write — which is why the hardest cache bugs
are entries nobody invalidated and nobody noticed. On the other hand a cache can be made
read-your-writes for a single key trivially (write through it, or delete the key in the
same transaction); a view generally cannot, because the refresh happens elsewhere. If a
user must immediately see their own change, either read the source for that user's own
rows or accept [Eventual Consistency](/concept/eventual-consistency) explicitly in the UI.

**They compose, and usually should.** The standard production shape for an expensive
read-heavy endpoint is a materialized view for completeness plus a cache in front of it
for the hot keys and for absorbing bursts. The view guarantees there is no expensive
fallback path, so a cache stampede degrades to a slightly slower table scan rather than a
minute-long aggregation; the cache keeps the view's disk out of the p50. Reach for neither
first: an appropriate index (see [Indexing](/concept/indexing)) often removes the problem
at a fraction of the operational cost, and it is the only one of the three that cannot go
stale.

## Related

- [Materialized View](/pattern/materialized-view) — refresh strategies and read models
- [Cache](/concept/cache) — hit rates, TTLs and eviction policies
- [Cache Invalidation](/concept/cache-invalidation) — the hard half of caching
- [CQRS](/pattern/cqrs) — where read models become the architecture
- [Indexing](/concept/indexing) — try this before either of them
