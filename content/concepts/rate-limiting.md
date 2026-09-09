---
id: rate-limiting
name: Rate Limiting
tagline: Cap how many requests a client may make in a window so one user cannot exhaust the system
category: backend
tags: [Backend, Reliability, Security]
difficulty: 3
prerequisites: [http, backend, cache]
learningPath:
  - http
  - backend
  - cache
  - ttl
  - rate-limiting
  - redis
  - circuit-breaker
related:
  - { to: redis, rel: RELATED_TO }
  - { to: ttl, rel: REQUIRES }
  - { to: http, rel: REQUIRES }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Rate limiting rejects or delays requests once a client exceeds an allowed number per
time window — for example 100 requests per minute per API key. It protects a service
from abuse, from buggy clients in a retry loop, and from a single tenant starving
everyone else. Limits are enforced with a counter keyed by client identity, and the
counter usually lives in a fast shared store so every server sees the same count.

## Why it matters

Servers have finite capacity and traffic does not arrive evenly. Without limits, one
scraper, one misconfigured [Retry](/pattern/retry) loop or one credential-stuffing
attack can consume the capacity meant for thousands of legitimate users. Rate limits
also appear on the cost side: an [AI application](/architecture/ai-rag) calling a paid
model API needs per-user caps so a single account cannot run up the bill. Being on the
receiving end matters too — every public API a [Backend](/concept/backend) calls will
answer `429 Too Many Requests` at some point, and the client must handle it.

## Visual

```sequence
title: Fixed-window counter in Redis (limit 3 per minute)
participants: Client, API [backend], Redis [redis]
Client -> API: GET /search
API -> Redis: INCR rl:key123:12:05
Redis --> API: 1 (set TTL 60s on first hit)
API --> Client: 200 OK  X-RateLimit-Remaining: 2
Client -> API: GET /search
API -> Redis: INCR rl:key123:12:05
Redis --> API: 2
API --> Client: 200 OK  X-RateLimit-Remaining: 1
Client -> API: GET /search
API -> Redis: INCR rl:key123:12:05
Redis --> API: 3
API --> Client: 200 OK  X-RateLimit-Remaining: 0
Client -> API: GET /search
API -> Redis: INCR rl:key123:12:05
Redis --> API: 4 ❌ over limit
API --> Client: 429 Too Many Requests  Retry-After: 37
```

## How it works

1. **Identify the client.** By API key or user id after [Authentication](/concept/authentication),
   by IP for anonymous traffic (imperfect: shared NATs and proxies), or by a combination.
2. **Count.** Increment a counter for that identity and window. `INCR` in
   [Redis](/technology/redis) is atomic, so many servers can share one counter without a
   [Race Condition](/concept/race-condition). Give the key a [TTL](/concept/ttl) so
   windows clean themselves up.
3. **Decide.** If the count exceeds the limit, reject with `429`, include `Retry-After`,
   and expose remaining quota in headers so well-behaved clients can slow down.
4. **Place it early.** Limits are cheapest at the edge — an API gateway, the
   [load balancer](/concept/load-balancing), or a [CDN](/concept/cdn) — before the
   request costs application or database time.

**Algorithms:**

- **Fixed window.** One counter per window (`user:minute`). Simplest, but allows a burst
  of 2× the limit at the boundary (100 at 12:00:59, 100 more at 12:01:00).
- **Sliding log.** Store every request timestamp in a sorted set and count those within
  the last N seconds. Exact, but memory grows with traffic.
- **Sliding window counter.** Weight the previous window's count by how much of it still
  overlaps the current one. Approximate, cheap, smooths the boundary burst.
- **Token bucket.** A bucket refills at a steady rate up to a capacity; each request
  takes a token. Allows short bursts up to the capacity while enforcing an average rate.
  The most common choice for APIs.
- **Leaky bucket.** Requests enter a queue drained at a fixed rate; overflow is dropped.
  Produces perfectly smooth output; used for traffic shaping.

## Deep Dive

**Distributed counting.** Each server counting locally gives N servers × limit in
total. A shared store fixes that but adds a round trip to every request and makes the
store a dependency. Hybrid designs keep a small local allowance and synchronise with
Redis periodically, accepting slight over-admission for lower latency.

**Atomicity.** "Read count, compare, increment" is a race under concurrency. Use an
atomic increment and check the returned value, or run the whole check-and-update in a
Lua script so the decision and the update happen together.

**Store unavailable.** If Redis is down, does the API reject everything (fail closed)
or let everything through (fail open)? Fail open is typical for a public API where
availability matters more than strict enforcement; fail closed suits abuse-sensitive
endpoints such as login. Decide explicitly and monitor for the degraded mode.

**Layered limits.** Production systems apply several at once: per IP to blunt anonymous
floods, per user for fairness, per endpoint because a search is costlier than a health
check, and a global ceiling to protect the database. The tightest limit wins.

**Good client behaviour.** Honour `Retry-After`, back off exponentially with jitter, and
do not retry `429` immediately. Combined with a [Circuit Breaker](/pattern/circuit-breaker),
this keeps one throttled dependency from taking down the caller.

**Rate limiting is not load shedding.** Limits are per-client policy decided in advance.
Load shedding drops requests based on *current* server health (queue depth, CPU),
regardless of who sent them. Healthy systems need both: limits for fairness and abuse,
shedding for survival under unexpected load.

**Failure modes:**

- Limiting by IP behind a proxy without reading the forwarded address throttles the
  proxy, not the users.
- Counters without TTLs leak memory forever.
- Limits too low for legitimate bursts (page load fires 20 API calls) generate support
  tickets; token buckets with a sensible capacity avoid this.
- Returning `429` without headers leaves clients guessing and retrying blindly.
