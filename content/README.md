# TechFlow content

Everything a visitor reads lives here as Markdown or JSON. Every file is a **node in one
knowledge graph**; links between nodes are explicit. Run `pnpm validate` after editing —
broken links, missing sections and bad shapes fail the build.

```
content/
├── technologies/   *.md   Redis, PostgreSQL, Kafka …
├── concepts/       *.md   Cache, Transaction, Idempotency …
├── patterns/       *.md   Cache Aside, Outbox, Circuit Breaker …
├── architectures/  *.json Chat system, E-commerce … (interactive diagrams)
├── comparisons/    *.md   Redis vs Memcached, WebSocket vs SSE …
├── roadmaps/       *.json Backend, Frontend …
├── stacks/         *.json Real-world stack archetypes
├── challenges/     *.json Design challenge questions
├── radar.json             Technology radar assessment
├── system-designs/ *.json URL shortener … (step-by-step scale journey)
└── builds/         *.json "I want to build…" goals
```

The filename **must equal the `id`** (kebab-case). Write in English (the product UI is English).

## Content principles

Every technology/concept/pattern answers: *What? Why? How? When? Why not? Alternative?
Related? Prerequisites? Trade-offs? Real-world usage?* Never present a technology as
"good" — show when it fits and when it doesn't. Prefer short paragraphs, lists and the
visual fences below over long prose. Avoid marketing tone. Do not invent facts about
specific companies.

## Markdown nodes (`technologies/`, `concepts/`, `patterns/`)

```yaml
---
id: redis
name: Redis
tagline: In-memory data structure store          # ≤ 90 chars, no trailing period
category: database                                # database | messaging | networking | protocol | backend | frontend | infrastructure | data | security | architecture | fundamentals
tags: [Database, Cache, Distributed System]       # human labels shown as chips
difficulty: 3                                     # 1 beginner … 5 expert
usedFor: [cache, session, distributed-lock]       # concept ids — "Used for" chips (technologies only)
prerequisites: [http, backend, database, cache]   # ORDERED chain of node ids, simple → this node
learningPath:                                     # ORDERED; node ids preferred, free text allowed
  - programming-fundamentals
  - http
  - database
related:                                          # explicit graph edges
  - { to: cache, rel: RELATED_TO }
  - { to: memcached, rel: ALTERNATIVE_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: chat-system, rel: USED_IN }              # architectures are nodes too
  - { to: cache-aside, rel: IMPLEMENTS }           # pattern this tech implements / concept this pattern solves
meta: { lastReviewed: 2026-09-09, version: "Redis 8.x", confidence: high }
---
```

Relations: `RELATED_TO`, `USED_IN`, `USED_WITH`, `ALTERNATIVE_TO`, `REQUIRES`, `IMPLEMENTS`,
`SOLVES`, `PART_OF`. `ALTERNATIVE_TO`, `USED_WITH`, `RELATED_TO` are symmetric (declare once).
Edges are also **derived** automatically from `usedFor`, `prerequisites`, `learningPath`,
architecture node `ref`s, comparison `subjects` and roadmap steps — so you rarely need
more than 4–8 explicit `related` entries. Aim for ≥ 5 total edges per node.

### Body = H2 sections

The body is split on `## Heading`. Known headings get a designed layout; unknown headings are
rendered in order as plain sections.

**Technology** (required: TL;DR, Why, Advantages, Trade-offs, When to use, When not to use)

```
## TL;DR            Level 1 — 30-second understanding. 2–4 sentences.
## Practical        Level 2 — how it is actually used in projects. Lists, short code.
## Deep Dive        Level 3 — internals, performance, distributed-systems view.
## Why              The problem it solves. MUST include a before/after `sequence` or `steps` fence.
## Advantages       bullet list, start each with "+ " is NOT needed — plain "- " bullets
## Trade-offs       bullet list
## When to use      bullet list
## When not to use  bullet list  ("Don't use X when …")
## Real-world       where this shows up in production systems (generic, no unverifiable company claims)
```

**Concept** (required: TL;DR, Why it matters) — add `## Visual` with a fence (`timeline`,
`sequence`, `steps`), `## Solutions` (how the problem is solved), `## Deep Dive`.

**Pattern** (required: Problem, Solution, How it works, Advantages, Disadvantages, When to
use, When not to use) — `## Solution` MUST include a `sequence` or `steps` fence.

### Visual fences

Use these instead of ASCII art. They render as interactive, animated SVG/HTML.

````
```steps
title: Prerequisites            # optional
HTTP [http]                     # "[node-id]" makes the step a link
Backend [backend]
Database [database]
Caching [cache] | keep hot data in memory     # "| note" adds a caption
Redis [redis]
```
````

````
```sequence
title: Cache miss
participants: Client, API, Redis [redis], DB [postgresql]
Client -> API: GET /user/1
API -> Redis: GET user:1
Redis --> API: MISS                 # "-->" = dashed reply
API -> DB: SELECT …
DB --> API: row
API -> Redis: SET user:1 (TTL 60s)
API --> Client: 200 OK
```
````

````
```compare
Feature        | Redis    | Memcached
Data structure | Rich     | Simple
Persistence    | Yes      | Limited
Pub/Sub        | Yes      | No
```
````

````
```decision
? Need rich data structures (lists, sets, sorted sets)?
  YES -> Redis [redis]
  NO -> ? Is simple key/value caching enough?
    YES -> Memcached [memcached]
    NO -> Reconsider — a database may fit better
```
````

