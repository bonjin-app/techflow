---
id: optimistic-ui
name: Optimistic UI
tagline: Apply the change locally, reconcile with the server, and roll back visibly on failure
category: application
tags: [Frontend, UX, Performance, State]
difficulty: 3
prerequisites: [http, rest]
learningPath:
  - http
  - rest
  - state-management
  - optimistic-ui
  - idempotency
related:
  - { to: idempotency, rel: REQUIRES }
  - { to: state-management, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: chat-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A user taps "like", types a message, checks a checkbox, reorders a list. The change is
theirs, it is small, and it will almost certainly succeed — but the interface waits for a
round trip before showing it. On a good connection that is 100 ms of dead time; on a mobile
network it is half a second or more, per interaction.

Spinners do not fix this, they document it. Worse, a disabled control during the wait makes
rapid interaction impossible: the user cannot check the next box until the previous one
returns, so a fifteen-item checklist becomes a fifteen-round-trip chore. The interface feels
slow not because the server is slow but because the UI has made the network visible.

## Solution

Predict the result and render it immediately. When the user acts, apply the expected change
to local state and paint it, send the request in the background, then reconcile: on success
replace the predicted state with the server's authoritative version; on failure revert the
change and tell the user clearly what happened. The interface is fast because it stopped
asking permission for outcomes it can predict.

```sequence
title: One optimistic action, and one that fails
participants: User, UI [react], Local state, API [rest], DB [postgresql]
User -> UI: tap Like
UI -> Local state: apply predicted change, liked true, count 41, pending
Local state --> UI: repaint immediately, 0 ms
UI -> API: POST /posts/7/like with request id r-4c1
API -> DB: insert like, unique on user and post
DB --> API: ok
API --> UI: 200, liked true, count 41
UI -> Local state: confirm, clear pending, adopt the server value
User -> UI: tap Delete on a comment
UI -> Local state: remove the comment optimistically
Local state --> UI: row disappears at once
UI -> API: DELETE /comments/88
API --> UI: 403 not the author
UI -> Local state: revert, restore the comment at its original position
Local state --> UI: row reappears with an inline error and a retry action
```

## How it works

```steps
title: The lifecycle of an optimistic mutation
Capture intent | the action plus everything needed to undo it
Predict [state-management] | compute the next state locally and mark the entity pending
Render | paint immediately, with a subtle pending affordance rather than a blocker
Send [idempotency] | one request carrying a client-generated request id
Reconcile | on 2xx adopt the server's response as truth, not just the local guess
Roll back | on 4xx or 5xx restore the snapshot, explain, and offer retry
```

**Keep an undo snapshot, not a reversal function.** Store the previous value of what you
touched and restore it verbatim on failure. Trying to invert an operation ("decrement the
counter again") breaks as soon as anything else changed the same state in between.

**Adopt the server's answer even when it agrees.** The server may return a canonical id, a
normalised value, a recomputed count or a server timestamp. Confirming means replacing the
prediction with the response, not merely clearing a flag — otherwise the client slowly
drifts from the server in ways that only show up after a refresh.

**Every optimistic request needs a stable request id.** Retries, double taps and lost
responses all cause duplicate delivery, so the endpoint must be
[idempotent](/concept/idempotency): same request id, same effect, same response. Without
that, "post the message" becomes "post the message twice" on a flaky connection.

**Order and concurrency need thought.** Two optimistic edits to the same entity can return
out of order and leave the later response overwriting the newer state — a plain
[race condition](/concept/race-condition). The usual fixes are serialising mutations per
entity, discarding responses older than the latest issued request, or versioning the entity
and rejecting stale writes.

**Failure must be visible and located.** A toast that says "Something went wrong" while the
list already scrolled away is worse than a spinner, because the user believes their change
was saved. Revert the item in place, show the error next to it, and keep the user's input
so a retry is one tap rather than a re-entry.

## Advantages

- Interactions feel instant; perceived latency drops to render time
- Rapid sequential actions work naturally — no disabled controls between round trips
- Fewer spinners and layout shifts, so the interface reads as calmer and more solid
- Degrades usefully on slow networks, where the gain is largest
- Pairs directly with [Offline First](/pattern/offline-first): the same mutation queue serves both

## Disadvantages

- Two sources of truth exist briefly, and reconciliation logic is easy to get subtly wrong
- Rollback is a second UI state to design, build and test — usually the least-tested path
- A rollback that the user does not notice is a data-loss bug from their perspective
- Duplicate delivery becomes your problem, so the API contract must change too
- Concurrent mutations on one entity introduce ordering bugs that are hard to reproduce
- Client-side prediction can diverge from server rules — the client re-implements logic it does not own

## When to use

- High-frequency, low-stakes actions: likes, reactions, checkboxes, tags, drag-to-reorder
- Actions whose outcome the client can predict with near certainty from local state
- Text entry in chat and comment interfaces, where waiting per message is intolerable
- Anything already backed by a local store and a sync queue
- Operations that are cheaply and completely reversible in the UI

## When not to use

- **Money and irreversible effects.** Payments, transfers, refunds, order placement, ticket
  purchase. Never show "paid" before the server says paid — a rollback there is not a UI
  glitch, it is a false statement about someone's money.
- Actions with side effects the user cannot take back: sending an email, publishing, deleting
  an account, submitting an exam. Show the real state, and use a progress indicator.
- Outcomes the client cannot predict: server-side allocation, seat or inventory reservation,
  quota checks, anything decided by rules or data the client does not have.
- Operations that frequently fail validation or authorisation — constant rollbacks are more
  jarring than a short wait.
- Long-running work. Optimism covers a round trip, not a job; use a real progress or job
  status model instead.

## Real-world

Chat interfaces are the canonical example: the message appears immediately in a pending
state, gets a "sent" marker when the server acknowledges, and turns into a visible failure
with a retry action when it does not. Social feeds apply the same treatment to likes,
follows and reactions, where the count is cheap to predict and harmless to correct.
Task and issue trackers use it for status changes, assignment and reordering.

The consistent boundary in all of them is stakes. The same product that optimistically
renders a like will make you wait — with a real spinner and a real confirmation — for the
checkout, because the [E-commerce](/architecture/e-commerce) payment path is exactly where
a predicted outcome is not acceptable. Optimism is a UX technique for the interactions
where being wrong costs a repaint.
