---
id: rust
name: Rust
tagline: Compiled language with compile-time memory and thread safety, and no garbage collector
category: languages
tags: [Language, Systems, Concurrency, Performance, Memory Safety]
difficulty: 4
usedFor: [concurrency, backend, serialization]
prerequisites: [programming-fundamentals, concurrency]
learningPath:
  - programming-fundamentals
  - concurrency
  - race-condition
  - rust
  - http
  - backend
  - grpc
related:
  - { to: go, rel: ALTERNATIVE_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: grpc, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: iot-telemetry, rel: USED_IN }
  - { to: video-streaming, rel: USED_IN }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Rust 1.8x–1.9x stable (six-week releases); 2024 edition", confidence: medium }
---

## TL;DR

Rust is a compiled systems language that gives you C-level performance without a garbage
collector and without the memory bugs. A compile-time **ownership** model tracks who owns
each value and how long references to it live, so use-after-free, double-free, buffer
overruns and data races between threads become compile errors instead of production
incidents. You pay for that in learning curve and compile times. It is the usual choice
when a component must be both fast and correct: proxies, databases, codecs, embedded
firmware and the native cores under Python and JavaScript libraries.

## Practical

Rust shows up in a narrower set of places than [Go](/technology/go) or
[Python](/technology/python), but the places are specific:

- **Latency-critical network components** — proxies, edge functions and protocol
  implementations holding many connections with a tight tail-latency budget.
- **Data and storage engines** — columnar engines, vector indexes, stream processors; where
  per-row overhead multiplied by billions of rows is the whole cost model.
- **Native cores for other languages** — a Rust crate exposed to
  [Python](/technology/python) via PyO3 or to Node via napi-rs is the standard way to fix a
  hot loop without rewriting the product.
- **Embedded and IoT firmware** — `no_std` builds with no allocator, on devices that report
  into an [IoT Telemetry](/architecture/iot-telemetry) pipeline.
- **WebAssembly** — Rust is the best-supported source language for wasm modules.

```text
// axum handler: shared state, typed extraction, explicit error mapping
async fn get_order(
    State(app): State<Arc<App>>,          // Arc = shared ownership across tasks
    Path(id): Path<i64>,
) -> Result<Json<Order>, ApiError> {
    if let Some(hit) = app.cache.get(id).await {
        return Ok(Json(hit));             // no copy of the body, no GC pause
    }
    let order = sqlx::query_as!(Order, "select * from orders where id = $1", id)
        .fetch_optional(&app.db)
        .await?                           // `?` converts sqlx::Error into ApiError
        .ok_or(ApiError::NotFound)?;

    app.cache.insert(id, order.clone(), Duration::from_secs(60)).await;
    Ok(Json(order))
}
```

`cargo` is the whole toolchain: build, test, benchmark, docs, dependencies and lockfile.
Add `clippy` (lints) and `rustfmt`; use `cargo deny` or `cargo audit` to watch the
dependency tree, which grows quickly.

## Deep Dive

**Ownership and borrowing.** Every value has exactly one owner; when the owner goes out of
scope the value is dropped. You can lend a value out as an immutable reference (`&T`, many
at once) or a mutable one (`&mut T`, exactly one, and never alongside an immutable
reference). The compiler's borrow checker proves those rules statically using lifetimes.
This single mechanism eliminates dangling pointers, iterator invalidation and — because a
`&mut` is exclusive — most [race conditions](/concept/race-condition). Shared mutable state
is still possible, but it must be explicit: `Arc<Mutex<T>>`, channels, or atomics.

**`Send`, `Sync` and fearless concurrency.** Two marker traits describe whether a type may
move between threads or be shared by reference. Because they are checked at compile time,
passing a non-thread-safe handle into a thread pool simply does not compile. This is the
concrete difference from Go, where a data race is a runtime bug that the race detector may
or may not catch.

**No garbage collector.** Memory is freed deterministically at scope exit, so there are no
GC pauses and no heap headroom multiplier; tail latency is dominated by your own code and
the allocator. Footprint is typically a fraction of a JVM or Go equivalent, which matters
for dense deployments and for [connection pooling](/concept/connection-pooling) at the edge.

**Errors and nullability are in the type system.** `Option<T>` replaces null and
`Result<T, E>` replaces exceptions; both must be handled to compile, with `?` for
propagation. Enums with pattern matching make invalid states unrepresentable.

**Async is powerful and sharp.** `async`/`await` compiles to state machines with no runtime
included; you choose an executor (Tokio in practice). Async Rust then adds its own hard
concepts — pinning, `Send` bounds across `await` points, cancellation safety — and blocking
work inside a task must be moved to a blocking pool explicitly.