````
```timeline
title: Lost update
Thread A                | Thread B
read balance = 100      |
                        | read balance = 100
balance -= 50           |
                        | balance -= 80
write 50                |
                        | write 20 ❌
```
````

Regular fences (`ts`, `sql`, `json`, `http`, `bash`, `text`) render as code.
Internal links: `[Cache Aside](/pattern/cache-aside)` — they are validated.

## Architectures (`architectures/*.json`)

```jsonc
{
  "id": "chat-system",
  "name": "Chat System",
  "tagline": "Real-time messaging with fan-out",
  "summary": "2–3 sentences.",
  "category": "system", "tags": ["Real-time", "Messaging"], "difficulty": 4,
  "nodes": [
    // x = column, y = row on a grid (0-based). Keep ≤ 6 columns, ≤ 6 rows.
    { "id": "browser", "label": "Browser", "kind": "client", "x": 2, "y": 0,
      "ref": "websocket", "role": "Client", "why": "…", "alternatives": [], "related": ["websocket"] },
    { "id": "redis", "label": "Redis", "kind": "cache", "x": 2, "y": 3,
      "ref": "redis", "role": "Pub/Sub + presence", "why": "Fast shared state between chat servers",
      "alternatives": ["memcached"], "related": ["pub-sub", "session"] }
  ],
  "edges": [ { "from": "browser", "to": "lb", "label": "WebSocket" },
             { "from": "chat-1", "to": "kafka", "label": "event", "style": "dashed" } ],
  "flows": [
    { "id": "send", "name": "Send a message",
      "path": ["browser", "lb", "chat-1", "redis", "kafka", "notification"],
      "steps": ["Client sends over WebSocket", "LB routes sticky", "Server persists & publishes", "Redis fans out to other servers", "Kafka records the event", "Notification service pushes to offline users"] }
  ],
  "decisions": [
    { "decision": "Use Redis Pub/Sub for fan-out", "why": "…", "alternatives": ["kafka"], "tradeoff": "…" }
  ],
  "versions": [ { "version": "v1", "title": "Monolith", "summary": "…", "nodes": ["browser", "api", "db"] } ],
  "textAlternative": "Plain-language description of the diagram for screen readers.",
  "related": [ { "to": "pub-sub", "rel": "RELATED_TO" } ]
}
```

`kind`: `client | edge | lb | service | cache | db | queue | storage | external | worker`.
`ref`, `alternatives`, `related` must be existing node ids. Every architecture needs ≥ 1 flow.

## Comparisons (`comparisons/*.md`)

Frontmatter: `id, name, tagline, subjects: [redis, memcached], tags, difficulty, related`.
Body sections: `## TL;DR`, `## Comparison` (a `compare` fence), `## Decision` (a `decision`
fence), `## When X`, `## When Y`, `## Deep Dive`.

## Roadmaps (`roadmaps/*.json`)

`{ id, name, tagline, summary, steps: [{ ref?, label, note?, stage? }] }` — ordered.

## System designs (`system-designs/*.json`)

`{ id, name, tagline, summary, requirements: [], steps: [{ title, scale?, problem, why, alternatives?, nodes, edges }] }`
— each step is a small architecture (same node/edge shape) showing how the system grows.

## Build goals (`builds/*.json`)

`{ id, name, tagline, architecture, systemDesign?, technologies: [], concepts: [], patterns: [], learningPath: [] }`.

## Real-world stacks (`stacks/*.json`)

Archetype stacks — **never** presented as a specific company's stack.

```jsonc
{
  "id": "modern-saas",
  "name": "Modern B2B SaaS",
  "tagline": "≤ 90 chars",
  "summary": "2–3 sentences on what this stack is for.",
  "basis": "Where this comes from. Required — it is rendered to the reader.",
  "updated": "2026-09-10",
  "confidence": "high",          // high | medium | low
  "layers": [
    { "label": "Data", "items": [
      { "ref": "postgresql", "note": "why this piece is here" },
      { "label": "Managed platform (PaaS)", "note": "free text when no page exists yet" }
    ]}
  ],
  "whenToUse": ["..."],           // "Fits when"
  "tradeoffs": ["..."],           // "What it costs you" — required, be honest
  "related": ["multi-tenant-saas", "rbac"]
}
```

Every `ref` must be an existing node id. Stacks are not graph nodes: they do not appear in
search or the graph, they live at `/stack/<id>`.

## Design challenges (`challenges/*.json`)

```jsonc
{
  "id": "double-charge",
  "question": "One concrete design question.",
  "context": "The constraints that make the answer non-obvious.",
  "difficulty": 3,
  "options": [                    // 2+; exactly the ones a real engineer would consider
    { "label": "…", "correct": true,  "why": "why this fits", "ref": "idempotency" },
    { "label": "…", "correct": false, "why": "why this looks right but is not", "ref": "transaction" }
  ],
  "related": ["idempotency", "payment-system"]
}
```

Wrong options must be *plausible* and their `why` must teach something. At least one option
must be `correct: true`. The home page features one per day, deterministically.

## Technology radar (`radar.json`)

```jsonc
{
  "assessedOn": "2026-09-09",
  "method": "How to read this. Required — rendered on the page.",
  "entries": [
    { "ref": "redis", "ring": "adopt", "quadrant": "data-messaging",
      "note": "One sentence: why this ring, today.", "moved": "new" }
  ]
}
```

`ring`: `adopt | trial | assess | caution`. `quadrant`: `languages-interfaces |
platforms-delivery | data-messaging | architecture-operations` — keep the four roughly
balanced, or labels collide in the chart. Rings describe how confidently
*we* would start a new project with the item — never an absolute quality ranking.
