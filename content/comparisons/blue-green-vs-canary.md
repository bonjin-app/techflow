---
id: blue-green-vs-canary
name: Blue-Green vs Canary
tagline: Switch everyone at once and keep the old version warm, or move a slice at a time and watch
category: decision
tags: [Deployment, Release, Operations, Risk, Decision]
difficulty: 3
subjects: [blue-green-deployment, canary-release]
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-22, confidence: high }
---

## TL;DR

Both exist so that a bad release is survivable.
[Blue-green](/pattern/blue-green-deployment) runs two complete environments and flips all
traffic from one to the other in a single step; the old one stays running, so undoing the
release is flipping back. [Canary](/pattern/canary-release) sends a small share of traffic
to the new version, compares it against the old under real load, and widens only if the
numbers hold.

The difference is what each one buys. Blue-green buys a **fast, certain rollback** — one
switch, no partial state, and the previous version never stopped running. Canary buys
**evidence before commitment** — you learn the new version is bad from 1% of users instead
of all of them. They answer different fears, and a team that can do both usually does: a
canary to decide, a blue-green switch to retreat.

## Comparison

```compare
Dimension          | Blue-green [blue-green-deployment]              | Canary [canary-release]
Exposure           | Everyone, the moment you switch                  | A slice you choose, widened over time
Blast radius       | Every user, for as long as it takes to notice    | The slice, for as long as it runs
Rollback           | Flip back; seconds, and certain                  | Stop widening and drain; also fast
What it detects    | Nothing before the switch                        | Errors, latency and business metrics, live
Infrastructure     | Two full environments, briefly both live         | One environment, weighted routing
Cost               | Double capacity during the release               | A few percent extra
Versions in prod   | One at a time, by design                         | Two at once, by design
Database migration | Must serve both versions across the switch       | Must serve both versions, for longer
Needs              | A router or DNS switch you trust                  | Per-version metrics you trust
Fails you when     | The fault is only visible at full load            | The fault only appears at scale or over days
```

## Decision

```decision
? Can you measure the new version's health from a small share of real traffic?
  YES -> ? Is the risk a subtle regression — latency, error rate, conversion?
    YES -> Canary [canary-release]
    NO -> ? Is the change large, or does it alter shared state?
      YES -> Blue-green [blue-green-deployment]
      NO -> Canary [canary-release]
  NO -> ? Can you afford to run two full environments during the release?
    YES -> Blue-green [blue-green-deployment]
    NO -> ? Would a feature flag let you ship the code dark and enable it separately?
      YES -> Feature flag [feature-flag]
      NO -> Blue-green [blue-green-deployment]
```

## When Blue-Green

- The rollback needs to be a single, certain action that a tired person can take at 3am
  without reasoning about percentages.
- The release changes enough that running two versions side by side would be a problem —
  shared caches with incompatible entries, a background worker that must not run twice.
- You have the capacity to double an environment for the length of a release, and the
  routing layer to switch it atomically.
- The application is not easy to judge from a slice: low traffic, long sessions, or a fault
  that only shows up once the whole load is on the new version.

## When Canary

- The failure you fear is one that arrives as a number rather than an outage: p99 latency,
  a rising 5xx rate, a drop in checkouts — things a slice reveals and a smoke test does not.
- You have per-version [observability](/concept/observability) good enough to compare the
  two honestly, and an [SLO](/concept/slo) that says when to stop.
- Traffic is high enough that 1% is a meaningful sample within minutes rather than days.
- The change is incremental and both versions can run together safely, which is usually the
  case once [schema migrations](/concept/schema-migration) are done in expand-contract steps.

## Deep Dive

**Neither solves the database.** Both put two versions of the code in front of one set of
data — blue-green for the length of the switch, canary for as long as the rollout takes. The
schema must be readable and writable by both, which means additive changes first, backfill,
then remove the old column in a later release. A blue-green flip does not make a destructive
migration safe; it only makes the code rollback fast while the data stays broken.

**A canary's value is the comparison, not the percentage.** Sending 1% of traffic somewhere
and not looking is not a canary, it is a smaller outage. What makes it work is measuring the
same signals on both versions over the same window and having a rule agreed in advance for
what stops the rollout. Without that, the rollout widens because nobody objected, which is
how a canary becomes a slow full deployment.

**Rollback is not free in either case once side effects exist.** Flipping back or draining a
canary reverts the code, not the emails it sent, the payments it took or the events it
published. Where a release can do something irreversible, the safety belongs in a
[feature flag](/pattern/feature-flag) around that action rather than in the deployment
strategy around the process.

**The two compose.** Run the new version as a canary to gather evidence, and keep the old
environment warm so that retreating is a switch rather than a redeploy. The common failure
is doing neither properly: a "canary" nobody measures, in front of an old environment
already torn down.
