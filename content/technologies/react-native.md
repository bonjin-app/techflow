---
id: react-native
name: React Native
tagline: Build iOS and Android apps from one React codebase, rendering real native views
category: frontend
tags: [Mobile, Cross-platform, React, JavaScript, UI]
difficulty: 3
usedFor: [mobile-networking, push-notification, state-management]
prerequisites: [programming-fundamentals, web-fundamentals, react]
learningPath:
  - programming-fundamentals
  - web-fundamentals
  - react
  - typescript
  - react-native
  - mobile-networking
  - offline-first
  - app-store-review
related:
  - { to: react, rel: REQUIRES }
  - { to: flutter, rel: ALTERNATIVE_TO }
  - { to: swift, rel: ALTERNATIVE_TO }
  - { to: kotlin, rel: ALTERNATIVE_TO }
  - { to: typescript, rel: USED_WITH }
  - { to: state-management, rel: RELATED_TO }
  - { to: offline-first, rel: IMPLEMENTS }
  - { to: app-store-review, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "React Native 0.7x–0.8x, new architecture default; Expo SDK 5x", confidence: medium }
---

## TL;DR

React Native runs your [React](/technology/react) components in a JavaScript engine on the
device and renders them as **real native views** — a platform button, not a canvas drawing
of one. One codebase covers iOS and Android, most product screens share 80–95% of their
code, and you can push JavaScript-only updates without an app store review. The cost is a
bridge you now live on: anything the framework does not wrap needs native code, and the
hardest bugs are in the seam between JavaScript and the platform. Most teams start with
**Expo**, which supplies the build service, native modules and update channel.

## Practical

Expo is the default entry point: `npx create-expo-app`, then EAS Build compiles the native
projects in the cloud so you can ship an Android build without Android Studio and an iOS
build without opening Xcode. Ejecting is no longer a one-way door — config plugins let you
add native dependencies while keeping the managed workflow.

- **UI** is React with `View`, `Text`, `Pressable` and flexbox — no HTML, no CSS cascade.
  Styling is a style object; NativeWind gives you Tailwind syntax if the team wants it.
- **Navigation** is Expo Router or React Navigation, which maps native stack, tab and modal
  presentations onto a familiar file or component tree — see [Routing](/concept/routing).
- **State** is whatever you already use in React: local state, a store, and a query cache
  such as TanStack Query for server data. [State Management](/concept/state-management)
  applies unchanged.
- **Storage** is AsyncStorage for small values and SQLite for real data, which is what makes
  [Offline First](/pattern/offline-first) practical.

