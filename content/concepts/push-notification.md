---
id: push-notification
name: Push Notifications
tagline: Best-effort delivery to a device you do not control, through a gateway you do not own
category: application
tags: [Mobile, Messaging, Notification, Reliability]
difficulty: 3
prerequisites: [http, message-queue, mobile-networking]
learningPath:
  - http
  - message-queue
  - mobile-networking
  - push-notification
  - idempotency
  - dead-letter-queue
related:
  - { to: notification-system, rel: USED_IN }
  - { to: message-queue, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: mobile-networking, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: webhook, rel: RELATED_TO }
  - { to: swift, rel: RELATED_TO }
  - { to: kotlin, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A push notification is a message you hand to Apple's or Google's gateway, which delivers it
to a device over the single connection the OS already maintains. That indirection is the
whole design: it saves the battery that per-app polling would burn, and it means you do not
control delivery. Pushes are **best effort** — the gateway may delay, collapse, throttle or
drop them, the user may have revoked permission, and the device may be off for a week.
Never treat a push as transport for data your product depends on. It is a *signal to come
and look*, and the truth stays on your server.

## Why it matters

Two mistakes account for most push-related incidents.

The first is treating a push as a message queue. Teams put the state change in the payload —
"balance is now $40" — and the device that missed it is permanently wrong. Pushes are
unordered, unacknowledged, size-limited and droppable. Send an identifier, have the app
fetch; then a lost push costs one round trip instead of correctness.

The second is treating the token list as stable. Device tokens change when an app is
reinstalled, restored to a new device, or rotated by the OS, and a token that belongs to
someone else's phone after a device transfer is how a notification leaks to the wrong
person. Tokens are perishable data with a feedback channel, and ignoring that channel means
sending to millions of dead tokens, which the gateways will eventually rate-limit you for.

There is also a product cost that has no technical fix: a permission the user grants once,
and revokes forever the first week you are noisy. Notification permission is the most
expensive thing you will ever ask for.

## Visual

```sequence
title: One notification, from event to lock screen
participants: Service [backend], Queue [message-queue], Worker, Gateway [external], Device [mobile-networking], App
Service -> Queue: order.shipped event (userId, orderId)
Queue -> Worker: deliver (at least once)
Worker -> Worker: look up device tokens, check preferences and quiet hours
Worker -> Gateway: POST payload + token (collapse key: order-42)
Gateway --> Worker: 200 accepted — accepted, not delivered
Gateway -> Device: over the OS's existing connection
Device --> App: taps notification → deep link to /orders/42
App -> Service: GET /orders/42 — the payload was a pointer, not the data
Gateway --> Worker: token unregistered (async feedback) → mark token dead
```

## Solutions

**Send a pointer, not a state.** The payload carries an entity id and just enough text to
render the alert. The app fetches the current state when opened. This survives dropped,
delayed and out-of-order delivery, and it keeps sensitive data off the lock screen and out
of a third-party gateway.

**Treat the token store as a living table.** Register on launch and after every token
refresh, store the token with a user id, platform, app version and last-seen timestamp, and
delete it the moment the gateway reports it unregistered. Delete tokens on logout — that is
the fix for notifications following a device to its next owner. Prune anything not seen for
months.

**Queue the fan-out.** The event that triggers a notification and the delivery to a gateway
are separate concerns with different failure modes. Put a
[message queue](/concept/message-queue) between them so a gateway outage becomes a backlog
rather than lost notifications, and so one user with 40 devices cannot slow the request that
caused the event. [Notification System](/architecture/notification-system) is this design
end to end.

**Make workers idempotent.** Queues deliver at least once, so the same notification job will
be processed twice. Deduplicate on an event id before sending, or your users receive
doubles. See [Idempotency](/concept/idempotency).

**Collapse and prioritise.** A collapse key replaces an undelivered notification with the
newer one, so a chat that received nine messages while offline produces one alert, not nine.
Reserve high priority for things the user is waiting for; use low priority for everything
else, and expect the OS to batch it.

**Respect the user's attention explicitly.** Per-category preferences, quiet hours in the
user's own time zone, a per-user rate cap, and a real reason for every notification. Ask for
permission at the moment its value is obvious, not on first launch — and if the user
declines, the product must still work.

**Have a fallback ladder.** Push, then in-app inbox, then email or SMS after a delay if the
notification is important and unread. Push alone is never a delivery guarantee.

## Deep Dive

**"Accepted" is not "delivered".** A `200` from the gateway means the request was well
formed and the token was plausible. Delivery to the device is asynchronous, unacknowledged
and conditional on the device being reachable, the OS's batching policy, and the user's
settings. Data messages may be dropped entirely if the app has been backgrounded for long
enough or the device is in a deep power-saving state. Build dashboards on *sends and
failures*, and instrument opens from the app side — the gap between them is the only
delivery signal you get.

**The feedback loop is mandatory, not optional.** Both platforms report tokens that are no
longer valid, sometimes inline and sometimes asynchronously. If you do not consume it, your
token table grows monotonically, your send volume is dominated by tokens that cannot receive
anything, your cost and latency rise, and eventually you are throttled. Treat unregistered
responses like a [dead letter queue](/pattern/dead-letter-queue): a stream that must be
processed, not a log line.

**Payload limits are small.** A few kilobytes, including everything. That constraint pushes
you towards the pointer design anyway. Localisation is better done with a key the client
resolves than by sending translated strings, because the device knows the current locale and
your server knows a stale copy of it.

**Silent pushes are a scheduling hint, not a job trigger.** A content-available push can
wake the app to refresh in the background, but the OS decides whether and when, based on
battery, usage patterns and how well-behaved your app has been. It is a way to make data
fresher when the user opens the app. It is not a cron.

**Web push is the same model with different plumbing.** The Push API plus a service worker
gives browsers the same shape — a subscription endpoint per browser instance, VAPID keys
instead of a platform certificate, the same best-effort semantics, the same permission
economics. If you already have the queue and the pointer-shaped payload, adding a channel is
mostly a new adapter behind the same worker.

**Fan-out is the scaling problem, not the sending.** One event for a popular account can
mean millions of device sends, and gateways accept batches with per-connection concurrency
limits. That means sharded workers, bounded concurrency per gateway connection, a rate
limiter you own so you fail before the gateway fails you, and [backpressure](/concept/backpressure)
back into the queue. See [Notification System](/architecture/notification-system) and the
fan-out discussion in [Social Feed](/architecture/social-feed) — the shape is the same
problem in a different costume.

**Security.** Gateway credentials belong in [secrets management](/concept/secrets-management)
with rotation, because a leaked key lets anyone send notifications as you. Never put
personal or financial detail in a payload: it passes through a third party and renders on a
locked screen. And always verify server-side that the user this token belongs to is still
entitled to the content you are announcing.
