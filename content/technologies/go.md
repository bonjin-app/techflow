---
id: go
name: Go
tagline: Compiled, statically typed language whose goroutines make concurrent servers cheap
category: languages
tags: [Language, Backend, Concurrency, Compiled]
difficulty: 2
usedFor: [backend, concurrency, rest, rpc]
prerequisites: [programming-fundamentals, http, backend, concurrency]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - concurrency
  - go
  - docker
  - kubernetes
  - observability
related:
  - { to: nodejs, rel: ALTERNATIVE_TO }
  - { to: python, rel: ALTERNATIVE_TO }
  - { to: rust, rel: ALTERNATIVE_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: grpc, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: kubernetes, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
  - { to: multi-tenant-saas, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Go 1.26+ (six-month release cadence, Go 2024/2025 language changes shipped in minor releases)", confidence: medium }
---

## TL;DR

Go is a small, compiled, statically typed language designed for network servers. Its
headline feature is the **goroutine**: a function started with `go f()` that costs a few
kilobytes of stack, so one process can keep hundreds of thousands of operations in flight
without an OS thread per request. Builds produce a single static binary with no runtime to
install, which is why most container-era infrastructure — Docker, Kubernetes, Prometheus,
Terraform — is written in it. The language deliberately omits features to keep large
codebases boring and readable.

## Practical

Where Go actually shows up in projects:

- **HTTP and RPC services** — `net/http` in the standard library is production-grade; most
  teams add only a router. For service-to-service calls, [gRPC](/technology/grpc) has
  first-class Go support. See [RPC](/concept/rpc).
- **Infrastructure and CLI tools** — a static binary cross-compiled for
  linux/amd64 and linux/arm64 drops into a `scratch` container image of a few megabytes.
  See [Docker](/technology/docker).
- **Kubernetes controllers and operators** — the whole ecosystem's client libraries are Go.
- **Data plumbing and agents** — sidecars, log shippers, metrics exporters, webhook
  receivers: things that must be small, fast to start and boring to operate.

```go
// A handler that fans out two dependent calls and respects the caller's deadline.
func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 300*time.Millisecond)
	defer cancel()

	var order Order
	var items []Item
	g, ctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { order, err = s.orders.Get(ctx, id(r)); return })
	g.Go(func() (err error) { items, err = s.items.List(ctx, id(r)); return })
	if err := g.Wait(); err != nil {
		http.Error(w, "upstream failed", http.StatusBadGateway) // one failure cancels the other
		return
	}
	json.NewEncoder(w).Encode(response{order, items})
}
```

Day to day you will use `go test ./...` (table-driven tests, no framework), `go vet`,
`go test -race`, `gofmt` (there is one style and no debate), and `go mod` for dependencies.

## Deep Dive

**The scheduler.** The runtime multiplexes goroutines (G) onto OS threads (M) across
logical processors (P), with work stealing between run queues. A goroutine that blocks on
network I/O is parked and its thread picks up other work; a goroutine that blocks on a
*syscall* hands its P to another thread. Since Go 1.25 `GOMAXPROCS` is container-aware, so
a pod with a 0.5 CPU limit no longer schedules as if it owned the whole node.

**Channels and the memory model.** Channels are typed queues with optional buffering; the
idiom is "share memory by communicating". They are not free — a channel send is a lock plus
a scheduler hand-off — and plain `sync.Mutex` is often faster for shared state. Go has a
documented memory model and a race detector, but it does **not** prevent data races at
compile time the way [Rust](/technology/rust) does. See
[Race Condition](/concept/race-condition).

**Garbage collection.** A concurrent mark-and-sweep collector tuned for latency rather than
throughput: sub-millisecond stop-the-world pauses are normal, at the cost of extra CPU and
heap headroom (`GOGC`, `GOMEMLIMIT`). Recent releases have been rolling out a redesigned
collector with better memory locality. There is no generational GC and no manual control,
so allocation-heavy hot paths are optimised by allocating less, not by tuning knobs.

**Interfaces and errors.** Interfaces are satisfied structurally — a type never declares
that it implements one — which keeps packages loosely coupled. Errors are ordinary values
returned alongside results, wrapped with `%w` and inspected with `errors.Is`/`errors.As`.
The result is explicit but verbose: `if err != nil` is roughly one line in twenty.

**Generics exist but are modest.** Type parameters landed in 1.18 and generic type aliases
in 1.24. They cover containers and helpers, not the type-level programming you would do in
Rust or TypeScript. Much library code still uses `any` plus reflection.

## Why

A server's job is mostly waiting: on a database, on a cache, on another service. The
classic model gives each request an OS thread, and an OS thread costs a megabyte of stack
plus a kernel context switch. Under load you either run out of memory or spend your CPU
switching, so you cap the pool — and once the pool is full, new requests queue behind
requests that are themselves only waiting.

```sequence
title: Before — one OS thread per in-flight request
participants: Client, Pool [backend], DB [postgresql], Payments [http]
Client -> Pool: 200 concurrent requests
Pool -> Pool: 200 threads × ~1 MB stack
Pool -> DB: query (blocks a thread for 40 ms)
Pool -> Payments: POST /charge (blocks a thread for 800 ms)
DB --> Pool: rows
Payments --> Pool: 201
Pool --> Client: 152 OK, 48 rejected — pool exhausted
```

Go moves the waiting into userspace. Each request gets a goroutine with a small, growable
stack; when it blocks on I/O the runtime parks it and reuses the thread. The number of OS
threads stays close to the number of CPU cores no matter how many requests are outstanding,
and `context` propagates deadlines and cancellation down the whole call tree.

```sequence
title: After — goroutines parked on I/O, threads stay near core count
participants: Client, Server [go], Runtime [concurrency], DB [postgresql], Payments [http]
Client -> Server: 200 concurrent requests
Server -> Runtime: go handle(req) × 200 (~4 KB stacks)
Runtime -> DB: query
Runtime -> Payments: POST /charge
Runtime --> Runtime: parked goroutines, 8 OS threads busy
DB --> Runtime: rows
Payments --> Runtime: 201
Server --> Client: 200 OK, memory flat
```

The same property makes Go a good fit for anything fan-out shaped: crawlers, batch
importers, proxies, and sidecars that hold many idle connections.

## Advantages

- Cheap concurrency: goroutines and `context` make fan-out, timeouts and cancellation routine
- Single static binary — trivial containers, no interpreter or JVM to provision
- Fast compilation and a fast, dependency-free test runner keep feedback loops short
- Strong standard library (HTTP, TLS, JSON, crypto, profiling) reduces third-party risk
- One canonical formatter and a small feature set make unfamiliar code readable
- Excellent built-in tooling: `pprof`, execution tracer, race detector, benchmarks

## Trade-offs

- Verbose error handling; no exceptions, no `?` operator, lots of `if err != nil`
- Generics are limited, so libraries still fall back to `any` and reflection
- Garbage collection means tail-latency jitter and higher memory headroom than Rust or C++
- Nothing stops a data race at compile time — the race detector only finds what tests exercise
- `nil` interfaces, unbuffered-channel deadlocks and leaked goroutines are common bugs
- Weak fit for CPU-bound numeric or ML work: the library ecosystem is in [Python](/technology/python)

## When to use

- HTTP/gRPC services that are I/O-bound and need predictable latency under concurrency
- Infrastructure components, agents, operators and CLIs shipped as binaries
- Teams that rotate people between services and value uniformity over expressiveness
- Workloads where startup time matters (serverless, short-lived jobs, sidecars)
- Replacing a thread-per-request service that has hit a connection or memory ceiling

## When not to use

- Don't use Go for data science, ML training or notebook-driven analysis — use [Python](/technology/python)
- When you need hard real-time or zero-GC guarantees, reach for [Rust](/technology/rust)
- For rich domain modelling with algebraic types and exhaustive matching, Go will fight you
- When the team's productivity depends on an existing framework ecosystem (Rails, Django, Spring)
- For browser or heavily UI-driven code, where [TypeScript](/technology/typescript) is the native choice

## Real-world

Go occupies a specific niche: the layer between the network and the data store. In a
[Microservices](/architecture/microservices) deployment it is a common choice for the
services behind the [API Gateway](/concept/api-gateway), for
[Sidecar](/pattern/sidecar) proxies, and for the control-plane operators that reconcile
[Kubernetes](/technology/kubernetes) state. In a
[Multi-tenant SaaS](/architecture/multi-tenant-saas) backend its cheap concurrency suits
per-tenant background workers and webhook fan-out. It is also the implementation language
of much of the tooling elsewhere in this graph — [Prometheus](/technology/prometheus),
[Terraform](/technology/terraform) and the
[OpenTelemetry](/technology/opentelemetry) Collector are all Go programs, which is why
their operational shape (one binary, one config file, a `/metrics` endpoint) feels so
similar. If you are choosing between it and Python for a new backend, see
[Go vs Python](/compare/go-vs-python).