```tsx
// The screen is ordinary React; the primitives are native views
export default function Orders() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.get<Order[]>("/orders"),
    staleTime: 30_000,                        // cached, so a back-navigation is instant
  });

  if (isLoading) return <ActivityIndicator />;

  return (
    <FlatList                                  // virtualised: only visible rows exist
      data={data}
      keyExtractor={(o) => String(o.id)}
      refreshing={isRefetching}
      onRefresh={refetch}                      // native pull-to-refresh gesture
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/orders/${item.id}`)}>
          <Text style={styles.row}>{item.total}</Text>
        </Pressable>
      )}
    />
  );
}
```

## Deep Dive

**The new architecture changed the performance story.** The old design serialised every
call between JavaScript and native over an asynchronous bridge, which is why list scrolling
and gesture-driven animation used to stutter. The current design (JSI, Fabric, TurboModules,
Hermes) lets JavaScript hold direct references to native objects and call them
synchronously, and moves layout onto a shared C++ core. Animations and gestures run on the
UI thread through Reanimated and Gesture Handler rather than round-tripping per frame. If
your mental model of React Native is from before this, it is out of date.

**You are still shipping a JavaScript engine.** Hermes precompiles to bytecode and starts
fast, but startup cost, memory and the single JS thread are real. Long synchronous work in
JavaScript blocks interaction exactly as it does in a browser. Heavy compute — image
processing, cryptography, on-device inference — belongs in a native module or a worklet.

**Native dependencies are the actual risk.** Every native library is a second project with
its own platform requirements and its own maintenance status. A framework upgrade can be
blocked for weeks by one unmaintained module, and version bumps have historically been the
least pleasant part of the ecosystem. Count your native dependencies before adopting: a
product with three is a different proposition from one with thirty.

**Over-the-air updates are a genuine advantage with limits.** JavaScript-only changes can
be delivered directly to installed apps, so a bad copy fix or a broken screen is a
same-hour rollout rather than a review cycle. Anything touching native code still needs a
store build, and store policy permits updates that do not change the app's purpose — read
[App Store review](/concept/app-store-review) before designing a release process around it.

**Platform parity is a choice you keep making.** `Platform.select`, per-platform files and
platform-specific components exist because the platforms differ in navigation gestures, back
behaviour, permission flows, keyboard handling and typography. "Write once" is accurate for
business logic and lists; it is not accurate for anything that has to feel native, and
budgeting zero time for per-platform polish is the most common planning mistake.

**Where it lags native.** Same-day support for a brand-new OS API, complex custom gestures,
long-running background work, and any interface built out of many simultaneous animations
are all easier in [Swift](/technology/swift) or [Kotlin](/technology/kotlin). The framework
gets there, but on its own schedule, not the platform vendor's.

## Why

The problem is arithmetic. Two native codebases mean two languages, two toolchains, two
implementations of every screen and two review queues, staffed by two sets of specialists —
for a product where most screens are a list, a detail view and a form over the same API.

```sequence
title: Before — one feature, built twice
participants: Product, iOS [swift], Android [kotlin], API [rest], Store [app-store-review]
Product -> iOS: build the orders screen
Product -> Android: build the orders screen
iOS -> API: GET /orders
Android -> API: GET /orders
iOS --> Product: ships week 3
Android --> Product: ships week 5, with different empty-state behaviour
Product -> Store: two submissions, two rollbacks when the copy is wrong
```

React Native collapses the shared part. The screen, its state, its data fetching and its
validation exist once, in a language the web team already writes, and the platform-specific
work shrinks to what genuinely differs.

```sequence
title: After — one screen, two platforms, one update channel
participants: Product, App [react-native], API [rest], iOS [swift], Android [kotlin]
Product -> App: build the orders screen once (React + TS)
App -> API: GET /orders
API --> App: 200 JSON
App --> iOS: native views, iOS navigation gestures
App --> Android: native views, Android back behaviour
Product -> App: copy fix → over-the-air JS update, no review queue
App --> Product: platform-specific work is now the exception, not the default
```

## Advantages

- One codebase and one team for iOS and Android; most product code is genuinely shared
- Real native views, so scrolling, text input and accessibility behave like the platform
- React skills, libraries, TypeScript types and testing habits transfer directly from the web
- Over-the-air JavaScript updates for fixes that do not touch native code
- Expo removes most native toolchain work, including building iOS without a Mac
- The new architecture removed the old bridge bottleneck for gestures and animation
- Escape hatch is always available: drop into Swift or Kotlin for one module

## Trade-offs

- Every native dependency is a maintenance liability and can block framework upgrades
- Ships a JavaScript engine: startup cost, memory overhead and one JS thread to protect
- New OS APIs arrive on the framework's schedule, not the platform's
- Platform differences still need per-platform work; "write once" undersells the polish budget
- Debugging spans JavaScript, native and the seam between them — the hardest bugs live there
- Heavy compute and complex custom gestures need native code anyway
- Upgrade cadence is demanding; falling several versions behind is expensive to fix

## When to use

- One small-to-medium team must ship and maintain both platforms
- The app is mostly lists, detail views, forms and a network API — normal product surface
- The team already writes React and TypeScript for the web
- You want fast iteration and the option of over-the-air fixes
- An MVP whose main risk is whether anyone wants the product, not platform fidelity

## When not to use

- Don't use React Native for a graphics-, camera- or sensor-heavy app that lives in native APIs
- When the product must adopt brand-new OS features on release day
- For a single-platform app you intend to keep for years — go native
- When native quality is the differentiator and users will feel the difference
- If nobody on the team can read or write native code when the seam breaks
- For a mostly-content app, where a responsive website is cheaper and updates instantly

## Real-world

React Native occupies the client edge of the same architectures documented here. A shopping
app talks to the [E-commerce](/architecture/e-commerce) backend over
[REST](/concept/rest), caches responses in a query cache and a local database so the catalogue
survives a lift, and reconciles writes with [Offline First](/pattern/offline-first). Live
features hold a [WebSocket](/technology/websocket) as the clients in
[Chat System](/architecture/chat-system) do, with polling as the fallback when the OS
suspends the app. Push tokens registered from the app are the final hop of a
[Notification System](/architecture/notification-system). Authentication uses
[OAuth 2.0](/concept/oauth) in the system browser with tokens in the platform keychain, not
a [JWT](/concept/jwt) in AsyncStorage. Crash and performance data goes to the same
[observability](/concept/observability) stack as the services — and the metric that matters
most is cold-start time, because that is where the JavaScript engine shows up.
