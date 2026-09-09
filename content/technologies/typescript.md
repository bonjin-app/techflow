---
id: typescript
name: TypeScript
tagline: Statically typed superset of JavaScript that catches contract errors before runtime
category: fundamentals
tags: [Language, Type System, JavaScript, Tooling]
difficulty: 2
usedFor: []
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - typescript
  - nodejs
  - react
  - rest
  - graphql
related:
  - { to: programming-fundamentals, rel: RELATED_TO }
  - { to: serialization, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: grpc, rel: USED_WITH }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
  - { to: chat-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "TypeScript 5.9+ (6.x; native Go-based compiler rolling out as 7.0)", confidence: medium }
---

## TL;DR

TypeScript adds a static type system on top of JavaScript. You annotate (or let the
compiler infer) the shapes of values; the compiler checks them and then erases the
types, emitting plain JavaScript that runs anywhere JavaScript runs. Nothing changes at
runtime — the payoff is entirely at development time: caught mistakes, precise editor
tooling, and self-documenting APIs. It is now the default way to write both
[Node.js](/technology/nodejs) backends and [React](/technology/react) front ends.

## Practical

A TypeScript project is a JavaScript project with a `tsconfig.json`, `.ts`/`.tsx` files
and a type-check step in CI. Day-to-day work looks like this:

- Turn on `strict` (and usually `noUncheckedIndexedAccess`); anything less gives a
  false sense of safety.
- Model domain data as types or interfaces; use discriminated unions for states
  (`{ status: "loading" } | { status: "ok"; data: T } | { status: "error"; error: E }`).
- Generate types from contracts instead of writing them twice: OpenAPI for
  [REST](/concept/rest), codegen for [GraphQL](/technology/graphql), protobuf for
  [gRPC](/technology/grpc), Prisma/Drizzle for the database schema.
- Validate at boundaries with a schema library (Zod, Valibot, ArkType) and infer the
  static type from the schema — types are erased, so untrusted input needs runtime
  checks. See [Serialization](/concept/serialization).
- Let the bundler or runtime strip types (esbuild, Vite, Node's type stripping); run
  `tsc --noEmit` separately for checking.

```ts
import { z } from "zod";

// One schema → runtime validation + static type
const CreateOrder = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1),
  currency: z.enum(["USD", "EUR", "KRW"]),
});
type CreateOrder = z.infer<typeof CreateOrder>;

export async function handler(body: unknown) {
  const order = CreateOrder.parse(body);   // throws on bad input
  return placeOrder(order);                // `order` is fully typed from here on
}
```

Share types between server and client in a monorepo so a renamed field breaks the
build, not production.

## Deep Dive

**Structural typing.** Compatibility is decided by shape, not by name: any object with
`{ id: string; name: string }` satisfies a `User` type. This fits JavaScript's
duck-typed idioms and makes gradual adoption possible, but it also means two unrelated
types with identical fields are interchangeable unless you brand them.

**Inference and narrowing.** The compiler infers most types from initialisers and
return values; control-flow analysis narrows unions (`if ("data" in result)`,
`switch (state.status)`). Good TypeScript has few annotations and many precise unions.
Generics, conditional types and template literal types allow library authors to type
things like ORMs and routers exactly — and to build type-level puzzles that hurt
compile times.

**Types are erased.** `instanceof` on an interface does not exist; a value typed
`User` may be anything at runtime if it came from `JSON.parse` or an `any`. Every
`as` cast and every `any` is a hole in the guarantees. The `unknown` type plus
validation is the honest way to bring data in.

**Compiler performance and the native port.** Type checking large monorepos with
complex generic libraries can take minutes. Microsoft is porting the compiler and
language service to Go (announced 2025, shipping as TypeScript 7); it reports large
speedups, and the 6.x line is the bridge release. Check the current release notes for
which line your tooling targets.

**Module semantics.** TypeScript follows the JavaScript module system it targets
(`"module": "nodenext"` mirrors Node's ESM/CJS rules). Most configuration pain comes
from mismatched module settings between compiler, bundler and runtime rather than from
types.

## Why

JavaScript's flexibility makes a growing codebase brittle. A field rename in an API
response breaks a screen three directories away; a function called with arguments in
the wrong order fails only when that path runs in production; `undefined is not a
function` is the top error in most crash reports. Refactoring means grep and prayer.

```steps
title: Before — plain JavaScript, contracts live in people's heads
Backend renames user.fullName → user.displayName | deploys
Frontend still reads user.fullName | no build error
Page renders "undefined" in the header | caught by a customer
Developer greps for fullName | misses a template string
Second bug ships | three days later ❌
```

With types shared across the boundary, the same rename is a compile error at every use
site — including the template string — before the code is committed. The editor
becomes a precise refactoring tool instead of a text editor.

```steps
title: After — types make the contract explicit and checkable
Backend renames the field in the shared type | `displayName`
tsc reports 14 errors across web and mobile | before commit
Developer uses "Rename Symbol" | all 14 sites updated at once
Runtime validation at the API boundary | rejects payloads with the old shape
Deploy | header renders correctly ✔
```

The gain compounds: autocompletion on every object, documentation that cannot go
stale, and the confidence to refactor large systems continuously.

## Advantages

- Catches whole classes of bugs (typos, null access, wrong arguments, shape mismatches) at compile time
- Precise editor support: autocompletion, go-to-definition, safe renames across a monorepo
- Types double as living documentation for APIs, props and events
- Gradual adoption — mix `.js` and `.ts`, tighten strictness over time
- Contract-driven development: generate types from OpenAPI, GraphQL, protobuf and database schemas
- Massive ecosystem support; nearly every npm package ships or has types

## Trade-offs

- Types vanish at runtime — no protection from untrusted data without separate validation
- `any`, casts and overly clever generics erode the guarantees while looking safe
- Build/type-check step and configuration surface (tsconfig, module settings) add friction
- Type checking large projects is slow; the native compiler is arriving but toolchains are mid-transition
- Advanced type-level programming has a steep learning curve and can produce unreadable errors
- Structural typing lets unrelated types substitute for each other unless you brand them

## When to use

- Any JavaScript codebase expected to live more than a few months or involve more than one developer
- Shared contracts between frontend and backend, especially in a monorepo
- Libraries and SDKs, where consumers rely on your types as documentation
- Backend services in Node.js where request/response shapes and database rows must line up
- Large refactors of existing JavaScript — add types first, then change behaviour

## When not to use

- Don't use TypeScript for a throwaway script or a one-file prototype — the setup outweighs the benefit
- When the team has no time to learn it and would sprinkle `any` everywhere, which is JavaScript with extra steps
- For runtime input validation on its own — pair it with a schema validator or the types are decorative
- In environments where the build step is unwelcome and plain JavaScript with JSDoc types gives most of the value
- When the project is in another language ecosystem and the JavaScript surface is trivial

## Real-world

TypeScript is now the assumed language on both sides of a web product: the
[React](/technology/react) client and the [Node.js](/technology/nodejs) API in a
[Simple Web App](/architecture/simple-web-app) share a `types` package so an API change
fails the frontend build; an [E-commerce](/architecture/e-commerce) platform generates
types from its OpenAPI spec and database schema so cart, pricing and checkout agree on
what an `Order` is; a [Chat System](/architecture/chat-system) types its WebSocket
message envelope as a discriminated union so every consumer handles every event kind.
Beyond web, it is the language of most build tooling, infrastructure-as-code SDKs and
serverless platforms in the JavaScript world.
