---
id: api-versioning
name: API Versioning
tagline: Evolve a published contract without breaking the clients already using it
category: api
tags: [API, Compatibility, Design]
difficulty: 3
prerequisites: [http, rest, serialization]
learningPath:
  - http
  - rest
  - serialization
  - api-versioning
  - graphql
related:
  - { to: rest, rel: SOLVES }
  - { to: graphql, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
  - { to: api-gateway, rel: USED_WITH }
  - { to: backend-for-frontend, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

You published an API. Mobile apps call it, partners integrate with it, an
internal service depends on it. Now a field must be renamed, a response must
become paginated, and `status: "ok" | "fail"` must grow a third value.

None of these can simply be changed. Clients parse your JSON with generated
types; a renamed field is a crash. A partner integration written two years ago
still runs and nobody at that company remembers it. Mobile users cannot be
force-updated — some fraction stays on last year's build for years. So the
contract is not yours to change unilaterally: once published, it is a promise.

Doing nothing is not an option either. An API that cannot evolve becomes a
museum of past decisions, and teams route around it by adding
`/v1/orders-new-really`.

## Solution

Classify every change as **compatible** or **breaking**, and use versioning only
for the breaking ones. Compatible changes ship silently. Breaking changes get a
new version that runs *alongside* the old one, with a published deprecation
window, so clients migrate on their own schedule.

```steps
title: Deciding what a change costs
Is the change additive? [serialization] | new optional field, new endpoint, new enum value clients ignore
Yes → ship it in place, no version bump
No → it removes, renames, retypes or changes semantics
Introduce the new version next to the old one [rest] | both served from one codebase
Announce deprecation with a date and measure who still calls the old version [observability]
Migrate clients; help the large ones directly
Remove the old version only when traffic is near zero
```

```sequence
title: Two versions, one implementation
participants: Old Client [http], New Client [http], Gateway [api-gateway], Service [backend], DB [postgresql]
Old Client -> Gateway: GET /v1/orders/9
New Client -> Gateway: GET /v2/orders/9
Gateway -> Service: route both to the same handler
Service -> DB: SELECT … (one internal model)
DB --> Service: row
Service --> Gateway: v1 shape (flat total)
Service --> Gateway: v2 shape (money object)
Gateway --> Old Client: 200 OK
Gateway --> New Client: 200 OK
```

## How it works

Three placements are common, and the argument between them matters less than
picking one and being consistent.

**URI path** (`/v1/orders`) is the most visible, trivially cacheable and easy to
route at a proxy; purists object that a version is not part of a resource's
identity. **Header** (`Accept: application/vnd.api+json; version=2`) keeps URLs
stable but is invisible in logs and browser tests and easy to get wrong. **Date
or version request header** (`API-Version: 2026-09-01`) works well for large
public APIs where each client pins a snapshot.

```http
GET /v2/orders/9 HTTP/1.1
Host: api.example.com
Accept: application/json

HTTP/1.1 200 OK
Deprecation: true
Sunset: Wed, 01 Apr 2026 00:00:00 GMT
Link: <https://docs.example.com/migrate/v3>; rel="deprecation"
```

Internally, do **not** fork the codebase per version. Keep one domain model and
one implementation, and translate at the edge: a small adapter per version maps
the internal model to that version's request and response shapes. Forking gives
you two divergent implementations of the same business rules and the bugs that
follow.

[gRPC](/technology/grpc) and Protobuf push most of this into the wire format:
field numbers are the contract, adding optional fields is safe, and removing a
field means reserving its number forever. [GraphQL](/technology/graphql)
typically avoids versions entirely by deprecating fields
(`@deprecated(reason:)`) and relying on clients requesting only what they use —
which works well until a field's *meaning* changes, where a deprecation notice
does nothing and you need a new field name anyway.

The part teams skip is measurement. Deprecation without per-version, per-client
usage metrics is a wish; with them, removal is a data-driven decision.

## Advantages

- Clients keep working while the API evolves — no coordinated global upgrade
- Breaking changes become explicit, reviewable and schedulable
- Old and new behaviour can be compared side by side in production
- A clear place to correct earlier design mistakes instead of accreting workarounds
- Deprecation headers and metrics turn "who still uses this?" into a query

## Disadvantages

- Every live version is code, tests, docs and on-call surface that must keep working
- Adapters accumulate; three versions of one endpoint make the edge layer the most complex part of the service
- Semantic changes are not solved by versioning — same field, new meaning, silently wrong clients
- Versions are sticky: without enforcement, "temporary" v1 lives for years and blocks refactoring
- Per-version behaviour differences leak into the domain model if the translation layer is not disciplined
- Cross-version bug fixes must be applied and tested more than once

## When to use

- The API has consumers you do not control or cannot force to upgrade
- Mobile clients with long tails of old builds
- Public or partner APIs where stability is part of the product
- A change removes, renames or retypes something clients depend on

## When not to use

- The only consumer is your own frontend, deployed together with the backend — change both at once
- The change is additive; bumping a version for a new optional field trains clients to ignore versions
- You cannot commit to maintaining the old version — a version you break anyway is worse than none
- A [BFF](/pattern/backend-for-frontend) already isolates each client and can absorb the change
- The right answer is a new resource, not a new version of an old one

## Real-world

Payment and identity APIs are the strictest practitioners: a pinned version per
account, multi-year support windows and explicit migration guides — because a
broken integration means failed transactions. The
[Payment System](/architecture/payment-system) architecture keeps its public
contract versioned at the [gateway](/concept/api-gateway) while internal services
evolve freely behind it, which is the general lesson: version what crosses an
organisational boundary, and nothing else.
