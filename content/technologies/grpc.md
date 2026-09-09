---
id: grpc
name: gRPC
tagline: Binary RPC framework over HTTP/2 with Protobuf contracts and streaming
category: protocol
tags: [RPC, Protocol, Microservices, Protobuf]
difficulty: 3
usedFor: [rpc, serialization]
prerequisites: [http, tcp, rpc, serialization, backend]
learningPath:
  - programming-fundamentals
  - http
  - tcp
  - tls
  - rpc
  - serialization
  - backend
  - grpc
  - microservices
related:
  - { to: rest, rel: ALTERNATIVE_TO }
  - { to: rpc, rel: IMPLEMENTS }
  - { to: rest-vs-grpc, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: nginx, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "gRPC 1.7x (2026), Protocol Buffers 3 / Editions", confidence: high }
---

## TL;DR

gRPC is a remote procedure call framework: you describe services and messages in a
`.proto` file, a compiler generates client and server code in a dozen languages, and
calls travel as compact binary Protocol Buffers over HTTP/2. It is the default choice for
internal service-to-service communication where you own both ends and care about
latency, type safety and streaming. It is a poor fit for browsers and public APIs, where
[REST](/concept/rest) over JSON remains simpler.

## Practical

The workflow always starts with the contract:

- Define messages and services in `.proto`; check the file into a shared repository so
  every team generates from the same source.
- Run `protoc` (or Buf) to generate stubs; the client calls a normal function, the
  framework does [serialization](/concept/serialization), connection management and
  [HTTP/2](/concept/http) framing.
- Pick a call style per method: unary, server-streaming, client-streaming or
  bidirectional streaming.
- Set a **deadline** on every call and propagate it; configure retries only for
  idempotent methods. See [Timeout](/pattern/timeout) and [Retry](/pattern/retry).
- Use interceptors for auth (mTLS or tokens in metadata), logging and metrics.

```text
// payments.proto
syntax = "proto3";
package payments.v1;

service Payments {
  rpc Authorize (AuthorizeRequest) returns (AuthorizeResponse);
  rpc WatchSettlements (WatchRequest) returns (stream Settlement);  // server streaming
}

message AuthorizeRequest {
  string idempotency_key = 1;
  string account_id      = 2;
  int64  amount_minor    = 3;   // cents
  string currency        = 4;
}
message AuthorizeResponse { string authorization_id = 1; Status status = 2; }
enum Status { STATUS_UNSPECIFIED = 0; APPROVED = 1; DECLINED = 2; }
```

Field numbers are the wire contract: never reuse or renumber them. Add fields freely;
mark removed ones `reserved`.

## Deep Dive

**HTTP/2 underneath.** One TCP connection carries many concurrent streams, so a client
keeps a single multiplexed connection per server and avoids head-of-line blocking at the
HTTP layer. Headers are compressed with HPACK; trailers carry the status code. This is
also why plain browsers cannot speak gRPC natively — they expose no trailer or raw
stream control — and why gRPC-Web or a REST/JSON transcoding gateway sits in front of
browser clients.

**Protocol Buffers.** Messages encode as tag-length-value binary, typically several times
smaller and faster to parse than JSON. The schema is required to decode, which is the
whole point: compatibility rules (add optional fields, never change types or numbers)
are what let services deploy independently. Protobuf Editions (replacing the
proto2/proto3 split) tune these semantics per file.

**Load balancing is a client concern.** Because connections are long-lived, an L4 load
balancer pins a client to one backend forever. Production setups use client-side
balancing with a resolver (DNS, xDS), an L7 proxy that understands HTTP/2 streams
([NGINX](/technology/nginx), Envoy), or a service mesh. In
[Kubernetes](/technology/kubernetes) this is the most common gRPC surprise.

**Deadlines and cancellation propagate.** A deadline set at the edge travels with the
call; when it expires every downstream call is cancelled. This stops one slow dependency
from consuming resources across a whole call chain and is a major reason gRPC suits deep
[microservice](/architecture/microservices) graphs.

**Status codes and errors.** gRPC has its own status vocabulary (`OK`, `NOT_FOUND`,
`UNAVAILABLE`, `DEADLINE_EXCEEDED`, …) with rich error details as protobuf messages.
Retry policies key off these codes, so mapping domain errors correctly matters.

## Why

