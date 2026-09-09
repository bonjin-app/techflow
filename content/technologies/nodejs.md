---
id: nodejs
name: Node.js
tagline: JavaScript runtime with a single-threaded event loop built for I/O-heavy servers
category: backend
tags: [Runtime, JavaScript, Backend, Event Loop]
difficulty: 2
usedFor: [backend, concurrency, rest]
prerequisites: [programming-fundamentals, http, backend]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - nodejs
  - typescript
  - rest
  - database
  - postgresql
  - concurrency
related:
  - { to: typescript, rel: USED_WITH }
  - { to: react, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: redis, rel: USED_WITH }
  - { to: websocket, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: concurrency, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: chat-system, rel: USED_IN }
  - { to: social-feed, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Node.js 24 LTS (26 Current)", confidence: high }
---

## TL;DR

Node.js runs JavaScript outside the browser on the V8 engine, with a **single-threaded
event loop** and non-blocking I/O provided by libuv. One process can juggle thousands of
concurrent connections because it never waits on a socket or file — it registers a
callback and moves on. That makes it excellent for API servers, real-time gateways and
tooling, and a poor fit for CPU-heavy work, which blocks the loop for everyone. It ships
with npm, the largest package ecosystem in existence, which is both its superpower and
its supply-chain risk.

## Practical

Most Node.js code you will write is an HTTP service, a WebSocket gateway, a background
worker, or build tooling:

- **API servers** with Express, Fastify, Hono or NestJS exposing [REST](/concept/rest)
  or [GraphQL](/technology/graphql), almost always in
  [TypeScript](/technology/typescript).
- **Real-time** servers holding many [WebSocket](/technology/websocket) or
  [SSE](/technology/sse) connections and fanning out messages via
  [Redis](/technology/redis) Pub/Sub.
- **Workers** consuming queues ([RabbitMQ](/technology/rabbitmq),
  [Kafka](/technology/kafka)) for email, image processing hand-off, webhooks.
- **Server-side rendering** for [React](/technology/react) frameworks.

```ts
import Fastify from "fastify";
import { Pool } from "pg";

const app = Fastify();
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

app.get("/users/:id", async (req) => {
  const { id } = req.params as { id: string };
  // await yields to the event loop — other requests run while the DB works
  const { rows } = await db.query("select id, name from users where id = $1", [id]);
  return rows[0] ?? app.httpErrors.notFound();
});

app.listen({ port: 3000, host: "0.0.0.0" });
```

Operationally: run one process per CPU core (cluster module, PM2, or one container per
core under [Kubernetes](/technology/kubernetes)), put [NGINX](/technology/nginx) or a
load balancer in front, set memory limits (`--max-old-space-size`), and lock
dependencies with a lockfile plus `npm audit`/provenance checks. Even-numbered releases
become LTS every October; stay on an LTS line in production.

## Deep Dive

**The event loop.** JavaScript runs on one thread. I/O (sockets, DNS, file system) is
handed to libuv, which uses the OS's async primitives (`epoll`, `kqueue`, IOCP) and a
small thread pool for operations the OS cannot do asynchronously. When work completes,
its callback is queued and run on the main thread. Timers, I/O callbacks, `setImmediate`
and microtasks (`Promise.then`) run in distinct phases; understanding that order explains
most "why did this run first" bugs.

**Blocking the loop is the cardinal sin.** A synchronous `JSON.parse` of a 50 MB body, a
tight loop, `fs.readFileSync` on a hot path, or a heavy regex stalls every connection in
the process. Measure event-loop lag; move CPU work to `worker_threads`, a separate
service, or a queue.

**Memory and GC.** V8's heap default is modest; a leak (growing arrays, unbounded caches,
listeners never removed) surfaces as rising RSS and long GC pauses. Heap snapshots and
`--inspect` are the standard tools.

**Modules and the platform.** ESM is the default direction, CommonJS is still
everywhere; current LTS lines load both interchangeably. The runtime now has a built-in
test runner, `fetch`, `WebSocket` client, watch mode, permission model and can run
TypeScript files by stripping types — reducing the tooling once required. Alternative
runtimes (Deno, Bun) implement much of the same API surface and are converging with it.

