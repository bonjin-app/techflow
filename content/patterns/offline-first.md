---
id: offline-first
name: Offline First
tagline: The local store is the source of truth for the UI; the network syncs it later
category: application
tags: [Frontend, Mobile, Sync, Distributed System]
difficulty: 4
prerequisites: [database, eventual-consistency]
learningPath:
  - database
  - sqlite
  - eventual-consistency
  - offline-first
  - idempotency
related:
  - { to: sqlite, rel: USED_WITH }
  - { to: idempotency, rel: REQUIRES }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: race-condition, rel: RELATED_TO }
  - { to: optimistic-ui, rel: USED_WITH }
  - { to: retry, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: event-sourcing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## Problem

An application that reads and writes over the network is unusable exactly when the network
is unreliable — in a lift, on a train, in a warehouse, on hotel wifi that resolves DNS but
drops packets. Even with good connectivity, every interaction costs a round trip, so the
interface spends its life showing spinners.

The naive fix, "cache the last response and show it when offline", produces a read-only
museum: the user can look but not act, and the moment they can act, their change is lost if
the request fails. What people actually need is to keep working — create, edit, delete —
and have the results appear on the server whenever the network returns, without losing
anything and without silently overwriting someone else's work.

## Solution

Invert the dependency. A **local store on the device is the source of truth for the UI**.
Every read comes from it and every write goes to it first, synchronously. A separate
**sync engine** owns the relationship with the server: it drains a durable queue of local
changes upward, pulls remote changes downward, and resolves conflicts by a rule you chose
deliberately. The network becomes a background process, not a precondition for using the
app.

```sequence
title: Write offline, sync on reconnect
participants: UI [react], Local store [sqlite], Sync queue, Server [backend], Remote DB [postgresql]
UI -> Local store: insert note, id n-9f3, updatedAt 10:02, dirty
Local store --> UI: committed, render immediately
Local store -> Sync queue: enqueue mutation n-9f3 with client id
Sync queue -> Server: POST /notes, offline, send fails
Sync queue -> Local store: keep the mutation, schedule a retry with backoff
UI -> Local store: edit note n-9f3, updatedAt 10:05, still dirty
Sync queue -> Server: connectivity returns, POST /notes with client id n-9f3
Server -> Remote DB: upsert by client id, idempotent
Remote DB --> Server: stored, server version v7
Server --> Sync queue: 200, v7, serverUpdatedAt 10:06
Sync queue -> Local store: clear dirty flag, record v7
Sync queue -> Server: GET /notes?since=cursor
Server --> Sync queue: changes from other devices
Sync queue -> Local store: merge, flag one conflict for resolution
Local store --> UI: reactive query re-renders with merged state
```

## How it works

```steps
title: The four moving parts
Local store [sqlite] | an embedded database the UI queries directly, not a cache
Change tracking | every local row carries a dirty flag, a client-generated id and a version
Outbound queue [retry] | durable, ordered per entity, drained by a sync worker with backoff
Inbound sync | a cursor or "changed since" query that pulls remote changes incrementally
```

**Client-generated ids** are non-negotiable. If the server assigns the id, an offline
creation has no identity, cannot be referenced by other offline records, and cannot be
recognised as a duplicate when a retry succeeds after a response was lost. A UUID minted on
the device makes the create operation naturally
[idempotent](/concept/idempotency): the server upserts by that id.

**The queue stores intent, not state.** Queue mutations ("set title to X", "add tag Y"),
not whole-record snapshots. Snapshots make every edit an all-fields write, which turns any
concurrent change into a conflict. Intent also lets the queue collapse redundant work —
three edits to the same field before sync become one — and lets an edit followed by a
delete cancel out entirely.

**Conflict resolution has to be chosen, not defaulted.** Two realistic options:

- **Last write wins**, decided by a version or a server timestamp. Trivial to implement,
  and it silently discards one side's work. Acceptable for single-user-per-record data
  (personal notes, drafts, device settings) and never acceptable for shared records.
- **Merge**, either field-level (each field takes the newest writer, so two people editing
  different fields both keep their change) or operation-based, where the data type itself
  is designed so concurrent operations commute — the counters, sets and text types behind
  collaborative editors.

Whatever you pick, keep a third escape hatch: surface the conflict to the user with both
versions. For anything the user would be upset to lose, a prompt beats a clever heuristic.

## Advantages

- The app is usable with no network, and instant with a bad one — reads never wait
- Perceived latency drops to local write speed, typically a millisecond or two
- Traffic falls sharply: batched deltas instead of a request per interaction
- Server outages degrade to "sync is behind" rather than "the product is down"
- One code path for online and offline, instead of a special disconnected mode

## Disadvantages

- You have built a distributed system inside a phone, with all that implies
- Conflict resolution is genuinely hard and cannot be fully hidden from users
- Migrations must be applied to every device's local schema, on versions you do not control
- Local storage is a privacy and security surface — encryption and remote wipe become your problem
- Debugging is harder: bugs depend on a device's sync history, not on a reproducible server state
- Server APIs must change too — cursors, versions, upsert-by-client-id, tombstones for deletes

## When to use

- Mobile or field applications used where connectivity is intermittent by nature
- Note-taking, task, inventory, inspection and point-of-sale apps — anything where losing an entry is unacceptable
- Interaction-heavy interfaces where a round trip per keystroke or toggle is the latency budget
- Mostly single-writer data, where conflicts are rare and last-write-wins is defensible
- Products where "works on a plane" is a feature people choose you for

## When not to use

- Data that must be authoritative at read time: balances, inventory at checkout, seat availability
- Multi-writer shared documents, unless you commit to a real merge strategy rather than a timestamp
- Records subject to server-side authorisation or validation that the client cannot evaluate
- Datasets too large to fit or too sensitive to store on a device
- Simple, read-mostly apps on reliable networks, where an HTTP cache and a spinner are enough

## Real-world

Every mail client is offline-first: messages are in a local database, composing works with
no signal, and sending is a queue. Mobile task and note apps use an embedded
[SQLite](/technology/sqlite) store with a sync worker; collaborative editors take the
merge-based branch, using data types whose operations commute so two people can type in the
same paragraph. Field-service and retail applications keep the pattern for a blunter
reason: the warehouse has no coverage, and the inspection still has to be recorded.

The common shape across all of them is the same one this pattern describes — local store,
durable intent queue, idempotent upserts keyed by client id, incremental pull, an explicit
conflict rule — combined with [Optimistic UI](/pattern/optimistic-ui) so the interface
never waits for the server it may not be able to reach.