Once a system splits into services, the cost of every internal call is paid thousands of
times per second. Hand-written REST clients for each service drift from the server,
JSON encoding dominates CPU on hot paths, and every team reinvents timeouts, retries and
auth headers slightly differently. Nothing enforces that a field a client relies on still
exists.

```sequence
title: Before — hand-rolled JSON/REST between services
participants: Checkout [backend], Payments [backend]
Checkout -> Payments: POST /authorize {"amount": "12.50", "currency": "USD"} (new TCP conn, JSON)
Payments -> Payments: parse JSON, validate types by hand
Payments --> Checkout: 200 {"authorizationId": …} (or 500 with free-text error)
Checkout -> Checkout: no deadline set → waits until socket timeout
Checkout -> Payments: retry? unclear if first call was applied
```

With gRPC the contract is compiled into both sides. The client calls
`Authorize(request, deadline)`; the framework handles encoding, connection reuse, status
codes and cancellation, and a schema change that would break a caller fails at compile
time rather than in production.

```sequence
title: After — generated stubs, binary encoding, propagated deadlines
participants: Checkout [grpc], Payments [grpc], Ledger [grpc]
Checkout -> Payments: Authorize(req) deadline=800ms  [HTTP/2 stream, protobuf 60 bytes]
Payments -> Ledger: Reserve(req) deadline=remaining 650ms
Ledger --> Payments: OK ReserveResponse
Payments --> Checkout: OK AuthorizeResponse{status=APPROVED}
Checkout -> Payments: Authorize(req2) deadline=800ms
Payments -> Ledger: Reserve(req2)
Ledger --> Payments: DEADLINE_EXCEEDED (cancelled downstream too)
Payments --> Checkout: UNAVAILABLE (retryable status, idempotency key reused)
```

The same machinery gives streaming for free, which is why gRPC also appears wherever a
service must push a continuous flow of updates to another service.

## Advantages

- Compact binary encoding and HTTP/2 multiplexing give low latency and high throughput
- Contract-first: generated, type-safe clients and servers in many languages from one `.proto`
- Built-in deadlines, cancellation propagation and standard status codes
- Four call styles including bidirectional streaming on one connection
- Interceptors, pluggable auth (mTLS, tokens) and health checking are standardised
- Strong backward/forward compatibility rules make independent deployment safe

## Trade-offs

- Not browser-native; needs gRPC-Web or a transcoding gateway for front ends
- Binary payloads are not human-readable — debugging requires tooling (`grpcurl`, reflection)
- Long-lived HTTP/2 connections defeat naive L4 load balancers; needs L7 proxy or client-side balancing
- Proto toolchain and codegen add build complexity to every consumer
- Less friendly to public third-party developers than REST/JSON with OpenAPI
- Streaming and deadlines are powerful but easy to misuse (leaked streams, missing deadlines)

## When to use

- Internal service-to-service calls in a polyglot [microservices](/architecture/microservices) system
- Latency-sensitive hot paths where JSON encoding is a measurable cost
- Streaming between services: live pricing, telemetry ingestion, log shipping, long-running job progress
- Teams that want compile-time API contracts and generated clients rather than hand-written SDKs
- Mobile clients talking to your own backend, where payload size and battery matter

## When not to use

- Don't use gRPC for a browser-facing or public API — [REST](/concept/rest) or [GraphQL](/technology/graphql) is simpler for consumers. See [REST vs gRPC](/compare/rest-vs-grpc)
- When human-readable payloads and `curl`-level debuggability are more valuable than raw efficiency
- For a small monolith or two services where a JSON HTTP call is perfectly adequate
- When your infrastructure only offers L4 load balancing and you cannot add an L7 proxy or client-side balancing
- For large file transfers — object storage such as [S3](/technology/s3) with presigned URLs is the right tool

## Real-world

gRPC is the connective tissue inside many service-oriented backends: in a
[Payment System](/architecture/payment-system) the checkout, authorization, ledger and
fraud services exchange strictly typed messages with deadlines so one slow risk check
cannot stall the whole flow; in a [Search System](/architecture/search-system) the query
frontend fans out to index shards over gRPC and streams partial results back. Service
meshes and cloud control planes are themselves built on it. At the edge, it is almost
always wrapped: browsers talk REST or GraphQL to a gateway, which speaks gRPC inward.
