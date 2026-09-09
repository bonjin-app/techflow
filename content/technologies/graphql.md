---
id: graphql
name: GraphQL
tagline: Typed query language for APIs where the client decides the shape of the response
category: protocol
tags: [API, Query Language, Protocol, Schema]
difficulty: 3
usedFor: [api-gateway, serialization]
prerequisites: [http, rest, backend, serialization]
learningPath:
  - programming-fundamentals
  - http
  - rest
  - backend
  - serialization
  - graphql
  - api-gateway
related:
  - { to: rest, rel: ALTERNATIVE_TO }
  - { to: grpc, rel: ALTERNATIVE_TO }
  - { to: rest-vs-graphql, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: react, rel: USED_WITH }
  - { to: nodejs, rel: USED_WITH }
  - { to: typescript, rel: USED_WITH }
  - { to: social-feed, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "GraphQL specification, 2021 edition (current); 2025 draft in progress", confidence: high }
---

## TL;DR

GraphQL is a query language and execution model for APIs. The server publishes a
**typed schema**; the client sends a query naming exactly the fields it wants, and gets
back JSON in that exact shape — one request, no over-fetching, no under-fetching. It
usually runs over a single HTTP `POST /graphql` endpoint. It solves the "many screens,
many payload shapes" problem well and introduces new problems around caching, query cost
and server complexity that [REST](/concept/rest) does not have.

## Practical

A GraphQL API has three moving parts: a **schema** (types, queries, mutations,
subscriptions), **resolvers** (functions that fetch each field), and a **client** that
sends queries. Typical work you will do:

- Write the schema first — it is the contract, and tools generate
  [TypeScript](/technology/typescript) types from it for both server and client.
- Implement resolvers per field, then fix the N+1 query problem with a batching layer
  (a "DataLoader") that collects ids within one request and issues one database query.
- Add pagination with cursors (`edges { node, cursor }`, `pageInfo`), because
  offset-based pagination breaks on live data.
- Set query depth and complexity limits so a client cannot ask for the whole graph.
- Decide caching: persisted queries + `GET` for CDN caching, or a normalised client cache.

```text
# schema (SDL)
type User { id: ID!, name: String!, posts(first: Int = 10): [Post!]! }
type Post { id: ID!, title: String!, author: User! }
type Query { user(id: ID!): User }

# a client query — only the fields this screen needs
query ProfileHeader($id: ID!) {
  user(id: $id) {
    name
    posts(first: 3) { title }
  }
}
```

Most teams pair it with [React](/technology/react) on the front end and
[Node.js](/technology/nodejs) or a JVM/Go server on the back end, and often put it in
front of several existing REST or gRPC services as a Backend-for-Frontend.

## Deep Dive

**Execution is a tree walk.** The server validates the query against the schema, then
resolves fields top-down. Each field's resolver receives its parent's value, so a naive
implementation issues one database call per list item — the N+1 problem. Batching
(collect all `author` lookups for this tick, query once) and per-request caching are
not optional; they are the core of a production GraphQL server.

**Single endpoint, opaque to HTTP.** Every query is a `POST` with status `200`, even
when parts failed (`errors` array alongside partial `data`). This defeats HTTP caches,
CDN rules and status-code-based monitoring. The mitigations — persisted queries hashed
into a `GET` URL, `@cacheControl` hints, client-side normalised caches — work but must
be designed in.

**Cost is client-controlled.** A REST endpoint has a bounded cost; a GraphQL query can
join arbitrarily deep (`friends { friends { friends } }`). Servers enforce depth limits,
static complexity scoring, timeouts, and rate limiting by cost instead of by request
count. See [Rate Limiting](/concept/rate-limiting).

**Schema evolution without versions.** Fields are added freely and deprecated with
`@deprecated`; nothing is removed until usage telemetry says it is safe. This works
because clients declare which fields they use — the server can see exactly who still
depends on an old field.

**Subscriptions and federation.** Subscriptions push events over
[WebSocket](/technology/websocket) or [SSE](/technology/sse). Federation composes one
supergraph from many team-owned subgraphs via a gateway — powerful for large
organisations, and a significant infrastructure investment. See
[API Gateway](/concept/api-gateway).

