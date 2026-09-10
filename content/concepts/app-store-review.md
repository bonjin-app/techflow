---
id: app-store-review
name: App Store & Play Review
tagline: Someone else approves your release, and old versions of your app live forever
category: deployment
tags: [Mobile, Release, Process, Compliance]
difficulty: 2
prerequisites: [ci-cd, mobile-networking]
learningPath:
  - ci-cd
  - mobile-networking
  - app-store-review
  - feature-flag
  - api-versioning
  - canary-release
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: feature-flag, rel: SOLVES }
  - { to: api-versioning, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: swift, rel: RELATED_TO }
  - { to: kotlin, rel: RELATED_TO }
  - { to: react-native, rel: RELATED_TO }
  - { to: flutter, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

On the web you deploy. On mobile you *submit*, and a reviewer — part automated checks, part
a person — decides whether your build ships. Reviews usually complete within a day or two,
but a rejection costs a round trip, and the reasons are as often about metadata, privacy
disclosures and business rules as about code. The deeper consequence is not the wait: it is
that users choose when to update, so every version you have ever shipped is still running
somewhere. That single fact is why mobile teams need feature flags, server-driven
configuration and strict API compatibility, while a web team can skip all three.

## Why it matters

Two of the assumptions a backend team lives by are false here.

**You cannot hotfix.** A wrong price, a broken checkout, a crash on launch — the fix is a
build, a submission, a review and then a staged rollout the user opts into. From bug to
majority-fixed is days, not minutes, unless you designed for it in advance. The design that
buys you minutes is a server-side kill switch, not a faster pipeline.

**Your old clients never retire.** Some users update within hours; a long tail never
updates until the OS forces them. Any endpoint your 18-month-old build calls is still in
production traffic. Delete it and you break people who cannot fix it themselves — they would
have to notice, then update. This is why [API versioning](/pattern/api-versioning) is not
optional on mobile.

And rejection is a *process* risk, not a code risk. Teams plan for the engineering and then
lose a week to a missing privacy label, a login screen with no demo account for the
reviewer, or a payment flow that routes around the platform's own billing.

## Visual

```steps
title: One release, from merge to most users
Merge to main | CI builds, signs and uploads on every commit
Internal testing | the team's own devices, minutes after the build
Beta track | TestFlight or Play testing track — real users, no public review gate
Submit for review | metadata, screenshots, privacy answers and a reviewer demo account
Automated checks | signing, permissions, private APIs, crash-on-launch
Human review | policy: payments, data use, account deletion, content, functionality
Approved | not yet released — you still hold the switch
Phased release | small percentage first, watching crash-free rate before going wide
Most users updated | days later; the long tail is still on older versions
Something is wrong | flip a server-side flag — you cannot recall a shipped build
```

## Solutions

**Ship dark, release with a flag.** Get the code into the binary early and off by default,
then enable it from the server when you are ready. [Feature Flags](/pattern/feature-flag)
turn "we need a release" into "we need a config change", which is the single highest-value
practice in mobile delivery. It also means the same build can be an experiment for 5% of
users and a rollback target for the rest.

**Use phased rollout and watch the right metric.** Both stores can release to a small
percentage of users first. The signal to watch is the crash-free session rate and the key
funnel conversion of the *new version only*, compared with the previous one — an overall
average hides the problem for days. This is [canary release](/pattern/canary-release) with a
much slower feedback loop, so automate the comparison rather than eyeballing a dashboard.

**Keep every API version alive, and know who is on it.** Version endpoints or negotiate
capability, and instrument which app versions call what, so retirement is a decision with
evidence. Add a server-controlled minimum-supported-version check from the very first
release: the ability to say "please update to continue" is impossible to add retroactively
to the clients that need it.

**Automate everything up to submission.** Signing, provisioning, screenshots, changelogs and
upload belong in [CI/CD](/concept/ci-cd). Manual release engineering on mobile is where the
credentials rot, the certificate expires on a Friday, and the one person who knows the
process is on holiday.

**Answer the policy questions before you build.** The rules with real architectural
consequences are consistent: digital goods go through platform billing; the app must offer
account deletion if it offers account creation; every permission needs a stated purpose the
reviewer can verify; data collection must match the privacy disclosure you filed. Read them
during design, not during rejection.

**Give the reviewer a working app.** A demo account with real data, notes explaining
anything non-obvious, and no server-side flag that hides the feature they are meant to see.
A large share of first-time rejections are simply a reviewer unable to get past a login.

## Deep Dive

**The two stores differ in practice, not in principle.** Apple's review is stricter and more
human, with policy interpretation that can vary between submissions; there is an expedited
path for genuine emergencies, and it should be spent carefully. Google leans more on
automated analysis with review for sensitive permissions and categories, and its testing
tracks and staged rollout are more granular. Both require you to plan around review; neither
guarantees a timeline.

**Over-the-air updates have a narrow, real scope.** [React Native](/technology/react-native)
and similar frameworks can update JavaScript in an installed app, which genuinely turns a
copy fix into a same-hour rollout. Policy permits updates that do not change the app's
purpose or add unreviewed capability. Treat it as an operational safety net, keep the native
release train running, and do not build a product plan on the assumption that review can be
bypassed.

**Deadlines you do not control.** Platforms raise the minimum SDK level, deprecate APIs and
add compliance requirements on their own schedule, and an app that misses one can stop
accepting updates or be removed from search until it complies. Certificates and provisioning
profiles expire. Track those dates like any other operational deadline — nobody will remind
you at a convenient moment.

**Design so a bad release is survivable.** Assume some build will be broken. That means a
kill switch per feature, no client-side hardcoding of anything a server could send, graceful
degradation when an endpoint returns something unexpected, and crash reporting wired to
alert on the *new version's* crash-free rate specifically. Recovery on mobile is a design
property, decided before submission — not an operational reflex, because the reflex you have
on the web is unavailable here.

**Release cadence shapes the product.** A weekly train with everything behind flags beats
shipping when features are ready: the release becomes routine, low-risk and independent of
any one feature's schedule, and a missed train costs a week rather than a rushed submission.
It is the same reasoning as continuous delivery on the backend, applied to a pipeline whose
last stage belongs to someone else.
