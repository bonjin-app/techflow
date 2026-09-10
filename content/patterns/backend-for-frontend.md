---
id: backend-for-frontend
name: Backend for Frontend
tagline: One tailored API per client instead of one generic API for all of them
category: api
tags: [API, Frontend, Architecture]
difficulty: 3
prerequisites: [http, rest, api-gateway]
learningPath:
  - http
  - rest
  - api-gateway
  - backend-for-frontend
  - graphql
related:
  - { to: api-gateway, rel: SOLVES }
  - { to: graphql, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: react, rel: USED_WITH }
  - { to: api-versioning, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: social-feed, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A mobile app, a web app and a partner integration all consume the same services,
but they need different things from them. The mobile home screen needs a small
payload: five products, a name, a thumbnail URL, a price. The web home page shows
the same products with reviews, stock levels and recommendations. The partner
API needs stable, verbose, versioned resources.

Serve all three from one generic API and you get one of two bad outcomes. Either
the API returns everything, and mobile clients download and discard 80% of the
payload over a mobile network; or clients compose the screen themselves with six
or ten round-trips, which on a high-latency connection is the difference between
a fast screen and a slow one. Meanwhile the API's shape becomes a negotiation
between three teams with different release cycles: mobile cannot force-update
users, so nothing can ever be removed.

## Solution

Give each client **its own backend** — a thin server-side layer owned by the
team that builds that client. The BFF calls the downstream services, aggregates
and reshapes their responses, and returns exactly the payload one screen needs.

The BFF is not a shared gateway. A shared gateway serves everyone and therefore
belongs to no one; a BFF serves one client and is owned by that client's team, so
it can change on the client's release cadence without cross-team coordination.

```sequence
title: Mobile home screen — one call in, three fan-out calls
participants: Mobile App [react], BFF [nodejs], Catalog [backend], Reviews [backend], Cache [redis]
Mobile App -> BFF: GET /mobile/home
BFF -> Cache: GET home:v3:user-9
Cache --> BFF: MISS
BFF -> Catalog: GET /products?featured=true
BFF -> Reviews: GET /ratings?ids=…
Catalog --> BFF: 12 products, 40 fields each
Reviews --> BFF: rating summaries
BFF -> BFF: trim to 5 products × 4 fields, merge ratings
BFF -> Cache: SET home:v3:user-9 EX 60
BFF --> Mobile App: 200 OK (3 KB)
```

```steps
title: Responsibilities of a BFF
Authenticate and translate session → service tokens [authentication]
Fan out to the services the screen needs [rest]
Aggregate and reshape into one screen-sized payload
Cache what is safe to cache [cache-aside] | per-user or per-segment, short TTL
Degrade gracefully when one dependency fails [circuit-breaker]
Own the client-specific contract and its versions [api-versioning]
```

## How it works

The BFF lives in the client team's repository — often in the same language as the
client, which is why Node.js BFFs sit under React apps. It has no database of its
own: its state is the downstream services plus a cache. Requests are parallelised
and the slowest dependency sets the latency floor, so per-call
[timeouts](/pattern/timeout) and partial-response handling matter more here than
almost anywhere else.

```ts
// One screen, one endpoint, partial failure tolerated
app.get("/mobile/home", async (req, res) => {
  const [products, ratings] = await Promise.all([
    catalog.featured({ limit: 5, timeout: 300 }),
    reviews.summaries({ timeout: 150 }).catch(() => ({})),   // optional
  ]);
  res.json(products.map((p) => ({
    id: p.id, title: p.name, price: p.price,
    image: p.images[0]?.thumb, rating: ratings[p.id]?.avg ?? null,
  })));
});
```

A frequent question is "why not [GraphQL](/technology/graphql) instead?" GraphQL
solves the over-fetching half of the problem by letting the client pick fields,
and can remove the need for a per-client server. It does not remove the need for
client-specific auth translation, aggressive per-screen caching, or hiding
downstream failures — and it moves complexity into resolver performance and query
cost control. Many systems run both: a GraphQL BFF per client.

## Advantages

- Payloads and round-trips are tuned per client, which is felt directly on mobile networks
- The client team owns and deploys its own contract — no cross-team API negotiation for a screen change
- Downstream services stay generic and are not polluted with screen-specific endpoints
- A convenient place for client-specific auth, feature gating and graceful degradation
- Breaking changes are contained: retiring a web field does not touch mobile

## Disadvantages

- N clients means N deployable services to build, monitor, secure and keep on-call
- Logic duplicates across BFFs; a bug fixed in the web BFF often needs fixing in the mobile one
- Another network hop and another place latency and failures can originate
- The temptation to put business rules in the BFF is strong, and then the same rule exists in three places inconsistently
- Only worth it when client teams are separate; one team with one client just gained a service for nothing

## When to use

- Two or more genuinely different clients (mobile, web, TV, partner) with different payload and latency needs
- Separate client teams that want to ship without waiting for a platform API change
- A [microservices](/architecture/microservices) backend where composing a screen requires several calls
- Clients you cannot force to upgrade, so their contract must be frozen independently

## When not to use

- A single web client — call the services or the gateway directly
- Clients that differ only in field selection; GraphQL or sparse fieldsets (`?fields=`) may be enough
- Your organisation cannot staff another deployable per client
- The BFF would become the only place business logic lives — that belongs in a service
- You need one stable public contract for external developers; that is a versioned API, not a BFF
- The concern is cross-cutting for *every* client (TLS, global [rate limiting](/concept/rate-limiting), WAF) — that belongs in an [API Gateway](/concept/api-gateway) in front of the BFFs, not copied into each one

## Real-world

BFFs are standard in product organisations with separate mobile and web teams:
a Node.js layer per client, fanning out to domain services and caching in Redis.
The [Social Feed](/architecture/social-feed) architecture is the classic case —
the feed a phone renders and the feed a desktop renders need different amounts of
data per item, and the ranking service should not care which.
