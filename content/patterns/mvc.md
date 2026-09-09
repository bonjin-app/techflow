---
id: mvc
name: MVC
tagline: Split an interactive application into Model, View and Controller so each changes alone
category: application
tags: [Application Architecture, Web Framework, Separation of Concerns]
difficulty: 2
prerequisites: [programming-fundamentals, http, backend]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - mvc
  - layered-architecture
  - rest
related:
  - { to: backend, rel: SOLVES }
  - { to: layered-architecture, rel: ALTERNATIVE_TO }
  - { to: clean-architecture, rel: RELATED_TO }
  - { to: http, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: nodejs, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## Problem

A request handler starts small: parse the input, run a query, print some HTML.
Six months later the same function validates forms, talks to three tables,
formats dates for two locales and decides which buttons to show. Changing the
page layout risks breaking a business rule; changing a business rule means
editing a template. Nothing can be tested without a running web server, and two
developers cannot work on "the order page" at the same time because it is one
file.

The underlying issue is that three different kinds of change — *what the data is*,
*how it is shown* and *how user input is handled* — are tangled in one place.

## Solution

Separate the application into three roles with one-directional knowledge:

- **Model** — domain data and the rules that govern it. Knows nothing about HTTP or HTML.
- **View** — renders a representation of the model (HTML, JSON, a screen). Reads the model, never mutates it.
- **Controller** — receives input, translates it into model operations, picks a view.

```steps
title: Dependency direction — outer layers know the inner ones
Controller | receives the HTTP request, validates input, calls the model
Model | entities, rules and persistence; independent of controller and view
View | renders the model returned by the controller
Response [http] | HTML, JSON or a redirect leaves the process
```

The controller depends on model and view; the view depends on the model; the
model depends on neither. Swap the view (HTML → JSON) or the delivery mechanism
(HTTP → CLI) and the model stays untouched.

## How it works

```sequence
title: One request through MVC
participants: Browser [http], Controller [backend], Model [database], View
Browser -> Controller: POST /orders {items}
Controller -> Model: Order.create(items)
Model --> Controller: order (or validation error)
Controller -> View: render(order)
View --> Controller: HTML
Controller --> Browser: 201 Created
```

In server-side web frameworks a router maps a URL to a controller action. The
action reads request parameters, calls into the model and hands the result to a
template. The "model" in most frameworks is an ORM class that mixes data and
persistence — convenient, but it is where business logic tends to leak into
database concerns.

```ts
// controller
router.post("/orders", async (req, res) => {
  const result = Order.create(req.body.items);        // model
  if (!result.ok) return res.status(422).render("orders/new", { errors: result.errors });
  await orders.save(result.order);                   // persistence
  res.status(201).render("orders/show", { order: result.order }); // view
});
```

Client-side variants (MVVM, MVP) keep the same idea but let the view observe the
model and update itself; the controller becomes a thin binder. Frameworks such as
React blur the split further — a component is view and controller at once — and
many teams keep the "model" as a separate store.

## Advantages

- Views can change without touching rules, and rules can be unit-tested without a browser
- Familiar: almost every web framework ships with an MVC-shaped skeleton and conventions
- Parallel work — front-end and back-end developers touch different files
- Multiple views over the same model (HTML page, JSON API, email) come cheaply
- Low ceremony compared with [Clean Architecture](/pattern/clean-architecture); good for small teams

## Disadvantages

- "Fat controller" or "fat model" drift — business logic ends up wherever it was convenient
- The model usually couples domain rules to the ORM and therefore to the database schema
- Says nothing about application services, transactions or external integrations; larger apps need another layer
- Every framework interprets the roles differently, so "MVC" alone does not describe a codebase
- Cross-cutting concerns (auth, logging) do not have an obvious home and end up in middleware soup

## When to use

- Server-rendered or API-first web applications with a moderate domain
- Teams that want framework conventions rather than a bespoke structure
- Projects where the database schema *is* essentially the domain model (CRUD-heavy)
- As the delivery layer inside a larger structure such as [Layered Architecture](/pattern/layered-architecture)

## When not to use

- Complex domains with many invariants — the model layer grows rules the ORM class cannot express well; prefer [Clean](/pattern/clean-architecture) or [Hexagonal](/pattern/hexagonal-architecture) architecture
- Batch or event-driven backends with no interactive "view"; the pattern's vocabulary does not fit
- When you need to swap the database or run the domain without persistence; MVC models are rarely that decoupled
- Very small scripts — three folders for one endpoint is overhead

## Real-world

MVC is the default shape of most server-side web frameworks and of the
[Simple Web App](/architecture/simple-web-app) architecture: a router hands the
request to a controller, the controller loads rows through a model and a template
renders the page. Larger systems typically keep controllers as a thin HTTP layer
and move rules into services — which is the moment they have quietly become a
[Layered Architecture](/pattern/layered-architecture).
