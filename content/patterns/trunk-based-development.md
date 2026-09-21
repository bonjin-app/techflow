---
id: trunk-based-development
name: Trunk-Based Development
tagline: Everyone merges to one branch every day, and release is a flag rather than a merge
category: backend
tags: [Delivery, Git, CI/CD, Team Practice]
difficulty: 2
prerequisites: [git, testing, ci-cd]
learningPath:
  - git
  - testing
  - ci-cd
  - trunk-based-development
related:
  - { to: ci-cd, rel: REQUIRES }
  - { to: git, rel: USED_WITH }
  - { to: feature-flag, rel: USED_WITH }
  - { to: testing, rel: REQUIRES }
  - { to: canary-release, rel: USED_WITH }
  - { to: contract-testing, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
meta: { lastReviewed: 2026-09-21, confidence: high }
---

## Problem

A team agrees to work on branches. Each branch is small when it is cut and large when it
lands, because the trunk moved underneath it the whole time. Merging becomes an event people
schedule around. Two branches touch the same file and the conflict is resolved by whoever
merges second, under time pressure, with no test that the *combination* works.

The cost is not the conflicts. It is that integration — the only step that proves the team's
work fits together — has been deferred to the least convenient moment. A green build on a
branch says the branch works against a trunk that no longer exists.

```timeline
title: Two branches, integrated late
Alice                        | Bob
cuts branch from trunk       |
                             | cuts branch from trunk
renames `getUser` → `loadUser` |
                             | adds 12 call sites to `getUser`
CI green on her branch       | CI green on his branch
merges to trunk              |
                             | merges to trunk ❌ 12 conflicts, neither build proved this
```

## Solution

Everyone commits to the trunk, at least daily, in small pieces. Work that is not finished
ships anyway — disabled behind a [feature flag](/pattern/feature-flag) — so that
*integration* and *release* stop being the same event. Branches still exist, but they live
hours, not weeks.

```steps
title: One change, trunk-based
Take a small slice | a day's work at most, not a whole feature
Add it behind a flag [feature-flag] | off in production; the code still merges
Push to trunk [git] | CI runs the whole suite against what everyone else has merged
Deploy trunk [ci-cd] | every merge is deployable, because release is decoupled from merge
Enable for 1% [canary-release] | turn the flag on for a slice and watch
Ramp or revert | a config change, not a rollback deploy
```

## How it works

**The trunk stays releasable, always.** That is the constraint everything else serves. It
means the test suite has to be trustworthy and fast — if a red trunk is normal, or CI takes
forty minutes, people batch their work and you are back on long branches.

**Feature flags decouple merge from release.** A half-built feature is merged with its entry
point disabled. This is what makes "commit daily" possible for work that takes three weeks.
The flag is temporary scaffolding, and the discipline that matters is deleting it once the
feature is fully on.

**Changes are made in expand/contract steps.** A rename becomes: add the new name, migrate
callers, delete the old name — three merges, each individually safe, instead of one merge
that breaks everything in flight. Schema changes follow the same shape, which is why
[schema migration](/concept/schema-migration) discipline and trunk-based development tend to
arrive together.

**Review happens on small diffs, quickly.** A 2,000-line pull request that sits for three
days is the long-lived branch in another costume. Teams that make this work either review
within hours or pair, so the change is reviewed as it is written.

**Release branches, if they exist, are cut from trunk and only take fixes.** They never
receive new work, and fixes land on trunk first and are cherry-picked forward — so the
branch cannot silently diverge.

## Advantages

- Integration problems surface within hours, when the author still has the context
- CI tests the combination everyone is actually working against, not a stale snapshot
- Merge conflicts become rare and small, because nothing diverges for long
- Release stops being a project: the trunk is always deployable
- Rollback is a flag flip rather than a revert-and-redeploy
- Small diffs get better reviews — reviewers read them properly

## Disadvantages

- Demands a fast, reliable test suite; a flaky trunk poisons the whole practice
- Feature flags are real complexity: every flag is a branch in the code and a state to test
- Stale flags accumulate into a combinatorial mess if nobody removes them
- Incomplete work is visible in the codebase, which some teams find uncomfortable
- Slicing a large change into individually safe steps is a genuine skill
- Poor fit when the artefact cannot be released continuously

## When to use

- Web services and applications you deploy at least weekly
- Teams large enough that long branches routinely collide
- Any codebase already practising [CI/CD](/concept/ci-cd) with a suite you trust
- Work where you want [canary releases](/pattern/canary-release) or gradual rollout
- Microservice estates, where cross-service changes must land in a known order

## When not to use

- Don't adopt it before the test suite is trustworthy — you will ship the breakage faster
- Don't use it where releases are externally gated: mobile [app store review](/concept/app-store-review),
  firmware, regulated software with sign-off per release
- Don't apply it to open-source projects taking drive-by contributions from people without commit rights
- Don't force it on a team that cannot yet review within a day; the branches just move to the review queue
- Don't reach for it if you cannot flag incomplete work, and the feature genuinely cannot ship dark

## Real-world

The practice is the norm for teams that deploy many times a day, and the reason is
arithmetic rather than fashion: ten engineers on week-long branches produce forty-five
possible pairwise conflicts every week, and no build proves any of those pairs work until
someone merges. The same teams typically pair it with [feature flags](/pattern/feature-flag)
for dark launches and [canary releases](/pattern/canary-release) for exposure, so that
"merged", "deployed" and "released" are three separate decisions. Where it fails, the cause
is almost always the same: a slow or flaky pipeline made daily merges painful, people
started batching, and the branches came back.
