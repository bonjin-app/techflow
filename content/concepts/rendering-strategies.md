---
id: rendering-strategies
name: Rendering Strategies
tagline: Where HTML gets built — in the browser, per request, at build time, or streamed
category: frontend
tags: [Frontend, SSR, Performance, Cache]
difficulty: 3
prerequisites: [http, react, cdn]
learningPath:
  - http
  - react
  - cdn
  - cache
  - rendering-strategies
  - nextjs
  - web-performance
related:
  - { to: nextjs, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: web-performance, rel: RELATED_TO }
  - { to: routing, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Every page is HTML built somewhere: in the browser after a JavaScript bundle loads (CSR),
on a server per request (SSR), once at build time (SSG), at build time and then refreshed
in the background (ISR), or progressively as a stream. The choice is about who pays for
the render, how stale the result may be, and whether a [CDN](/concept/cdn) can serve it
without asking the origin. Most applications mix several, one route at a time.

## Why it matters

Rendering strategy sets the floor on what a page can feel like. A client-rendered page
cannot paint content before its bundle has downloaded and executed, so a slow phone waits
through several serial round trips. A prerendered page paints from the first packet, but
shows whatever was true when it was built. Neither is better in general; they fail in
different directions.

It is also a cost decision. Static output is a file on an edge server: effectively free and
immune to a traffic spike. Per-request rendering is compute you run, monitor and scale, and
every render is a chance to be slow or to fall over when the database is. Rendering a page
per request when its data changes once a day is paying for freshness nobody asked for.

## Visual

```compare
title: What each strategy costs and buys
Property        | CSR                  | SSR                     | SSG                  | ISR                    | Streaming SSR
Where HTML built | Browser             | Server, per request     | Build server, once   | Build, then refreshed  | Server, in chunks
Time to first byte | Fast, empty shell | Slow as your slowest query | Fast, from the edge | Fast, from the edge   | Fast, shell first
Time to content | After bundle and data | With the first response | With the first response | With the first response | Shell first, rest streams
Data freshness  | Live at fetch time   | Live per request        | As of the last build | Up to the revalidate window | Live per request
CDN cacheable   | Assets only          | Rarely, per user        | Fully                | Fully, with revalidation | Partially, cached shell
Server cost per view | None            | One render plus queries | None                 | Amortised over the window | One render, held open
Fails when      | JS fails or is slow  | Origin or database is down | Content is personalised | Staleness is unacceptable | Client disconnects mid-stream
Good fit        | Dashboards behind login | Personalised or fast-changing pages | Docs and marketing | Catalogues and articles | Pages mixing static and slow data
```

## How it works

**CSR.** The server sends a near-empty document and a bundle. The browser parses, executes,
discovers what data it needs, fetches it, then paints — three serial hops before content.
It suits screens behind a login where SEO is irrelevant, and it is the cheapest to host.

**SSR.** The server runs the same components with real data and returns complete HTML, so
the first paint contains content and crawlers see the page. The browser then hydrates:
downloads the same components and attaches event handlers, which means the JavaScript cost
did not disappear, it moved after the paint. Every request costs a render, so the origin is
now on the critical path.

**SSG.** Render at build time and deploy the result as files. The best numbers available and
the least to operate, bounded by two constraints: the content must be the same for every
user, and it is only as fresh as the last build. Build time also grows with page count.

**ISR.** Static output with a lifetime. The edge serves the cached page immediately and,
once it is older than the revalidation window, regenerates it in the background so the next
visitor gets the new one. This is stale-while-revalidate applied to whole pages, and it
inherits the same question as any [Cache](/concept/cache): how stale is acceptable, and
what triggers an early refresh.

**Streaming.** The server sends the shell as soon as it exists and streams the slower
sections as their data resolves, each replacing a placeholder, so first paint stops waiting
for the slowest query. The cost is complexity: status and headers are committed before the
body finishes, so an error deep in the stream cannot become a 500 and must be handled
inside the page.

## Deep Dive

**Strategy is per route, not per application.** In an [E-commerce](/architecture/e-commerce)
system, a category page is prerendered and revalidated when the catalogue changes, a product
page is prerendered with a live stock indicator streamed in, and checkout renders per
request because it is personal. Frameworks such as [Next.js](/technology/nextjs) exist to
express exactly this split.

**The CDN is part of the rendering decision.** If a response can be cached at the edge, the
strategy that produced it barely matters for the second visitor; if it cannot — a
`Set-Cookie`, a personalised greeting, a `Vary` on almost anything — every view reaches your
origin.

**Hydration is the hidden bill of server rendering.** HTML arrives early and the page still
cannot respond until its JavaScript has loaded and hydrated; painting at 0.8s and becoming
interactive at 4s feels broken in a specific, frustrating way. Selective hydration, server
components that ship no JavaScript, and simply sending less code all attack this. See
[Web Performance](/concept/web-performance).

**Personalisation breaks static caching, but rarely all of it.** The usual repair is to
serve one cached page for everyone and fill the personal parts in client-side or by
streaming them, with their space reserved in the layout so nothing jumps.

**Freshness is a product question.** "How wrong may this page be?" has an answer per
content type: a price, minutes at most; an article, until the next publish. Write it down
as a revalidation window or a trigger. Without one, teams default to per-request rendering
out of caution and pay for it on every view.

**Measure the strategy you shipped.** Prerendering that quietly falls back to per-request
rendering because a page reads a cookie is a common, invisible regression. Check the built
output and the edge hit ratio, not the intent in the code.
