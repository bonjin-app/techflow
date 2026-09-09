---
id: react
name: React
tagline: Component-based UI library where the view is a function of state
category: frontend
tags: [Frontend, UI Library, JavaScript, Components]
difficulty: 2
usedFor: []
prerequisites: [programming-fundamentals, http]
learningPath:
  - programming-fundamentals
  - http
  - react
  - typescript
  - rest
  - graphql
  - nodejs
related:
  - { to: typescript, rel: USED_WITH }
  - { to: websocket, rel: USED_WITH }
  - { to: sse, rel: USED_WITH }
  - { to: rest, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: social-feed, rel: USED_IN }
  - { to: chat-system, rel: USED_IN }
  - { to: video-streaming, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "React 19.x", confidence: high }
---

## TL;DR

React is a library for building user interfaces out of **components**: functions that
take data (props and state) and return a description of what the UI should look like.
When state changes, React re-runs the affected components and reconciles the difference
into the DOM. That declarative model — describe the result, not the mutations — is why
it dominates web front ends and also powers React Native. It is only the view layer;
routing, data fetching and build tooling come from frameworks around it.

## Practical

In 2026 you rarely start with React alone. You pick a framework (Next.js, Remix/React
Router, Expo for native, or Vite for a client-only SPA) that provides routing, bundling
and a data-loading story, and write [TypeScript](/technology/typescript) components:

- **Components and hooks** — `useState` for local state, `useEffect` for
  synchronising with external systems, custom hooks to share logic.
- **Data fetching** — a server-component loader or a client cache (TanStack Query, SWR,
  Apollo for [GraphQL](/technology/graphql)) rather than raw `useEffect` + `fetch`.
- **Forms and mutations** — Actions and `useActionState`/`useOptimistic` in React 19,
  or a form library.
- **Real-time** — subscribe to [WebSocket](/technology/websocket) or
  [SSE](/technology/sse) streams and push updates into state.
- **Rendering mode** — client-only SPA, server-side rendering with hydration, static
  generation, or React Server Components that never ship to the browser.

```ts
// A component: UI = f(props, state)
function LikeButton({ postId, initial }: { postId: string; initial: number }) {
  const [likes, setLikes] = useState(initial);
  const [pending, startTransition] = useTransition();

  function like() {
    startTransition(async () => {
      setLikes((n) => n + 1);                       // optimistic
      await fetch(`/api/posts/${postId}/like`, { method: "POST" });
    });
  }
  return <button onClick={like} disabled={pending}>♥ {likes}</button>;
}
```

Deployment is static assets on a [CDN](/concept/cdn) for SPAs, or a
[Node.js](/technology/nodejs) (or edge) runtime for server rendering.

## Deep Dive

**Reconciliation.** Rendering produces a tree of lightweight element objects. React
diffs the new tree against the previous one and applies the minimal set of DOM
mutations. Keys tell the differ which list items are the same across renders; wrong or
missing keys are the classic source of state jumping between rows.

**Rendering is pure; effects are not.** A component function must be side-effect free
because React may call it more than once (Strict Mode does so deliberately). Anything
touching the outside world — subscriptions, timers, imperative DOM — belongs in an
effect with correct cleanup. Most "React is confusing" bugs are effects that depend on
values not in their dependency list.

**Concurrent rendering.** Since React 18 the renderer can pause, resume and abandon
work. Transitions mark updates as non-urgent so typing stays responsive while an
expensive list re-renders; Suspense lets a tree declare "I am waiting on data" and show
a fallback. The React Compiler (stable in 19.x) automatically memoises components,
reducing the need for hand-written `useMemo`/`useCallback`.

**Server Components.** RSC split the tree into server components (run only on the
server, can read databases directly, ship zero JS) and client components (interactive).
This reduces bundle size and waterfalls but couples you to a framework and a server
runtime, and changes how you think about data ownership.

**Performance.** The usual failure is not React's diffing but re-rendering large
subtrees on every keystroke, huge unvirtualised lists, and shipping too much JavaScript.
Profile first; virtualise long lists; split bundles by route.

## Why

Before component models, a UI was a DOM plus a pile of event handlers that mutated it
imperatively. Each feature added another place where the DOM and application state
could diverge — a counter updated here but not there, a list re-sorted while a detail
panel still showed the old item. Testing meant driving a real browser.

```steps
title: Before — imperative DOM updates drift out of sync with state
User clicks "Like" | handler runs
Handler mutates data | likes++ in a variable
Handler updates DOM node A | button text set by hand
Forgets DOM node B | sidebar count still stale ❌
Another handler re-renders list | loses the "liked" highlight ❌
Bug report | "count is wrong sometimes" — no single source of truth
```

React removes the second half of that list. State lives in one place; the component
describes the UI for any state; React figures out which DOM nodes to touch. A change
to the data model reaches every part of the screen that depends on it, and the same
component can be rendered in a test without a browser.

```steps
title: After — declarative UI recomputed from state
User clicks "Like" | setLikes(n => n + 1)
React schedules a render | transition, non-blocking
LikeButton re-runs | returns new element tree
Sidebar re-runs | reads the same state → correct count
Reconciler diffs trees | only two text nodes change in the DOM
Test | render(<LikeButton/>), click, assert — no browser needed
```

The same idea scales from a button to an application because components compose: a
page is a component made of components, each owning its own state or receiving it as
props.

## Advantages

- Declarative components make UI state predictable and unit-testable
- Largest front-end ecosystem: frameworks, component libraries, tooling, hiring pool
- One mental model across web (DOM), native (React Native) and server rendering
- Concurrent features (transitions, Suspense) keep interfaces responsive under load
- React Compiler removes most manual memoisation work
- Mature TypeScript integration and generated types from GraphQL/OpenAPI schemas

## Trade-offs

- It is only the view layer; you must assemble or adopt a framework for routing, data and SSR
- Large default bundle and hydration cost compared with compiled frameworks (Svelte, Solid) or server-rendered HTML
- Hooks and effect semantics have a real learning curve; stale closures and missing dependencies are common bugs
- Server Components add a second programming model and lock you into a compatible framework
- Ecosystem churn: recommended patterns for data fetching and state have changed several times
- Frequent re-renders in poorly structured trees cause performance problems that need profiling to find

## When to use

- Interactive web applications with meaningful client-side state (dashboards, editors, feeds, chat)
- Teams that want to share components and types across web and mobile via React Native
- Products where the ecosystem (design systems, form libraries, charts) saves months
- Server-rendered sites that still need rich interactivity after load
- Long-lived codebases where hiring and documentation availability matter

## When not to use

- Don't use React for a mostly static content site — server-rendered HTML with minimal JS loads faster and costs less
- When bundle size on low-end devices is the primary constraint and a compiled framework or plain HTML would serve
- For a small internal form or admin page where a server template is finished in an hour
- When the team is committed to another ecosystem (Vue, Angular, Svelte, Flutter) with existing components
- For embedding a widget into third-party pages where a framework-free script is expected

## Real-world

React is the browser tier of most of the architectures on this site: the
[Simple Web App](/architecture/simple-web-app) ships a React bundle from a CDN and
calls a [REST](/concept/rest) API; the [Social Feed](/architecture/social-feed) renders
infinite-scrolling cards from a GraphQL or REST aggregation layer with optimistic likes;
the [Chat System](/architecture/chat-system) keeps a WebSocket open and pushes messages
into component state; [Video Streaming](/architecture/video-streaming) wraps a media
element and adaptive-bitrate player in React for controls and recommendations. In each,
React owns what the user sees; the interesting engineering happens in how data flows to
it.
