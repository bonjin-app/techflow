---
id: saga
name: Saga
tagline: Run a multi-service transaction as a chain of local steps with compensating actions
category: distributed
tags: [Distributed System, Consistency, Messaging, Transactions]
difficulty: 4
prerequisites: [transaction, distributed-system, message-queue, idempotency]
learningPath:
  - transaction
  - acid
  - distributed-system
  - message-queue
  - idempotency
  - outbox
  - saga
  - eventual-consistency
related:
  - { to: transaction, rel: SOLVES }
  - { to: distributed-system, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: idempotency, rel: REQUIRES }
  - { to: outbox, rel: USED_WITH }
  - { to: event-driven-architecture, rel: USED_WITH }
  - { to: kafka, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
  - { to: delivery-semantics, rel: REQUIRES }
  - { to: dead-letter-queue, rel: USED_WITH }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## Problem

Placing an order means creating the order, reserving stock and charging the card —
three services, three databases. A single ACID [transaction](/concept/transaction)
cannot span them, and two-phase commit across services is slow, holds locks while
waiting on the network, and fails badly when a coordinator dies. Yet the business
rule is clear: if the charge fails, the stock must be released and the order
cancelled. You need "all or nothing" semantics without a global lock.

## Solution

Model the operation as a **saga**: an ordered sequence of local transactions, each
committed in one service. If a step fails, the saga runs **compensating
transactions** for the steps already completed — in reverse order — until the
system is back to a consistent business state. Compensation is not rollback: the
charge is not un-happened, it is refunded; the reservation is released, not erased.

```sequence
title: Orchestrated saga — payment fails, earlier steps are compensated
participants: Orchestrator [backend], Order [backend], Inventory [backend], Payment [backend]
Orchestrator -> Order: create order (PENDING)
Order --> Orchestrator: created
Orchestrator -> Inventory: reserve stock
Inventory --> Orchestrator: reserved
Orchestrator -> Payment: charge card
Payment --> Orchestrator: DECLINED
Orchestrator -> Inventory: release reservation
Inventory --> Orchestrator: released
Orchestrator -> Order: cancel order
Order --> Orchestrator: CANCELLED
```

## How it works

```steps
title: Anatomy of a saga
Define each step as a local transaction [transaction] | one service, one database
Define a compensation for every step that can be followed by a failure
Persist saga state after every step [outbox] | survive crashes mid-saga
Make every step and compensation idempotent [idempotency] | retries will redeliver
On failure, run compensations in reverse order
Accept intermediate states [eventual-consistency] | "PENDING" is a real state
```

Two coordination styles exist:

- **Orchestration** — a central saga coordinator tells each service what to do next
  and decides when to compensate. The flow is explicit and easy to read; the
  orchestrator is one more component to run and can become a bottleneck of logic.
- **Choreography** — each service reacts to the previous service's event
  (`OrderCreated` → Inventory reserves → `StockReserved` → Payment charges). No
  central component, but the overall flow is spread across services and hard to
  see, and cyclic dependencies creep in.

The usable rule: choreography while the flow is linear and has about three
participants, orchestration the moment it branches, has a timeout per step, or
needs someone to answer "where is order 8f21 right now?". Teams almost always
start with choreography because it needs no new component, and almost always add
an orchestrator later — so if you can already see the branch coming, start there.

Saga state must be durable. The orchestrator writes "step 2 done" to its database
before sending step 3, ideally together with the outgoing command via the
[Transactional Outbox](/pattern/outbox). Steps are grouped as *compensatable*
(can be undone), a single *pivot* step after which the saga must complete, and
*retriable* steps that are guaranteed to eventually succeed.

**There is no isolation, so buy some back where it matters.** A saga's intermediate
states are visible to everyone: stock is reserved but unpaid, an order exists but is
not confirmed. Where that is unacceptable, the countermeasures are all application
level. A *semantic lock* marks the record as in-flight (`status = PENDING`) and other
operations refuse to touch it. *Commutative updates* — add and subtract rather than
set — make the order of concurrent changes irrelevant. *Re-reading the value* before
the pivot step catches a change made underneath you. None of these is free, and
choosing "we accept the intermediate state" is a legitimate answer as long as it is
a decision rather than an oversight.

**Compensations fail too, and that path needs a design.** A refund can be declined,
a release can hit a service that is down, and a compensation that fails leaves the
system in exactly the state the saga existed to prevent. Two rules make this
survivable: compensations retry forever with backoff rather than giving up, and
anything that exhausts its retries goes to a
[dead letter queue](/pattern/dead-letter-queue) that a human actually reads. Design
compensations to be simpler than the forward step — releasing a reservation is a
delete, refunding is one API call — because a compensation with its own branches is
a saga inside a saga.

**Some steps cannot be compensated, so put them last.** An email cannot be unsent
and a physical shipment cannot be recalled. The *pivot* is the step after which the
saga must go forwards: everything before it is compensatable, everything after it is
retriable until it succeeds. Ordering the steps so the irreversible ones come after
the pivot is most of saga design, and getting it wrong is how you end up apologising
by email.

**You cannot operate what you cannot see.** Every message in a saga carries the same
correlation id, the orchestrator's state is queryable ("which sagas are in step 2
and older than ten minutes?"), and a stuck saga raises an alert rather than sitting
in a table. The failure mode in production is not a saga that compensates — that is
the design working — it is a saga that stops halfway and nobody notices for a week.

**Test the unhappy paths, because they are the pattern.** A saga's happy path is the
least interesting thing about it. The tests that matter inject a failure at each
step and assert the compensations ran, deliver every message twice and assert
nothing doubled, and kill the orchestrator mid-saga to prove it resumes from its
persisted state.

```ts
const placeOrderSaga = defineSaga("place-order", [
  { step: createOrder,   compensate: cancelOrder },
  { step: reserveStock,  compensate: releaseStock },
  { step: chargeCard,    compensate: refundCharge },   // pivot: after this, only retriable steps
  { step: confirmOrder },                              // retriable — no compensation needed
]);
```

## Advantages

- Consistency across services without distributed locks or two-phase commit
- Each service keeps its own database and its own local ACID transactions
- Failures are handled explicitly; the "unhappy path" is designed, not discovered
- Long-running processes (days of waiting for a shipment) fit naturally
- Orchestrated sagas give one place to read and monitor the whole flow

## Disadvantages

- No isolation: other requests see intermediate states (stock reserved, order pending)
- Compensations may themselves fail, so there must be a retry path and a human queue behind it
- Some actions cannot be compensated cleanly — an email cannot be unsent
- Every step must be idempotent because messages are redelivered [at least once](/concept/delivery-semantics)
- Significantly more design, testing and tooling than a single transaction

## When to use

- A business operation must update several services and roll back as a unit
- Each participant already owns its data and exposes commands or events
- Temporary inconsistency is acceptable and visible states like PENDING are meaningful
- The operation may take longer than a database transaction should be held open

## When not to use

- All the data lives in one database — use a normal [transaction](/concept/transaction)
- The process cannot tolerate any intermediate state being observed
- Steps have no sensible compensation and cannot be made retriable
- The team is not ready to operate durable messaging, idempotent handlers and dead-letter queues

## Real-world

Order placement, travel booking (flight + hotel + car) and money transfers between
ledgers are the classic sagas. In the [E-commerce](/architecture/e-commerce)
architecture checkout creates the order and an outbox event; inventory and payment
react, and a declined payment triggers reservation release and order cancellation.
The [Microservices](/architecture/microservices) architecture shows the same
choreography over RabbitMQ, with each service publishing the event the next step
listens for.
