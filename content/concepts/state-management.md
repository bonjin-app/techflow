---
id: state-management
name: State Management
tagline: Decide what each piece of state is and who owns it, before choosing a library
category: frontend
tags: [Frontend, State, Architecture, Cache]
difficulty: 3
prerequisites: [programming-fundamentals, http, react]
learningPath:
  - programming-fundamentals
  - http
  - react
  - state-management
  - routing
  - rendering-strategies
related:
  - { to: react, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: graphql, rel: RELATED_TO }
  - { to: routing, rel: RELATED_TO }
  - { to: rendering-strategies, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Almost everything a frontend calls "state" is one of three things: a **copy of data the
server owns**, **client state** that exists only in this tab, or **URL state** that belongs
in the address bar. Deciding which kind you are holding answers most of the design
questions that follow — what can go stale, what must survive a reload, what a shared link
must reproduce. A dedicated state library earns its place only when genuinely shared client
state outgrows props and context; the far more common need is a cache.

## Why it matters

The complaint "state management is hard" is usually a category error: server data was
modelled as client state. The moment a component stores a fetched list in a variable, the
application owns a hand-written cache and inherits every problem in
[Cache](/concept/cache) — keys, staleness, deduplicating concurrent requests, retries,
pagination, refetch on focus, and invalidation after a mutation. Those problems get solved
again, slightly differently, on every screen.

The symptoms are recognisable. Two components show different counts for the same thing.
A mutation succeeds but the list still shows the old row. The back button returns to a page
that has forgotten which filters were applied. None of these are bugs in a library; they
are consequences of putting state somewhere that cannot answer "who is responsible for
keeping this true?"

## Visual

```compare
title: Three kinds of state
Question             | Server state              | Client state             | URL state
Where truth lives    | Database or service       | This browser tab         | The address bar
Who owns freshness   | The server; you hold a copy | Nobody, it is the truth | The user, via navigation
Survives reload      | Yes, refetched            | No                       | Yes
Survives a shared link | Yes                     | No                       | Yes
Can be stale         | Always                    | Never                    | Never
Fix for staleness    | Invalidate and refetch    | Not applicable           | Not applicable
Typical examples     | Orders, profile, search results | Modal open, form draft, hover | Page, filters, tab, selected id
Typical tool         | A query cache             | useState or a reducer    | The router
```

## How it works

**Server state is a cache, so treat it like one.** Give every server read a stable key,
fetch through one layer, and let that layer deduplicate in-flight requests, serve a cached
value while revalidating, and expire entries. After a mutation, invalidate the keys the
mutation could have changed rather than manually patching every component. This is
[Cache Invalidation](/concept/cache-invalidation) with a different name: the two hard cases
are still "which keys did this write affect?" and "how stale may this be?". Libraries in
this space (query caches for [REST](/concept/rest), normalised clients for
[GraphQL](/technology/graphql)) exist because that machinery is the same everywhere.

**Client state is small and local.** Whether a menu is open, what is typed but not
submitted, which row is hovered. It has no remote counterpart, cannot be stale, and is
correctly lost on reload. Keep it in the component that uses it and lift it only as far as
the nearest common ancestor. Most state that people try to make global is client state
that was lifted too high.

**URL state is the part users control.** Which page, which tab, sort order, filters,
the selected entity. Putting it in the URL makes it linkable, bookmarkable, restorable by
the back button and reproducible in a bug report, for free. Putting the same values in a
store makes all of that your problem — see [Routing](/concept/routing).

**Derive rather than store.** A total, a filtered list, an "is valid" flag: compute these
during render from the state above. Every derived value stored separately is a second copy
that can disagree with the first.

**When a library earns its place.** After the three kinds are separated, what remains is
client state shared by distant parts of the tree: an editor's document model, a
multi-step wizard, a collaborative canvas, presence. When that state is large, updated
frequently, or read by many components that should not all re-render, a store with
selectors is worth the dependency. Reaching for one before that point mostly moves the same
problem to a new file.

## Deep Dive

**Context is a distribution mechanism, not a store.** [React](/technology/react)'s context
re-renders every consumer when its value changes, so a single context holding an object
that changes on every keystroke re-renders half the application. It is a good fit for values
that rarely change (theme, current user, a store handle) and a poor fit for hot state.

**Optimistic updates are a consistency decision.** Writing the expected result into the
cache before the server confirms it makes the interface feel instant, and obliges you to
roll back on failure and reconcile with whatever the server actually returned. This is
worthwhile for high-confidence, low-stakes actions and dangerous for anything the user
would be angry to see reversed.

**Real-time pushes are cache writes.** Messages arriving over
[WebSocket](/technology/websocket) or [SSE](/technology/sse) should be applied into the same
cache the rest of the application reads, not into a parallel store. Two sources of truth for
one entity produce the exact disagreement bugs described above.

**Server rendering constrains what state can be.** With server-rendered or streamed HTML,
initial state is serialised into the response and rehydrated in the browser, so it must be
JSON-serialisable and must never be shared across requests — a module-level store on the
server is a cross-user data leak. See [Rendering Strategies](/concept/rendering-strategies)
and [Next.js](/technology/nextjs).

**Persisted state needs a version.** Writing to `localStorage` gives continuity across
sessions and a schema you must migrate: last week's shape will be read by this week's code.

**Testable state is state that is a function.** Reducers and pure update functions can be
tested without rendering anything; state tangled into effects and component lifecycles can
only be tested through the UI. That difference is usually a better argument for a given
approach than any benchmark — see [Testing](/concept/testing).
