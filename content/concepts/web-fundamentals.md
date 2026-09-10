---
id: web-fundamentals
name: HTML, CSS & JavaScript
tagline: The three languages every framework produces, and where your bugs actually are
category: frontend
tags: [Frontend, HTML, CSS, JavaScript, Fundamentals]
difficulty: 1
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - web-fundamentals
  - http
  - typescript
  - react
  - accessibility
  - web-performance
related:
  - { to: http, rel: RELATED_TO }
  - { to: accessibility, rel: RELATED_TO }
  - { to: web-performance, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: typescript, rel: RELATED_TO }
  - { to: bundling, rel: RELATED_TO }
  - { to: rendering-strategies, rel: RELATED_TO }
  - { to: cors, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Every web framework produces the same three things: HTML for structure and meaning, CSS for
layout and appearance, JavaScript for behaviour. Frameworks change how you write them, not
what the browser receives. That is why the platform is worth learning first and directly:
your accessibility comes from HTML elements, your layout bugs are CSS, your mysterious
ordering bugs are the JavaScript event loop, and no amount of framework knowledge explains
any of the three. Learn the platform once and every framework becomes a matter of syntax.

## Why it matters

Frameworks abstract the platform without hiding it. The abstraction leaks in exactly the
places that are hardest to debug.

A component library that ships a `div` with a click handler looks fine in React and is
invisible to a keyboard, because focusability comes from the element, not the framework. A
layout that collapses on one screen size is a flexbox rule, and reading more React
documentation will not find it. A state update that seems to apply one tick late is the
event loop and the microtask queue. A form that "works" but does not submit on Enter is a
missing `form` element.

There is also a career argument. Frameworks turn over every few years; HTML, CSS and
JavaScript have been backwards-compatible for two decades. Time spent on the platform keeps
paying after the framework you learned it through is legacy — and the platform has absorbed
much of what frameworks were invented to work around: grid layout, custom properties,
container queries, native dialogs and view transitions all exist now without a library.

## Visual

```steps
title: What the browser does with your three files
GET / returns HTML | the [HTTP](/concept/http) response arrives as a byte stream
Parse HTML into the DOM | incrementally — the browser starts before the file has finished arriving
Discover a stylesheet | render-blocking: nothing paints until it is fetched and parsed
Discover a script | a plain script blocks parsing; defer or module scripts do not
Build the CSSOM | the cascade resolves which rules win for every element
Render tree | DOM plus computed styles, minus anything display:none
Layout | every box gets a size and a position — this is where flexbox and grid run
Paint and composite | pixels, layer by layer; transform and opacity skip layout entirely
JavaScript runs | mutating the DOM sends you back to layout and paint
Event loop takes over | one task at a time; long tasks are why a page stops responding
```

## Solutions

**HTML is a semantic contract, not a bag of divs.** Use the element that means the thing:
`button`, `a`, `form`, `label`, `table`, `nav`, `main`, and headings in descending order.
Each one arrives with keyboard behaviour, focus, an accessible role and platform
conventions you would otherwise implement by hand — the whole argument of
[Accessibility](/concept/accessibility) starts here. Forms in particular do a great deal
for free: labels tied to inputs, native validation, Enter to submit, and a working
submission even before your JavaScript loads.

**CSS is a layout engine you configure with a cascade.** Learn the box model, then flexbox
for one-dimensional arrangement and grid for two, then the cascade and specificity so you
know why a rule loses. Custom properties give you design tokens without a preprocessor;
container queries let a component respond to its own space instead of the viewport, which
is what component-based design actually needed. Prefer this over utility-class muscle memory
— every CSS framework is a shorthand for these primitives.

**JavaScript is the language plus two runtimes.** The language (values, closures, prototypes,
modules, `async`/`await`) is one thing; the DOM API and the event loop are the browser's.
Learn `fetch`, events and the DOM enough to read what your framework generates, and learn
the event loop well enough to reason about ordering. Then add
[TypeScript](/technology/typescript), which is this language with types — not a different
one.

**Build the smallest real thing without a framework.** A page with a form that validates,
submits with `fetch`, renders the result and works on a phone. It takes an afternoon and it
turns three abstract subjects into one mental model, which is exactly what makes the next
framework easy.

## Deep Dive

**The event loop explains most "impossible" bugs.** JavaScript runs one task at a time on one
thread. Promises and `await` resolve on the microtask queue, which drains completely before
the next task or render; `setTimeout` schedules a new task. That ordering — synchronous code,
then microtasks, then render, then the next task — is why a state change appears one tick
late and why a 200ms loop makes the page unresponsive. Layout is synchronous too: reading
`offsetHeight` after a write forces the browser to lay out immediately, and doing that in a
loop is the classic scroll-jank bug that no framework prevents.

**Specificity is not "the last rule wins".** The cascade resolves by origin, then layer, then
specificity, then order — which is why a component's own class loses to a global `#app .x`
selector written a year earlier. Cascade layers make this explicit and are the modern answer
to the specificity wars that produced `!important` and CSS-in-JS. Keeping selectors flat and
scoping by component beats winning arguments with specificity.

**Rendering cost lives in layout, not paint.** Animating `left` or `width` re-runs layout for
every frame; animating `transform` and `opacity` runs on the compositor and can hit 60fps on
a phone. Which properties are cheap is a platform fact and one of the highest-leverage things
to know for [Web Performance](/concept/web-performance).

**Where and when the HTML is produced is a separate decision.** The same markup can be
generated on a server per request, at build time, or in the browser after a JavaScript bundle
downloads — with very different consequences for first paint, search engines and complexity.
That is the subject of [Rendering Strategies](/concept/rendering-strategies), and it is a
decision about delivery, not about the languages.

**Modules, and why bundling exists.** ES modules are native in browsers, but hundreds of
small requests, dependency resolution and older syntax made bundling the norm; see
[Bundling](/concept/bundling). What matters here is that a bundle is an optimisation of
something the platform already does, so debugging it means reading the network panel and the
module graph, not trusting the build tool.

**The browser is a security boundary.** Same-origin policy isolates one site's DOM, cookies
and storage from another's, and [CORS](/concept/cors) is how a server opts into being read
across origins. Cookies, `localStorage` and `sessionStorage` differ in lifetime and in who
can read them, which is why token storage is a security decision rather than a convenience —
see [Authentication](/concept/authentication). Anything the client validates, the server must
validate again.

**Progressive enhancement still pays.** A page whose core function works from HTML and a
server response, with JavaScript improving it, keeps working on a slow connection, an old
device, a failed bundle and a crawler. It is not nostalgia; it is the same reasoning as
graceful degradation in a distributed system, applied to the last hop.