## Why

A product with a web app, an iOS app and a partner integration needs different slices of
the same data. With REST, either every client downloads the full resource and discards
most of it, or the backend team maintains a growing set of bespoke endpoints
(`/users/1/profile-header`, `/users/1/mobile-card`) and coordinates every change.
Rendering one screen often takes several round trips because related resources live at
separate URLs.

```sequence
title: Before — REST screen needs several round trips and over-fetches
participants: App [react], API [backend], DB [postgresql]
App -> API: GET /users/1 (full user, 40 fields)
API -> DB: SELECT * FROM users …
DB --> API: row
API --> App: 200 OK (uses 2 fields)
App -> API: GET /users/1/posts?limit=3
API -> DB: SELECT … FROM posts …
DB --> API: rows
API --> App: 200 OK (uses title only)
App -> API: GET /users/1/followers/count
API --> App: 200 OK
```

With GraphQL the client states the shape it needs, and the server assembles it in one
pass. Adding a field for a new screen is a schema change, not a new endpoint, and old
clients keep working because they never asked for it.

```sequence
title: After — one typed query, one response in the shape the screen needs
participants: App [react], GraphQL [graphql], DB [postgresql]
App -> GraphQL: POST /graphql { user(id:1) { name posts(first:3){title} followersCount } }
GraphQL -> GraphQL: validate against schema, plan resolvers
GraphQL -> DB: SELECT name FROM users … (batched with other user lookups)
GraphQL -> DB: SELECT title FROM posts WHERE author_id IN (…) LIMIT 3
GraphQL -> DB: SELECT count(*) FROM follows …
DB --> GraphQL: rows
GraphQL --> App: 200 OK { data: { user: { name, posts: [...], followersCount } } }
```

The price is that the work of composing data moved from many small, cacheable endpoints
into one execution engine that must be protected against expensive queries.

## Advantages

- Clients fetch exactly the fields they need in one request — fewer round trips, smaller payloads on mobile
- Strongly typed schema doubles as documentation and drives code generation for clients and servers
- Introspection enables tooling: explorers, linting, mock servers, type-safe clients
- Evolve the API by adding and deprecating fields instead of versioning URLs
- A single graph can front many backend services without clients knowing the topology
- Subscriptions give a standard model for real-time updates

## Trade-offs

- HTTP caching, CDNs and status-code monitoring largely stop working out of the box
- N+1 resolver problem requires batching infrastructure from day one
- Query cost is unbounded unless you add depth/complexity limits and cost-based rate limiting
- File uploads, binary data and simple CRUD are more awkward than with REST
- More server-side machinery (schema, resolvers, gateway, persisted queries) than a REST framework
- Error handling is non-standard: `200 OK` with an `errors` array confuses generic clients and proxies

## When to use

- Many client types (web, mobile, partners) that need different views of the same data
- Screens that aggregate several resources and would otherwise need many REST calls
- Front-end teams that ship faster when they can change data requirements without backend tickets
- A Backend-for-Frontend layer composing several internal services into one graph
- Public APIs where consumers want to explore and self-serve against a typed schema

## When not to use

- Don't use GraphQL for a simple CRUD service with one client — REST is less machinery. See [REST vs GraphQL](/compare/rest-vs-graphql)
- When responses must be cached at the CDN and HTTP layer with minimal effort
- For internal service-to-service calls where binary efficiency and streaming matter — [gRPC](/technology/grpc) fits better
- When the team lacks time to implement batching, complexity limits and observability; a naive GraphQL server is an easy way to overload a database
- For large file transfer or streaming media endpoints

## Real-world

GraphQL shows up most often as the API layer behind content-heavy product UIs: a
[Social Feed](/architecture/social-feed) where each card needs author, media, counts and
viewer state in one fetch, or an [E-commerce](/architecture/e-commerce) product page
composing catalogue, pricing, inventory and reviews from separate services. In larger
organisations it takes the form of a federated gateway that lets each team own a
subgraph while clients see one schema. It rarely replaces REST entirely; the common
outcome is GraphQL for client-facing composition and REST or gRPC underneath.
