---
id: flutter
name: Flutter
tagline: Build iOS and Android apps from one Dart codebase that draws its own pixels
category: frontend
tags: [Mobile, Cross-platform, Dart, UI, Rendering]
difficulty: 3
usedFor: [mobile-networking, push-notification, state-management]
prerequisites: [programming-fundamentals, state-management]
learningPath:
  - programming-fundamentals
  - flutter
  - state-management
  - http
  - rest
  - mobile-networking
  - offline-first
  - app-store-review
related:
  - { to: react-native, rel: ALTERNATIVE_TO }
  - { to: swift, rel: ALTERNATIVE_TO }
  - { to: kotlin, rel: ALTERNATIVE_TO }
  - { to: state-management, rel: RELATED_TO }
  - { to: offline-first, rel: IMPLEMENTS }
  - { to: app-store-review, rel: RELATED_TO }
  - { to: sqlite, rel: USED_WITH }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Flutter 3.x with Impeller; Dart 3.x", confidence: medium }
---

## TL;DR

Flutter renders its own widgets onto a canvas rather than mapping them to platform views.
That single decision explains everything else: the app looks and animates identically on
both platforms, complex custom interfaces are cheap, the compiled Dart code is fast because
there is no JavaScript bridge — and nothing you draw is a real platform control, so text
selection, accessibility and OS-level behaviours are Flutter's re-implementations rather
than the system's. It is the strongest cross-platform option when the interface is your own
design language, and the weakest when you want the app to feel indistinguishable from
native.

## Practical

Everything is a widget, including padding and alignment, so the tree is deep and composition
replaces styling. Dart compiles ahead-of-time to native ARM code for release builds and
just-in-time in development, which is what makes stateful hot reload work — edit, save, and
the running app updates while keeping its state.

- **State management** is the first real decision: `setState` for a screen, then Riverpod or
  Bloc for anything shared. [State Management](/concept/state-management) frames the same
  trade-off in other frameworks.
- **Networking** is `dio` or `http` with generated JSON serialisation; see
  [Networking on Mobile](/concept/mobile-networking) for retry, offline and background rules.
- **Persistence** is Drift or sqflite over [SQLite](/technology/sqlite), plus Isar or Hive
  for key–value data — the local-first foundation of [Offline First](/pattern/offline-first).
- **Platform access** goes through plugins; `MethodChannel` and Dart FFI are the escape
  hatches when no plugin exists.

```dart
// A screen: async data, explicit loading and error states, no bridge in between
class OrdersPage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);          // AsyncValue<List<Order>>

    return orders.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorView(
        message: 'Could not load orders',
        onRetry: () => ref.invalidate(ordersProvider),  // stale list stays on screen
      ),
      data: (list) => RefreshIndicator(
        onRefresh: () => ref.refresh(ordersProvider.future),
        child: ListView.builder(                        // lazy: builds visible rows only
          itemCount: list.length,
          itemBuilder: (_, i) => OrderRow(order: list[i]),
        ),
      ),
    );
  }
}
```

## Deep Dive

**Owning the renderer is the whole trade.** Flutter ships its own layout, painting and
compositing (Impeller, which replaced the older Skia path and removed the shader-compilation
jank that used to hit first animations). Because the framework controls every frame, a
60/120fps custom animation is ordinary work rather than a fight, and the two platforms cannot
diverge visually. The other side: a text field is Flutter's text field. Platform behaviours —
selection handles, autofill, dictation, magnification, screen-reader semantics, right-click
menus — exist because Flutter re-implemented them, and gaps show up in exactly the places
that are hard to test.

**Dart is compiled, single-threaded, and pleasant.** Sound null safety, `async`/`await` and
`Stream` cover the same ground as Kotlin's coroutines and Flow. Concurrency is isolates —
separate memory, message passing, no shared mutable state — so heavy work moves off the UI
isolate without locks. The language is small and easy to pick up; the constraint is that it
is used almost nowhere else, so the library ecosystem is Flutter's ecosystem, and you cannot
share code with a JavaScript web frontend.

**Widget rebuilds are the performance model.** `build` runs often and must stay cheap; the
common bugs are rebuilding a large subtree from a high-up state change, and doing work in
`build` instead of `initState` or a provider. `const` constructors, keys and narrow listeners
are the levers. Profile in a release build — debug builds are misleadingly slow.

