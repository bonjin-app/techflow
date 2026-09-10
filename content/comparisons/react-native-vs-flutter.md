---
id: react-native-vs-flutter
name: React Native vs Flutter
tagline: Two ways to ship one mobile codebase — render platform views, or draw every pixel yourself
category: decision
tags: [Mobile, Cross-platform, Decision, UI]
difficulty: 3
subjects: [react-native, flutter]
related:
  - { to: swift, rel: RELATED_TO }
  - { to: kotlin, rel: RELATED_TO }
  - { to: state-management, rel: RELATED_TO }
  - { to: app-store-review, rel: RELATED_TO }
  - { to: mobile-networking, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Both give you one codebase for iOS and Android, and both are mature enough that the choice
will not be what makes your app succeed or fail. The real difference is one architectural
decision. [React Native](/technology/react-native) maps your components onto **real
platform views**, so a text field is the system's text field, with its selection, autofill
and accessibility — and your app inherits platform behaviour you did not write.
[Flutter](/technology/flutter) **draws its own widgets** on a canvas, so both platforms
render identical pixels and custom animation is cheap — and every platform behaviour is
Flutter's re-implementation. Pick React Native if your team writes React or you want the
app to feel native; pick Flutter if the product has its own design language or the interface
is animation-heavy.

## Comparison

```compare
Feature                | React Native                                     | Flutter
Language               | JavaScript / TypeScript                           | Dart
Rendering              | Real platform views (Fabric)                       | Own engine draws to a canvas (Impeller)
Look and feel          | Inherits platform controls and gestures            | Identical on both platforms, by design
Custom UI & animation  | Needs Reanimated; possible, more work               | Cheapest option of the two
Team transfer          | React, TS, hooks, testing all carry over            | Dart is used almost nowhere else
Web reuse              | Shares logic and skills with a React web app        | Web target renders a canvas
Startup & binary size  | JS engine adds startup cost                         | Engine adds a few MB to the binary
Compute-heavy work     | Off the JS thread: native module or worklet         | Isolates, no locks needed
Hot reload             | Fast refresh                                        | Stateful hot reload
OTA updates            | Yes, for JS-only changes (Expo Updates)             | Not for compiled Dart
Accessibility          | Platform's, mostly free                             | Framework's semantics tree; test it
New OS APIs            | Wait for a wrapper or write native code             | Wait for a plugin or write native code
Managed toolchain      | Expo + EAS (build iOS without a Mac)                | Flutter CLI; iOS builds still need macOS
Desktop                | Community targets                                    | First-party, credible for internal tools
```

## Decision

```decision
? Does the app need to feel indistinguishable from a native platform app?
  YES -> ? Is it one platform only, or is native quality the differentiator?
    YES -> Go native — Swift [swift] or Kotlin [kotlin]
    NO -> React Native [react-native] — real platform views inherit platform behaviour
  NO -> ? Does the product have its own design language, or heavy custom animation?
    YES -> Flutter [flutter] — owning the renderer is exactly this case
    NO -> ? Does the team already write React and TypeScript?
      YES -> React Native [react-native] — reuse the skills, the libraries and the web logic
      NO -> ? Is consistency between the two platforms a hard requirement?
        YES -> Flutter [flutter]
        NO -> Either works; pick on hiring and on which docs the team prefers
```

## When React Native

- The team already writes [React](/technology/react) and [TypeScript](/technology/typescript) — the transfer is close to total
- The app should feel native: platform navigation gestures, native text input, system autofill
- Accessibility matters and you would rather inherit it than implement it
- You want over-the-air fixes for copy and logic without an [App Store review](/concept/app-store-review) cycle
- Logic, validation and API clients are shared with a React web frontend
- Nobody on the team has a Mac and Expo's cloud builds are the way you ship iOS
- The surface is ordinary product UI: lists, detail screens, forms over an API

## When Flutter

- The interface is your own design system, not a platform's conventions
- Animation, custom gestures and visual distinctiveness are part of the product
- Pixel-identical behaviour across platforms is a requirement, not a nice-to-have
- You want one performance model with no JavaScript thread to protect and no bridge to reason about
- Compute happens on device and isolates are a cleaner answer than native modules
- The same code should also produce a desktop build for an internal tool
- The team is starting fresh, with no React investment to reuse

## Deep Dive

**The rendering decision propagates into everything.** React Native's platform views mean
free platform behaviour and free platform inconsistency: the same code produces two slightly
different products, and you spend the difference on per-platform polish. Flutter's canvas
means one product and one implementation, and you spend the difference re-implementing
platform behaviour — text selection handles, dictation, autofill, screen-reader semantics.
Neither is free; they bill you at different times. React Native's bill arrives during
polish, Flutter's during accessibility and edge-case testing.

**Performance is no longer the deciding factor.** React Native's new architecture removed the
serialised bridge, and gestures and animation run on the UI thread through Reanimated.
Flutter compiles Dart ahead of time and Impeller removed the shader-compilation jank that
used to hit the first animation. Both hit 60/120fps for ordinary product UI. What remains
is shape, not magnitude: React Native has one JavaScript thread you must keep clear and a
cold-start cost from the engine; Flutter has a larger binary and a first-frame cost. Measure
cold start on a low-end Android device — that is where either choice shows up first.

**Native dependencies are the actual risk in both.** Every plugin or native module is a
second project with its own maintenance status, and in both ecosystems one abandoned
dependency is what blocks an engine or framework upgrade. Count them before you commit: a
product with three native dependencies is a different proposition from one with thirty,
regardless of framework. Both frameworks also wait for someone to wrap a brand-new OS API —
if release-day support matters, that argues for native, not for the other framework.

**Over-the-air updates are React Native's structural advantage.** JavaScript-only changes
reach installed apps directly, so a broken screen or a wrong price string is a same-hour
rollout rather than a review cycle. Flutter's Dart is compiled into the binary, so the
equivalent fix is a store release. Store policy limits this to updates that do not change
the app's purpose, so treat it as an operational safety net, not a way to avoid review.

**Hiring cuts both ways.** React and TypeScript developers are abundant, and many can work
on a React Native codebase productively within a week — but web experience does not teach
mobile lifecycle, background execution or store review, and pretending otherwise is how
teams get surprised. Dart is quick to learn and rarely already known, so Flutter hiring
usually means hiring people who will learn it, which is fine as long as the plan says so.

**The option neither framework replaces.** If the app is thin over sensors, camera,
background processing or on-device models, or if it must be excellent on exactly one
platform, native ([Swift](/technology/swift) / [Kotlin](/technology/kotlin)) is still the
answer, and Kotlin Multiplatform is the middle path: share the logic, write each UI
natively. And if the product is mostly content, a responsive website costs less than either
and updates instantly.

## Related

- [Swift](/technology/swift) and [Kotlin](/technology/kotlin) — the native option both of these are measured against
- [Networking on Mobile](/concept/mobile-networking) — the constraints that apply whichever you pick
- [Offline First](/pattern/offline-first) — the pattern every serious mobile app converges on
- [App Store & Play Review](/concept/app-store-review) — why release cadence differs from the web
- [State Management](/concept/state-management) — the first architectural decision in either framework
