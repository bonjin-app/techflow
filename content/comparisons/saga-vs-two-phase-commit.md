---
id: saga-vs-two-phase-commit
name: Saga vs Two-Phase Commit
tagline: Undo the steps that already happened, or hold every participant until all agree
category: decision
tags: [Distributed System, Transaction, Consistency, Microservices, Decision]
difficulty: 4
subjects: [saga, two-phase-commit]
related:
  - { to: transaction, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: outbox, rel: RELATED_TO }
  - { to: database-per-service, rel: RELATED_TO }
  - { to: e-commerce, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-22, confidence: high }
---

## TL;DR

One business operation spans several services, each with its own database, and you need it
to end in a sensible state. [Two-phase commit](/pattern/two-phase-commit) keeps the
[transaction](/concept/transaction) property you are used to: every participant prepares,
a coordinator decides, and until it does, everyone holds their locks. A
[saga](/pattern/saga) gives that up: each step commits immediately, and if a later step
fails, earlier ones are undone by compensating actions you write yourself.

The trade is availability against tidiness. 2PC never exposes a half-done state and blocks
when the coordinator is unreachable. A saga never blocks and is visibly half-done in the
middle — an order exists before it is paid for. Most systems that span services choose the
saga, not because it is elegant but because a pattern that stalls when one participant is
slow is not one you want on a request path.

## Comparison

```compare
Dimension          | Saga [saga]                                     | Two-phase commit [two-phase-commit]
Isolation          | None; intermediate states are visible            | Full; nobody sees a partial result
Failure of a step  | Compensate the steps already done                | Coordinator aborts, everyone rolls back
Locks held         | Only within each local transaction               | Across the whole operation, until commit
Coordinator down   | Steps continue; recovery is per-step             | Participants block, holding locks
Latency            | Sum of the steps, no global wait                 | Two round trips to every participant
Heterogeneity      | Any store, any service, any language             | Needs XA support in every participant
What you write     | A compensating action per step                   | Almost nothing, if XA is available
What can go wrong  | A compensation that cannot undo reality          | One slow participant stalls the rest
Typical scale      | Services owned by different teams                 | One database, or two inside one boundary
```

## Decision

```decision
? Does every participant sit inside a single database, or one you fully control?
  YES -> ? Does it support a distributed transaction across those participants?
    YES -> Two-phase commit [two-phase-commit]
    NO -> Saga [saga]
  NO -> ? Can an intermediate state be visible for a second or two without harm?
    YES -> Saga [saga]
    NO -> ? Can the operation be restructured so the irreversible step is last?
      YES -> Saga [saga]
      NO -> Two-phase commit [two-phase-commit]
```

## When Saga

- The steps live in services owned by different teams, with their own stores and release
  cycles — the situation [database per service](/pattern/database-per-service) creates
  deliberately.
- Availability matters more than hiding the middle of the operation. An order that exists
  in a pending state for two seconds is acceptable; a checkout that blocks because the
  inventory service is slow is not.
- The steps are genuinely compensable: refund a charge, release a reservation, restock an
  item. Each has an inverse you can execute later.
- You can make the irreversible step last. Reserve, then charge, then ship — because a
  shipment cannot be un-shipped and a saga's compensation is a business action, not a
  rollback.

## When Two-phase commit

- Every participant is inside one boundary you control, and the coordinator is not a
  network hop away from any of them.
- The operation genuinely cannot expose an intermediate state — a ledger where two accounts
  must move together, and a reader seeing one side is a correctness bug rather than an
  inconvenience.
- The participants are two databases or a database and a queue, both supporting XA, and the
  operation is rare enough that holding locks for a round trip does not matter.
- Writing a correct compensation for each step would be harder than accepting the blocking:
  some actions have no inverse, and pretending otherwise is worse than waiting.

## Deep Dive

**A compensation is not a rollback.** A rollback erases the fact that anything happened; a
compensation is a new action that makes up for one. Refunding a payment leaves two entries
in the ledger and possibly a fee. Releasing a seat may hand it to someone who was waiting.
Cancelling an email that has been read is not possible at all. Designing a saga is largely
the work of asking, step by step, "what does undoing this actually mean to a customer" —
and if the honest answer is "nothing can undo it", that step belongs at the end.

**2PC blocks, and that is its defining property, not a bug.** Between prepare and commit
every participant holds its locks and waits. If the coordinator fails in that window,
participants cannot safely decide alone — they have promised to honour whatever comes — so
they wait, holding those locks, until it returns. That is why it is unsuitable across a
network you do not control, and why three-phase variants and consensus-based coordinators
exist to narrow the window rather than to remove it.

**Both need idempotency.** A saga retries steps and compensations; 2PC retries commits after
a coordinator restart. Either way a participant will see the same instruction twice, so
every step needs an [idempotency](/concept/idempotency) key and a record of what it has
already applied. This is the part teams underestimate: the pattern is the easy half, and
making each step safe to repeat is the work.

**The outbox belongs to both.** A step that writes to its own database and then publishes an
event has two writes and no transaction spanning them. The
[outbox pattern](/pattern/outbox) — write the event to the same database in the same local
transaction, relay it afterwards — is what makes a saga's steps reliable without reaching
for a distributed transaction to coordinate a message broker.
