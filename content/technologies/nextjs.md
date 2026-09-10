---
id: nextjs
name: Next.js
tagline: React framework with server rendering, file-based routing and a build pipeline
category: frontend
tags: [Frontend, React, Framework, SSR, Fullstack]
difficulty: 3
usedFor: [cdn, cache, rest]
prerequisites: [http, react, typescript]
learningPath:
  - programming-fundamentals
  - http
  - react
  - typescript
  - nextjs
  - cdn
related:
  - { to: react, rel: REQUIRES }
  - { to: nodejs, rel: REQUIRES }
  - { to: typescript, rel: USED_WITH }
  - { to: cdn, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: backend-for-frontend, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Next.js 16.x", confidence: medium }
---

## TL;DR

Next.js is a framework built on [React](/technology/react) that supplies what React
deliberately leaves out: routing, server rendering, server-side data fetching, caching,
bundling and a deployment target. Its central idea is that most components render on the
server — producing HTML, not JavaScript — and only interactive parts ship to the browser.
That makes it a full-stack tool rather than a frontend library: a page component can query
the database directly. The price is strong opinions, plus a caching and rendering model that
has changed substantially between major versions.

## Practical

A route is a folder; a page is an async component that fetches its own data on the server:

```ts
// app/product/[id]/page.tsx — a Server Component; this code never reaches the browser
import { cacheLife } from 'next/cache';
import { db } from '@/lib/db';
import AddToCart from './add-to-cart';       // 'use client' — the only JS shipped

async function getProduct(id: string) {
  'use cache';                               // opt in per function
  cacheLife('hours');                        // give the cached result a lifetime
  return db.product.findUnique({ where: { id } });
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;               // request APIs are async in Next.js 16
  const product = await getProduct(id);

  return (
    <main>
      <h1>{product.name}</h1>
      <AddToCart productId={product.id} />
    </main>
  );
}
```

What it is typically used for:

- **Content-heavy sites that are also interactive** — marketing, docs, catalogues, where
  prerendered HTML at the [CDN](/concept/cdn) edge decides your page-speed numbers.
- **Product UIs with a database behind them** — the page queries
  [PostgreSQL](/technology/postgresql) on the server, so no public API is needed for its own
  data. See [E-commerce](/architecture/e-commerce).
- **A thin server layer over existing services** — route handlers and server actions act as a
  [Backend for Frontend](/pattern/backend-for-frontend), holding tokens and shaping responses.
- **Anything where SEO, social previews and first paint are requirements**, not nice-to-haves.

## Deep Dive

**Server and Client Components are a network boundary.** Components render on the server by
default; `'use client'` marks a subtree as browser code. The server sends a serialised render
result, not the components, so secrets, database clients and heavy libraries never enter the
bundle. The boundary is the thing to design: props crossing it must be serialisable, and a
`'use client'` marker high in the tree drags everything below it into the browser bundle.
Most confusion with the framework is a misplaced boundary.

**Rendering is a spectrum, not a switch.** A route can be prerendered at build time, rendered
per request, or split — a cached static shell served instantly while request-specific parts
stream in behind `<Suspense>`. That partial-prerender model is what the Cache Components
configuration enables in Next.js 16, replacing the earlier experimental PPR flag.

**Caching is now explicit, and this is the part that has churned.** In current Next.js
`fetch` is *not* cached by default: you opt in with `use cache` on a function, component or
page, give it a lifetime with `cacheLife`, and tag entries with `cacheTag` so
`revalidateTag` can invalidate them. Earlier versions cached aggressively by default and were
criticised for surprising staleness — so caching advice older than your version is often
wrong, and invalidation is yours to design. See
[Cache Invalidation](/concept/cache-invalidation).

**Mutations run on the server.** Server actions let a form call a server function directly,
with the framework handling serialisation and revalidation. Convenient — and still a public
entry point: an action needs the same authentication and authorisation as any
[REST](/concept/rest) route, because looking like a function call does not make it one.

**Proxy, not middleware.** The request hook was renamed `proxy` in Next.js 16 (same
capability). It suits header rewriting, redirects and optimistic checks, and is explicitly
not the place for session management, authorisation or slow data fetching.

**The build is a real build.** Turbopack is the default bundler in 16, and the framework owns
code splitting, image optimisation, font loading and asset hashing — a lot of value you did
not write, and a lot of behaviour you do not control.

**Deployment has a shape.** A Next.js app is a Node.js server plus static assets: self-host
it in a container behind a CDN, or use a managed platform. Static export works for sites with
no server rendering. Features arrive optimised for the vendor's platform first, and
self-hosting incremental caching and image optimisation is real operational work.

## Why

A single-page application asks the browser to do everything: download a bundle, execute it,
then discover what data it needs and fetch it. The user waits through serial round trips
before seeing content, and crawlers see an empty shell.

```sequence
title: Before — client-rendered single-page app
participants: Browser, CDN [cdn], API [backend], DB [postgresql]
Browser -> CDN: GET /product/42
CDN --> Browser: near-empty HTML + large JS bundle
Browser -> API: GET /api/product/42 (only after the bundle parses)
API -> DB: SELECT …
DB --> API: row
API --> Browser: JSON
Browser -> Browser: first meaningful paint, three round trips in
```

Server rendering removes the waiting. The server has a fast path to the database, so it
sends HTML; the browser downloads JavaScript only for the interactive parts.

```sequence
title: After — server-rendered and streamed
participants: Browser, CDN [cdn], Next [nextjs], DB [postgresql]
Browser -> CDN: GET /product/42
CDN --> Browser: cached static shell — immediate first paint
Browser -> Next: same request continues for the dynamic parts
Next -> DB: SELECT … (on the server, no client round trip)
DB --> Next: row
Next --> Browser: streamed HTML for the suspended sections
Browser -> Browser: hydrate only the interactive components
```

The gain is fewer round trips and much less shipped JavaScript. The cost is owning a server,
a caching model, and a server/client boundary you must keep straight.

## Advantages

- Routing, rendering, bundling and asset optimisation arrive as one maintained system
- Server Components keep data access, secrets and heavy dependencies out of the browser bundle
- Streaming plus a cached shell gives fast first paint without giving up dynamic data
- Server-rendered HTML solves the SEO and social previews SPAs struggle with
- One codebase: pages, route handlers and mutations share types and utilities
- Very large ecosystem, documentation and hiring pool; excellent TypeScript support

## Trade-offs

- The caching and rendering model has changed materially across recent majors, so advice expires quickly
- The server/client boundary is a genuinely new mental model, and mistakes surface as bundle bloat or serialisation errors
- You are running and operating a Node.js server, not shipping static files
- Debugging spans server render, streaming and hydration
- Strong conventions: unanticipated requirements are disproportionately hard
- The best-supported deployment path is the vendor's own platform
- Hydration cost has not disappeared — a client-heavy app still ships a lot of JavaScript

## When to use

- Content-driven sites that also need interactivity, SEO and fast first paint
- Product UIs that read your own database and would otherwise need an API just for themselves
- Teams fluent in React and TypeScript who want routing and rendering solved
- Applications that benefit from prerendering plus per-request streaming on the same page
- Frontends needing a small server layer to hold tokens and aggregate service calls

## When not to use

- Don't use it for a highly interactive app behind a login with no SEO needs — plain [React](/technology/react) with a client-side router is simpler
- Don't use it as your primary backend beyond frontend concerns; domain logic belongs in a service — see [Microservices](/architecture/microservices) or a [Modular Monolith](/pattern/modular-monolith)
- Don't use it for a purely static site that a static generator or plain HTML would serve
- Don't adopt it if you cannot operate a Node.js runtime, or need one static artifact behind [Nginx](/technology/nginx)
- Don't pick it if the team would rather not track a fast-moving framework's majors

## Real-world

The common production shape is a Next.js app behind a [CDN](/concept/cdn): shells and assets
cached at the edge, dynamic segments streamed from a small fleet of Node.js containers, and
reads going either straight to [PostgreSQL](/technology/postgresql) or to internal services
over [REST](/concept/rest) or [gRPC](/technology/grpc). In an
[E-commerce](/architecture/e-commerce) system, category and product pages are prerendered
and revalidated by tag when the catalogue changes, while cart and checkout render per
request — a split the caching primitives exist to express. For a
[Simple Web App](/architecture/simple-web-app) the framework covers the whole stack: pages,
forms, a few route handlers and one database. Two lessons recur: pin the version and read
that version's own docs, because caching and routing conventions differ between majors; and
treat server actions and route handlers as public endpoints with real authorisation.
