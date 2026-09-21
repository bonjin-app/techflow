# Contributing

Most changes here are content. The code exists to render it, and the checks
exist to stop the graph rotting quietly.

## Before you open a pull request

```bash
pnpm install
pnpm validate      # content, graph links, example questions, path algorithms
pnpm test          # unit tests (run `pnpm gen` once first)
pnpm lint && pnpm typecheck
pnpm build && pnpm check:links && pnpm check:build
pnpm e2e           # needs `pnpm exec playwright install chromium` once
```

CI runs exactly these on every pull request. If one fails locally it will fail
there, and the message names the file and the rule.

`pnpm e2e` is four sweeps over the built export, each generated from the real
sitemap rather than a hand-written list:

| Sweep | What it would have caught |
| --- | --- |
| `journeys` | A reader cannot get from the front page to an answer |
| `mobile` | A page scrolls sideways on a phone |
| `a11y` | axe-core: contrast, roles, labels — 106 of these were live. Themes alternate by page, because Playwright renders light by default and 290 pages of dark mode went unchecked |
| `keyboard` | Focus traps, dead skip links, silent comboboxes |
| `perf` | Content that jumps after paint, or a blocked main thread |

The performance budgets are far above what the site does today (layout shift
near zero, ~300ms blocked at 4x CPU throttling). They exist to catch a
collapse — a heavy library pulled into the shared bundle — not to police
milliseconds, because measurement showed there was nothing there to win.

## Writing content

`content/README.md` is the authoring guide: frontmatter fields, the required
sections per node type, and the visual fence grammars. Three rules matter more
than the rest:

1. **Every page says when not to use the thing.** A page that only recommends
   is not finished. Comparisons must carry a decision tree and a section per
   subject for the same reason.
2. **Link where the question comes up**, not only in the frontmatter. `pnpm gaps`
   lists terms the content leans on with no page behind them; that is how waves
   7 and 8 were chosen.
3. **Never put a Markdown link inside a visual fence or a JSON file.** Both print
   as plain text, so the reader sees raw brackets. `pnpm validate` fails on it.

## Writing code

- `src/lib/*.ts` holds the pure logic — graph algorithms, search, the question
  parser, the fence grammars. Anything that can be a pure function over data
  should be, because that is what `tests/` can exercise.
- The React compiler rules are enforced by lint: no `setState` in an effect
  body, no ref reads during render, no impure calls during render.
- The site is a static export. There is no server, no database and no account;
  personal state is `localStorage` and must degrade to "no state" when storage
  throws.

## What gets rejected

Content that recommends without qualifying, claims about a named company that
cannot be verified, a page with no review date, and anything that makes the
build green by weakening a check rather than fixing what it found.