**Concurrency model in context.** Node.js offers I/O concurrency without shared-memory
threads — no data races on your own objects, but also no parallel CPU work per process.
Compare with thread-per-request or goroutine models under
[Concurrency](/concept/concurrency).

## Why

Classic thread-per-request servers dedicate an OS thread to each connection. A thread
waiting on a database or downstream API still occupies its stack and scheduler slot, so
10,000 mostly idle connections — a chat room, long-polling clients, slow mobile
networks — need 10,000 threads, and the machine spends its time context switching. For
I/O-bound work most of that capacity is spent waiting.

```sequence
title: Before — thread per request, threads sit idle while waiting on I/O
participants: Clients, Server [backend], DB [postgresql]
Clients -> Server: 1,000 concurrent requests
Server -> Server: allocate 1,000 threads (stack + context switches)
Server -> DB: 1,000 queries in flight
DB --> Server: rows (each thread wakes, finishes)
Server --> Clients: responses
Clients -> Server: connection 1,001 → thread pool exhausted, request queues
```

Node.js inverts this: one thread issues all the I/O, and the operating system notifies
it as results arrive. Idle connections cost a few kilobytes, not a thread. The trade is
that the single thread must never be kept busy for long.

```sequence
title: After — one event loop, I/O overlapped, no idle threads
participants: Clients, Node [nodejs], DB [postgresql], Redis [redis]
Clients -> Node: 1,000 concurrent requests
Node -> DB: issue 10 pooled queries (rest queue at the pool)
Node -> Redis: GET session:* for others (non-blocking)
Redis --> Node: callbacks run as each reply arrives
DB --> Node: rows → resume the awaiting handlers
Node --> Clients: responses stream out as they complete
Clients -> Node: 10,000 idle WebSocket connections
Node -> Node: ~KBs each, loop stays free until data arrives
```

The same model is why a Node.js process fits naturally as a real-time gateway: holding
many open connections and forwarding small messages is exactly what the loop is good at.

## Advantages

- Very high I/O concurrency per process with low memory per connection
- One language across browser, server, tooling and edge; shared types with TypeScript
- Enormous ecosystem (npm) and fast iteration; most SaaS APIs ship a Node.js SDK first
- Natural fit for real-time gateways, BFFs, serverless functions and streaming responses
- Strong built-in platform now: `fetch`, test runner, watch mode, worker threads, type stripping
- Predictable LTS cadence and first-class support on every cloud and container platform

## Trade-offs

- Single-threaded execution: CPU-heavy work blocks every request in the process
- No parallelism without worker threads or multiple processes; scaling is horizontal by design
- Dependency sprawl and supply-chain attacks are a real, recurring operational risk
- Dynamic typing at runtime means boundary validation is your job even with TypeScript
- Memory ceiling per process and GC pauses under heavy allocation
- Ecosystem churn: frameworks, module formats and bundlers change faster than in JVM/.NET land

## When to use

- REST/GraphQL API servers and Backend-for-Frontend layers that mostly wait on databases and other services
- Real-time systems: chat, presence, notifications, collaborative editing over WebSocket/SSE
- Teams already fluent in JavaScript/TypeScript who want one language end to end
- Serverless functions and edge handlers where cold-start size and startup time matter
- Build tooling, CLIs and developer platforms in the JS ecosystem

## When not to use

- Don't use Node.js for CPU-bound workloads (video transcoding, heavy image processing, large in-memory analytics) — use Go, Rust, JVM or a dedicated service and hand off via a queue
- When you need many-core parallelism with shared memory in one process
- For strict low-latency systems where GC pauses are unacceptable
- When your organisation's operational tooling, libraries and hiring pool are centred on another platform
- For tiny scripts where a shell or Python one-liner would do

## Real-world

Node.js is the default application tier in the [Simple Web App](/architecture/simple-web-app)
pattern: [NGINX](/technology/nginx) in front, a few Node processes per host, a
[PostgreSQL](/technology/postgresql) pool behind, and Redis for sessions. In the
[Chat System](/architecture/chat-system) it is the WebSocket gateway holding hundreds of
thousands of connections and relaying messages through Redis Pub/Sub. In a
[Social Feed](/architecture/social-feed) it typically serves as the GraphQL or REST
aggregation layer in front of feed, media and profile services written in whatever
language suits each.
