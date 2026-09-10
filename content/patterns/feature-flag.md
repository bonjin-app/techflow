---
id: feature-flag
name: Feature Flag
tagline: Decouple releasing a feature from deploying the code that contains it
category: deployment
tags: [Deployment, CI/CD, Release]
difficulty: 2
prerequisites: [backend, http, ci-cd]
learningPath:
  - backend
  - http
  - ci-cd
  - feature-flag
  - canary-release
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: availability, rel: SOLVES }
  - { to: redis, rel: USED_WITH }
  - { to: canary-release, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: ALTERNATIVE_TO }
  - { to: strangler-fig, rel: USED_WITH }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Deploying code and releasing a feature are usually the same event, and that
couples engineering to product in painful ways. A half-finished feature cannot be
merged, so it lives on a long-running branch that diverges for six weeks and
produces a merge nobody can review. A feature that must launch at 9 a.m. on
Tuesday requires a deploy at 9 a.m. on Tuesday. And a feature that turns out to
be broken can only be removed by deploying again — which takes as long as your
pipeline does, at the worst possible moment.

The underlying issue is that the decision "should users see this?" is encoded in
which artifact is running, and changing the artifact is slow, risky and
coordinated.

## Solution

Put the feature behind a **runtime condition** — a flag — evaluated per request.
The code ships to production disabled. Turning the feature on is a configuration
change that takes effect in seconds, for everyone or for a chosen subset.

```sequence
title: Ship dark, enable for a segment, kill instantly
participants: User [http], App [backend], Flags [redis], New Path [backend], Old Path [backend]
App -> Flags: evaluate new-checkout for user 42
Flags --> App: off (0% rollout)
App -> Old Path: current behaviour
App -> Flags: evaluate for user 42 (internal staff on)
Flags --> App: on
App -> New Path: new behaviour
App -> Flags: evaluate (5% of all users)
Flags --> App: on for hashed bucket
App -> New Path: new behaviour
Flags -> Flags: incident — kill switch set to off
App -> Old Path: back to current behaviour, no deploy
```

```steps
title: Lifecycle of a flag
Add the flag, default off, and merge the unfinished feature [ci-cd] | trunk stays mergeable
Deploy — the code is in production but dark
Enable for the team, then internal staff
Ramp by percentage and compare metrics [canary-release]
100% for a stabilisation period with the old path still present
Delete the flag and the old path | this step is the one teams skip
```

## How it works

A flag is a named decision plus a targeting rule, evaluated against a context
(user id, plan, region, request attributes). The evaluation must be local and
fast — a network call per flag per request is not acceptable — so clients
subscribe to the ruleset, cache it in memory and evaluate offline, refreshing on
change.

```ts
if (flags.enabled("new-checkout", { userId: user.id, plan: user.plan })) {
  return newCheckout(cart);
}
return legacyCheckout(cart);
```

Percentage rollouts must be **sticky**: hash the user id with the flag key so a
user who gets the new checkout keeps getting it. Random per-request evaluation
makes the experience flicker and makes metrics uninterpretable.

Flags come in kinds with very different lifetimes, and conflating them is the
main source of trouble. **Release flags** exist to ship dark and ramp up; they
should be deleted within weeks. **Kill switches** are permanent operational
controls for expensive or fragile dependencies. **Experiment flags** back A/B
tests and end when the experiment concludes. **Permission flags** gate features
by plan or entitlement — these are really product configuration and belong in
your [authorisation](/concept/rbac) model, not in the release flag system.

Two flags mean four code paths; ten interacting flags mean a state space nobody
tests. That is the real cost, and it is why the delete step is load-bearing: a
codebase with 300 stale flags has 300 untested branches and an unreadable
checkout function.

## Advantages

- Deploy continuously while releasing on a product schedule
- Kill switch in seconds, with no pipeline, no rebuild, no rollback deploy
- Trunk-based development becomes practical — no long-lived feature branches
- Targeting enables internal-first testing, beta cohorts and per-plan features
- The natural substrate for A/B tests, since the same mechanism assigns users
- Combines with a [Strangler Fig](/pattern/strangler-fig) migration to route users between old and new implementations

## Disadvantages

- Every flag doubles the paths through the code; combinations grow exponentially and are untested
- Stale flags are technical debt that compounds — cleanup is unglamorous and always deprioritised
- Flag state is production configuration that can break the system, often without review or an audit trail
- Testing must cover both sides of every meaningful flag, or you ship an untested path
- The flag service becomes a critical dependency; it needs safe defaults and local caching for when it is unreachable
- Flags inside data-layer or migration code can leave inconsistent data written by two different code paths

## When to use

- A feature must be merged before it is finished, or launched at a specific time
- A risky change needs an instant off switch independent of deployment
- You want percentage rollouts or internal-first exposure per user rather than per instance
- Running A/B tests or gating features by plan or cohort
- Practising trunk-based development with frequent deploys

## When not to use

- Small, low-risk changes — a flag costs more than it saves
- Schema and data migrations: a flag cannot un-write rows, and both paths writing different shapes creates inconsistency
- As a substitute for [API versioning](/pattern/api-versioning) on a public contract
- Long-term entitlements and permissions — model those explicitly instead
- Your team has no process or budget for removing flags; unbounded flag debt is worse than slower releases

## Real-world

Feature flags are how large web products release: code merges to trunk daily,
features go live by configuration, and every expensive dependency has a kill
switch used during incidents. They pair with
[Canary Release](/pattern/canary-release) — the canary limits exposure per
instance while flags limit it per user — and with
[Blue-Green Deployment](/pattern/blue-green-deployment), where flags cover the
cases a routing flip cannot: turning off one feature without reverting an entire
release. The [E-commerce](/architecture/e-commerce) checkout is the archetypal
place for one: a new payment path behind a flag, ramped by user percentage, with
an immediate kill switch when authorisation failures rise.