**Compile times and ecosystem shape.** Monomorphised generics and heavy optimisation make
release builds slow; large workspaces take minutes. There is no stable ABI, so plugins and
cross-language linking go through the C ABI, and some domains (enterprise integrations, ML
training) are thin on crates.

## Why

Before Rust the choice was framed as a dilemma: manual memory management gave you speed and
a permanent supply of memory-safety vulnerabilities, while a managed runtime gave you safety
and a garbage collector you could not schedule around.

```sequence
title: Before — the C/C++ bug that ships, or the GC pause that spikes
participants: Client, Service [backend], Allocator [concurrency], Monitoring [observability]
Client -> Service: 50k req/s, p99 budget 5 ms
Service -> Allocator: manual malloc/free in hot path
Allocator --> Service: use-after-free on an error path
Service --> Monitoring: crash / CVE (or, in a GC language, 40 ms pause)
Monitoring --> Service: page on-call, patch, repeat
```

Rust moves that class of failure to the left, into the compiler. The borrow checker rejects
the aliasing that causes use-after-free and the sharing that causes data races, and because
memory is reclaimed at scope exit there is no collector to pause the process. What used to
be a production incident is now a build failure on a developer's laptop.

```sequence
title: After — the same class of bug becomes a compile error
participants: Dev, Compiler [rust], CI [github-actions], Service [backend], Monitoring [observability]
Dev -> Compiler: cargo build (aliasing + Send violations)
Compiler --> Dev: E0502 / E0277 — rejected before merge
Dev -> Compiler: fix ownership, cargo build
Compiler --> CI: binary, no GC runtime
CI -> Service: deploy
Service --> Monitoring: p99 flat, memory flat, no pause spikes
```

The trade is visible and deliberate: you spend time arguing with the compiler up front
instead of debugging heisenbugs later. That is an excellent deal for a proxy or a storage
engine and a poor one for a CRUD form.

## Advantages

- Memory safety and freedom from data races proven at compile time, without a GC
- Predictable latency and low memory footprint; no collector pauses to design around
- Expressive type system (enums, traits, generics) makes invalid states hard to represent
- `cargo` gives one toolchain for build, test, bench, docs and dependency locking
- Excellent C interop and first-class WebAssembly and embedded (`no_std`) targets
- Errors and absence are explicit values, so failure paths are hard to forget

## Trade-offs

- Steep learning curve; ownership, lifetimes and async each take real time to internalise
- Slow release compile times slow the inner loop on large workspaces
- Async Rust adds pinning, `Send` bounds and cancellation subtleties on top of the basics
- Refactoring can cascade through lifetimes and trait bounds far from the change
- Ecosystem gaps in enterprise integrations and ML training relative to Java or Python
- No stable ABI; plugin architectures and dynamic linking need C-ABI boundaries
- `unsafe` blocks and dependency trees still let memory bugs in — safety is not absolute

## When to use

- Components where both tail latency and correctness are hard requirements
- Per-record hot paths: parsers, codecs, serialisers, storage and query engines
- Replacing a hot function in a Python or Node service without rewriting the service
- Embedded, firmware and edge targets with no runtime and tight memory budgets
- Long-running processes where GC pauses or memory growth have already caused incidents
- Security-sensitive code that parses untrusted input

## When not to use

- Don't use Rust for ordinary CRUD services where [Go](/technology/go) or a mainstream framework ships faster
- For data science, notebooks and ML experimentation — that is [Python](/technology/python)'s ground
- When the team is small, junior or borrowed and cannot absorb the ramp-up
- For throwaway scripts, internal tools and prototypes whose lifetime is weeks
- When you need a mature vendor SDK that only exists for the JVM or Python

## Real-world

Rust tends to be introduced surgically rather than as a company-wide language. In an
[Analytics Pipeline](/architecture/analytics-pipeline) it is common under the covers of the
stream processors and columnar engines that touch every row, and as the language of custom
[Kafka](/technology/kafka) consumers where per-message overhead dominates. In
[Video Streaming](/architecture/video-streaming) it appears in transcoding and packaging
components and in edge proxies in front of a [CDN](/concept/cdn). In
[IoT Telemetry](/architecture/iot-telemetry) the same language can run on the device
(`no_std` firmware) and in the ingest gateway terminating thousands of
[TLS](/concept/tls) connections. Teams also reach for it to fix one profiled hot path —
which is why so many Python and JavaScript packages now ship a Rust core.
