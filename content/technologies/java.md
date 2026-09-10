---
id: java
name: Java
tagline: Statically typed, JVM-hosted language built for long-lived server applications
category: languages
tags: [Language, Backend, JVM, Concurrency, Enterprise]
difficulty: 3
usedFor: [backend, concurrency, serialization]
prerequisites: [programming-fundamentals, backend]
learningPath:
  - programming-fundamentals
  - java
  - backend
  - database
  - sql
  - concurrency
  - microservices
related:
  - { to: go, rel: ALTERNATIVE_TO }
  - { to: python, rel: ALTERNATIVE_TO }
  - { to: nodejs, rel: ALTERNATIVE_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: spark, rel: USED_WITH }
  - { to: elasticsearch, rel: RELATED_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: connection-pooling, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Java 25 (LTS); 21 still widely deployed", confidence: high }
---

## TL;DR

Java is a statically typed language that compiles to bytecode and runs on the JVM — a mature
runtime with garbage collection, a profiling just-in-time compiler, and decades of tooling.
Its real product is not the syntax but that runtime: long-running server processes that get
*faster* as they run, observable memory and thread behaviour, and libraries for nearly
everything. Since Java 21 it also has virtual threads, which make the simple
thread-per-request style scale without rewriting code as callbacks or reactive streams. The
cost is start-up time, memory footprint, and a language that remains verbose next to newer
alternatives.

## Practical

Modern Java is considerably terser than its reputation. Records, `var`, pattern matching and
virtual threads cover most day-to-day server code:

```java
// Records: immutable data with equals/hashCode/toString generated
record Order(long id, String status, BigDecimal amount) {}

// Virtual threads (Java 21+): thousands of blocking tasks, no reactive rewrite
try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<Order>> pending = ids.stream()
        .map(id -> pool.submit(() -> repo.findOrder(id)))  // blocking JDBC is fine here
        .toList();

    for (Future<Order> f : pending) {
        Order o = f.get();
        var label = switch (o.status()) {          // switch as an expression
            case "paid"    -> "revenue: " + o.amount();
            case "pending" -> "awaiting capture";
            default        -> "ignored";
        };
        log.info(label);
    }
}
```

Where it shows up in real stacks:

- **Business services with long lifetimes** — order, payment, billing and inventory systems
  where the codebase outlives several teams. See [Microservices](/architecture/microservices).
- **Data infrastructure** — [Kafka](/technology/kafka),
  [Elasticsearch](/technology/elasticsearch), [Cassandra](/technology/cassandra) and
  [Spark](/technology/spark) are JVM systems, so JVM tuning knowledge transfers directly.
- **Anything with heavy concurrency and blocking IO** — the model that virtual threads
  finally made cheap. See [Concurrency](/concept/concurrency).
- **Android and desktop tooling**, plus Kotlin and Scala, which share the JVM and its
  libraries.

## Deep Dive

**The JVM is the interesting part.** Source compiles to bytecode; the JVM interprets it,
profiles what is hot, and compiles those paths to machine code with speculative
optimisations (inlining, escape analysis, branch prediction from real behaviour). A steady
Java service therefore reaches throughput a static compiler struggles to match — but only
after warm-up, which is why a freshly deployed instance is slow and why benchmarks that
measure the first thousand requests are misleading.

**Garbage collection is a tuning surface, not a mystery.** G1 is the default and balances
throughput against pause time; ZGC and Shenandoah target pauses in the low single-digit
milliseconds at some throughput cost; Parallel GC maximises throughput for batch work. The
practical rules: allocation is cheap, retention is expensive, and most "memory leaks" are
unbounded caches or collections holding references. Heap size and GC choice belong in the
deployment configuration, not in code.

**Containers changed the defaults.** The JVM reads cgroup limits, so heap sizing inside a
container should be expressed as a percentage of the container's memory rather than a fixed
value — and remember the JVM also uses non-heap memory (metaspace, thread stacks, direct
buffers) that a memory limit counts. Ignoring that is the usual cause of a container being
OOM-killed while the heap graph looks healthy. See [Linux](/technology/linux).

**Virtual threads change the concurrency calculus.** Historically each request needed a
platform thread — about a megabyte of stack plus an OS scheduling entity — so servers used a
bounded pool that any blocking call could exhaust. That pushed people to reactive
frameworks, which scaled but made debugging painful. Virtual threads are scheduled by the
JVM onto a few carrier threads, so a blocking call parks cheaply and a million concurrent
tasks are plausible. What did *not* change: a
[Connection Pooling](/concept/connection-pooling) ceiling or the database's capacity is now
the bottleneck instead of the thread pool.

**Backward compatibility is a real feature.** Code compiled for older versions generally
keeps running, which is why decade-old systems are trusted to the platform — and why Java
carries visible history: checked exceptions, type erasure, `null` in the type system, APIs
predating the conventions that replaced them. Releases land every six months with an LTS
every two years, so the practical decision is which LTS to standardise on.

**Start-up and footprint are being worked on.** Class-data sharing, ahead-of-time caches and
GraalVM native images cut start-up from seconds to milliseconds at the cost of build
complexity and some dynamic-reflection limits — relevant for serverless and CLI use, mostly
irrelevant for a service that runs for weeks.

## Why

Before managed runtimes, a server program was compiled per operating system and processor,
managed its own memory, and had no portable concurrency or standard library to speak of.
Correctness problems were memory problems, and shipping to two platforms meant maintaining
two builds.

```steps
title: Before — compile per platform, manage memory by hand
Write the service in a language compiled directly to one platform's machine code
Maintain a separate build, and separate bugs, for each target OS
Allocate and free memory manually; a missed free leaks, a double free corrupts
Threading, sockets and text encoding come from platform-specific libraries
Profiling and monitoring mean platform-specific tooling
```

Java's bet was to compile to portable bytecode and let a runtime handle memory, threads and
optimisation — so the same artifact runs anywhere the JVM does, and the runtime learns from
actual execution.

```steps
title: After — one artifact on a managed, self-optimising runtime
Compile once to bytecode; run it on any JVM platform [java]
Garbage collection removes the whole class of manual-memory bugs
The JIT profiles the running process and optimises the hot paths it observes
One standard library and one concurrency model, plus a vast dependency ecosystem
Heap, threads and GC are inspectable in production with standard tooling [observability]
```

Those trade-offs still describe the language today: you accept a runtime beneath your code
and get memory safety, portability, peak throughput and observability in exchange.

## Advantages

- Static types plus excellent IDE tooling make large-scale refactoring safe
- JIT-compiled peak throughput for long-running processes, with mature GC options
- Virtual threads make simple blocking code scale to very high concurrency
- Deep runtime observability: JFR, heap and thread dumps, mature profilers
- Strong backward compatibility, so upgrades are usually feasible rather than rewrites
- Enormous ecosystem, and much data infrastructure is itself JVM-based
- Multiple production-grade implementations and vendors; the ecosystem is not single-sourced

## Trade-offs

- Start-up latency and warm-up mean poor fit for short-lived processes and scale-to-zero
- Memory footprint is high compared with Go or Rust for equivalent services
- The language is still verbose, and older libraries carry pre-modern idioms
- `null` in the type system remains a major source of runtime failure
- Framework conventions (annotations, reflection, injection) can obscure control flow
- GC and JVM tuning is real expertise you occasionally need at short notice
- Six-month releases mean the "current Java" people know varies widely across teams

## When to use

- Long-lived business systems where type safety and refactorability matter more than terseness
- High-concurrency services with blocking IO, especially on Java 21+
- Workloads that run continuously, so JIT warm-up is amortised
- Teams already operating JVM data infrastructure and its tuning knowledge
- Domains where the required libraries or vendor SDKs are strongest on the JVM

## When not to use

- Don't use it for short-lived CLIs, serverless functions or scale-to-zero workloads — [Go](/technology/go) or a native binary starts far faster
- Don't use it for small scripts, data exploration or ML work; [Python](/technology/python) has the ecosystem
- Don't use it where memory per instance is the binding constraint
- Don't use it for browser or edge-rendered frontends — that is [TypeScript](/technology/typescript) with [Node.js](/technology/nodejs)
- Don't pick it when the team has no JVM operational experience and no appetite to acquire it
- Don't reach for a reactive framework on modern Java without measuring first; virtual threads removed the usual reason

## Real-world

Java's typical position is the service layer of systems that must not be rewritten: a
[Payment System](/architecture/payment-system) where correctness outweighs startup latency,
an [E-commerce](/architecture/e-commerce) order and inventory core, or the internal services
of a large [Microservices](/architecture/microservices) platform behind Spring Boot, Quarkus
or Micronaut. It is equally present one layer down: running [Kafka](/technology/kafka)
brokers, [Elasticsearch](/technology/elasticsearch) nodes or [Spark](/technology/spark)
executors means operating JVMs whether or not your own code is Java, so heap sizing, GC
choice and thread dumps become required skills. The migrations worth doing in 2026 are
mundane: move to a current LTS for virtual threads, drop reactive plumbing that existed only
for thread economy, and express heap limits as a share of the container.
