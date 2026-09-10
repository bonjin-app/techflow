---
id: webhook
name: Webhook
tagline: Server-to-server callbacks — the provider POSTs an event to your URL when it happens
category: protocol
tags: [Integration, Events, HTTP, Backend]
difficulty: 3
prerequisites: [http, rest, idempotency]
learningPath:
  - http
  - rest
  - idempotency
  - webhook
  - retry
  - dead-letter-queue
related:
  - { to: http, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: pub-sub, rel: RELATED_TO }
  - { to: payment-system, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A webhook is a **user-defined HTTP callback**: you register a URL with a provider, and
the provider sends an HTTP request to it whenever a subscribed event occurs. It inverts
polling — instead of asking "anything new?" every minute, you are told within seconds.
Because delivery crosses two organisations over an unreliable network, every real webhook
system needs signature verification, retries with backoff, and an
[Idempotency](/concept/idempotency) strategy on the receiving side.

## Why it matters

Most integrations start by polling an API on a timer: wasteful when nothing changes, slow
when something does, and rate-limited exactly when a burst happens. Webhooks push the
event instead, which is why they are how payment providers report a captured charge, how
a git host triggers [CI/CD](/concept/ci-cd), and how a mail service reports a bounce.
They are also the point where two teams' reliability assumptions meet: the sender retries
because it cannot know whether you processed the event, so the receiver *will* see
duplicates and out-of-order deliveries, and code that ignores this corrupts data quietly.

## Visual

```sequence
title: Signed delivery, failure, retry, and duplicate
participants: Provider, Receiver [backend], Queue [kafka], Worker [nodejs]
Provider -> Provider: event charge.succeeded (id evt_9f1) — sign body with shared secret
Provider -> Receiver: POST /hooks/payments  X-Signature: t=1789…,v1=9c8b…
Receiver -> Receiver: recompute HMAC over "t.body", compare in constant time
Receiver -> Receiver: reject if timestamp older than 5 minutes (replay window)
Receiver -> Queue: append raw event (evt_9f1)
Receiver --> Provider: 200 OK — under 2s, before any business logic
Worker -> Queue: consume evt_9f1
Worker -> Worker: INSERT evt_9f1 into processed_events — first time, so apply
Provider -> Receiver: POST /hooks/payments (evt_9f1) — earlier delivery timed out
Receiver -> Queue: append evt_9f1 again
Worker -> Worker: INSERT evt_9f1 → unique violation, already processed, skip
Provider -> Receiver: POST /hooks/payments (evt_a22)
Receiver --> Provider: 503 — receiver is down
Provider -> Provider: retry with exponential backoff + jitter (1m, 5m, 30m, 2h …)
Provider -> Receiver: POST /hooks/payments (evt_a22)
Receiver --> Provider: 200 OK
Provider -> Provider: exhausted endpoints are disabled and surfaced in a dashboard
```

## How it works

**Registration.** The subscriber supplies an HTTPS URL and the event types it cares
about; the provider returns a **signing secret**. Good providers also offer per-endpoint
event filters, a replay/redelivery button, and a delivery log.

**The delivery request.** A `POST` with a JSON body describing one event: a unique event
id, a type (`invoice.paid`), a timestamp, an API version, and a payload. Headers carry
the signature and often a delivery attempt number.

**Verification.** The receiver recomputes an HMAC-SHA256 of the timestamp plus the raw
request body using the shared secret and compares it to the header with a constant-time
comparison. Two details matter: verify the **raw bytes** — re-serialising the parsed JSON
changes them — and reject stale timestamps so a captured request cannot be replayed
later. Some providers sign asymmetrically instead, so you verify with their public key
and no secret needs to be shared.

**Acknowledge fast, process later.** Return `2xx` as soon as the event is durably
recorded — in a [Message Queue](/concept/message-queue), an outbox table, or
[Kafka](/technology/kafka) — and do the work in a background worker. Providers time out
in a handful of seconds, and a slow handler converts into retries, duplicates and
eventually a disabled endpoint.

**Retries.** Any non-2xx or timeout is retried with exponential backoff and jitter for
hours or days, then parked. On the receiving side that means *at-least-once* delivery:
deduplicate by event id, and make handlers idempotent so applying the same event twice
is harmless.

## Deep Dive

**Ordering is not guaranteed.** Retries and parallel delivery mean `subscription.updated`
can arrive before `subscription.created`. Do not build state machines that assume
sequence. Instead, key each event to an entity and either apply only events newer than
the stored version (a sequence number or timestamp on the resource) or treat the webhook
as a *hint* and re-fetch the current state from the provider's API before acting — the
most robust option when correctness matters more than a round trip.

**Thin versus fat payloads.** A thin event ("invoice inv_12 changed") plus a follow-up
read is always current and leaks little, at the cost of an API call and a dependency on
provider availability. A fat payload avoids the call but can be stale by the time you
process it, and puts business data in transit and in logs. Payment and identity events
lean thin; high-volume analytics events lean fat.

**Failure modes on the receiving side.** Handlers that do multi-step work with no
transaction, so a crash halfway leaves partial state; deduplication in application memory
instead of a durable unique constraint; returning 200 before validating the signature;
logging full bodies containing personal data; a queue with no
[Dead Letter Queue](/pattern/dead-letter-queue), so a single unparseable event blocks the
partition.

**Security beyond signatures.** Require HTTPS and reject invalid certificates. Treat the
payload as untrusted input, since a valid signature only proves origin, not sanity. If
your receiver fetches any URL from the payload, guard against server-side request forgery
against internal addresses. Rotate secrets with an overlap window during which both the
old and new signatures verify.

**Operating an endpoint.** Publish stable IP ranges or use a distinct hostname so
customers can allowlist you. Expose per-endpoint success rate and lag as metrics — a
webhook receiver that silently 500s for a day loses events that no user complained about.
Keep the raw payloads for a retention window so a bug fix can be replayed against them.

**When not to use webhooks.** For browser clients (they have no reachable URL) use
[WebSocket](/technology/websocket) or [SSE](/technology/sse). Inside your own system, a
message broker gives ordering, replay and backpressure that HTTP callbacks do not — a
webhook's natural home is the boundary between two independently operated systems.
