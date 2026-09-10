---
id: anti-corruption-layer
name: Anti-Corruption Layer
tagline: Translate at the boundary so a foreign or legacy model cannot leak into your domain
category: application
tags: [Architecture, Integration, Legacy, Maintainability]
difficulty: 3
prerequisites: [backend, rest, api-gateway]
learningPath:
  - backend
  - rest
  - layered-architecture
  - hexagonal-architecture
  - anti-corruption-layer
  - strangler-fig
related:
  - { to: strangler-fig, rel: RELATED_TO }
  - { to: microservices, rel: RELATED_TO }
  - { to: backend-for-frontend, rel: RELATED_TO }
  - { to: hexagonal-architecture, rel: USED_WITH }
  - { to: api-versioning, rel: RELATED_TO }
  - { to: serialization, rel: RELATED_TO }
  - { to: circuit-breaker, rel: USED_WITH }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Your new billing service must read customers from a fifteen-year-old CRM. Its API returns
`CUST_STAT` as `"A"`, `"I"` or `"P3"`, dates as `YYYYDDD` strings, and one field that means
two different things depending on another field. The pragmatic move is to call it directly
and use its shapes — and within a month that foreign vocabulary has spread everywhere.

`customerStatus === "P3"` appears in a pricing rule. A UI component checks `CUST_STAT`.
The legacy null-means-active quirk is now an implicit assumption in four modules. When the
CRM is replaced, or when it renames a field, the change is not at one boundary — it is
everywhere. The same happens with third-party SDKs whose types end up in domain entities,
and with a shared database another team keeps reshaping.

## Solution

Put a **translation layer** between your domain and the foreign system. Everything crossing
the boundary is converted: their identifiers, their enums, their errors, their units become
yours on the way in, and yours become theirs on the way out. Your domain code depends only
on an interface you define, expressed in your own language.

```sequence
title: A request crossing the boundary twice
participants: Domain Service [backend], ACL [backend], Legacy CRM [rest]
Domain Service -> ACL: getCustomer(CustomerId)
ACL -> Legacy CRM: GET /cust?no=00099123
Legacy CRM --> ACL: { CUST_STAT: "P3", DT_JOIN: "2019204", … }
ACL -> ACL: map codes, parse dates, normalise nulls | quirks stop here
ACL --> Domain Service: Customer { status: Suspended, joinedOn: 2019-07-23 }
Domain Service -> ACL: suspend(CustomerId, reason)
ACL -> Legacy CRM: POST /cust/status { CUST_STAT: "P3", RSN: 14 }
Legacy CRM --> ACL: 200 OK / ERRCD 55
ACL --> Domain Service: Ok | or a domain error, never ERRCD 55
```

## How it works

```steps
title: Building the boundary
Define the interface your domain wants [hexagonal-architecture] | written before looking at their API
Implement one adapter that speaks the foreign protocol [rest]
Map every field, code and unit explicitly | a table, not scattered if-statements
Translate their errors into your domain errors [circuit-breaker] | plus timeouts and retries
Hide their identifiers behind your own [api-versioning]
Test the adapter against recorded real responses [serialization] | contract tests catch drift
```

Two rules make it work. First, the translation is **total**: no foreign type, error code or
string constant is allowed past the layer, and that is enforced by review or a lint rule on
imports. Second, the interface is written from your domain's needs *first* — if you generate
it from their OpenAPI schema you have built a client, not an anti-corruption layer, and
their model still shapes yours.

```ts
// Domain-owned port — no CRM vocabulary anywhere
export interface CustomerDirectory {
  find(id: CustomerId): Promise<Customer | null>;
  suspend(id: CustomerId, reason: SuspensionReason): Promise<void>;
}

const STATUS: Record<string, CustomerStatus> = {
  A: "Active", I: "Closed", P3: "Suspended", "": "Active",  // legacy: blank means active
};
```

The layer is also the natural home for resilience — [timeouts](/pattern/timeout), a
[circuit breaker](/pattern/circuit-breaker), retry policy and a cache — because the domain
should not know that this dependency is slow and flaky. During a
[Strangler Fig](/pattern/strangler-fig) migration it is the seam that lets you swap the
legacy implementation for a new one without touching a line of domain code.

## Advantages

- The domain model stays clean and expressed in business language
- Foreign changes are absorbed in one file instead of rippling through the codebase
- Replacing or removing the external system becomes a contained refactor
- A single place to add caching, retries, rate limiting and observability for that dependency
- Legacy quirks are documented as explicit mapping code rather than tribal knowledge
- The adapter can be stubbed, so domain tests need no legacy system

## Disadvantages

- Real cost with no user-visible feature: a layer, mapping code and its tests
- Two models to keep in sync; a new field must be added in both places
- Mapping loses information — fields with no domain meaning get dropped, sometimes wrongly
- An extra hop adds latency, and a caching layer adds staleness
- Over-applied it becomes a pass-through: dozens of DTOs that mirror the source exactly
- Someone must own it, or it silently drifts from what the foreign system actually returns

## When to use

- Integrating with a legacy system, a third-party API or another team's shared database
- Migrating incrementally and needing the old system behind a stable interface
- The external model conflicts with your domain concepts or is unstable
- The dependency is unreliable and needs a resilience boundary anyway
- Two [microservices](/architecture/microservices) with genuinely different vocabularies must cooperate

## When not to use

- The external model is small, stable and close to yours — plain mapping in the client is enough
- A throwaway script, prototype or one-off import
- You control both sides and can simply fix the upstream model
- The layer would just rename fields with no semantic translation — that is ceremony
- Ultra-low-latency paths where an extra transformation hop is measurable and unacceptable

## Real-world

Anti-corruption layers show up wherever new code meets old: a modern checkout wrapping a
mainframe inventory system, a product API wrapping a payment or shipping provider's SDK, an
integration service normalising three CRMs into one customer concept. In the
[E-commerce](/architecture/e-commerce) architecture the shipping and tax integrations sit
behind adapters, so a carrier's odd status codes and a tax vendor's rate format never reach
the order domain — and swapping a provider is an adapter change, not a redesign. The pattern
comes from Domain-Driven Design, where it protects a bounded context from an upstream model
it does not control.
