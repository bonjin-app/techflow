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
meta: { lastReviewed: 2026-09-09, confidence: high }
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

Saga state must be durable. The orchestrator writes "step 2 done" to its database
before sending step 3, ideally together with the outgoing command via the
[Transactional Outbox](/pattern/outbox). Steps are grouped as *compensatable*
(can be undone), a single *pivot* step after which the saga must complete, and
*retriable* steps that are guaranteed to eventually succeed.

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
- Compensations may themselves fail and need retries, alerts or manual repair
- Some actions cannot be compensated cleanly — an email cannot be unsent
- Every step must be idempotent because messages are redelivered
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
