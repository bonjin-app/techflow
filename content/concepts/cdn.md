---
id: cdn
name: CDN (Content Delivery Network)
tagline: Serve content from edge servers near the user instead of from one distant origin
category: networking
tags: [Networking, Cache, Performance]
difficulty: 2
prerequisites: [http, cache]
learningPath:
  - http
  - cache
  - ttl
  - cdn
  - load-balancing
  - cache-invalidation
related:
  - { to: http, rel: REQUIRES }
  - { to: cache, rel: REQUIRES }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

A CDN is a geographically distributed set of caching proxies ("edges" or points of
presence). Users are routed to the nearest edge; the edge serves content from its
[Cache](/concept/cache) when it can and fetches from your origin server only on a miss.
The result is lower latency (shorter network distance), less load on the origin, and a
buffer against traffic spikes and attacks. CDNs are the outermost layer of
[HTTP](/concept/http) caching.

## Why it matters

Light travels only so fast: a round trip from Seoul to a server in Virginia takes
roughly 150–200 ms before any work is done, and a page needs dozens of round trips.
Moving static assets — images, scripts, stylesheets, video segments — to an edge 10 ms
away changes page load from seconds to fractions of one. The origin also stops handling
the 90%+ of requests that are for the same files, which is why a
[Simple Web App](/architecture/simple-web-app) on one small server can survive a
front-page traffic burst if its assets are behind a CDN.

## Visual

```sequence
title: Edge miss then edge hit
participants: User A, Edge (Seoul), Origin [backend], User B
User A -> Edge (Seoul): GET /app.3f9c.js
Edge (Seoul) -> Edge (Seoul): cache lookup — MISS
Edge (Seoul) -> Origin: GET /app.3f9c.js
Origin --> Edge (Seoul): 200, Cache-Control: max-age=31536000
Edge (Seoul) -> Edge (Seoul): store copy
Edge (Seoul) --> User A: 200 (≈180 ms)
User B -> Edge (Seoul): GET /app.3f9c.js
Edge (Seoul) -> Edge (Seoul): cache lookup — HIT
Edge (Seoul) --> User B: 200 (≈10 ms), origin never contacted
```

## How it works

1. **Routing to an edge.** The site's hostname resolves through the CDN's DNS, which
   returns the address of a nearby edge (GeoDNS) or a single anycast address announced
   from every location so the network delivers packets to the closest one.
2. **Cache lookup.** The edge keys the object by URL (plus selected headers, cookies or
   query parameters). A hit is served immediately.
3. **Origin fetch on miss.** The edge requests the object from your origin, often via a
   regional "shield" tier so that many edges missing at once produce one origin request
   instead of hundreds.
4. **Store according to headers.** `Cache-Control: max-age`, `s-maxage` (CDN-specific
   lifetime), `no-store`, `private`, and `Vary` tell the edge whether and how long to
   keep the object. The [TTL](/concept/ttl) is set by the origin, not guessed by the CDN.
5. **Revalidate.** When an object's lifetime ends, the edge can ask the origin
   `If-None-Match: <etag>` and receive `304 Not Modified` — cheap compared to a full
   transfer. `stale-while-revalidate` lets it serve the old copy while checking.

**What to put behind a CDN:**

- Static assets with **content-hashed filenames** (`app.3f9c.js`): cache for a year;
  a new build produces a new URL, so invalidation is never needed.
- Images and video, usually with on-the-fly resizing and format negotiation.
- Public API responses and full HTML pages that are identical for every user — with a
  short TTL and explicit purging.
- Not: personalised pages, authenticated API responses (unless keyed carefully), or
  anything whose accidental sharing between users would be a security incident.

## Deep Dive

**Invalidation.** Hashed filenames sidestep the problem for assets. For everything else,
CDNs offer purge APIs (by URL, by tag/surrogate key, or everything) that propagate to
edges in seconds. Purging is a form of [Cache Invalidation](/concept/cache-invalidation)
and has the same trap: forgetting a variant (a different `Accept-Encoding`, a query
string) leaves stale copies alive. Keep TTLs short enough that a missed purge heals
itself.

**Cache key design.** Including every query parameter in the key fragments the cache
(`?utm_source=` produces a miss per campaign). Including too little serves the wrong
content (ignoring `?page=2`). Normalise: whitelist the parameters that affect the
response, sort them, and strip the rest.

**Private data leaks.** An origin that returns `Cache-Control: public` on a response
containing a user's account page has just published it to the next visitor at that
edge. Authenticated responses must be `private` or `no-store`; treat cache headers as
part of the security review.

**Hit ratio and long-tail content.** Edges have finite storage and evict less-popular
objects. A catalogue of millions of rarely viewed images has a low edge hit ratio no
matter what; a shield tier and larger regional caches help, but the origin must still
cope with the tail.

**Dynamic content at the edge.** Modern CDNs run code at the edge (edge functions),
terminate TLS, apply [Rate Limiting](/concept/rate-limiting) and WAF rules, and absorb
volumetric DDoS traffic before it reaches the origin. This makes the CDN the first line
of defence, and also a dependency: a CDN outage takes the whole site down even though
the origin is healthy.

**Consistency.** A CDN is another replica of your data. Two users in different cities
can see different versions of a page for the duration of the TTL — a bounded form of
[Eventual Consistency](/concept/eventual-consistency). For a product price in an
[E-commerce](/architecture/e-commerce) site that is usually acceptable for seconds, not
minutes; choose TTLs per content type accordingly.

**Cost and measurement.** CDNs charge per byte delivered and per request; the origin
saves the same. Watch edge hit ratio, origin request rate, and time-to-first-byte per
region — a region with a low hit ratio usually reveals a cache-key or header problem
rather than a CDN problem.
