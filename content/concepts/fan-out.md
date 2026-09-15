---
id: fan-out
name: Fan-out
tagline: One event, many recipients — and the choice of whether to pay on write or on read
category: distributed
tags: [Distributed System, Messaging, Scalability, Architecture]
difficulty: 3
prerequisites: [message-queue, pub-sub, cache]
learningPath:
  - message-queue
  - pub-sub
  - cache
  - fan-out
  - backpressure
  - tail-latency
related:
  - { to: pub-sub, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: tail-latency, rel: RELATED_TO }
  - { to: kafka, rel: USED_WITH }
  - { to: social-feed, rel: USED_IN }
  - { to: notification-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Fan-out is one input producing many outputs: a post that must reach ten thousand timelines,
an order that must reach payment, email, analytics and search, a chat message that must reach
every device in the room. The recurring decision is **when to pay**. *Fan-out on write* does
the work once, at write time, and makes reads trivial — until one input has a million
recipients. *Fan-out on read* stores the event once and assembles per reader, which keeps
writes cheap and makes every read do work. Most systems at scale end up doing both, splitting
by how popular the producer is, because neither answer survives the extremes alone.

## Why it matters

Fan-out is where an innocuous write becomes an expensive one, and the cost is invisible in a
small test dataset.

Posting to 50 followers is 50 inserts and nobody notices. Posting to 50 million is 50 million
inserts, and it arrives as one HTTP request. If that work happens inside the request, the
request times out; if it happens in a worker pool with no bound, the pool fills and every
other job waits behind it; if it happens against the database, that write amplification is
now your database's capacity problem.

The same shape appears wherever one thing must reach many: a notification to every device a
user owns, a cache invalidation to every region, a webhook to every subscribed integration, a
[push notification](/concept/push-notification) to a million tokens. What changes is the
recipient count and who feels the delay.

And fan-out multiplies failure as well as work. Ten thousand deliveries against a dependency
with a 0.1% error rate is ten failures per event, every time — so retry, deduplication and a
dead-letter path stop being optional at exactly the point fan-out appears.

## Visual

```compare
Question                    | Fan-out on write (push)                         | Fan-out on read (pull)
When the work happens       | at publish time, once per recipient              | at read time, once per reader
Write cost                  | O(recipients) — a celebrity post is enormous     | O(1) — append to one place
Read cost                   | O(1) — the timeline is already assembled         | O(sources) — gather and merge
Read latency                | low and predictable                              | depends on how many sources
Storage                     | a copy per recipient                             | one copy
Freshness                   | whatever the worker backlog is                   | always current at read time
Inactive recipients         | you did the work anyway                          | costs nothing
Good for                    | read-heavy, most producers small                 | write-heavy, or very popular producers
Breaks on                   | one producer with millions of recipients         | one reader following thousands of sources
Typical of                  | timelines, notification inboxes, chat delivery   | search, aggregation, low-traffic feeds
```

## Solutions

**Split by popularity rather than choosing one.** The standard answer at scale is a hybrid:
fan out on write for ordinary producers, and leave the few enormous ones to be pulled at read
time and merged in. This is exactly what [Social Feed](/architecture/social-feed) does, and
it works because the distribution is extreme — almost everyone is small, and the handful who
are not would otherwise dominate the entire write path.

**Never fan out inside the request.** Write the event once, durably, return, and let workers
do the multiplication. The [Outbox](/pattern/outbox) pattern makes the hand-off atomic so the
event cannot be lost between the commit and the queue. The user's request should cost the
same whether they have ten followers or ten million.

**Bound the concurrency, and let the queue be the buffer.** Unbounded parallel delivery
turns one popular event into a denial-of-service attack on your own dependencies. Fixed
worker pools, a concurrency cap per destination, and [backpressure](/concept/backpressure)
into the queue keep a spike as a backlog rather than an outage.

**Batch at the destination.** Most fan-out targets accept batches — a database multi-row
insert, a push gateway batch, a bulk index request. Sending ten thousand single writes when
the destination accepts five hundred at a time is usually the whole difference between
minutes and hours.

**Deduplicate, because delivery is at-least-once.** Workers retry, so a recipient will
sometimes be processed twice. Key the work per (event, recipient) and make it idempotent —
see [Delivery Semantics](/concept/delivery-semantics). At fan-out scale, "occasionally
duplicated" means thousands of duplicates per incident.

**Prioritise, or the important things wait.** One celebrity's fan-out can occupy every worker
for minutes while password resets sit behind it. Separate queues by urgency, or at minimum
separate the big jobs from the small ones so a large fan-out cannot block a small one.

## Deep Dive

**Fan-out amplifies the tail, not the average.** If a single delivery has a p99 of 100ms and
an event fans out to 1,000 recipients, roughly ten of those deliveries will be slow, so the
*event's* completion time is governed by the slow ones rather than the median. This is why
fan-out systems are judged on time-to-last-delivery, and why shaving the tail matters more
than shaving the mean — see [Tail Latency](/concept/tail-latency).

**Chunk large fan-outs so they are resumable.** A job that delivers to a million recipients
and crashes at 60% must not start again from zero. Split the recipient list into chunks with
a cursor, commit progress per chunk, and make each chunk independently retryable. Without
this, the largest fan-outs are the ones most likely to never complete.

**The write-amplification arithmetic is worth doing in advance.** Average followers × posts
per second = inserts per second. Plug in the real distribution rather than the mean: the mean
follower count is meaningless when the distribution has a long tail, and the peak comes from
the tail. This number decides whether fan-out on write is viable at all.

**Fan-out is not only per user.** The same pattern appears as one event to many *services*
(an order reaching payment, inventory, email and analytics), and there the recipients are few
but each is a network call with its own failure mode. [Pub/Sub](/concept/pub-sub) with one
topic and independent consumer groups is the right shape: adding a fifth consumer should cost
the publisher nothing, which is precisely what [Event-Driven
Architecture](/pattern/event-driven-architecture) buys.

**Deleting is fan-out too, and it is usually forgotten.** If a post was copied into ten
thousand timelines, deleting it means ten thousand deletions — or a read-time filter against
a tombstone, which is cheaper to write and adds cost to every read forever. Whichever you
pick, decide it when you choose fan-out on write, not when the first deletion request
arrives.

**Measure the backlog, not the throughput.** A fan-out system that processes a million
deliveries a minute is healthy or drowning depending on the arrival rate. The number that
predicts trouble is queue age — how old is the oldest undelivered item — because it rises
before throughput falls.
