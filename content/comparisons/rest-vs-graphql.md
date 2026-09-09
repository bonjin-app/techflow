---
id: rest-vs-graphql
name: REST vs GraphQL
tagline: Resource-shaped endpoints versus a query language for client-shaped data
category: decision
tags: [API, HTTP, Protocol, Frontend, Decision]
difficulty: 3
subjects: [rest, graphql]
related:
  - { to: http, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: e-commerce, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Both are ways to expose data over [HTTP](/concept/http), and both usually return JSON.
[REST](/concept/rest) models the system as *resources* with URLs — `/users/1`,
`/users/1/orders` — and lets HTTP do the work: verbs, status codes, caching headers, ETags.
The server decides what a response contains. [GraphQL](/technology/graphql) exposes a single
endpoint and a typed schema; the client sends a query naming exactly the fields and nested
relations it wants, and gets back one JSON document in that shape. REST is the simpler,
better-cached default for most services and public APIs. GraphQL earns its complexity when
many different clients need different slices of a rich, interconnected data model and
over-fetching or request waterfalls are a measurable problem.

## Comparison

```compare
Feature               | REST [rest]                                            | GraphQL [graphql]
Endpoint model        | Many URLs, one per resource or collection              | One endpoint (POST /graphql), one typed schema
Response shape        | Fixed by the server per endpoint                       | Chosen by the client per query, field by field
Nested data           | Several round trips or ad-hoc ?include= parameters     | One query resolves the whole graph
HTTP caching          | GET + ETag / Cache-Control work at CDN and browser      | POST by default; needs persisted queries or a client cache
Schema and typing     | Optional (OpenAPI); drift is common                    | Mandatory; introspection and codegen come for free
Versioning            | /v2/ paths or media types                              | Evolve one schema, deprecate fields
Error handling        | HTTP status codes                                      | 200 with an errors array (partial results possible)
Server cost per call  | Predictable per endpoint                               | Varies with query depth; needs complexity limits
Real-time             | Polling, SSE or WebSocket alongside                    | Subscriptions built into the spec (transport is yours)
Tooling maturity      | Everything speaks it: proxies, gateways, browsers      | Rich client libraries; less at the infrastructure layer
```

## Decision

```decision
? Do several clients (web, mobile, partners) need different fields from the same rich data model?
  YES -> ? Is the data a graph of related entities that screens traverse in one go?
    YES -> GraphQL [graphql]
    NO -> ? Is per-client over-fetching actually hurting latency or bandwidth?
      YES -> GraphQL [graphql]
      NO -> REST [rest]
  NO -> ? Do you rely on HTTP/CDN caching or serve a public, long-lived API?
    YES -> REST [rest]
    NO -> ? Is the API mostly simple CRUD or file/media transfer?
      YES -> REST [rest]
      NO -> GraphQL [graphql]
```

## When REST

- Resource-shaped CRUD where each endpoint's payload is small and stable.
- You want the browser, a [CDN](/concept/cdn) or a reverse proxy to cache responses with
  standard `Cache-Control` and `ETag` semantics and no extra machinery.
- Public or partner APIs where the widest possible tooling compatibility matters.
- Uploads, downloads and streaming — HTTP verbs and content types already model these.
- Service-to-service calls inside a backend where each caller owns its endpoint contract
  (or where [gRPC](/technology/grpc) is the alternative rather than GraphQL).
- Team is small and you want the fewest moving parts.

## When GraphQL

- A product UI built from many nested entities (user → posts → comments → authors) where
  REST would cost a waterfall of requests or a zoo of `?include=` variants.
- Multiple front ends with different data needs share one backend, and you want them to
  evolve without server changes for every new screen.
- You want a strongly typed contract with generated client code in TypeScript or mobile
  languages, and schema-driven documentation.
- A gateway layer that stitches or federates several internal services into one graph —
  effectively an [API gateway](/concept/api-gateway) with a schema.
- Real-time updates fit naturally as subscriptions next to queries and mutations.

## Deep Dive

**Round trips.** The most visible difference is how a screen gets its data. With REST the
client walks the resource graph one URL at a time, or the server adds compound endpoints
that erode REST's uniformity.

```sequence
title: REST — the client follows links, one request per resource
participants: Browser [react], API [rest], DB [postgresql]
Browser -> API: GET /users/1
API -> DB: SELECT user
API --> Browser: 200 {id, name, ...30 fields}
Browser -> API: GET /users/1/posts?limit=10
API -> DB: SELECT posts
API --> Browser: 200 [ {...}, {...} ]
Browser -> API: GET /posts/42/comments
API -> DB: SELECT comments
API --> Browser: 200 [ ... ]
```

GraphQL collapses this into a single request whose shape mirrors the UI. The server walks
the query tree, calling a *resolver* per field. Naive resolvers produce the N+1 problem
(one database query per post for its comments), so production servers batch resolver
calls per request with a DataLoader-style layer.

```sequence
title: GraphQL — one query, resolvers batched, one response
participants: Browser [react], GraphQL [graphql], DB [postgresql]
Browser -> GraphQL: POST /graphql { user(id:1){ name posts(first:10){ title comments{ text } } } }
GraphQL -> GraphQL: parse, validate against schema, check depth/complexity
GraphQL -> DB: SELECT user WHERE id=1
GraphQL -> DB: SELECT posts WHERE user_id=1 LIMIT 10
GraphQL -> DB: SELECT comments WHERE post_id IN (…)   (batched)
GraphQL --> Browser: 200 { data: { user: { name, posts: [...] } } }
```

**Caching.** REST's GET responses are cacheable by every intermediary because the URL *is*
the cache key. GraphQL sends queries in a POST body, so HTTP caches see nothing. The
GraphQL answer is a normalised client-side [cache](/concept/cache) (entities keyed by type
and id) plus, for edge caching, *persisted queries* — the client sends a hash of a
pre-registered query via GET. That works, but you are rebuilding what REST gets from HTTP
for free.

**Error semantics.** A REST call fails with a status code; a GraphQL response is `200 OK`
with a `data` object and an `errors` array, and a single query can partially succeed. This
is powerful for UIs (render what arrived) and confusing for monitoring — a dashboard of
status codes shows nothing while half your resolvers fail.

**Server protection.** A REST endpoint has a known cost. A GraphQL endpoint accepts
arbitrary trees, so a hostile or careless query can request `friends { friends { friends
… } }`. Servers therefore add depth limits, cost analysis and per-query
[rate limiting](/concept/rate-limiting) — extra layers REST does not need.

**Schema and evolution.** GraphQL's schema is not optional, which forces the contract into
the open and lets tooling generate types, mocks and docs. Fields are deprecated rather than
versioned, so old clients keep working. REST can achieve the same with OpenAPI and
discipline, but nothing enforces it.

## Related

- [REST](/concept/rest) — the constraints REST actually implies
- [GraphQL](/technology/graphql) — schema, resolvers and the ecosystem
- [HTTP](/concept/http) — what REST leans on and GraphQL partly bypasses
- [API Gateway](/concept/api-gateway) — where a federated GraphQL layer often lives
- [REST vs gRPC](/compare/rest-vs-grpc) — the other common alternative to REST
