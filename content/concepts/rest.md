---
id: rest
name: REST
tagline: Model an API as resources addressed by URLs and manipulated with standard HTTP methods
category: protocol
tags: [API, HTTP, Backend]
difficulty: 2
prerequisites: [http, backend]
learningPath:
  - http
  - backend
  - rest
  - authentication
  - idempotency
  - rate-limiting
related:
  - { to: http, rel: REQUIRES }
  - { to: backend, rel: REQUIRES }
  - { to: idempotency, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

REST (Representational State Transfer) is an architectural style for APIs that leans on
[HTTP](/concept/http) as it was designed: nouns in URLs (`/orders/42`), verbs from the
method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), meaning in status codes, and no
server-side conversation state between requests. It is less a specification than a set
of conventions — but following them gives you caching, idempotent retries and
predictable clients for free, because the web infrastructure already understands HTTP.

## Why it matters

Most services a [Backend](/concept/backend) talks to, and most APIs it exposes, are
REST-shaped. Knowing the conventions means you can predict an unfamiliar API's
behaviour, that proxies and [CDNs](/concept/cdn) can cache your `GET`s, that a client
can safely retry a `PUT` after a timeout, and that a `404` versus `403` versus `409`
tells the caller what to do next. Breaking the conventions — `POST /getUser`,
`200 OK {"error": true}` — removes all of that and forces every client to learn your
API by hand.

## Visual

```sequence
title: Resource lifecycle over HTTP
participants: Client, API [backend], DB [postgresql]
Client -> API: POST /orders {items: [...]}
API -> DB: INSERT order
DB --> API: id 42
API --> Client: 201 Created  Location: /orders/42
Client -> API: GET /orders/42
API -> DB: SELECT …
DB --> API: row
API --> Client: 200 OK  ETag: "v1"  {status: "pending"}
Client -> API: PATCH /orders/42  If-Match: "v1"  {status: "paid"}
API -> DB: UPDATE … WHERE version = 1
DB --> API: 1 row
API --> Client: 200 OK  ETag: "v2"
Client -> API: DELETE /orders/42
API --> Client: 204 No Content
Client -> API: GET /orders/42
API --> Client: 404 Not Found
```

## How it works

**Resources and URLs.** Everything is a resource with a stable identifier. Collections
are plural nouns (`/users`), members are addressed by id (`/users/7`), and relationships
nest at most a level or two (`/users/7/orders`). Actions are avoided in paths; if one is
unavoidable, model it as a resource (`POST /orders/42/cancellations`).

**Methods carry semantics.**

| Method | Meaning | Safe | Idempotent |
| --- | --- | --- | --- |
| `GET` | read a representation | yes | yes |
| `PUT` | replace the resource entirely | no | yes |
| `PATCH` | partial update | no | not guaranteed |
| `POST` | create or trigger a process | no | no |
| `DELETE` | remove | no | yes |

*Safe* means no side effects, so caches and prefetchers may call it freely.
*Idempotent* means repeating the call has the same effect as making it once — the basis
for safe [Retry](/pattern/retry). `POST` can be made idempotent with an
`Idempotency-Key` header; see [Idempotency](/concept/idempotency).

**Status codes are the contract.** `2xx` success (`201` created, `204` no body), `3xx`
redirection, `4xx` the client must change something (`400` malformed, `401`
unauthenticated, `403` forbidden, `404` missing, `409` conflict, `422` semantically
invalid, `429` rate limited), `5xx` the server failed and the client may retry.

**Representations.** The same resource can be served as JSON, XML or HTML via content
negotiation (`Accept`). JSON is the de facto default.

**Statelessness.** Each request carries everything needed — usually an
[Authentication](/concept/authentication) token — so any server can handle any request.
No server-side "current page" or "selected item" between calls.

**Conditional requests.** `ETag` and `If-Match` / `If-None-Match` provide optimistic
concurrency (reject an update based on a stale version) and cheap revalidation for
caches.

## Deep Dive

**Pagination, filtering, sorting.** Collections need bounded responses: `?limit=50&cursor=…`
scales better than `?page=37` because offsets get slow and skip or repeat items when
data changes underneath. Return the next cursor in the body or a `Link` header.

**Versioning.** Adding fields is backwards-compatible; renaming or removing is not.
Common strategies are a path prefix (`/v2/orders`) or a header; the honest answer is to
avoid breaking changes and, when they are needed, run both versions for a deprecation
period.

**Errors.** Use the right status *and* a structured body (`{ "type", "title", "detail" }`
— RFC 9457 "Problem Details") so clients can branch on a machine-readable field rather
than parsing a message.

**HATEOAS and "how RESTful".** The original definition includes hypermedia — responses
that link to available next actions. Few public APIs do this; most are "HTTP APIs with
resource-style URLs". The Richardson Maturity Model names the levels; arguing about the
label matters less than being consistent.

**Common mistakes.** Returning `200` with an error payload defeats every generic client
and monitoring tool. Using `GET` for actions with side effects lets crawlers and
prefetchers trigger them. Exposing database ids and shapes directly couples the API to
the schema. Deeply nested URLs (`/a/1/b/2/c/3/d/4`) become impossible to evolve.

**Alternatives and when to choose them.** *GraphQL* lets clients select exactly the
fields they need and fetch related data in one round trip — good for varied front-ends,
harder to cache and rate-limit. *gRPC* offers binary encoding, streaming and generated
clients — good for internal service-to-service calls in
[Microservices](/architecture/microservices), poor for browsers without a proxy.
*WebSockets* or [SSE](/technology/sse) suit server-initiated updates that request/
response cannot express. REST remains the default for public, cacheable,
resource-oriented APIs because everything in the HTTP ecosystem already speaks it.
