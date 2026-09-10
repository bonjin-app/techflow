---
id: routing
name: Routing
tagline: Map URLs to what is on screen, and keep the browser's history model intact
category: frontend
tags: [Frontend, Navigation, URL, Web]
difficulty: 2
prerequisites: [http, react]
learningPath:
  - http
  - react
  - state-management
  - routing
  - nextjs
  - rendering-strategies
related:
  - { to: nextjs, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: http, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: state-management, rel: RELATED_TO }
  - { to: rendering-strategies, rel: RELATED_TO }
  - { to: bundling, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A router is the function from a URL to a screen. On the server it runs per request and
returns HTML; in the browser it runs on a link click and swaps part of the tree without a
reload. Client routing buys instant transitions and preserved state at the cost of
reimplementing what the browser did for free — history, scroll position, focus,
cancellation and error pages. Most frameworks now run both halves from one route table.

## Why it matters

The URL is the only piece of application state the user can copy, bookmark, share, reopen
tomorrow and navigate with the back button. A screen that cannot be reached by its address
is invisible to search engines, unlinkable in a support ticket and irreproducible in a bug
report. Routing is what keeps that contract while the application behaves like an
application rather than a stack of documents.

It is also where performance is decided. Routes are the natural boundary for splitting code
and data: a route knows what it needs before it renders, so the framework can fetch the
right chunk and the right query in parallel rather than discovering them one component at a
time. Get this wrong and every navigation is a waterfall — see
[Bundling](/concept/bundling).

## Visual

```sequence
title: One client-side navigation
participants: User, Router, Bundler chunk [bundling], API [rest], DOM
User -> Router: click a link to /orders/42
Router -> Router: match route, cancel in-flight work for the old route
Router -> DOM: pushState, URL changes without a reload
Router -> Bundler chunk: import the code split chunk for this route
Router -> API: start the route data fetch in parallel
Bundler chunk --> Router: module ready
API --> Router: order 42
Router -> DOM: render the nested layout, keep the shell mounted
Router -> DOM: move focus to the new main region
Router -> DOM: scroll to top and remember the old scroll offset
User -> Router: press Back
Router -> DOM: popstate, render the previous route
Router -> DOM: restore the remembered scroll offset
```

## How it works

**Matching.** A route table maps path patterns (`/orders/:id`, `/docs/*`) to a handler or
component, most specific first. Segments become parameters; the query string carries
optional, unordered state such as filters and pagination — the cheapest form of
[state management](/concept/state-management) there is.

**Nested layouts.** Real applications are trees, not lists: a shell, a section navigation,
a detail pane. Nested routing lets each level own a layout that stays mounted while the
level below changes, so a sidebar keeps its scroll position and a video keeps playing
across a navigation. It also means a single URL resolves to several route entries, each
able to declare its own data and error boundary.

**Two runtimes, one definition.** The first visit is a server request: the server matches
the URL and returns HTML. Later navigations are matched in the browser against the same
table. Routes therefore have to be describable without executing them, which is why
file-based routing became the convention in frameworks such as
[Next.js](/technology/nextjs) — the file tree is a route table both runtimes can read.

**Code splitting per route.** Each route's component tree becomes its own chunk, loaded on
demand. Because the router knows the destination the moment a link is clicked — or hovered
— it can prefetch the chunk and the data before the user commits, which is what makes a
well-built client transition feel immediate.

**Deep links must work cold.** Any URL the application can produce must render correctly
when it is the first request. For a static host this needs a rewrite so unknown paths serve
the application shell rather than a 404; behind a [CDN](/concept/cdn) it needs cache rules
that do not confuse a document request with an asset request.

## Deep Dive

**History is a stack you are borrowing.** `pushState` adds an entry, `replaceState` edits
the current one. Use `replaceState` for changes the user should not have to press Back
through — a filter typed character by character, a redirect after login. Overusing
`pushState` produces the trapped-user effect where Back must be pressed eleven times to
leave a page.

**Scroll restoration is not automatic once you take over.** Browsers restore scroll for
real document navigations. A client router must record the scroll offset of the outgoing
route, scroll to the top of the new one, and restore the offset on a back or forward
navigation — after the content that gives the page its height has rendered, which is the
part that breaks with lazily loaded lists. Setting `history.scrollRestoration = 'manual'`
signals that the application has taken responsibility.

**Focus is the accessibility half of the same problem.** A document navigation resets focus
to the top of the page and screen readers announce the new title. A client navigation does
neither by default, leaving focus on a link that no longer exists and giving a screen reader
user no signal that anything happened. Move focus to the new main region or a heading and
announce the change in a live region — see [Accessibility](/concept/accessibility).

**Navigation is asynchronous and cancellable.** Between click and render are requests that
can be slow, fail or be superseded by a faster click. A router needs a pending state that
does not flash on fast transitions, an abort path for the old route's requests, and an
error boundary per route so one failed section does not blank the shell.

**Preserve intent across the back button.** The most common regression in client routing is
that Back re-renders the previous route but loses what the user did there: form input,
opened accordions, list position. Anything that must survive belongs in the URL or in a
cache keyed by the route, not in component state that unmounts.

**Paths are a contract.** URLs outlive the code that serves them — they are indexed,
bookmarked and pasted into other people's links — so when one must change, serve a real
301 rather than a client-side hop, and let [HTTP](/concept/http) caches and crawlers learn
the new address.
