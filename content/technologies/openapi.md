---
id: openapi
name: OpenAPI
tagline: A machine-readable description of an HTTP API, and the code and checks generated from it
category: api
tags: [API, REST, Contract, Documentation, Tooling]
difficulty: 2
usedFor: [rest, contract-testing, api-versioning]
prerequisites: [http, rest, serialization]
learningPath:
  - http
  - rest
  - serialization
  - openapi
  - contract-testing
  - api-versioning
related:
  - { to: rest, rel: RELATED_TO }
  - { to: contract-testing, rel: USED_WITH }
  - { to: api-versioning, rel: USED_WITH }
  - { to: graphql, rel: ALTERNATIVE_TO }
  - { to: grpc, rel: ALTERNATIVE_TO }
  - { to: typescript, rel: USED_WITH }
  - { to: api-gateway, rel: USED_WITH }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, version: "OpenAPI 3.1 (JSON Schema aligned); 3.0 still common", confidence: high }
---

## TL;DR

OpenAPI is a YAML or JSON document describing an HTTP API: its paths, parameters, request
and response schemas, status codes and authentication. Because it is machine-readable, one
file produces documentation, typed clients in a dozen languages, server stubs, request
validation at the gateway, mock servers and contract tests. That is the entire value
proposition — [REST](/concept/rest) has no built-in schema, so OpenAPI is how a REST API
gets the typed contract that [gRPC](/technology/grpc) and [GraphQL](/technology/graphql) have
by default. Its characteristic failure is equally simple: a specification generated as an
afterthought, or written once and never updated, is worse than none, because people trust it.

## Practical

Two ways to get a spec, and the choice matters more than the tooling.

**Spec-first**: write the document, review it like an API design, generate the server stubs
and the client, then implement. The contract exists before the code, so consumers can start
against a mock on day one and the design conversation happens in a pull request rather than
after release.

**Code-first**: annotate the handlers and generate the document from them. Lower friction,
and the spec cannot drift because it is derived — but it describes what you built rather than
what you agreed, and the design review never happens.

```yaml
# The shape of it: one path, one response, one reusable schema.
openapi: 3.1.0
info: { title: Orders API, version: 2.3.0 }
paths:
  /orders/{id}:
    get:
      operationId: getOrder          # becomes the client method name
      parameters:
        - { name: id, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Order" }
        "404":
          content:
            application/problem+json:   # RFC 9457 — errors deserve a schema too
              schema: { $ref: "#/components/schemas/Problem" }
components:
  schemas:
    Order:
      type: object
      required: [id, total, currency, status]
      properties:
        id: { type: string }
        total: { type: integer, description: minor units }
        currency: { type: string, pattern: "^[A-Z]{3}$" }
        status: { type: string, enum: [pending, paid, shipped, cancelled] }
```

What to wire up once you have it: generate the client into
[TypeScript](/technology/typescript) so the frontend cannot call a field that does not
exist; validate incoming requests against the schema at the
[API gateway](/concept/api-gateway) or in middleware; run a diff of the spec in
[CI/CD](/concept/ci-cd) so a breaking change fails the build; publish a rendered reference
from the same file so the docs cannot disagree with the API.

## Deep Dive

**The spec is only worth what its accuracy is.** A document that describes last quarter's API
sends every consumer into a debugging session. Whichever direction you generate, the spec has
to be verified against the running service — by validating responses in integration tests, by
generating the server from it, or by
[contract tests](/concept/contract-testing) that fail when reality diverges. "We keep it up
to date" is not a mechanism.

**Breaking-change detection is the highest-value automation.** A diff tool comparing the new
spec against the published one classifies changes: adding an optional field is safe, removing
a field or narrowing an enum is not. Running that in CI turns
[API Versioning](/pattern/api-versioning) from a discipline people remember into a gate that
fails. This alone justifies keeping a spec.

**Generated clients are a trade.** They remove hand-written HTTP code and the drift that
comes with it, and they produce code shaped by the generator rather than by your codebase —
verbose, awkward in places, and occasionally wrong for a schema the generator handles poorly.
Generate the types and write a thin client by hand if the generated client fights you; the
types are where most of the value is.

**3.1 aligned with JSON Schema, and it matters.** Earlier versions used a near-JSON-Schema
dialect with small incompatibilities that broke validators. 3.1 is a proper superset, so the
same schema can validate a request at the edge, a message on a queue and a row in a pipeline.
Many tools still target 3.0, so check support before adopting 3.1 features.

**Describe the errors, not just the happy path.** Most specs document the 200 and leave
clients guessing at failures. An error schema — RFC 9457 problem details is the standard
shape — plus the status codes each operation can return is the part consumers need most,
because that is the code they write least confidently.

