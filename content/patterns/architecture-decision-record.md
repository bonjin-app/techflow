---
id: architecture-decision-record
name: Architecture Decision Records
tagline: One short file per decision, recording the options and the reason, at the time you decided
category: architecture
tags: [Architecture, Documentation, Process, Decision]
difficulty: 1
prerequisites: [programming-fundamentals, git]
learningPath:
  - git
  - architecture-decision-record
  - layered-architecture
  - modular-monolith
  - strangler-fig
related:
  - { to: git, rel: USED_WITH }
  - { to: domain-driven-design, rel: USED_WITH }
  - { to: strangler-fig, rel: RELATED_TO }
  - { to: api-versioning, rel: RELATED_TO }
  - { to: incident-response, rel: RELATED_TO }
  - { to: modular-monolith, rel: RELATED_TO }
  - { to: microservices, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

Six months after a decision, nobody remembers why. The code says the system uses eventual
consistency between two services, and the only people who know whether that was a
considered trade-off or an accident have left. So the team re-litigates it in a meeting with
worse information than the original decision had, or — more often — treats it as untouchable
because changing it might break something nobody understands.

The usual alternatives fail in familiar ways. A wiki architecture page describes the *current*
state, not the reasoning, and rots within a quarter. A design document is written before the
work, is 40 pages long, and is never read again. A decision made in a chat thread is gone
the moment the thread scrolls. Meanwhile new joiners spend their first months asking "why is
it like this?" and getting shrugs — which is how a system acquires a reputation for being
badly designed when it was designed carefully for constraints that no longer exist.

## Solution

Record each significant decision as a short, immutable, numbered file in the repository,
written when the decision is made. Roughly one page: the context and forces, the options
considered, the choice, and the consequences you accept. When a decision changes, you do not
edit the old record — you write a new one that supersedes it, so the history of the thinking
survives alongside the history of the code.

```steps
title: One decision, from question to record
A decision comes up | "how do the order and payment services stay consistent?"
Write the context first | the forces: latency budget, team boundaries, failure requirements
List the options honestly | two-phase commit, saga with compensation, one shared database
State what each costs | not "we considered X" but why X lost, in one line
Decide, and name the decision | the record's title is the decision, not the topic
Write the consequences | what becomes harder, what you now owe (a reconciliation job)
Open a pull request | the record is reviewed like code, by the people affected by it
Merge it with the change | number it, mark it accepted, and it stops being editable
Someone questions it later | they read the record, and argue with the reasoning, not from zero
The constraint changes | write a new record that supersedes it; the old one stays as history
```

## How it works

**Markdown in the repository, next to the code.** Conventionally `docs/adr/0007-use-saga-for-order-payment.md`.
In the repository rather than a wiki, because it is then versioned, reviewed, searchable with
the same tools, and impossible to lose in a documentation migration.

**A fixed, small structure.** Title (the decision, as a statement), status, context, options
considered, decision, consequences. Five headings, one page. The brevity is the feature: a
template that invites ten pages produces documents nobody writes and nobody reads.

**Immutable and numbered.** Records are never rewritten. Status moves from *proposed* to
*accepted*, and later to *superseded by 0021*. This is what distinguishes an ADR from a wiki
page — you are keeping a decision log, not maintaining a description of the present.

**Context before decision.** The most valuable section is the one people skip: the forces
that applied at the time. Team size, deadline, existing skills, the SLA you were given, the
volume you expected. A future reader's real question is not "what did you choose" — the code
answers that — but "would you choose it again now?", and only the context can answer that.

**Options with their reasons for losing.** A record listing three options where two are
dismissed in one line each is far more useful than a long argument for the winner, because
it tells the next person which paths have already been explored and why.

**Reviewed like code.** The pull request is where the decision is actually made, which pulls
the discussion into a durable place, gives quieter people a way to object, and makes the set
of people who should have been consulted visible.

**Write it when you decide, not after.** A record written retrospectively is a
rationalisation; the constraints have already faded. The habit that makes this work is
writing the record as part of the change that implements it.

## Advantages

- The reasoning survives the people, which is the only real defence against tribal knowledge
- New joiners can answer "why is it like this?" without interrupting anyone
- Reviewing a decision starts from its context instead of from scratch
- Writing the options down improves the decision itself — several die during drafting
- Superseded records show how the system's constraints evolved, which is genuinely rare
- Almost free: one page, in the repository, reviewed with the code
- Makes disagreement explicit and time-boxed rather than recurring in every design meeting

## Disadvantages

- Discipline decays quickly; a directory of three records from two years ago is worse than none
- Easy to over-apply — a record for every library choice buries the five that matter
- Tempting to write them retrospectively, which produces justification rather than reasoning
- A record can be mistaken for permission: "we have an ADR" is not the same as "this is right"
- Requires judgement about what is significant, and teams calibrate that differently
- Does not describe the current architecture — you still need a diagram or an overview
- Little value in a small, stable team that already shares the whole history

## When to use

- Decisions that are expensive to reverse: storage engine, consistency model, service boundaries
- Anything where a reasonable engineer would later ask "why on earth is it like this?"
- Choices made under a constraint that will not be obvious later (a deadline, a headcount, a contract)
- Deliberately accepting a trade-off — eventual consistency, a known limit, a temporary shortcut
- Long-lived systems, and teams whose membership will turn over
- Deprecating or migrating something, where the plan matters as much as the choice — see [Strangler Fig](/pattern/strangler-fig)

## When not to use

- Don't write one for reversible, local choices — a library, a naming convention, a file layout
- For decisions with no alternatives considered; there is nothing to record
- As a substitute for an architecture overview or a system diagram
- In a two-person project that will not outlive the two people
- When the organisation will not read them — an unread process is a tax, so fix the culture first

## Real-world

The decisions worth recording are the ones the rest of this site frames as trade-offs. Why
this system uses [eventual consistency](/concept/eventual-consistency) between two services
and what reconciliation job pays for it. Why a
[modular monolith](/pattern/modular-monolith) was chosen over
[microservices](/architecture/microservices) at 12 engineers, and the size at which that would be
revisited. Why [Kafka](/technology/kafka) rather than
[RabbitMQ](/technology/rabbitmq) when the requirement was replay. Why a cache is
[write-through](/pattern/write-through) here and [cache-aside](/pattern/cache-aside) there.
Why the refund flow tolerates a duplicate and relies on
[idempotency](/concept/idempotency) instead of a distributed transaction.

Two habits make the practice survive. First, keep the records short enough that writing one
is not a decision in itself — a page, in the same pull request as the change. Second, link to
them: from the module's README, from the code comment where the consequence bites, from the
[incident review](/concept/incident-response) that revisits the trade-off. A decision log
nobody links to is a directory nobody opens, and the point was never the documents — it was
that the next person to touch this can see what you were solving for.
