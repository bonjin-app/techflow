---
id: event-sourcing
name: Event Sourcing
tagline: Store every change as an immutable event and derive current state by replaying them
category: data
tags: [Data, Architecture, Consistency, Distributed System]
difficulty: 5
prerequisites: [database, transaction, message-queue, eventual-consistency]
learningPath:
  - database
  - transaction
  - acid
  - message-queue
  - event-driven-architecture
  - cqrs
  - event-sourcing
related:
  - { to: transaction, rel: SOLVES }
  - { to: cqrs, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: outbox, rel: USED_WITH }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: materialized-view, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A normal table stores only the *latest* state. When a support agent asks "why is this
order marked cancelled, and who did it?", the row cannot answer: the previous values were
overwritten. Teams then bolt on audit tables, `updated_by` columns and triggers, each
covering a different slice of the truth and none of them complete.

The same gap hurts more than auditing. A [transaction](/concept/transaction) that flips
`balance` from 100 to 50 loses the *reason* — was it one withdrawal or two? A new report
asking "how many carts were abandoned after adding a second item?" is unanswerable
because that intermediate state never existed in storage. Debugging becomes archaeology
across logs, and every new question about the past requires data you did not keep.

## Solution

Make the **sequence of events the source of truth**. Instead of updating a row, append an
immutable fact: `OrderPlaced`, `ItemAdded`, `OrderCancelled`. Current state is not stored
primarily — it is a *fold* over that event stream. To load an aggregate, read its events
in order and apply each one to an in-memory object.

```sequence
title: Command against an event-sourced aggregate
participants: Client, Command Handler [backend], Event Store [postgresql], Bus [kafka], Projector [backend]
Client -> Command Handler: CancelOrder(o-1)
Command Handler -> Event Store: read events for o-1 (v0..v7)
Event Store --> Command Handler: OrderPlaced, ItemAdded, ItemAdded, Paid …
Command Handler -> Command Handler: rebuild state, check invariants
Command Handler -> Event Store: append OrderCancelled (expectedVersion 7)
Event Store --> Command Handler: OK (now v8)
Event Store -> Bus: OrderCancelled
Bus -> Projector: OrderCancelled
Projector -> Projector: update read model / [materialized-view](/pattern/materialized-view)
```

The append carries an **expected version**. If another writer got there first the append
fails, which gives optimistic concurrency without locks and prevents the
[race condition](/concept/race-condition) of two conflicting cancellations.

## How it works

```steps
title: Write path and read path
Command arrives [http]
Load the aggregate's events by stream id [database]
Fold events into current state | pure function, no I/O
Validate the command against that state | invariants live only here
Append new events with expectedVersion [race-condition] | conflict = retry the command
Publish the events [message-queue]
Projectors build query-shaped views [cqrs] | eventually consistent
```

The store itself is simple — often just a table:

```sql
CREATE TABLE events (
  stream_id  text    NOT NULL,
  version    int     NOT NULL,
  type       text    NOT NULL,
  payload    jsonb   NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stream_id, version)
);
```

The primary key is what enforces concurrency: an insert at `version = 8` fails if 8 exists.

```ts
const state = events.reduce(apply, initial);   // rebuild
function apply(s: Order, e: Event): Order {
  switch (e.type) {
    case "OrderPlaced":   return { ...s, status: "PLACED", lines: [] };
    case "ItemAdded":     return { ...s, lines: [...s.lines, e.payload.line] };
    case "OrderCancelled": return { ...s, status: "CANCELLED" };
    default:              return s;            // unknown = ignore, never crash
  }
}
```

Streams that grow long need **snapshots**: persist the folded state at version 500 and
replay only events after it. Reads almost never go through the aggregate; they use
projections maintained by [CQRS](/pattern/cqrs) projectors.

## Advantages

- Complete history: every change, its cause and its actor are permanent facts
- New read models can be built for questions nobody asked when the data was written
- Projections are disposable — drop and rebuild them after a bug or schema change
- Optimistic concurrency comes free from the append-only version check
- Temporal queries ("what did this look like on 1 March?") are a replay, not a guess
- Natural fit for [event-driven architecture](/pattern/event-driven-architecture): the store *is* the event feed

## Disadvantages

- **Schema evolution of events is permanent work.** Old events are immutable and must stay
  readable forever, so every handler needs upcasters or version branches. Renaming a field
  is a code change that lives for years.
- **Replay cost grows.** Rebuilding a projection over hundreds of millions of events takes
  hours and needs a dual-write or shadow-read strategy to switch over safely.
- **Deletes are genuinely hard.** An append-only log conflicts directly with "erase this
  person's data". The usual answer is crypto-shredding (store personal fields encrypted
  per subject, delete the key), which must be designed in from day one — retrofitting GDPR
  erasure onto an existing store is a migration of the whole history.
- No ad-hoc SQL against current state; every query needs a projection built in advance
- Reads are eventually consistent, so "read your own write" needs explicit handling
- Steep learning curve: most teams model events as CRUD diffs at first and get the worst of both worlds

## When to use

- The history *is* the domain: ledgers, payments, inventory movements, insurance claims
- Auditability or regulatory reconstruction of past state is a hard requirement
- Many different views of the same facts are needed and keep changing
- Complex invariants that are easier to express as a fold over decisions than as a row update

## When not to use

- CRUD domains where nobody will ever ask why a field changed
- The team is new to it and the deadline is short — the failure mode is expensive
- Right-to-erasure obligations exist and no key-per-subject design is planned
- Ad-hoc analytical querying of current state is the main workload
- Only auditing is needed — an audit table or temporal table is far cheaper

## Real-world

Event sourcing is standard in accounting and banking cores, where a ledger is *already*
an append-only list of entries, and in order and inventory systems that must explain
themselves. It is typically paired with [CQRS](/pattern/cqrs) for reads, an
[Outbox](/pattern/outbox) or store-integrated feed to publish reliably, and
[Kafka](/technology/kafka) to distribute events. The
[Payment System](/architecture/payment-system) architecture leans on the same idea:
authorisations, captures and refunds are recorded as separate facts rather than a mutable
`status` column, so a disputed charge can be reconstructed exactly as it happened.