**It cannot express everything, and pretending otherwise is a trap.** Rate limits, eventual
consistency, whether an operation is idempotent, which fields can change together, what
happens on a retry — none of it fits the schema. The spec is the syntax of your API; the
semantics still need prose, and the most useful API documentation is a spec plus a page about
[idempotency](/concept/idempotency) and error handling.

**Operation ids and tags are the ergonomics.** They become method names and client namespaces,
so `getOrder` and `listOrders` produce a usable client while auto-generated
`ordersIdGet` does not. It is a five-minute decision that every consumer lives with.

## Why

Before a machine-readable contract, a REST API's shape lived in a wiki page, a Postman
collection and the server code, and those three disagreed within a month. Every consumer
hand-wrote its own client and its own types, and discovered a renamed field in production.

```sequence
title: Before — three descriptions of one API, none of them authoritative
participants: Backend [backend], Wiki, Frontend [react], QA [testing]
Backend -> Backend: rename total_cents to total
Backend -> Wiki: updated next sprint, or not at all
Frontend -> Wiki: reads the old page, writes its own type by hand
Frontend -> Backend: GET /orders/8f21
Backend --> Frontend: {total: 4200} — the field the client expects is missing
Frontend --> QA: undefined in the UI, found in staging if you are lucky
QA --> Backend: "was this intentional?" — nobody can tell from the code
```

After: one document is the contract. The client's types are generated from it, the gateway
validates against it, CI refuses a breaking change, and the documentation is rendered from
the same file — so the three descriptions become one.

```sequence
title: After — one document, and the drift becomes a failing build
participants: Backend [backend], Spec [openapi], CI [github-actions], Frontend [react], Gateway [api-gateway]
Backend -> Spec: rename total_cents to total
Spec -> CI: diff against the published spec
CI --> Backend: breaking change — removed a required field; the build fails
Backend -> Spec: add total, keep total_cents deprecated for one version
CI -> Frontend: regenerate the typed client
Frontend --> Frontend: compiler flags every use that must change
Spec -> Gateway: request and response validation from the same schema
Gateway --> Frontend: a response that does not match the contract never ships
```

## Advantages

- One source of truth for docs, clients, server stubs, mocks and validation
- Breaking changes become a CI failure instead of a consumer's incident
- Consumers can build against a mock before the implementation exists
- Typed clients remove hand-written HTTP code and the drift it accumulates
- Request validation at the edge rejects malformed input before it reaches your code
- Vendor-neutral and universally supported — gateways, test tools and SDK generators all read it
- Gives REST the typed contract gRPC and GraphQL have built in

## Trade-offs

- A spec that drifts from the implementation is worse than no spec
- Generated clients are verbose and shaped by the generator, not by your codebase
- Large specs become unwieldy; `$ref` sprawl across files is hard to review
- Cannot express rate limits, idempotency, consistency or cross-field rules
- Code-first generation documents what you built, not what you agreed
- 3.0 and 3.1 differ enough that tool support has to be checked
- Keeping examples accurate is manual work that quietly rots

## When to use

- A REST API with more than one consumer, especially consumers you do not control
- Public or partner APIs, where the reference documentation is part of the product
- Frontend and backend in separate repositories or separate teams
- You want breaking-change detection and request validation without writing them
- Multiple client languages that would otherwise hand-write the same types

## When not to use

- Don't add OpenAPI to a single internal endpoint with one caller you also own
- For internal service-to-service RPC, [gRPC](/technology/grpc)'s protobuf contract is stronger and mandatory
- When the client's needs vary so much that [GraphQL](/technology/graphql) fits better
- If nobody will maintain it — an inaccurate spec costs more than no spec
- For event and message schemas; that is AsyncAPI's or a schema registry's job

## Real-world

OpenAPI usually shows up at the boundary of an [E-commerce](/architecture/e-commerce) or
[Multi-tenant SaaS](/architecture/multi-tenant-saas) system, where the public API is a
product and its documentation is part of the sale. The spec generates the reference site and
the SDKs partners use, the gateway validates requests against it so malformed input never
reaches a service, and a CI diff enforces the deprecation policy described in
[API Versioning](/pattern/api-versioning). Internally the same file generates the frontend's
[TypeScript](/technology/typescript) types, which is where most of the day-to-day value
lands: a backend field rename becomes a compile error in the client's repository rather than
an undefined in production. Teams that also run
[contract tests](/concept/contract-testing) against the spec close the last gap — the
document describing what the service actually does, rather than what it did when someone last
edited the YAML.
