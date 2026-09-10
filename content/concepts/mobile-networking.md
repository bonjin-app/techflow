---
id: mobile-networking
name: Networking on Mobile
tagline: A phone network is slow and intermittent, and the OS can suspend you mid-request
category: networking
tags: [Mobile, Networking, Reliability, Offline, Battery]
difficulty: 3
prerequisites: [programming-fundamentals, http, tcp]
learningPath:
  - http
  - tcp
  - rest
  - mobile-networking
  - offline-first
  - retry
  - idempotency
related:
  - { to: offline-first, rel: RELATED_TO }
  - { to: retry, rel: SOLVES }
  - { to: idempotency, rel: RELATED_TO }
  - { to: http2, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: swift, rel: RELATED_TO }
  - { to: kotlin, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Server-to-server networking is fast, stable and always on. A phone is none of those. The
radio sleeps and costs battery to wake, latency swings from 20ms to 2,000ms within one
train journey, the IP address changes when the user walks out of Wi-Fi range, and the
operating system can suspend your process seconds after the screen goes off — in the middle
of a request. Code written for a data centre appears to work in the office and fails on the
Underground. The fixes are structural: render from a local store, make every write safe to
retry, batch instead of chatting, and hand long transfers to the OS.

## Why it matters

The failure mode is not an error dialog, it is a product that feels broken. A spinner that
never resolves because a request was issued as the app was suspended. A double charge
because the user tapped again when nothing happened. A battery complaint because the app
woke the radio every thirty seconds to poll. An app that shows an empty list in a lift when
it has the data on disk.

These are not rare paths. Mobile sessions are short, frequently interrupted, and often on a
degraded connection: a weak cellular signal that connects but barely moves data is far more
common — and far more damaging — than being cleanly offline, because every timeout you set
too generously becomes a frozen screen. Any request may be interrupted, so *interrupted*
must be an ordinary case in your design rather than an exception you log.

## Visual

```steps
title: What actually happens to one request on a phone
User taps Refresh | app is foreground, Wi-Fi is fading
Radio is idle | waking it costs several hundred ms and real battery
DNS + TCP + TLS handshake | on a cold connection this is most of the latency, not the payload
Request sent | 3 seconds pass with no bytes either way
User walks out of Wi-Fi range | the OS switches to cellular; the socket's IP is gone
Connection is dead, silently | no error arrives — the request simply never completes
Screen locks | the OS suspends the process; timers stop, callbacks never fire
Retry on resume | with the same idempotency key, so a completed write is not duplicated
Local rows render first | the list was never empty, even while all of the above happened
```

## Solutions

**Render from a local store, not from the network.** The screen reads a local database and
the network fills it. This is [Offline First](/pattern/offline-first) and it removes the
entire category of empty-screen-on-bad-network bugs. Show cached data with a quiet staleness
indicator rather than a blocking spinner.

**Make every write idempotent.** Attach a client-generated key to each mutation so a retry
after an ambiguous failure cannot create a second order or a second charge. See
[Idempotency](/concept/idempotency) — on mobile it is not an optimisation, it is the only
way retry is safe, because "did my request arrive?" is genuinely unanswerable from the
client.

**Retry with backoff and jitter, and only what is safe.** Reads retry freely; writes retry
with a key. Cap attempts, back off exponentially, add jitter so a whole city's phones do not
reconnect in lockstep after a tower blip. [Retry](/pattern/retry) covers the arithmetic.

**Set aggressive timeouts and design for them.** A 60-second timeout is a frozen app. Use a
short connect timeout, a request timeout of a few seconds for interactive calls, and fail
over to cached data. Interactive and background work deserve different budgets.

**Batch and coalesce.** Every wake of the radio has a fixed cost, so ten requests spread
over a minute are worse than one request carrying ten things. Deduplicate identical
in-flight requests, debounce user-typing calls, and prefer one endpoint that returns the
screen over six that return fragments.

**Hand long transfers to the OS.** Background transfer APIs (URLSession background sessions,
WorkManager) continue uploads and downloads after your process is gone and reschedule them
on a better network. Anything larger than a payload — a video, a photo batch, a sync — should
be theirs, not yours.

**Reuse connections.** Keep one client with connection pooling and keep-alive so subsequent
requests skip the handshake; [HTTP/2](/concept/http2) multiplexes them over one socket. This
single change often halves perceived latency on cellular.

**Shrink the payload.** Compression, no over-fetching, images sized for the device, and
pagination. On a metered connection bytes are the user's money, and the OS exposes whether
the connection is metered — respect it for anything optional.

## Deep Dive

**The radio state machine is why polling drains batteries.** A cellular radio moves between
idle and high-power states and stays awake for seconds after traffic stops. A poll every
thirty seconds keeps it permanently awake; the same data delivered by
[push notification](/concept/push-notification) costs almost nothing because the OS already
maintains one connection for every app on the device. "Poll less often" is a weaker fix than
"do not poll" — if the server can push, let it.

**Suspension is not a network error.** When the app is backgrounded, timers stop and
callbacks do not fire. A request in flight is neither delivered nor failed; it is frozen. On
resume, your state machine must decide what to do with work that has no outcome, which is
why in-flight operations need to be recorded durably before they are sent, not just held in
memory. Anything else loses a write when the user switches apps.

**Connection migration and the missing error.** Switching Wi-Fi to cellular changes the IP,
and the old socket is dead without notifying anyone. TCP notices only when a timeout
expires, which can take minutes. Watch the OS's network-change notifications and cancel and
reissue in-flight requests rather than waiting. Protocols built on QUIC survive this
better, because a connection identifier outlives the address.

**Captive portals lie.** Hotel and airport Wi-Fi accepts the connection and returns a login
page for every request, so you receive a `200` full of HTML where you expected JSON. Validate
content types and treat unexpected responses as a network failure rather than corrupt data.

**TLS handshakes dominate small requests.** On a cold connection the handshake can cost more
than the response body. Session resumption and connection reuse matter more here than on a
server. If you pin certificates, ship at least two pins and an expiry-safe rotation plan —
a pinned certificate that expires while old app versions are still installed bricks them,
and you cannot fix it without a store release. See [TLS](/concept/tls).

**Old versions never go away.** Some users will run a two-year-old build. Every endpoint the
app calls must keep working or degrade gracefully, which is why mobile forces
[API versioning](/pattern/api-versioning) discipline that a web frontend can skip — the web
ships a new client on every reload; you cannot. Pair it with a server-controlled minimum
version so you can eventually require an upgrade, and with
[feature flags](/pattern/feature-flag) so a bad rollout is switched off from the server
rather than through [App Store review](/concept/app-store-review).

**Measure percentiles on real networks.** Median latency from an office Wi-Fi tells you
nothing. Instrument client-side request timing and report it into
[observability](/concept/observability) segmented by connection type, OS version and
country; the p95 on cellular is the number your users actually experience, and it is
routinely five to ten times the median you were watching.
