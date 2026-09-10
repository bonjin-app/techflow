---
id: kotlin
name: Kotlin
tagline: JVM language with null safety and coroutines, and the default language for Android
category: languages
tags: [Language, Mobile, Android, JVM, Concurrency]
difficulty: 3
usedFor: [mobile-networking, push-notification, concurrency]
prerequisites: [programming-fundamentals, http]
learningPath:
  - programming-fundamentals
  - kotlin
  - state-management
  - http
  - rest
  - mobile-networking
  - offline-first
related:
  - { to: java, rel: ALTERNATIVE_TO }
  - { to: swift, rel: RELATED_TO }
  - { to: react-native, rel: ALTERNATIVE_TO }
  - { to: flutter, rel: ALTERNATIVE_TO }
  - { to: app-store-review, rel: RELATED_TO }
  - { to: sqlite, rel: USED_WITH }
  - { to: offline-first, rel: IMPLEMENTS }
  - { to: backpressure, rel: RELATED_TO }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Kotlin 2.x (K2 compiler)", confidence: medium }
---

## TL;DR

Kotlin is a JVM language and the default one for Android. Two features carry most of its
value: nullability is part of the type system, so the NullPointerException that dominated
Java crash reports becomes a compile error, and **coroutines** make asynchronous code look
sequential without blocking a thread. It interoperates with [Java](/technology/java) class
by class, so adoption is incremental. Beyond Android it is a solid server language, and
Kotlin Multiplatform can share non-UI logic with iOS — a smaller promise than the
cross-platform frameworks make, and a more reliable one.

## Practical

On Android the modern stack is **Jetpack Compose** for UI — declarative, state-driven,
replacing XML layouts — with a view model holding state that survives configuration
changes and process death.

- **Concurrency** is coroutines: `suspend` functions for one-shot work, `Flow` for streams,
  and a scope tied to the screen's lifecycle so leaving the screen cancels its work.
- **Networking** is Retrofit or Ktor over OkHttp, with kotlinx.serialization turning JSON
  into data classes. [Networking on Mobile](/concept/mobile-networking) covers what makes
  a phone different from a server.
- **Persistence** is Room over [SQLite](/technology/sqlite), exposing queries as `Flow` so
  the UI updates when the table does — the local-first shape of
  [Offline First](/pattern/offline-first).
- **Build** is Gradle with the Kotlin DSL; KSP generates the Room and DI code.

```kotlin
// ViewModel: nullability, a sealed result, cancellation for free
sealed interface OrdersUi {
    data object Loading : OrdersUi
    data class Ready(val orders: List<Order>) : OrdersUi
    data class Failed(val message: String) : OrdersUi
}

class OrdersViewModel(private val api: Api, private val dao: OrderDao) : ViewModel() {
    val ui: StateFlow<OrdersUi> = dao.observeAll()          // local rows first
        .map<List<Order>, OrdersUi> { OrdersUi.Ready(it) }
        .catch { emit(OrdersUi.Failed("Could not load orders")) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OrdersUi.Loading)

    fun refresh() = viewModelScope.launch {                 // cancelled with the screen
        runCatching { dao.replaceAll(api.orders()) }
            .onFailure { Log.w("orders", "refresh failed", it) }   // stale data still shows
    }
}
```

## Deep Dive

**Nullability is a type distinction.** `String` and `String?` are different types; the
compiler refuses to dereference the second without handling null, and `?.`, `?:` and
`let` make that cheap. The escape hatches are `!!` and platform types coming back from
Java, which is where surviving NPEs come from. Annotating the Java boundary or wrapping it
once is worth the effort.

**Coroutines are cheap, threads are not.** A `suspend` function releases its thread at each
suspension point, so tens of thousands of concurrent operations run on a small pool. This is
the same problem [Go](/technology/go)'s goroutines solve, in a language that must
interoperate with blocking JVM libraries — so the discipline is dispatchers: IO work on the
IO dispatcher, CPU work on the default one, UI on main. A blocking call on the wrong
dispatcher starves the pool, and it will not announce itself.

**Structured concurrency makes cancellation the default.** Coroutines belong to a scope;
cancelling the scope cancels every child and their children. Tie the scope to the screen and
abandoned work stops on its own. The rule that follows: cancellation is delivered as an
exception, so a blanket `catch (e: Exception)` swallows it and creates a coroutine that will
not die.

**Flow is a stream with backpressure built in.** A cold `Flow` produces only while a
collector is asking, which is [backpressure](/concept/backpressure) as an API rather than a
buffer that grows until it fails. `StateFlow` and `SharedFlow` are the hot variants for UI
state and events; `conflate` and `debounce` are how you keep a fast producer from repainting
a screen sixty times a second.

**Compose recomposes rather than mutates.** Composables are functions of state; when state
changes the framework re-invokes the affected ones. Reading state in the wrong place makes a
whole subtree recompose, which is the standard Compose performance bug — measure with the
layout inspector rather than guessing, and keep state as narrow as the thing that draws it.

