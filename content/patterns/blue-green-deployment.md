---
id: blue-green-deployment
name: Blue-Green Deployment
tagline: Run two identical environments and switch all traffic in one step
category: deployment
tags: [Deployment, CI/CD, Reliability]
difficulty: 3
prerequisites: [load-balancing, http, docker]
learningPath:
  - http
  - load-balancing
  - docker
  - ci-cd
  - blue-green-deployment
  - canary-release
related:
  - { to: availability, rel: SOLVES }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
  - { to: nginx, rel: USED_WITH }
  - { to: canary-release, rel: ALTERNATIVE_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Deploying by replacing the running version in place has two costs. During the
replacement there is a window where the old version is stopping and the new one
is starting — connections drop, requests fail, and the length of the window
depends on how fast the app boots. And if the new version is broken, recovery
means *another* deployment: rebuild or re-pull the old artifact, restart, wait.
Under pressure, at 2 a.m., that rollback is slow and error-prone.

Rolling updates soften the first problem but not the second: mid-rollout both
versions serve traffic, and aborting a half-finished rollout is its own
procedure. What you actually want is a deploy whose undo is instant and whose
release moment is a single, reversible decision.

## Solution

Keep **two complete production environments**: *blue* (currently live) and
*green* (idle). Deploy the new version to green while blue serves all traffic.
Warm it up, run smoke tests against it directly, then flip the router so all
traffic goes to green. Blue stays running, untouched, holding the previous
version.

If green misbehaves, flip back. Rollback is the same operation as release, in
reverse, and takes as long as a config change.

```sequence
title: Release and instant rollback
participants: Users [http], Router [nginx], Blue [backend], Green [backend], DB [postgresql]
Users -> Router: traffic
Router -> Blue: 100% (v1.4)
Green -> Green: deploy v1.5, warm caches
Green -> DB: smoke tests (backward-compatible schema)
Router -> Green: switch 100%
Users -> Router: traffic
Router -> Green: 100% (v1.5)
Router -> Blue: 0% — kept warm for rollback
Green -> Green: error rate spikes
Router -> Blue: switch back 100% (v1.4)
```

```steps
title: The release procedure
Green is idle and identical to blue [docker]
Apply the backward-compatible schema migration first [postgresql] | both versions must run against it
Deploy the new version to green [ci-cd]
Warm it: fill caches, open connection pools, pass health checks [connection-pooling]
Smoke-test green through a private hostname
Flip the router — one atomic change [load-balancing]
Watch error rate, latency and business metrics for the agreed window [observability]
Keep blue for the rollback window, then reuse it as the next green
```

## How it works

The flip itself is whatever your routing layer makes atomic: changing an
[nginx](/technology/nginx) upstream, repointing a load balancer target group,
switching a Kubernetes `Service` selector from `version: blue` to
`version: green`, or a weighted DNS record (slowest, because of TTL caching —
avoid DNS if you can).

```yaml
# Kubernetes: the flip is one selector change
apiVersion: v1
kind: Service
metadata: { name: orders }
spec:
  selector: { app: orders, slot: green }   # was: blue
  ports: [{ port: 80, targetPort: 8080 }]
```

The database is where blue-green gets hard, and it is the reason many teams do it
badly. Both environments share one database — duplicating it would mean losing
writes on a flip — so **every schema change must work with both versions at
once**. That forces the expand/contract discipline: first add the new column
(nullable, backfilled), release code that writes both and reads the new one, flip,
then in a *later* release remove the old column. A migration that renames or
drops in one step makes rollback impossible, which quietly destroys the pattern's
only real benefit.

The second subtlety is in-flight state. Long-lived connections (WebSockets, SSE),
in-progress background jobs and sticky sessions do not move with a router flip.
Either drain them gracefully on blue, or design them to reconnect.

## Advantages

- Rollback is a routing change: seconds, no rebuild, no artifact archaeology
- Zero-downtime release when connection draining is handled
- The new version can be fully tested in the real production environment before receiving users
- The release decision is one atomic, auditable event
- Simple mental model — much easier to run correctly under stress than a partially-completed rollout

## Disadvantages

- Double the production capacity during a release; for large fleets that is a real bill
- All users move at once, so a defect that only appears under real traffic hits 100% of them immediately
- Shared database forces backward-compatible migrations in every single release — extra discipline forever
- Stateful connections, caches and background workers do not flip cleanly and need explicit handling
- The idle environment drifts if it is not recreated from the same automation as the live one
- Rollback does not undo data already written by the new version, or messages it already published

## When to use

- A fast, reliable rollback is the top priority (regulated systems, revenue-critical paths)
- Release windows must be short and downtime-free
- You can afford twice the capacity for the duration of a release
- The application is stateless, or its state lives outside the environment
- Deploys are infrequent enough that a full second environment per release is acceptable

## When not to use

- Cost-sensitive systems where doubling capacity is not viable — use a rolling update
- You need to limit *blast radius*, not just shorten rollback time: only a fraction of users should see the new version first — use a [Canary Release](/pattern/canary-release)
- Schema changes cannot be made backward compatible in your data store
- Heavy long-lived connections or in-process state that cannot be drained
- Many small deploys per day; the ceremony and capacity cost per release add up

## Real-world

Blue-green is the default release strategy on managed platforms — load balancer
target groups, Kubernetes service selectors and platform "swap slot" features all
implement it. It pairs with [Canary Release](/pattern/canary-release) rather than
competing with it: canary the traffic shift to catch defects with 1% of users,
then complete the shift as a blue-green flip so the rollback path stays instant.
[Feature Flag](/pattern/feature-flag) covers the remaining case — features that
must be turned off without any deployment at all.
