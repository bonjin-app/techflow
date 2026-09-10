---
id: rest-vs-webhook
name: REST Polling vs Webhooks
tagline: Consumers poll your API, or you push events to theirs — who pays for freshness
category: decision
tags: [API, Integration, Event-Driven, Decision]
difficulty: 3
subjects: [rest, webhook]
related:
  - { to: http, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: dead-letter-queue, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Same integration question, two answers about who initiates. With
[REST](/concept/rest) polling the consumer asks "anything new?" on a timer; the provider
just serves a normal read endpoint and owns nothing about delivery. With a
[webhook](/concept/webhook) the provider does the asking in reverse: when something
happens it makes an HTTP request to a URL the consumer registered. Polling is trivially
reliable and wastes requests; webhooks are near-instant and hand the consumer three new
jobs — stay reachable, verify the signature, and deduplicate retries. Most mature
platforms ship both, because the failure modes are complementary rather than competing.

## Comparison

```compare
Feature              | REST Polling [rest]                                  | Webhooks [webhook]
Initiator            | Consumer, on a timer                                 | Provider, on the event
Latency to consumer  | Half the poll interval on average                    | Sub-second once the event is published
Cost when idle       | Every poll costs a request even when nothing changed  | None; nothing is sent until something happens
Delivery guarantee   | None needed — the consumer re-reads state             | At-least-once, with duplicates and reordering
Consumer uptime      | Can be offline for hours and catch up on next poll    | Must keep a public HTTPS endpoint always up
Provider work        | One read endpoint plus cursors and rate limits        | Queue, retry policy, signing, dead-letter store
Authentication       | Consumer holds a token and calls out                  | Provider signs the body; consumer verifies HMAC
Backfill and replay  | Native — just page back through the cursor            | Needs a separate replay API or event log
Ordering             | The consumer reads in whatever order it queries       | Not guaranteed; retries arrive out of order
Debuggability        | Reproduce with curl any time                          | Needs a delivery log and a tunnel in development
```

## Decision

```decision
? Does the consumer need the change within seconds rather than minutes?
  NO -> REST Polling [rest]
  YES -> ? Can the consumer operate a public, always-on HTTPS endpoint?
    NO -> REST Polling [rest]
    YES -> ? Can the consumer deduplicate and tolerate at-least-once delivery?
      NO -> REST Polling [rest]
      YES -> ? Must the consumer also backfill history or recover after long downtime?
        YES -> Webhooks plus a REST read API [webhook]
        NO -> Webhooks [webhook]
```

## When REST Polling

- The consumer is a batch job, a spreadsheet sync or an ETL run where minutes of lag are free.
- The consumer cannot be reached from the internet: a laptop, a CI runner, a device behind NAT or a corporate firewall.
- The integration is being built by a third party you cannot support — polling has no signature bugs, no retry storms and no "why did delivery 88 fail?" tickets.
- Volume is low relative to the poll cost, or changes are dense enough that most polls return data.
- You want reads to be reproducible: the same `GET` with the same cursor gives the same answer, which makes reconciliation and backfill trivial.

## When Webhooks

- The event drives something a human is waiting on: payment captured, build finished, document ready, message received.
- Events are sparse and bursty, so polling would mean thousands of empty responses per real change — see [Rate Limiting](/concept/rate-limiting) for what that does to your API budget.
- The consumer is a server you or your customer's platform team operates and can keep available.
- You are already publishing events internally and can reuse that log; the [Outbox](/pattern/outbox) pattern is the usual way to publish them without losing any.
- You will still add a read endpoint next to it, so consumers can reconcile after an outage.

## Deep Dive

**Delivery guarantees.** Polling needs none: the consumer reads current state, so a
missed poll costs nothing. A webhook is a distributed message and inherits every
distributed-messaging problem. Exactly-once delivery over HTTP does not exist, so
platforms promise at-least-once: the same event may arrive twice, out of order, or long
after a newer one. Send a stable `event_id` and a monotonically increasing sequence or
timestamp in every payload, and expect consumers to apply [Idempotency](/concept/idempotency)
by recording processed ids. The rule of thumb is to treat a webhook as a hint that
something changed, not as the authoritative state — the consumer confirms by reading the
resource.

**Retries and the provider's queue.** A webhook endpoint that returns `500` or times out
must be retried, which turns a "simple HTTP call" into a delivery system: a queue, a
[Retry](/pattern/retry) policy with exponential backoff and jitter, a per-endpoint
concurrency cap so one slow consumer cannot exhaust your workers, a circuit that disables
an endpoint after sustained failure, and a [Dead Letter Queue](/pattern/dead-letter-queue)
plus a replay API for what never got through. Consumers should acknowledge fast — return
`2xx` as soon as the event is durably enqueued on their side and process asynchronously,
because doing real work inside the request is what causes the timeouts that cause the
retries.

**Signature verification.** The endpoint is public, so anyone can post to it. The provider
computes an HMAC over the exact raw body plus a timestamp with a shared secret and sends
it in a header; the consumer recomputes it over the unparsed bytes, compares with a
constant-time function, and rejects timestamps outside a short window to stop replay.
Common mistakes: verifying after JSON re-serialisation, using `==` on the digest,
accepting any timestamp, and having no second secret so key rotation requires downtime.
IP allow-lists are a weak substitute — verify the signature.

**The consumer's availability burden.** This is the trade-off people discover late.
Polling shifts freshness cost onto the consumer's schedule; webhooks shift *availability*
cost onto the consumer's infrastructure. A consumer that is down for an hour must trust
the provider's retry window, and those windows are finite. That is why the honest answer
is usually both: webhooks for latency, a cursor-paged REST endpoint for truth. If the
consumer is a browser and the provider is your own backend, neither applies — that is a
[WebSocket vs SSE](/compare/websocket-vs-sse) question instead.

## Related

- [REST](/concept/rest) — the read endpoint every integration still needs
- [Webhook](/concept/webhook) — the push side, its retries and signatures
- [Idempotency](/concept/idempotency) — how consumers survive at-least-once delivery
- [Outbox](/pattern/outbox) — publishing events without losing them
- [Dead Letter Queue](/pattern/dead-letter-queue) — where undeliverable events go
