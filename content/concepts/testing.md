---
id: testing
name: Testing
tagline: Fast checks for logic, slower ones for the journeys that must never break
category: quality
tags: [Testing, Quality, Automation, Delivery]
difficulty: 2
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - testing
  - ci-cd
  - github-actions
  - contract-testing
  - load-testing
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: github-actions, rel: RELATED_TO }
  - { to: contract-testing, rel: RELATED_TO }
  - { to: chaos-engineering, rel: RELATED_TO }
  - { to: load-testing, rel: RELATED_TO }
  - { to: accessibility, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A test suite is a portfolio of checks with different costs and payoffs: unit tests are
near-instant and prove small pieces of logic, integration tests exercise real wiring
between a few components, and end-to-end tests drive the whole product as a user does.
Each catches failures the others cannot, at a price in runtime and maintenance. The useful
question is never "what is our coverage?" but "which failures would reach production?"

## Why it matters

Tests exist to let you change code. A codebase without them is not safer for being
untested; it is one where every refactor is a gamble and every dependency upgrade is
deferred, so it ossifies. Tests are also the fastest feedback loop a developer has: a
failure found in a second costs nothing, the same failure found in review costs an hour,
in staging a day, and in production an incident plus a rollback.

The second reason is delivery. Continuous deployment is only possible when a pipeline can
answer "is this safe to ship?" without a human. That is why the suite's *speed* is a
first-class property: a thirty-second suite is run constantly and a forty-minute one is
avoided, so the slow suite protects less in practice despite testing more on paper. See
[CI/CD](/concept/ci-cd).

## Visual

```compare
title: What each layer costs and catches
Property        | Unit                     | Integration                | End-to-end
Scope           | One function or component | A few real parts together | The deployed system
Typical runtime | Milliseconds             | Seconds                    | Tens of seconds per case
Feedback loop   | While typing             | On save or on push         | In the pipeline
Catches         | Logic, edge cases, branches | Wiring, queries, serialisation, config | Real user journeys, integration of everything
Misses          | Anything between the pieces | Anything outside the chosen boundary | Rare branches, precise edge cases
Flakiness risk  | Very low                 | Low to moderate            | High, needs active care
Failure message | Names the exact line     | Names the seam             | Says the checkout page broke, somewhere
Maintenance cost | Rises with mocking      | Moderate                   | High, brittle to UI change
Good use        | Pure logic, reducers, formatting, permissions | Repository and API layer, component behaviour | The handful of flows that must never break
```

## Solutions

**Unit tests for logic that is worth stating twice.** Pricing rules, permission checks,
parsers, reducers, date handling, retry back-off. They are cheap enough to write for every
branch and they document intent. They are also the layer most easily wasted: a test that
mocks everything a function touches and then asserts the function called its mocks proves
only that the code is the code it is.

**Integration tests for the seams.** Most production bugs live between components, not
inside them — a query that returns the wrong shape, a serialiser that drops a field, a
config that points somewhere else in staging. A test that runs the real handler against a
real database in a container catches those, and stays valid through refactoring because it
asserts behaviour rather than structure. This layer usually deserves the largest share of
effort.

**End-to-end tests for the few journeys that must work.** Sign up, log in, add to cart,
check out, the one report the business runs on. Write them against user-visible behaviour
(roles, labels, text) rather than CSS selectors, keep them few, and accept that they will
find whole classes of failure nothing else can — a missing environment variable, a broken
build, a redirect loop.

**Static checks before any of them.** A type checker, a linter and a formatter remove a
large class of failures with zero runtime cost. It is not a substitute for tests, but it is
the cheapest layer in the portfolio.

## Deep Dive

**Test doubles are a design decision.** A *stub* returns canned answers, a *fake* is a
working lightweight implementation (an in-memory repository), a *mock* asserts that
specific calls happened, and a *spy* records them. Prefer fakes and stubs at the edges of
your system — the network, the clock, the payment provider — and use mocks sparingly: a
mock encodes *how* your code works, so every refactor breaks tests that were not testing
anything a user cares about. Containers have made "use the real thing" viable for
databases and queues.

**Flakiness destroys the value of a suite.** A test that fails one run in twenty teaches
the team to re-run rather than investigate, and once that habit exists a real failure is
indistinguishable from noise. The usual causes are time (fixed sleeps instead of waiting
for a condition), shared state between tests, ordering assumptions, real network calls, and
unhandled async work. Treat a flaky test as a defect with an owner: quarantine it out of
the required check, fix it or delete it — never leave it failing intermittently in the
gate.

**Coverage is a diagnostic, not a target.** It reliably shows what is *not* tested, which
is useful. As a target it produces tests written to execute lines without asserting
anything meaningful. Mutation testing answers the better question — if the code were
subtly wrong, would anything fail?

**Determinism is a property you build in.** Inject the clock, seed the randomness, isolate
each test's data, and let tests run in parallel in any order. A suite that only passes when
run alphabetically on one machine will not survive its first pipeline change — see
[GitHub Actions](/technology/github-actions).

**Different layers answer different questions.** Distributed systems need failure injection
to test their resilience assumptions ([Chaos Engineering](/concept/chaos-engineering)),
capacity claims need traffic ([Load Testing](/concept/load-testing)), independently
deployed services need agreement on their interfaces
([Contract Testing](/concept/contract-testing)), and interfaces need to work for everyone
([Accessibility](/concept/accessibility)). None of these is covered by a unit test suite,
however green.

**Not all confidence comes from tests.** Canary releases, health checks and good
observability catch what testing cannot — the behaviour of real traffic on real data. A
[Feature Flag](/pattern/feature-flag) that disables a change in seconds is sometimes a
better investment than the test that would have caught it, and an honest test strategy
names both.
