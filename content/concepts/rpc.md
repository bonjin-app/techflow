---
id: rpc
name: RPC
tagline: Call a function on another machine as if it were local — and pay for pretending
category: protocol
tags: [Distributed System, Protocol, Backend]
difficulty: 3
prerequisites: [http, backend, serialization]
learningPath:
  - http
  - backend
  - serialization
  - rest
  - rpc
  - grpc
  - microservices
related:
  - { to: serialization, rel: REQUIRES }
  - { to: grpc, rel: RELATED_TO }
  - { to: rest, rel: ALTERNATIVE_TO }
  - { to: graphql, rel: RELATED_TO }
  - { to: timeout, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

RPC (Remote Procedure Call) lets a program invoke a procedure in another process —
usually on another machine — with the syntax of a local function call. A generated
client **stub** serialises the arguments, sends them over the network, and a server
stub deserialises them, runs the real function and ships the result back. Modern
examples are [gRPC](/technology/grpc), Thrift and JSON-RPC; the model is the backbone
of service-to-service communication in [Microservices](/architecture/microservices).

## Why it matters

Splitting a system into services means functions that used to be in-process calls now
cross a network. RPC frameworks make that transition cheap for developers: define the
interface once in an IDL, generate typed clients and servers in every language, and
call `orders.Create(req)`.

The danger is in the illusion. A local call cannot be lost, duplicated or take thirty
seconds; a remote one can. Systems that treat RPC as "just a function call" discover
cascading failures, retry storms and duplicate orders under load. Understanding what
the stub hides — [Serialization](/concept/serialization), transport, partial failure —
is what separates a robust service boundary from a fragile one.

## Visual

```sequence
title: One RPC, end to end
participants: Caller, Client Stub, Server Stub, Service
Caller -> Client Stub: CreateOrder(req)
Client Stub -> Server Stub: serialise → HTTP/2 frame → network
Server Stub -> Service: deserialise → CreateOrder(req)
Service --> Server Stub: OrderReply
Server Stub --> Client Stub: serialise → response frame
Client Stub --> Caller: OrderReply (or DEADLINE_EXCEEDED / UNAVAILABLE)
```

From the caller's point of view there is a single function call. Everything between
the two stubs is where latency, failures and version skew live.

## How it works

- **Interface definition (IDL)** — a language-neutral contract (`.proto`, Thrift IDL,
  OpenAPI for JSON-RPC-style APIs) declares services, methods and message types. Code
  generation produces stubs, so the compiler enforces the contract at both ends.
- **Serialisation** — arguments become bytes: Protocol Buffers for gRPC, compact binary
  for Thrift, JSON for JSON-RPC. Binary formats are smaller and faster to parse; JSON
  is readable and debuggable with any HTTP tool.
- **Transport** — gRPC uses HTTP/2, giving multiplexed streams, header compression and
  [TLS](/concept/tls) integration; older systems used raw [TCP](/concept/tcp) framing.
  HTTP/2's long-lived connections change how [Load Balancing](/concept/load-balancing)
  must work (see below).
- **Call styles** — unary request/response is the default; gRPC adds server streaming,
  client streaming and bidirectional streaming over one call, useful for feeds,
  uploads and live updates.
- **Status and metadata** — errors travel as structured status codes
  (`NOT_FOUND`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`) plus optional details; headers
  carry auth tokens, trace ids and deadlines.
- **Deadlines** — the caller states how long it is willing to wait; the deadline
  propagates to every downstream call, so a request that is already doomed stops
  consuming resources.

## Deep Dive

**Partial failure is the whole problem.** A local call either returns or throws. A
remote call has a third outcome: *unknown* — the request may have executed and the
reply was lost. Retrying a non-idempotent call after a timeout can create two orders.
Every RPC method needs a documented answer: is it safe to retry? If not, add an
[Idempotency](/concept/idempotency) key. Then pair [Retry](/pattern/retry) with
exponential backoff and a [Timeout](/pattern/timeout), and put a
[Circuit Breaker](/pattern/circuit-breaker) in front of dependencies that are failing
so a slow service does not exhaust the caller's threads.

**Load balancing with HTTP/2.** A connection-level (L4) balancer assigns each
long-lived gRPC connection to one backend, and all requests on it follow — scaling out
adds servers that receive nothing. Use an L7 proxy that balances per request, or
client-side balancing that resolves all backends and rotates across connections.

**Schema evolution.** Protobuf identifies fields by number, so adding a field is safe
for old clients (they ignore it) and old servers (they see the default). Never reuse
or renumber a field, never change its type, and mark removed numbers reserved. Breaking
changes get a new method or a new service version.

**RPC vs REST.** [REST](/concept/rest) models resources and reuses HTTP semantics —
caches, status codes, browser access, human readability. RPC models actions and
optimises for typed contracts and efficiency between services you control. Many
systems use both: gRPC internally, REST or [GraphQL](/technology/graphql) at the
public edge, sometimes with a transcoding gateway. See
[REST vs gRPC](/compare/rest-vs-grpc).

**Observability.** Because a stub hides the network, add interceptors that log method,
status and latency, propagate trace context and export metrics per method. A single
user request may fan out into dozens of RPCs; without tracing the slow one is
invisible.

**Chatty interfaces.** Designing RPC methods like local getters — `GetUser`, then
`GetAddress`, then `GetOrders` — multiplies round trips. Design coarse-grained methods
that return what a use case needs in one call, and prefer streaming over polling.

**Browsers.** gRPC's HTTP/2 trailers are not accessible from browser JavaScript, so
web clients use gRPC-Web through a proxy, Connect-style protocols, or plain JSON.

## Related

- [gRPC](/technology/grpc) — the most widely used modern RPC framework
- [Serialization](/concept/serialization) — how arguments become bytes
- [REST vs gRPC](/compare/rest-vs-grpc) — choosing a style for each boundary
