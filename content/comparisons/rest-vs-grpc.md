---
id: rest-vs-grpc
name: REST vs gRPC
tagline: Human-readable JSON over plain HTTP, or typed binary contracts and streams over HTTP/2
category: decision
tags: [API, RPC, Protocol, Microservices, Decision]
difficulty: 3
subjects: [rest, grpc]
related:
  - { to: http, rel: RELATED_TO }
  - { to: rpc, rel: RELATED_TO }
  - { to: serialization, rel: RELATED_TO }
  - { to: microservices, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

[REST](/concept/rest) sends JSON (usually) over ordinary [HTTP](/concept/http): any
language, browser, proxy or `curl` can talk to it, and the payload is readable by a human.
[gRPC](/technology/grpc) is a [remote procedure call](/concept/rpc) framework: you define
services and messages in a `.proto` file, generate client and server code, and exchange
compact binary Protocol Buffers over HTTP/2, with bidirectional streaming built in. For
anything a browser or third party calls directly, REST is the pragmatic default. For
chatty, latency-sensitive service-to-service traffic inside a backend — especially in a
polyglot [microservices](/architecture/microservices) estate — gRPC's typed contracts,
smaller payloads and streaming are a real advantage. Many systems use both: gRPC inside,
REST at the edge.

## Comparison

```compare
Feature             | REST [rest]                                          | gRPC [grpc]
Contract            | Informal; OpenAPI optional                            | Mandatory .proto schema, generated code in ~12 languages
Payload             | JSON text (readable, verbose)                          | Protocol Buffers binary (compact, needs the schema to read)
Transport           | HTTP/1.1 or HTTP/2, one request → one response         | HTTP/2 only: multiplexed, unary or streaming both ways
Browser support     | Native (fetch, XHR)                                    | Only via grpc-web and a proxy
Debuggability       | curl, browser dev tools, logs are readable             | Needs grpcurl / reflection; binary on the wire
Latency & size      | Higher parse cost, larger bodies                      | Small messages, fast (de)serialisation
Streaming           | Bolt on SSE or WebSocket                               | Server, client and bidirectional streams in the spec
Error model         | HTTP status codes plus a JSON body you design          | Standard status codes and typed error details
Caching / CDN       | GET responses cache everywhere                         | Effectively none at intermediaries
Deadlines, retries  | Per client library, ad hoc                             | Deadlines propagate; retry policy in service config
```

## Decision

```decision
? Is the caller a browser, a mobile app you do not control, or an external partner?
  YES -> ? Can you put a grpc-web or REST translation layer in front and is that worth it?
    YES -> gRPC [grpc]
    NO -> REST [rest]
  NO -> ? Is this internal service-to-service traffic with high call volume or tight latency budgets?
    YES -> ? Do you need streaming (live updates, large result sets, duplex) between services?
      YES -> gRPC [grpc]
      NO -> ? Are teams polyglot and would a generated, versioned contract remove integration bugs?
        YES -> gRPC [grpc]
        NO -> REST [rest]
    NO -> REST [rest]
```

## When REST

- Public APIs, partner integrations and anything a browser calls directly without a proxy.
- Resource-oriented CRUD where HTTP semantics (verbs, status codes, `ETag`,
  `Cache-Control`) carry real meaning and edge caching via a [CDN](/concept/cdn) matters.
- Small teams and small systems: no build step, no schema registry, no proxy — just JSON.
- Debuggability is a priority: support staff can read a request in a log or replay it with
  `curl`.
- The transport must traverse arbitrary proxies and firewalls; plain HTTP/1.1 always does.

## When gRPC

- Dense internal traffic between services — dozens of calls per user request — where
  JSON parsing and header overhead become visible on the CPU and latency profile.
- You want the compiler to catch contract mismatches: every service and client is
  generated from the same `.proto`, in Go, Java, Python, Node or C++.
- Streaming is part of the domain: pushing progress, tailing logs, feeding a model, or
  long-lived bidirectional sessions between services.
- Cross-cutting behaviours — deadlines, cancellation, retries, load-balancing policy,
  auth metadata — should be uniform across all languages via interceptors.
- You already run an [API gateway](/concept/api-gateway) or mesh that can transcode gRPC to
  REST/JSON for the few external callers.

## Deep Dive

**On the wire.** A REST call is text end to end. Headers repeat on every request (HTTP/1.1)
and the body is JSON that must be tokenised, validated and mapped into objects. Each
request typically occupies a connection until the response arrives, so concurrency means
more connections.

```sequence
title: REST — JSON over HTTP, one request per connection slot
participants: Order Service [backend], Inventory API [rest], DB [postgresql]
Order Service -> Inventory API: GET /items/42/stock  Accept: application/json
Inventory API -> DB: SELECT qty
Inventory API --> Order Service: 200 OK {"itemId":42,"qty":17}   (~120 bytes + headers)
Order Service -> Inventory API: POST /reservations {"itemId":42,"qty":2}
Inventory API -> DB: UPDATE … RETURNING
Inventory API --> Order Service: 201 Created {"reservationId":"r-9"}
```

gRPC runs over HTTP/2: one TCP connection carries many concurrent *streams*, headers are
compressed (HPACK), and messages are length-prefixed protobuf frames. The client stub and
server skeleton are generated, so `client.ReserveStock(req)` is a normal typed method call
with a deadline attached. Streaming RPCs keep a stream open and exchange many messages.

```sequence
title: gRPC — multiplexed HTTP/2, protobuf frames, a server stream
participants: Order Service [backend], Inventory gRPC [grpc], DB [postgresql]
Order Service -> Inventory gRPC: GetStock(item_id=42)  deadline=200ms  [stream 1]
Order Service -> Inventory gRPC: ReserveStock(item_id=42, qty=2)         [stream 3]
Inventory gRPC -> DB: SELECT qty
Inventory gRPC --> Order Service: StockReply{qty:17}  (~6 bytes)         [stream 1]
Inventory gRPC -> DB: UPDATE … RETURNING
Inventory gRPC --> Order Service: ReserveReply{id:"r-9"}                 [stream 3]
Order Service -> Inventory gRPC: WatchStock(item_id=42)   server-streaming
Inventory gRPC -> Order Service: StockEvent{qty:15}
Inventory gRPC -> Order Service: StockEvent{qty:14}
Order Service -> Inventory gRPC: cancel (deadline exceeded / client done)
```

**Serialisation.** Protobuf encodes field *numbers*, not names, as varints — a 32-bit
integer field costs two or three bytes instead of `"quantity": 17,`. Decoding is a
straight pass over the buffer into generated structs. The price is that the bytes are
meaningless without the schema, which is why gRPC tooling relies on *server reflection*
and why field numbers must never be reused. See [Serialization](/concept/serialization).

**Contract evolution.** REST evolves by convention — add a field, keep old ones, bump
`/v2` when you must. Protobuf has explicit rules: adding fields is safe, renaming is safe
(numbers matter, names do not), removing requires reserving the number. Break the rules and
old clients silently read garbage; follow them and rolling upgrades across hundreds of
services are routine.

**Load balancing and connections.** Because gRPC multiplexes many calls over one long-lived
connection, a plain L4 [load balancer](/concept/load-balancing) pins all of a client's
traffic to a single backend. You need an L7 proxy that understands HTTP/2, or client-side
balancing with service discovery. REST over HTTP/1.1 spreads naturally because each request
may open a new connection — less efficient, easier to balance.

**Deadlines and cancellation.** A gRPC deadline travels with the call; when the caller
gives up, every downstream server sees the cancellation and can stop work. REST has a
client-side timeout and nothing more — the server keeps computing a response nobody will
read. In deep call chains this difference shows up directly in tail latency and wasted
capacity.

**The browser gap.** Browsers cannot open raw HTTP/2 streams with trailers, so gRPC needs
grpc-web plus a proxy (Envoy) that translates. This is workable, but it means the edge of
almost every system is still REST or GraphQL — see [REST vs GraphQL](/compare/rest-vs-graphql).

## Related

- [RPC](/concept/rpc) — the model gRPC implements
- [Serialization](/concept/serialization) — why protobuf is smaller and stricter than JSON
- [HTTP](/concept/http) — HTTP/1.1 vs HTTP/2 underlies most of these differences
- [Microservices](/architecture/microservices) — where gRPC-inside, REST-outside is common
- [Timeout](/pattern/timeout) — deadlines are the gRPC form of this pattern
