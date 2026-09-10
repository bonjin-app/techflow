---
id: web-performance
name: Web Performance
tagline: Make the page feel fast — loading, responsiveness and visual stability, on real devices
category: frontend
tags: [Frontend, Performance, Measurement, Web]
difficulty: 3
prerequisites: [http, cache, cdn]
learningPath:
  - http
  - cache
  - cdn
  - bundling
  - web-performance
  - observability
  - slo
related:
  - { to: cdn, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: bundling, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
  - { to: rendering-strategies, rel: RELATED_TO }
  - { to: http2, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Users do not experience milliseconds, they experience three things: how long until they see
something useful, whether the page responds when they touch it, and whether it stays still
while they read. Everything measurable is a proxy for one of those. Performance work is
mostly a budget problem — deciding what a page is allowed to cost before the code is
written — and a small number of levers account for most of the improvement.

## Why it matters

Speed is a floor under every other quality of a product: a well-designed page nobody waits
for is not experienced. The effect is strongest exactly where teams measure least, because
development happens on fast machines, on fast networks, with a warm cache, on a page with
three items in the list. Real traffic is mid-range phones on congested mobile networks, and
their p75 is several times the number on the laptop.

It is also a slow, cumulative failure. No single commit makes a page slow; a component
library here, an analytics tag there, one more font weight, and a year later the page takes
six seconds. Because nothing was ever the cause, nothing is ever the fix — which is why a
budget enforced in [CI/CD](/concept/ci-cd) does more good than an optimisation sprint.

## Visual

```steps
title: Where the time goes on a cold page load
DNS and connection | resolve, TCP handshake, TLS — round trips before a byte of HTML
Server think time | the origin builds the response; a cache or CDN hit skips this entirely
HTML arrives | first byte; the browser can start parsing and discovering resources
Render-blocking CSS and fonts | nothing paints until the critical stylesheet is in
First contentful paint | something is on screen; the user stops wondering if it is broken
Largest element paints | the hero image or headline — what the user calls "loaded"
JavaScript downloads and parses | the main thread is busy and the page ignores taps
Hydration and event handlers | interaction is finally handled; the gap here is what feels broken
Late images and ads arrive | content jumps unless space was reserved — visual instability
Steady state | the page is interactive; long tasks now show up as input delay
```

## Solutions

**Send less JavaScript.** It is the most expensive kind of byte: downloaded, parsed,
compiled and executed on the main thread, and it costs several times more on a low-end
phone than on a laptop. Route-level code splitting, dropping a dependency, and rendering
what can be rendered without client JavaScript beat any micro-optimisation. See
[Bundling](/concept/bundling) and
[Rendering Strategies](/concept/rendering-strategies).

**Serve bytes from close by, once.** A [CDN](/concept/cdn) removes most of the connection
and origin time for repeat and cold visitors alike; long-lived immutable caching on hashed
assets makes repeat views nearly free. Cheap and boring, and usually the single largest win
on a first audit — see [Cache](/concept/cache).

**Protect the critical path.** Only the CSS needed for the first screen should block
rendering; everything else can be deferred. Fonts should paint with a fallback rather than
hiding text. Third-party scripts belong after the content, and each one should have to
justify its cost.

**Reserve space for everything that arrives late.** Width and height on images, fixed
dimensions for ad and embed slots, skeletons the same size as their content. Layout shift
is almost entirely preventable, and it is the defect users describe as "the page moved and
I clicked the wrong thing".

**Keep the main thread free.** Responsiveness is decided by long tasks: a 300 ms handler
means a tap during it waits 300 ms. Break up work, move heavy computation off the main
thread, virtualise long lists, and avoid re-rendering large trees on every keystroke.

## Deep Dive

**Field data decides; lab data explains.** A synthetic run on one machine is repeatable and
useful in [CI/CD](/concept/ci-cd), but it is one device on one network. Real user
measurement collected from actual sessions tells you what your users get, segmented by
device class, country and connection. Track the 75th percentile, not the mean: averages
hide the tail where the problem lives. Feed both into
[Observability](/concept/observability) alongside your backend numbers.

**Budgets work because they are refusals.** Pick a number per route — a JavaScript byte
budget, a largest-paint target — assert it in the pipeline, and let a pull request fail when
it exceeds it. That converts an unbounded argument about priorities into a specific
conversation about one change. The mechanism is the same as an
[error budget](/concept/slo): a limit that makes trade-offs explicit rather than moral.

**Server time and client time are the same latency to the user.** A page can be perfectly
optimised in the browser and still be slow because the origin takes 900 ms to answer.
Time to first byte belongs on the same dashboard as paint metrics, and its fixes are
backend fixes: caching, query tuning, fewer sequential calls.
[HTTP/2 and HTTP/3](/concept/http2) remove per-connection overhead but do nothing for a
slow query.

**Perceived speed is real speed.** Showing a meaningful skeleton, streaming content as it
resolves, prefetching the likely next route on hover, and responding to a click immediately
while the work continues in the background all change what the user experiences without
changing what the machine does. The limit is honesty: an optimistic response that later
reverses costs more trust than the wait would have.

**Images are usually the largest thing on the page.** Correct dimensions for the layout,
a modern format, lazy loading below the fold and eager loading for the hero element is a
short checklist that routinely halves page weight.

**Measure the change, not the intention.** Performance work is full of plausible ideas that
do nothing or backfire — preloading everything competes for bandwidth, splitting too
finely adds round trips, caching too aggressively serves stale pages. Take a before
reading, ship one change, take an after reading on the same device profile.
