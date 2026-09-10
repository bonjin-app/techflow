---
id: ci-cd
name: CI/CD
tagline: Every commit is built, tested and promoted by the same automated pipeline
category: operations
tags: [DevOps, Automation, Delivery, Testing]
difficulty: 3
prerequisites: [programming-fundamentals, backend, docker]
learningPath:
  - programming-fundamentals
  - backend
  - docker
  - ci-cd
  - infrastructure-as-code
  - observability
related:
  - { to: github-actions, rel: RELATED_TO }
  - { to: docker, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: infrastructure-as-code, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

**Continuous Integration** means every commit is merged into the shared mainline and
automatically built and tested, so integration problems surface in minutes rather than at
the end of a release. **Continuous Delivery** means every commit that passes produces a
deployable artifact that could be released at any time; **Continuous Deployment** goes one
step further and releases it automatically. The pipeline is code, runs on every change,
and is the only path to production.

## Why it matters

Batching changes makes releases riskier in a compounding way: a hundred commits released
together fail in ways nobody can bisect, and the fear of failure lengthens the next
batch. Small, frequent, automated releases invert that — a single change is easy to
review, easy to attribute when a metric moves, and easy to roll back. The pipeline is
also where quality gates actually get enforced: tests, linters, vulnerability scans and
[Infrastructure as Code](/concept/infrastructure-as-code) plans that run on a developer's
laptop are optional, while the same checks in CI are not.

## Visual

```steps
title: One commit's journey to production
1. Trigger | push or pull request; the pipeline definition is versioned with the code
2. Checkout and restore cache | pinned toolchain versions, dependency cache keyed by lockfile hash
3. Static checks (parallel) | format, lint, type-check, secret scan, dependency audit
4. Unit tests | fast, hermetic, no network — the gate that must stay under a few minutes
5. Build the artifact once [docker] | immutable image tagged with the commit SHA
6. Integration tests | run the artifact against real dependencies in throwaway containers
7. Publish to a registry | signed image plus provenance and a software bill of materials
8. Deploy to staging | same manifests as production, only configuration differs
9. Smoke tests and migrations | forward-compatible schema change first, then the new code
10. Promote to production [canary-release] | progressive rollout watched against error budget
11. Verify or roll back [slo] | automatic rollback on SLI regression; the artifact never changes
```

## How it works

**One artifact, many environments.** Build once, then promote the *same* image through
staging and production, changing only injected configuration and secrets. Rebuilding per
environment means the thing you tested is not the thing you shipped.

**Trunk-based development.** Short-lived branches merged daily keep CI meaningful; a
week-old branch tests a codebase that no longer exists. Incomplete work ships dark behind
a [Feature Flag](/pattern/feature-flag), which decouples *deploy* (a technical event)
from *release* (a product decision).

**The test pyramid.** Many fast unit tests, fewer integration tests, a small set of
end-to-end tests. The shape is driven by feedback time: developers ignore a pipeline that
takes an hour, and a slow pipeline is the root cause of most "let's just merge it"
incidents. Target minutes for pre-merge feedback; run longer suites post-merge or
nightly.

**Pipeline as code.** The definition lives in the repository ([GitHub
Actions](/technology/github-actions) workflows, or the equivalent for another runner), is
reviewed like any change, and is reproducible. Pin action and image versions by digest so
a third-party update cannot silently alter your build.

**Deployment strategies.** Rolling updates in [Kubernetes](/technology/kubernetes) are the
default; [Blue-Green Deployment](/pattern/blue-green-deployment) swaps two identical
environments for an instant, reversible cutover;
[Canary Release](/pattern/canary-release) sends a small share of traffic to the new
version and watches metrics before proceeding.

## Deep Dive

**Flaky tests destroy pipelines faster than slow ones.** A suite that fails 2% of the
time for unrelated reasons teaches everyone to re-run until green, which disables the
gate entirely. Treat flakiness as a defect: quarantine the test, track it, fix or delete
it. Determinism means fixed clocks, seeded randomness, no shared mutable fixtures, and no
dependence on test execution order.

**Database migrations are the hard part.** A deploy replaces code gradually, so old and
new versions run simultaneously — schema changes must therefore be backward compatible in
both directions. The safe sequence is expand/contract: add the nullable column or new
table, deploy code that writes both and reads the old, backfill, switch reads, then
remove the old column in a later release. Never combine a destructive migration with the
deploy that stops using it, because that removes your ability to roll back.

**Rollback must be boring.** Keep the previous artifact deployable, make migrations
reversible or additive, and prefer rolling forward with a fix only when rollback is
genuinely impossible. Measure the time from "bad metric" to "traffic on the old version" —
that number, not deploy frequency, is what limits blast radius.

**Supply-chain security.** CI holds credentials to production, so it is a high-value
target. Use short-lived, workload-identity-based credentials instead of long-lived static
secrets; do not let pull requests from forks run with secrets; pin dependencies by hash;
sign artifacts and verify signatures at deploy time; and keep an auditable log of what was
built from which commit by whom. A build step that pipes a remote script into a shell has
the same trust level as production.

**Environment parity and ephemeral environments.** The closer staging is to production —
same manifests, same dependency versions, representative data volumes — the more signal
its tests carry. Per-pull-request preview environments raise confidence further, at real
cost in infrastructure and complexity; scope them by teardown policy from the start.

**Metrics that matter.** Deployment frequency, lead time from commit to production, change
failure rate and time to restore service. They resist gaming better than test counts and
directly reflect whether the pipeline is helping. Track pipeline duration and queue time
too: a runner pool that saturates every afternoon is a productivity tax that never appears
in a dashboard anyone reads.

**Common anti-patterns.** Manual steps in a "fully automated" pipeline; a green build that
nobody trusts; secrets in environment files committed to the repo; per-environment builds;
deploy scripts that only work from one engineer's laptop; and gates so heavy that people
route around them with hotfix branches.