**Interop and Multiplatform.** Kotlin and Java coexist in one module, so a legacy Android
codebase converts file by file. Kotlin Multiplatform compiles shared code to JVM, native and
JavaScript targets, which works well for models, validation, networking and storage, and
awkwardly for anything touching platform APIs. The honest framing: share the logic, write
each UI natively — a middle option between one native app per platform and
[React Native or Flutter](/compare/react-native-vs-flutter).

**Gradle is the tax.** Incremental builds are fine; cold builds, annotation processing and
version-catalog upgrades are where Android teams lose afternoons. Configuration caching and
keeping modules small are the levers that actually help.

## Why

Before Kotlin, Android was Java 7 with a UI toolkit that punished you for it: nulls were
untracked, so `NullPointerException` was the most common crash in the ecosystem, and
asynchronous work meant `AsyncTask` and nested callbacks that leaked the activity they
captured.

```sequence
title: Before — an NPE and a leaked screen
participants: Activity, Task [concurrency], API [rest], User
Activity -> Task: new AsyncTask().execute()
Task -> API: GET /orders
User -> Activity: rotates the device
Activity --> Activity: destroyed and recreated
API --> Task: 200 JSON
Task -> Activity: onPostExecute → old activity, still referenced
Task --> User: NullPointerException, and a leak that survives the screen
```

Kotlin addresses both halves. The type system tracks which references can be null, so the
crash becomes a compile error. Coroutines tie the work to a scope that dies with the screen,
so a rotation cancels the request instead of resuming into a dead activity.

```sequence
title: After — typed nulls, scoped work, cancellation on rotation
participants: Screen, ViewModel [state-management], Api [mobile-networking], Room [sqlite]
Screen -> ViewModel: collect ui state
ViewModel -> Room: observeAll() → Flow of local rows
Room --> Screen: renders immediately, offline included
ViewModel -> Api: refresh() in viewModelScope (suspend)
Api --> ViewModel: 200 JSON → data classes
ViewModel -> Room: replaceAll(rows) → Flow re-emits
Screen --> ViewModel: user leaves → scope cancelled, request torn down
```

## Advantages

- Null safety in the type system removes the platform's most common crash
- Coroutines and `Flow` give readable async code with cancellation and backpressure built in
- Full two-way Java interop, so migration is incremental and libraries all still work
- Concise data, sealed and value classes make modelling states cheap and exhaustive
- First-class Android support: tooling, Jetpack libraries and Compose are Kotlin-first
- Runs on the JVM for server code, and compiles to native and JS for shared logic
- Exhaustive `when` over sealed types turns "did I handle every state?" into a compile check

## Trade-offs

- Coroutine dispatchers must be chosen correctly; a blocking call on the wrong pool is invisible
- Cancellation arrives as an exception, so careless `catch` blocks break it
- `!!` and Java platform types leave holes in null safety
- Gradle build times and annotation processing are a persistent cost on Android
- Compose performance depends on where state is read — easy to get subtly wrong
- Multiplatform saves less than it appears once platform APIs are involved
- On the server the JVM ecosystem is Java-shaped; some libraries feel unidiomatic

## When to use

- Any new Android app, and any existing Android codebase you are still changing
- Sharing models, validation and networking with iOS via Multiplatform while keeping native UIs
- JVM backend work where you want coroutines and null safety without leaving the ecosystem
- Migrating a Java codebase incrementally, module by module, with no rewrite
- Apps that need deep platform integration — background work, widgets, sensors, foreground services

## When not to use

- Don't use Kotlin for the iOS UI layer; that is [Swift](/technology/swift)'s ground
- When one small team must ship both platforms and native quality is negotiable — compare the [cross-platform frameworks](/compare/react-native-vs-flutter)
- For a mostly-content app where a responsive website updates instantly and costs less
- On a backend team with no JVM experience or operational familiarity
- For scripts and data work where [Python](/technology/python) is already the answer

## Real-world

Kotlin sits at the client edge of the same systems the rest of this site describes. A
typical app renders from a local [SQLite](/technology/sqlite) database, refreshes over
[REST](/concept/rest), and reconciles conflicts through
[Offline First](/pattern/offline-first) so a tunnel does not empty the screen. Live features
hold a [WebSocket](/technology/websocket) like the clients in
[Chat System](/architecture/chat-system) and fall back to polling when the OS suspends the
process. Device tokens registered from the app are the last hop of a
[Notification System](/architecture/notification-system). Sign-in runs through
[OAuth 2.0](/concept/oauth) with tokens in the platform keystore, and crash, ANR and
performance data lands in the same [observability](/concept/observability) stack as the
services behind it — where release-over-release comparison, not the average, is what tells
you whether the last build was actually better.
