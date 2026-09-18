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
pnpm validate     # content, graph links, and the example questions (also runs before build)
pnpm build        # static production build
pnpm test         # unit tests (vitest) — needs `pnpm gen` once for the generated JSON
pnpm lint && pnpm typecheck
pnpm check:links  # after a build: links, sitemap coverage, published API
```

## Project layout

```
content/                 all content — see content/README.md for the authoring guide
  technologies/ concepts/ patterns/     Markdown nodes (frontmatter + H2 sections)
  architectures/ system-designs/        JSON diagrams (nodes, edges, flows, decisions, versions)
  comparisons/ roadmaps/ builds/        comparisons (md), roadmaps + "I want to build" goals (json)
  NODES.md                             master list of node ids
scripts/validate-content.ts            content validator (broken links fail the build)
scripts/gen-api.ts                     writes public/api/*.json and llms.txt
scripts/check-links.ts                 asserts every link in out/ resolves
src/lib/content/                       loader → knowledge graph (edges, neighbours, ego graphs, search index)
src/lib/fences.ts                      parsers for the visual code fences (steps / sequence / compare / decision / timeline)
src/lib/intent.ts                      recognises a typed question (goal / why / compare / how / learn) — keyword matching, no model
src/components/md/                     Markdown renderer + fence components
src/components/graph/                  RelationshipGraph (force layout), MindMap (two-sided radial), lazy loader
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
| Your progress | `/you` | What this browser remembers, crossed against the prerequisite graph: which pages are readable now, which are one page away, and which single page would open the most of them |
| Find a path | `/path`, `?from=&to=` | Two questions a list of pages cannot answer: how are these two connected (weighted so the route avoids hub pages), and what do I need to read first (prerequisites, topologically ordered, minus what you have ticked as known) |
| Mind map | `/map`, `?focus=<id>` | One centre, a branch per relationship kind, leaves stacked in columns. Clicking a leaf re-centres without a page load and keeps a trail; copies out as Mermaid |
| Technologies / Concepts / Patterns | `/technology`, `/concept`, `/pattern` | Three depth levels, trade-offs, prerequisites, learning path, animated diagrams |
| Architecture Explorer | `/architecture` | Interactive diagrams: ▶ Run animates a request, inspector per component, version evolution |
| System Design | `/system-design` | Step-by-step scale journeys with the reasoning and alternatives at each step |
| Comparisons | `/compare` | Feature matrices plus an interactive decision tree, and a "which would you pick" vote |
| Roadmaps | `/roadmap` | Ordered learning paths with local progress tracking |
| Real-world stacks | `/stack` | Which technologies get combined in practice, layer by layer, with the costs |
| Technology Radar | `/radar` | Adopt / Trial / Assess / Caution with dated, sourced reasoning |
| Playground | `/playground` | HTTP anatomy, cache, rate limiter, load balancer, real-time transports, JWT — all client-side |
| Design challenges | `/challenge` | Multiple-choice design questions that explain every option |
| JSON API | `/api-docs`, `/api/*.json` | The whole graph as static JSON — no key, no rate limit, regenerated every build |
| Search | `/search`, `⌘K` | Keyword search over the graph, plus question answering: a typed sentence is matched to a goal, a comparison or the pages for what it names |

Every technology, concept, pattern, architecture and system design page also carries a
**Try it** section linking to the playgrounds, design challenges, stacks and build goals that
reference it — the interactive half of the site reached from the page rather than from an
index.

## Keyboard

`/` or `⌘K` search · `⌘⇧D` developer mode · on a diagram: `space` run, `→` step, `f` fit.

`G` then a letter jumps: `H` home, `E` explore, `T` technologies, `C` concepts, `P` patterns,
`A` architecture, `S` system design, `V` compare (as in "vs"), `R` roadmaps, `M` mind map,
`K` stacks, `D` radar, `Y` playground. The command palette lists them all with their keys.

## Checks

Every gate runs on pull requests (`.github/workflows/ci.yml`) and again before deploy:

| Command | What it protects |
| --- | --- |
| `pnpm validate` | required sections, graph links and their types, prerequisite cycles, comparison structure, review dates, the four example questions, keyword ranking and the path algorithms |
| `pnpm test` | 55 unit tests over the pure logic: path finding, learning routes, the frontier, search ranking and typo tolerance, question parsing, the fence grammars, and localStorage behaviour including private mode |
| `pnpm lint` / `pnpm typecheck` | React compiler rules and types |
| `pnpm check:links` | 23,000 internal links, sitemap coverage, and that the published JSON API matches what was built |

## Deployment

The site is 100% static. `pnpm build` writes `out/`, which any static host can serve.
`.github/workflows/deploy.yml` builds on every push to `main` and publishes to GitHub Pages.
One repository setting is required first: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The workflow token is not allowed to create the Pages site itself,
so until that is set the build job passes and the deploy job fails. For a sub-path host it sets
`NEXT_PUBLIC_BASE_PATH=/<repo>`; on a custom domain remove that variable and set
`NEXT_PUBLIC_SITE_URL` to the domain so canonical / sitemap URLs are right.

## For developers

The graph is published as static JSON next to the pages, so tools can read it without
scraping: `/api/graph.json` (all nodes and edges plus the relation vocabulary),
`/api/nodes/{id}.json` (one node with its neighbourhood), `/search-index.json`, and
`/llms.txt`. `/api-docs` documents them with curl examples. All of it is regenerated by
`pnpm gen` on every build, so it can never drift from the site.

The mind map also copies itself out as a Mermaid graph, which pastes straight into a
README or a design doc.

## Question answering

`/search` accepts sentences, not just keywords. "I want to build a chat app but I don't
understand why I need Redis and Kafka" resolves to the real-time chat goal plus the Redis and
Kafka pages. It is keyword matching against the graph in the browser — no model, no network —
and it says so on the card, falling back to ranked results when it cannot read the question.
The path finder in `src/lib/path.ts` answers the other two shapes of question — a weighted
Dijkstra between any two pages, and a topological sort of a target's prerequisites. Both run
against `/api/graph.json` in the browser, and both are asserted by `pnpm check:intent`.

The recognisers live in `src/lib/intent.ts`; goal keywords are the `GOAL_WORDS` table and
abbreviations are shared with search in `src/lib/aliases.ts`. The four questions the product
was specified around — "Why Redis?", "When is Kafka needed?", "WebSocket vs SSE?", "How do I
design a payment system?" — are asserted by `pnpm check:intent`, along with the keyword
rankings, because three of the four broke once without anyone noticing.

## Personal state

There are no accounts and no backend. Learning-path checkboxes, recently viewed, streak and
theme live in the visitor's `localStorage` only. `/you` is the one place that reads all of it
at once — and it can also forget all of it, which is the only honest thing to offer when
there is nothing to log out of.
