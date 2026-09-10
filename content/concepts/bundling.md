---
id: bundling
name: Bundling
tagline: Turn a module graph into the fewest bytes a browser needs to render this page
category: frontend
tags: [Frontend, Build Tools, Performance, JavaScript]
difficulty: 3
prerequisites: [programming-fundamentals, typescript]
learningPath:
  - programming-fundamentals
  - typescript
  - react
  - bundling
  - web-performance
  - cdn
related:
  - { to: typescript, rel: RELATED_TO }
  - { to: nextjs, rel: RELATED_TO }
  - { to: web-performance, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: routing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A bundler follows the `import` statements from your entry points, builds a graph of every
module the application can reach, and emits a small number of files a browser can download.
Along the way it drops code nothing uses, splits the rest so a page loads only what it
needs, and hashes filenames so a [CDN](/concept/cdn) can cache them forever. Bundle size is
not an aesthetic concern: every kilobyte of JavaScript is latency plus main-thread time.

## Why it matters

The browser cannot render until it has the code the page depends on, and JavaScript is the
most expensive payload there is — it must be downloaded, parsed, compiled and executed
before it does anything. A 300 KB bundle that a laptop swallows unnoticed can cost a
mid-range phone a second of main-thread work, during which the page ignores taps.

Bundling is also what makes a modern codebase shippable at all: thousands of small modules
served individually means thousands of requests, and TypeScript, JSX and the newest syntax
are not things every browser runs directly. Its configuration quietly determines your
page-speed numbers — see [Web Performance](/concept/web-performance).

## Visual

```steps
title: From source files to a cached response
Entry point | the bundler starts at one file per route or app shell
Resolve imports | each import is resolved to a real file, following package exports and aliases
Module graph | the transitive closure of everything reachable, including CSS and assets
Transform | TypeScript and JSX are compiled, syntax is lowered to the browser targets you set
Tree shaking | exports nothing imports are dropped, if the module graph can prove they are unused
Split points | route boundaries and dynamic imports cut the graph into chunks
Shared chunk extraction | modules used by several routes move into a common chunk
Minify | rename locals, drop dead branches, strip comments and development-only code
Content hash in the filename | app.7f3c9a.js — the name changes only when the bytes change
Source map emitted | a side file mapping the minified output back to your source
CDN and browser cache | hashed files get a one-year immutable cache; only the HTML is revalidated
Next deploy | unchanged chunks keep their names, so returning users re-download only what changed
```

## How it works

**The module graph is the unit of everything.** Static `import` statements let the bundler
know, before running anything, exactly which modules a page can reach. Every later
optimisation is a query on that graph: what is unreachable (drop it), what is reachable only
from one route (split it), what is reachable from many (share it).

**Tree shaking removes what is provably unused.** It works when imports are static ES
modules with no side effects, and it silently stops working when they are not: CommonJS
interop, a namespace import, a module that mutates a global on load, or a package without
a `sideEffects` declaration. This is why importing one helper from a large utility library
can pull in the whole thing while a deep import costs a few bytes.

**Code splitting decides what arrives when.** A dynamic `import()` becomes a separate chunk
fetched on demand — usually per route, sometimes per heavy component such as an editor or
chart library. Split too coarsely and every visitor downloads the whole application; too
finely and a navigation becomes a chain of small round trips. Route-level splitting
plus a shared vendor chunk is the sane default; see [Routing](/concept/routing).

**Hashing turns caching into a solved problem.** When the filename contains a hash of the
contents, the file can be cached immutably forever, because a change produces a new name;
only the HTML needs revalidating. Keep chunk boundaries stable, or one changed line
invalidates a chunk half the site was caching.

**Source maps keep production debuggable.** They map minified output back to original
source so a stack trace names your function and line. Upload them to your error tracker
rather than serving them publicly if the source is sensitive; either way, a production
error without one is a puzzle nobody can solve.

## Deep Dive

**Bundle size is a latency problem with two halves.** Transfer time depends on compressed
bytes, so gzip and Brotli numbers are what a network graph shows. Parse, compile and
execute time depends on *uncompressed* bytes and on the device's CPU, and is often the
larger cost — which is why "it is only 40 KB gzipped" understates the price of code that
runs at startup.

**Measure the graph, not the total.** A bundle analyser showing chunk composition answers
the only useful question: what is in here, and why. The recurring findings are a locale
library pulling in every locale, an icon set imported as a namespace, polyfills for
browsers you no longer support, and a large dependency imported at module scope for a
feature few users open. Each is a targeted fix, not a project.

**The dependency you do not add is the cheapest optimisation.** Before installing, check
what the package pulls in transitively and whether it is tree-shakeable. Frameworks such as
[Next.js](/technology/nextjs) own the bundler configuration and do much of this well by
default, but cannot save you from a heavy dependency imported into a shared layout.

**Types are free, runtime is not.** [TypeScript](/technology/typescript) types are erased at
build time and cost nothing at runtime — but enums, decorators and some helper-emitting
options do generate code, and importing a value where you meant to import a type keeps the
module in the graph. `import type` makes that explicit.

**Server code must not leak into the client graph.** In a full-stack framework, one import
of a server-only module from a client component drags a database driver, its dependencies
and possibly a secret into the browser bundle. Server-only markers exist because this
failure is silent and shows up only as a suspiciously large chunk.

**Build tools change faster than the ideas.** Bundlers have moved from webpack to esbuild-,
Rollup- and Rust-based tools. The concepts — module graph, tree shaking, chunking, hashing,
source maps — have not changed, so learn those and treat the tool as replaceable.
