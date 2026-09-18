# Security

TechFlow is a static site. There is no server, no database, no account and no
user data: everything a visitor does stays in their browser's `localStorage`,
and the only network requests are for the site's own static files.

That removes most of the usual surface, and leaves three things worth reporting.

## What to report

- **A way to run script in a visitor's browser** — for example content that
  escapes the Markdown renderer, or a URL parameter that reaches the DOM.
- **A supply-chain problem** in a dependency that ships to the browser.
- **A workflow or build issue** that could let someone publish to the site.

## What is not a vulnerability

- Anything about content accuracy — open a normal issue.
- The published `/api/*.json`. It is deliberately public, has no key and no rate
  limit, and contains only what the pages already show.
- `localStorage` being readable by the person whose browser it is. That is where
  their own ticks and streak live, by design.

## How to report

Open a [private security advisory](https://github.com/bonjin-app/techflow/security/advisories/new)
rather than a public issue, and give a description and the steps to reproduce.
Expect an acknowledgement within a week. There is no bounty programme.
