---
id: webassembly
name: WebAssembly
tagline: A portable compilation target running sandboxed near-native code in browsers and servers
category: frontend
tags: [Frontend, Runtime, Performance, Portability, Sandbox]
difficulty: 4
usedFor: [web-performance, rendering-strategies, serialization]
prerequisites: [web-fundamentals, programming-fundamentals, bundling]
learningPath:
  - programming-fundamentals
  - web-fundamentals
  - bundling
  - webassembly
related:
  - { to: rust, rel: USED_WITH }
  - { to: web-performance, rel: RELATED_TO }
  - { to: bundling, rel: USED_WITH }
  - { to: serverless, rel: RELATED_TO }
  - { to: cdn, rel: USED_WITH }
  - { to: sqlite, rel: USED_WITH }
  - { to: offline-first, rel: RELATED_TO }
  - { to: typescript, rel: ALTERNATIVE_TO }
meta: { lastReviewed: 2026-09-21, version: "Wasm 2.0; component model still stabilising", confidence: medium }
---

## TL;DR

WebAssembly is a binary instruction format that browsers and standalone runtimes execute in
a sandbox at close to native speed. It is a *compilation target*, not a language: you write
[Rust](/technology/rust), C, Go or Zig and emit a `.wasm` module.

Its two useful properties are speed and isolation. A module cannot read a file, open a
socket or touch the DOM unless the host explicitly hands it a function that does — which
makes it as interesting for running untrusted code on a server as for making the browser
fast.

## Practical

- **In the browser** — the module is fetched and instantiated like any other asset, and
  called from JavaScript. Use it for the part of the work that is actually CPU-bound: image
  and video processing, compression, cryptography, a parser, a game engine, a spreadsheet
  recalculation, [SQLite](/technology/sqlite) running entirely client-side.
- **On the server** — runtimes such as Wasmtime, Wasmer and WasmEdge execute modules outside
  a browser. WASI defines the syscall-ish interface (files, clocks, sockets) that a module
  can ask for.
- **At the edge** — several [CDN](/concept/cdn) platforms run customer code as Wasm because a
  module starts in microseconds, which makes per-request isolation affordable in a way a
  container never is.
- **As a plugin format** — a host application can load untrusted extensions with a capability
  list instead of trusting them with the process.

```steps
title: What crossing the boundary costs
JS calls Wasm | a few nanoseconds — effectively a function call
Numbers | passed directly; this is the fast path
Strings and objects | copied through linear memory, or marshalled — this is the slow path
DOM access [rendering-strategies] | not available; must call back out into JavaScript
Chatty designs | lose to plain JS because the crossings dominate the work
```

## Deep Dive

**Linear memory is the model.** A module gets one contiguous `ArrayBuffer` and addresses it
with integers. There is no shared object graph with the host — a string is bytes at an
offset with a length, and someone has to agree what the encoding is. Every high-level
binding you use (`wasm-bindgen` and friends) is generating that marshalling code for you,
and its cost is the reason the boundary rewards coarse calls over chatty ones.

**The component model is what is actually changing.** Core Wasm only speaks integers and
floats. The component model adds an interface description (WIT) so modules can exchange
records, strings and lists, and compose with each other regardless of source language. It is
the difference between "a fast function you call from JavaScript" and "a portable unit of
software", and it is the part of the ecosystem still settling — treat versions and tooling
here as moving.

**Threads and GC arrived late.** Shared memory needs `SharedArrayBuffer`, which needs
cross-origin isolation headers, which is a deployment constraint rather than a code one. The
GC proposal lets garbage-collected languages target Wasm without shipping their own
collector in the module — the reason a Kotlin or Java module used to be megabytes.

**Size is a real constraint.** A Rust module with no runtime can be tens of kilobytes; one
that pulls in formatting, panics and an allocator is hundreds. Languages with a runtime (Go's
default toolchain, anything with a GC before the GC proposal) start in the megabytes, which
often cancels the performance win over the network.

## Why

JavaScript is fast for what it is, but its performance is not predictable: types are
discovered at runtime, the JIT deoptimises when assumptions break, and a workload that
allocates heavily fights the garbage collector at the worst moment. For most application
code this does not matter. For a decoder, a solver or a simulation, it does.

```sequence
title: A CPU-bound task in the browser
participants: User, JS [web-performance], Wasm [webassembly], Server [backend]
User -> JS: edit a 40MP image
JS -> Server: upload, process, download
Server --> JS: result, seconds later and a round trip away
User -> JS: edit again
JS -> Wasm: same filter, locally
Wasm --> JS: result in tens of milliseconds, no upload
```

The second path also keeps the image on the user's machine, which is frequently the more
important of the two wins.

## Advantages

- Predictable near-native speed for CPU-bound work, without a JIT warm-up cliff
- Deny-by-default sandbox: no capability the host has not explicitly granted
- One compiled artefact runs in browsers, on servers and at the edge
- Start-up measured in microseconds, which makes per-request isolation practical
- Lets existing C/C++/Rust libraries reach the browser without a rewrite
- Language-agnostic: the team's choice of source language stops being a platform decision

## Trade-offs

- No DOM access; every UI interaction is a call back into JavaScript
- The host boundary copies anything that is not a number, so chatty APIs are slow
- Module size can wipe out the speed win on a first visit, especially for runtime-heavy languages
- Debugging is worse than JavaScript: source maps exist but the experience is thinner
- The component model, WASI versions and tooling are still moving under you
- Another toolchain in the build, and another artefact to version and cache

## When to use

- A measurably CPU-bound path in the browser: codecs, compression, crypto, CAD, simulation
- Porting an existing native library to the web instead of reimplementing it
- Running untrusted or third-party code — plugins, user scripts, tenant logic — inside a process
- Edge or serverless workloads where container cold starts dominate the request
- Client-side processing that keeps user data off the server

## When not to use

- Don't use it for DOM-heavy UI work; the boundary crossings cost more than the work saved
- Don't reach for it before profiling — most slow pages are network and layout, not compute
- Don't ship a multi-megabyte module to shave milliseconds off a task users run once
- Don't pick it for straightforward CRUD server code, where a normal runtime is simpler and better supported
- Don't assume a language with a garbage collector produces a small module today

## Real-world

Design and media tools run their pixel and geometry work as Wasm so that editing stays local
and immediate. Database engines compiled to Wasm let an application query a real SQL engine
in the browser, which makes genuinely [offline-first](/pattern/offline-first) applications
possible. Edge platforms use it as the isolation unit for customer code, trading container
start-up for microseconds. Plugin systems in editors and proxies use it to run extensions
that the host does not have to trust. The common thread is not raw speed — it is that a
sandbox with a capability list is cheaper than a process.
