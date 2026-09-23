---
id: outbox-vs-change-data-capture
name: Transactional Outbox vs Change Data Capture
tagline: Write the event on purpose inside the transaction, or read every change out of the log
category: decision
tags: [Events, Messaging, Consistency, Data, Decision]
difficulty: 4
subjects: [outbox, change-data-capture]
related:
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: saga, rel: RELATED_TO }
  - { to: database-per-service, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: high }
---

## TL;DR

Both solve the dual-write problem: a service updates its database and must also tell the
rest of the system, and doing those as two separate writes means a crash between them
leaves one done and the other not.

The [Transactional Outbox](/pattern/outbox) makes the event part of the same database
transaction as the data — a row in an `outbox` table — and relays it afterwards. The
application decides what the event is and what it says. [Change Data Capture](/concept/change-data-capture)
changes no application code at all: it reads the database's own write log and turns every
committed row change into an event.

The real difference is **whose schema the world sees**. An outbox publishes an event you
designed — `OrderPlaced`, with the fields a consumer needs. CDC publishes your tables,
column by column, so every consumer is now coupled to your storage layout. That is exactly
right for replicating data somewhere else and exactly wrong for announcing what happened.

## Comparison

```compare
Dimension              | Transactional Outbox [outbox]                  | Change Data Capture [change-data-capture]
What is published      | An event the application designed             | Row-level changes, in table shape
Application change     | Write an outbox row in the same transaction     | None; the log is read from outside
Captures other writers | No — only code that writes the outbox           | Yes — every committed change, from anyone
Schema coupling        | Consumers see a contract you version            | Consumers see your columns and renames
Ordering               | Per aggregate, by outbox sequence               | Log order, per table or partition
Needs from the database| Transactions across two tables                  | Log access — a replication slot or binlog
Moving part to run     | A relay polling or tailing the outbox           | A connector reading the log, with its offsets
History on day one     | Only events written from now on                 | A snapshot, then the stream
Typical use            | Integration events between services             | Replication, search indexes, analytics feeds
```

## Decision

```decision
? Are consumers other services reacting to something that happened in the business?
  YES -> ? Would publishing your table layout couple them to storage you intend to change?
    YES -> Transactional Outbox [outbox]
    NO -> ? Can you add a write to the transactions that produce these events?
      YES -> Transactional Outbox [outbox]
      NO -> Change Data Capture [change-data-capture]
  NO -> ? Is the goal a copy of the data somewhere else — a search index, a warehouse, a cache?
    YES -> Change Data Capture [change-data-capture]
    NO -> ? Do writers you do not control also change these tables?
      YES -> Change Data Capture [change-data-capture]
      NO -> Transactional Outbox [outbox]
```

## When Transactional Outbox

- The events are part of a service's public contract — `PaymentCaptured`, `OrderShipped` —
  and consumers should depend on their meaning, not on how the tables are laid out today.
- One business action touches several rows but should produce one event. An outbox lets the
  application say so; a row-level feed makes every consumer reassemble it.
- You own all the code that writes these tables, so there is nowhere a change could happen
  without passing through the outbox.
- The database supports a transaction spanning the business tables and the outbox, which is
  the only thing the pattern actually depends on.

## When Change Data Capture

- The goal is to keep another store in step with this one: a search index, a warehouse, a
  read model, a cache that must follow the database rather than the code.
- The database is written by more than one application, or by a legacy system you cannot
  change, and every change has to be seen regardless of who made it.
- You need the existing data as well as future changes. CDC connectors take a snapshot and
  then follow the log; an outbox knows only what was written after it existed.
- You can operate the connector as infrastructure — replication slots, offsets, schema
  changes — which is a real, ongoing commitment rather than a library call.

## Deep Dive

**They are often the same system.** The most common way to relay an outbox reliably is to
point a CDC connector at the outbox table, and only that table: the application decides
what the event says, and the log decides when it has committed. That combination keeps the
outbox's designed contract and drops the polling relay. So the choice is less "outbox or
CDC" than "do consumers see an event you wrote, or your tables".

**Both deliver at least once.** A relay can publish and crash before recording that it did;
a connector can restart from its last committed offset. Either way a consumer will see some
events twice, so every consumer needs [idempotency](/concept/idempotency) — keyed on an
event id the producer assigns, not on arrival order. [Exactly-once](/concept/delivery-semantics)
is something consumers construct, not something either pattern hands them.

**CDC's schema problem arrives later.** On day one a row-level feed looks convenient: no
code, every change captured. The cost comes with the first column rename or table split,
which is now a breaking change for every downstream consumer — including ones nobody
remembers wiring up. Teams that use CDC for integration usually end up putting a
transformation in front of it that maps rows to designed events, which is an outbox built
after the fact.

**An outbox needs housekeeping.** Published rows must be deleted or archived, or the table
grows without bound and the relay's query slows. Partition it by time, delete behind the
relay's high-water mark, and alert when the unpublished backlog grows — a stuck relay looks
exactly like a quiet system.
