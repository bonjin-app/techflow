---
id: monorepo
name: Monorepo
tagline: One repository for many projects, so a cross-cutting change is a single commit
category: backend
tags: [Git, Build, Team Practice, Dependencies]
difficulty: 3
prerequisites: [git, ci-cd]
learningPath:
  - git
  - ci-cd
  - monorepo
related:
  - { to: git, rel: REQUIRES }
  - { to: ci-cd, rel: USED_WITH }
  - { to: bundling, rel: USED_WITH }
  - { to: typescript, rel: USED_WITH }
  - { to: contract-testing, rel: ALTERNATIVE_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: trunk-based-development, rel: USED_WITH }
  - { to: api-versioning, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-21, confidence: high }
---

## Problem

A shared library lives in its own repository. Changing it means: merge there, publish a
version, then open a pull request in each of the nine consumers to bump it. Until the last
of those lands, the same library exists at four versions across your estate, and a bug fixed
on Monday is still live in production on Friday.

Now make a breaking change. There is no commit that represents "the system after the
change" — only a sequence of partial states, none of which CI ever tested together.

```timeline
title: One rename across three repositories
lib                          | service-a and service-b
rename `getUser` → `loadUser`|
publish v3.0.0               |
                             | a: bump to v3, fix call sites, merge
                             | b: busy; stays on v2.4 for six weeks
                             | production runs both versions ❌
```

## Solution

Put the projects in one repository, with one commit history and one CI pipeline. A change to
a library and to every caller is a single commit that is reviewed, tested and reverted as a
unit. The build tool, not the directory layout, is what keeps the projects separate.

```steps
title: The same rename, in one repository
Edit the library | and every caller, in one branch
Open one pull request | the reviewer sees the whole change, not nine fragments
CI builds affected projects [ci-cd] | the dependency graph decides what to rebuild and retest
Merge [trunk-based-development] | there is never a moment where versions disagree
Revert if wrong | one commit, the whole system back together
```

## How it works

**A build graph replaces version numbers.** Tools such as Nx, Turborepo, Bazel and Pants read
each project's dependencies and compute what a change affects. Everything downstream of an
edited file is rebuilt and retested; everything else is skipped or served from cache. Without
this, CI runs everything on every commit and the repository becomes unusable within months.

**Remote caching is what makes it fast.** A build output is keyed by the hash of its inputs.
If someone — or a CI run — has already built that exact input set, the result is downloaded
rather than recomputed. On a large repository this is the difference between a two-minute and
a forty-minute pipeline.

**Internal dependencies are paths, not published versions.** There is one version of each
internal library: the one on the trunk. External dependencies usually go the same way — a
single resolved version for the whole repository — which removes duplicate-dependency
problems and replaces them with the occasional forced upgrade.

**Ownership is enforced in the tree, not by the repository boundary.** `CODEOWNERS` routes
review by directory, and module-boundary rules in the build config stop a project importing
something it should not. Without those, "one repository" quietly becomes "everyone can depend
on everything", which is the failure mode people blame monorepos for.

**Git itself needs help at scale.** Partial clone, sparse checkout and a filesystem monitor
keep clone and status times bearable once the tree is large — this is where teams first feel
the cost.

## Advantages

- Atomic cross-project changes: one commit, one review, one revert
- No version skew between internal libraries — there is only the trunk
- CI tests the combination that will actually run together
- Large refactors become tractable, because every caller is right there
- Shared tooling, linting and types apply uniformly without being republished
- Code is discoverable: reading the caller of an unfamiliar library takes no permissions

## Disadvantages

- Requires real build tooling on day one; naive CI does not scale past a handful of projects
- Git operations slow down as the tree grows, and need specific mitigations
- A single resolved version of an external dependency means upgrades are everyone's problem at once
- Access control is coarse: repository-level permissions no longer separate teams
- Broad blast radius — a bad change to a shared library can stop every pipeline
- Tempts teams into coupling that a repository boundary would have made visible

## When to use

- Several projects that change together: a web app, a mobile app and their shared types
- Teams sharing libraries where version skew is already causing production bugs
- Codebases where large refactors are frequent and currently avoided because they are painful
- Organisations willing to own build tooling as real infrastructure
- Products where one release train covers everything anyway

## When not to use

- Don't adopt it for projects that genuinely evolve independently and rarely change together
- Don't use it when teams must be isolated by permissions — open source, contractors, regulated separation
- Don't choose it if nobody will own the build graph and caching; without them it degrades badly
- Don't use it to publish a widely consumed open-source library, where consumers expect their own repository and release cadence
- Don't assume it fixes coupling — [contract testing](/concept/contract-testing) and clear
  boundaries still have to be deliberate

## Real-world

The pattern is most common where a single product spans several deployables and the same
people work across all of them — a web client, a mobile client, a backend and the schema they
share. The decisive question is not repository size but change correlation: if a typical
change touches two projects, one repository removes an entire class of coordination work; if
a typical change touches one, it adds tooling for no benefit. Teams that adopt it and regret
it usually skipped the build graph and ran the whole suite on every commit, and teams that
adopt it and keep it usually treat build tooling as a product with an owner.
