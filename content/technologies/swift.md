---
id: swift
name: Swift
tagline: Apple's language for iOS and macOS — optionals, value types and actor-based concurrency
category: languages
tags: [Language, Mobile, iOS, Concurrency, Type Safety]
difficulty: 3
usedFor: [mobile-networking, push-notification, concurrency]
prerequisites: [programming-fundamentals, http]
learningPath:
  - programming-fundamentals
  - swift
  - state-management
  - http
  - rest
  - mobile-networking
  - offline-first
related:
  - { to: kotlin, rel: RELATED_TO }
  - { to: react-native, rel: ALTERNATIVE_TO }
  - { to: flutter, rel: ALTERNATIVE_TO }
  - { to: app-store-review, rel: RELATED_TO }
  - { to: sqlite, rel: USED_WITH }
  - { to: offline-first, rel: IMPLEMENTS }
  - { to: concurrency, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Swift 6.x language mode; Xcode 26.x", confidence: medium }
---

## TL;DR

Swift is Apple's compiled language and the only way to build an iOS or macOS app with full,
same-day access to the platform's APIs. Three decisions shape how the code reads: absence
is a type (`Optional`), most data is a value type that is copied rather than shared, and
concurrency is structured around `async`/`await` with `actor` isolation checked by the
compiler. Memory is reference-counted rather than garbage-collected, so there are no
collector pauses but reference cycles are yours to break. Swift also runs on Linux for
server code, where the ecosystem is real but small.

## Practical

For a new app the default is **SwiftUI** — declarative views, state-driven updates, one
codebase across iPhone, iPad, Mac, watch and TV. **UIKit** is the older imperative
framework; it is not going away, it still owns some capabilities SwiftUI wraps thinly, and
most large apps are a mix, embedding one in the other.

- **State** lives in observable model objects and is read by views. Views are cheap structs
  that get rebuilt when state changes; see [State Management](/concept/state-management)
  for the same problem in other frameworks.
- **Networking** is `URLSession` with `async`/`await`, plus `Codable` to turn JSON into
  typed structs — no hand-written parsing. See [Networking on Mobile](/concept/mobile-networking)
  for retry, offline and background-transfer behaviour.
- **Persistence** is SwiftData or Core Data on top of [SQLite](/technology/sqlite), or
  SQLite directly when you want to own the schema and the queries.
- **Packaging** is Swift Package Manager; the toolchain is Xcode, which also owns
  signing, profiling (Instruments) and submission to [App Store review](/concept/app-store-review).

```text
// One screen's worth: typed decode, structured concurrency, isolated state
struct Order: Codable, Identifiable { let id: Int; let total: Decimal }

@MainActor @Observable final class OrderList {          // UI state, main-actor isolated
    var orders: [Order] = []
    var error: String?

    func load() async {
        do {
            let (data, response) = try await URLSession.shared.data(from: .orders)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw ApiError.status }
            orders = try JSONDecoder().decode([Order].self, from: data)   // throws, not crashes
        } catch is CancellationError {
            return                                       // screen went away; not an error
        } catch {
            error = "Could not load orders"
        }
    }
}
```

## Deep Dive

**ARC, not a garbage collector.** The compiler inserts retain and release calls; an object
dies the moment its last strong reference goes away. Latency is predictable and memory
footprint is low, but two objects that hold each other strongly leak forever. The fix is
part of the language — `weak` for references that may vanish, `unowned` for ones that
cannot outlive you — and delegates and closures capturing `self` are where cycles come
from in practice.

**Value semantics and copy-on-write.** Structs, enums, arrays and dictionaries are copied
on assignment, so passing data to another part of the app cannot mutate it underneath you.
The copy is lazy: the buffer is shared until someone writes. This removes a large class of
[race conditions](/concept/race-condition) by construction, which is why the standard
library favours structs and why classes are the exception rather than the default.

**Optionals only work if you respect them.** `String?` cannot be used as a `String` without
handling the empty case, which eliminates the null-dereference crash — until someone writes
`!` and reintroduces it. Force-unwrapping in view code and force-casting API responses are
the two crashes that dominate real crash reports; treat both as code-review failures.

**Structured concurrency and data-race safety.** `async` functions form a tree: a task's
children are cancelled when it is, so a screen that disappears cancels its own requests.
`actor` types serialise access to their state, and `@MainActor` marks anything that must
touch UI. Under the Swift 6 language mode the compiler checks that values crossing those
boundaries are `Sendable`, so sharing mutable state between threads becomes a build error
rather than an intermittent bug. Migrating an older codebase into that mode is real work —
the warnings are usually correct about latent bugs.

**Protocols and generics over inheritance.** Behaviour is composed from protocols with
default implementations and constrained extensions. It is expressive, and it is the main
source of the compiler's slow, occasionally cryptic type inference; large SwiftUI view
bodies are the usual place a build time goes bad. Break big views into small ones and give
ambiguous expressions an explicit type.

**Interop and reach.** Objective-C and C interop is direct, which is how the platform SDKs
and a decade of libraries remain usable. Swift on the server (Vapor, Hummingbird) works and
produces small binaries, but the library surface for queues, drivers and vendor SDKs is far
thinner than the JVM's, [Go](/technology/go)'s or [Python](/technology/python)'s — the same
calculation as choosing any minority server language.

## Why

Before Swift, iOS was Objective-C: messages to `nil` silently did nothing, JSON arrived as
untyped dictionaries, and asynchronous work was completion handlers nested inside completion
handlers with error paths duplicated in each one.

```sequence
title: Before — untyped data and nested callbacks
participants: View, Controller [state-management], Session [mobile-networking], API [rest]
View -> Controller: viewDidLoad
Controller -> Session: request(url) { data, err in
Session -> API: GET /orders
API --> Session: 200 JSON
Session --> Controller: NSDictionary (any key, any type)
Controller -> Controller: objectForKey chain, cast, hope
Controller --> View: crash on an unexpected null, at runtime
```

Swift moves those failures to compile time. The response becomes a typed struct through
`Codable`, absence becomes a case you must handle, and the callback pyramid collapses into
straight-line `await` with one `catch`. Cancellation stops being something you remember to
implement.

```sequence
title: After — typed decode, one error path, automatic cancellation
participants: View, Model [state-management], Session [mobile-networking], API [rest]
View -> Model: task { await load() }
Model -> Session: try await data(from:)
Session -> API: GET /orders
API --> Session: 200 JSON
Session --> Model: Data
Model -> Model: decode([Order].self) — typed or throws
Model --> View: orders (or one handled error)
View --> Model: screen dismissed → task cancelled, request torn down
```

## Advantages

- The only path to full, same-day platform API coverage on Apple devices
- Optionals and a strong type system remove null crashes and untyped JSON handling
- Value semantics and copy-on-write make accidental shared mutable state rare
- Structured concurrency with compiler-checked actor isolation; cancellation is built in
- Reference counting gives predictable latency and a small memory footprint — no GC pauses
- One language and one UI framework across iPhone, iPad, Mac, watch and TV
- Direct Objective-C and C interop keeps existing SDKs and native libraries available

## Trade-offs

- Apple platforms only in practice; server and cross-platform ecosystems are small
- Requires a Mac and Xcode; the toolchain is not substitutable
- Retain cycles are your problem — ARC frees you from pauses, not from leaks
- Type inference makes compile times and error messages worst exactly where views are biggest
- `!` and force-casts are always available, so the safety is a convention as much as a rule
- SwiftUI still has capability gaps that pull you into UIKit mid-project
- Migrating an existing codebase to strict concurrency checking is a substantial project

## When to use

- Building an iOS, iPadOS, macOS, watchOS or tvOS app you intend to keep for years
- The app depends on platform capability — camera, sensors, widgets, background modes, on-device models
- Interface fidelity and gesture feel are part of the product, not a checkbox
- The team ships iOS first and can staff a platform specialist
- You are already in a UIKit codebase and adding screens incrementally

## When not to use

- Don't pick Swift when the same app must ship on Android with one team — see [React Native vs Flutter](/compare/react-native-vs-flutter)
- For a content app that is mostly a web view, a responsive site costs less and updates instantly
- For backend services, unless the team is deliberately investing in server-side Swift
- When you have no Mac hardware, no Apple developer account, and no plan to get either
- For a throwaway prototype an internal web app would answer faster

## Real-world

Swift is what sits at the client edge of the systems described elsewhere on this site. An
app talking to a [REST](/concept/rest) API keeps a local [SQLite](/technology/sqlite) copy
and reconciles with [Offline First](/pattern/offline-first) so the screen still works in a
lift. It holds a [WebSocket](/technology/websocket) for live features like the ones in
[Chat System](/architecture/chat-system), falling back to polling when the OS suspends the
process. Device tokens registered from Swift are the leaf nodes of a
[Notification System](/architecture/notification-system), and login runs through
[OAuth 2.0](/concept/oauth) in the system browser with tokens in the Keychain rather than a
[JWT](/concept/jwt) in local storage. Crash and performance data flows into the same
[observability](/concept/observability) stack as the backend, which is how you learn that
one OS version, one device model or one carrier is where the errors live.