**Binary size and startup.** The engine is compiled in, so a Flutter app starts around
several megabytes larger than an equivalent native one. It matters for markets with size
limits or expensive data, and not at all for most products.

**Plugins are the dependency risk.** As with any cross-platform framework, each plugin is a
native project with its own maintenance status. The first-party set (camera, location,
notifications, in-app purchase, secure storage) is broad and healthy; the long tail is not,
and one abandoned plugin is what blocks an engine upgrade.

**Reach beyond mobile is real but uneven.** The same codebase targets desktop and the web.
Desktop is credible for internal tools. Web output is a canvas, which means text selection,
SEO and accessibility behave unlike a document — fine for an embedded app view, wrong for a
public marketing site. Compare with [Rendering Strategies](/concept/rendering-strategies)
before choosing it for anything a search engine must read.

## Why

Two native codebases mean building each screen twice, and the two results drift — different
animation curves, different empty states, different spacing — because two teams are
interpreting one design in two toolkits.

```sequence
title: Before — one design, two interpretations
participants: Design, iOS [swift], Android [kotlin], QA [testing], Product
Design -> iOS: custom onboarding, brand motion
Design -> Android: the same spec
iOS --> QA: spring animation, iOS-native transitions
Android --> QA: different curve, different insets
QA --> Product: "which one is correct?" for every screen
Product --> Design: reconcile, twice, every release
```

Flutter removes the second interpretation by removing the second toolkit. One widget tree
produces the same pixels on both platforms, so a design decision lands once and a custom
animation is built once.

```sequence
title: After — one widget tree, identical frames
participants: Design, App [flutter], Engine, iOS [swift], Android [kotlin]
Design -> App: custom onboarding, brand motion
App -> Engine: one widget tree, one animation controller
Engine --> iOS: composited frames at 60/120fps
Engine --> Android: the same frames, same curve
App --> Design: one implementation to review
App --> App: platform work now limited to plugins and OS conventions
```

## Advantages

- Pixel-identical UI on both platforms; a design decision is implemented once
- Custom interfaces and rich animation are cheap because the framework owns every frame
- Compiled Dart with no bridge: predictable performance and smooth gesture handling
- Stateful hot reload makes the edit-to-screen loop genuinely fast
- Strong first-party plugin set and a coherent, well-documented widget library
- Sound null safety and isolates remove null crashes and shared-state data races
- The same code also targets desktop, which is useful for internal tools

## Trade-offs

- Nothing is a real platform control; platform behaviours are re-implementations with gaps
- Accessibility, text selection, autofill and dictation need explicit testing on both platforms
- Dart is used almost nowhere else, so skills and libraries do not transfer to the web
- Binary size and cold start are larger than a native equivalent
- Long-tail plugins are the dependency risk, and one stale plugin blocks engine upgrades
- New OS APIs arrive when a plugin wraps them, not on release day
- Web output is a canvas: wrong for public, SEO-sensitive pages

## When to use

- The product has its own design language rather than following each platform's conventions
- The interface is animation-heavy, custom, or visually distinctive
- One team must ship both platforms and wants a single implementation of every screen
- Consistency between platforms is a requirement rather than a nice-to-have
- An internal tool that also needs a desktop build from the same code

## When not to use

- Don't use Flutter when the app should feel indistinguishable from a native platform app
- When you need same-day support for new OS capabilities
- If the team's existing skill is React and TypeScript — [React Native](/technology/react-native) reuses it
- For a public, content-first, SEO-dependent web experience
- When the app is thin over sensors, camera or background processing that lives in native APIs
- For a single-platform product with a long life — native pays back

## Real-world

Flutter shows up as the client for the same systems described elsewhere here. A delivery or
booking app renders from a local [SQLite](/technology/sqlite) store, refreshes over
[REST](/concept/rest) and reconciles with [Offline First](/pattern/offline-first) so a
basement does not empty the screen. Live tracking holds a
[WebSocket](/technology/websocket) like the clients in
[Chat System](/architecture/chat-system), with polling when the OS suspends the process.
Push tokens registered from the app terminate a
[Notification System](/architecture/notification-system). Sign-in runs
[OAuth 2.0](/concept/oauth) in the system browser, tokens in platform secure storage. The
metric to watch in production is not frames per second in isolation but jank on the first
animation of a cold start — historically Flutter's weakest moment, and the one Impeller was
built to fix.
