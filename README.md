# TechFlow

**Understand technology. See how it connects.**

TechFlow is an interactive developer knowledge graph. Technologies, concepts, patterns,
architectures, comparisons, roadmaps and system designs are nodes in one graph; every page
links to the nodes around it, and the diagrams are live (force graphs, animated request
flows, interactive decision trees) rather than pictures.

## Stack

- Next.js 16 (App Router, `output: "export"` — plain static HTML in `out/`), React 19, TypeScript
- Tailwind CSS v4 with CSS-variable design tokens (dark default, follows OS, manual toggle)
- Content as Markdown + JSON in `content/` — no database, no backend
- `d3-force` for graph layout; everything else is hand-written SVG
- Geist Sans / Geist Mono

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm validate     # checks every content file + graph links (also runs before build)
pnpm build        # static production build
pnpm lint && pnpm typecheck
```

## Project layout

```
content/                 all content — see content/README.md for the authoring guide
  technologies/ concepts/ patterns/     Markdown nodes (frontmatter + H2 sections)
  architectures/ system-designs/        JSON diagrams (nodes, edges, flows, decisions, versions)
  comparisons/ roadmaps/ builds/        comparisons (md), roadmaps + "I want to build" goals (json)
  NODES.md                             master list of node ids
scripts/validate-content.ts            content validator (broken links fail the build)
src/lib/content/                       loader → knowledge graph (edges, neighbours, ego graphs, search index)
src/lib/fences.ts                      parsers for the visual code fences (steps / sequence / compare / decision / timeline)
src/lib/intent.ts                      recognises a typed question (goal / why / compare / how / learn) — keyword matching, no model
src/components/md/                     Markdown renderer + fence components
src/components/graph/                  RelationshipGraph (force layout) + lazy loader
src/components/canvas/                 ArchitectureCanvas (zoom/pan, ▶ Run, inspector, versions), StepJourney
src/components/detail/                 shared detail-page building blocks (levels, learning path, neighbours, TOC)
src/components/radar/                  Technology Radar chart
src/components/playground/             browser-only simulators (HTTP, cache, rate limiter, load balancer, transports, JWT)
src/app/                               routes: /technology /concept /pattern /architecture /compare /roadmap
                                       /system-design /build /stack /radar /playground /challenge /search /explore
```

## Adding content

1. Pick an id from `content/NODES.md` (or add one there).
2. Copy the closest existing file (`content/technologies/redis.md` is the reference) and follow `content/README.md`.
3. Run `pnpm validate` — it fails on unknown ids, missing required sections and unknown fences.

Edges are declared in frontmatter (`related`) and derived automatically from `usedFor`,
`prerequisites`, `learningPath`, architecture node `ref`s, comparison `subjects` and roadmap steps.

## What is on the site

| Area | Route | What it does |
| --- | --- | --- |
| Knowledge graph | `/explore`, every detail page | Force-directed graph of all nodes; hover a neighbourhood, click to open |
| Technologies / Concepts / Patterns | `/technology`, `/concept`, `/pattern` | Three depth levels, trade-offs, prerequisites, learning path, animated diagrams |
| Architecture Explorer | `/architecture` | Interactive diagrams: ▶ Run animates a request, inspector per component, version evolution |
| System Design | `/system-design` | Step-by-step scale journeys with the reasoning and alternatives at each step |
| Comparisons | `/compare` | Feature matrices plus an interactive decision tree, and a "which would you pick" vote |
| Roadmaps | `/roadmap` | Ordered learning paths with local progress tracking |
| Real-world stacks | `/stack` | Which technologies get combined in practice, layer by layer, with the costs |
| Technology Radar | `/radar` | Adopt / Trial / Assess / Caution with dated, sourced reasoning |
| Playground | `/playground` | HTTP anatomy, cache, rate limiter, load balancer, real-time transports, JWT — all client-side |
| Design challenges | `/challenge` | Multiple-choice design questions that explain every option |
| Search | `/search`, `⌘K` | Keyword search over the graph, plus question answering: a typed sentence is matched to a goal, a comparison or the pages for what it names |

## Keyboard

`/` or `⌘K` search · `G` then `T/C/P/A/S/M/R` jump to a section · `⌘⇧D` developer mode ·
on a diagram: `space` run, `→` step, `f` fit.

## Deployment

The site is 100% static. `pnpm build` writes `out/`, which any static host can serve.
`.github/workflows/deploy.yml` builds on every push to `main` and publishes to GitHub Pages.
One repository setting is required first: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The workflow token is not allowed to create the Pages site itself,
so until that is set the build job passes and the deploy job fails. For a sub-path host it sets
`NEXT_PUBLIC_BASE_PATH=/<repo>`; on a custom domain remove that variable and set
`NEXT_PUBLIC_SITE_URL` to the domain so canonical / sitemap URLs are right.

## Question answering

`/search` accepts sentences, not just keywords. "I want to build a chat app but I don't
understand why I need Redis and Kafka" resolves to the real-time chat goal plus the Redis and
Kafka pages. It is keyword matching against the graph in the browser — no model, no network —
and it says so on the card, falling back to ranked results when it cannot read the question.
The recognisers live in `src/lib/intent.ts`; goal keywords are the `GOAL_WORDS` table.

## Personal state

There are no accounts and no backend. Learning-path checkboxes, recently viewed, streak and
theme live in the visitor's `localStorage` only.
