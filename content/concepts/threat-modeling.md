---
id: threat-modeling
name: Threat Modeling
tagline: Ask what can go wrong with a design before it ships, then fix the worst of it
category: security
tags: [Security, Architecture, Process, Risk]
difficulty: 3
prerequisites: [authentication, rbac, distributed-system]
learningPath:
  - authentication
  - oauth
  - rbac
  - tls
  - threat-modeling
related:
  - { to: authentication, rel: REQUIRES }
  - { to: rbac, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: oauth, rel: RELATED_TO }
  - { to: secrets-management, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Threat modeling is a structured conversation about a design: what are we building, what can
go wrong, what will we do about it, and did we do a good enough job. The common technique
is to draw the data flows, mark the **trust boundaries** where data crosses from a less
trusted party to a more trusted one, and walk each boundary through a checklist such as
STRIDE — Spoofing, Tampering, Repudiation, Information disclosure, Denial of service,
Elevation of privilege. The deliverable is a short, prioritised list of mitigations with
owners, not a document.

## Why it matters

Design flaws are the class of vulnerability that scanners cannot find and code review
rarely catches: a missing authorization check on an object id, a token with no audience, a
webhook whose signature is never verified, an internal endpoint that assumes the network is
trusted. They are also the most expensive to fix late, because the fix changes the shape of
the system rather than a line of code. An hour of structured questions during design
routinely surfaces issues that would otherwise be found by a customer — or by someone else.

## Visual

```steps
title: The STRIDE-style loop, per feature or per boundary
1. Scope it | one feature, one service, one new integration — never "the whole platform"
2. Draw the data flow | actors, processes, data stores, and every flow between them
3. Mark trust boundaries | internet to edge, tenant to tenant, service to database, admin to user data
4. Enumerate assets | what an attacker actually wants — tokens, PII, money movement, compute
5. Spoofing | can identity be faked? weak auth, no mTLS, guessable ids, unverified webhooks
6. Tampering | can data or config be modified in transit or at rest? no integrity check, mass assignment
7. Repudiation | can an actor deny an action? missing or mutable audit log
8. Information disclosure | verbose errors, over-broad API responses, cross-tenant reads, logs with PII
9. Denial of service | unbounded query, no rate limit, amplification, expensive unauthenticated endpoint
10. Elevation of privilege | IDOR, missing object-level authorization, SSRF into the metadata service
11. Rate each finding | likelihood times impact, agreed in the room, not calculated to two decimals
12. Decide per finding | mitigate now, mitigate later with a ticket, transfer, or accept with a named owner
13. Write the tests | each accepted mitigation becomes an automated test or an alert
14. Revisit on change | new trust boundary, new data class or new integration reopens the model
```

## How it works

**Four questions, in order.** *What are we building?* — a diagram everyone agrees with.
*What can go wrong?* — the enumeration step, where a checklist beats imagination. *What are
we going to do about it?* — mitigate, transfer, accept or eliminate, each with an owner.
*Did we do a good job?* — review whether the diagram still matches reality and the
mitigations landed.

**Diagram at the right altitude.** A data-flow diagram with a handful of boxes is enough.
The value is in the arrows crossing boundaries: each crossing is where authentication,
authorization, validation, encryption and logging decisions must be explicit. If a diagram
has no boundaries marked, the exercise degenerates into brainstorming.

**Checklists to drive enumeration.** STRIDE maps threat categories to boundary types and is
the most teachable. Kill chains and attack trees work better for adversary-focused analysis
of a known-valuable asset. Abuse cases ("as an attacker I want…") suit product features.
Pick one and be consistent, so findings across teams are comparable.

**Mitigations are usually existing building blocks.** Spoofing is answered by
[Authentication](/concept/authentication), [OAuth](/concept/oauth) with correct audience
and scope validation, and mutual [TLS](/concept/tls) between services. Elevation of
privilege is answered by object-level checks on every request and a coherent
[RBAC](/concept/rbac) model — not by hiding a button. Information disclosure is answered by
field-level response shaping and tenant scoping in the query itself. Denial of service is
answered by [Rate Limiting](/concept/rate-limiting), timeouts and query bounds.
Repudiation is answered by an append-only audit log. Tampering is answered by signatures on
[webhooks](/concept/webhook) and integrity checks on stored artefacts.

**Timing.** Do it when the design is drawn but not built — early enough to change, late
enough to be concrete. Re-run it when a trust boundary moves: a new third party, a new
tenant model, a new admin surface, a move from private network to public endpoint.

## Deep Dive

**Where threat models fail.** They are done once, at the wrong altitude ("the whole
system"), by the security team alone, producing a 40-page document nobody reads and no
tickets. The countermeasure is scope small, invite the engineers who will implement, cap it
at an hour, and end with issues in the tracker. A finding without an owner and a date is a
finding that will be rediscovered.

**Risk rating is a decision aid, not a science.** Numeric scores imply precision that does
not exist; the useful part is the argument about likelihood and impact that produces the
ordering. Beware two biases: over-rating exotic attacks because they are interesting, and
under-rating boring ones — credential stuffing, misconfigured storage, a stale access token
— which is where real incidents concentrate.

**Trust boundaries in modern architectures.** Assuming the internal network is trusted is
the flaw that turns one compromised service into a full breach, which is the argument for
per-service identity and encryption in a [Service Mesh](/concept/service-mesh). In
[Multi-Tenant SaaS](/architecture/multi-tenant-saas) the tenant boundary is the highest-value
one: every query needs a tenant predicate that cannot be omitted, ideally enforced by the
data layer rather than remembered by each developer. In a
[Payment System](/architecture/payment-system) the boundary around money movement demands
idempotency, non-repudiation and dual control, not only confidentiality.

**Trade-offs.** Threat modeling costs senior engineering time and can slow a design review;
skipping it moves that cost to incident response at a much worse exchange rate. Modeling
everything is as bad as modeling nothing — triage by asset value: anything handling
authentication, money, personal data, or code execution is worth an hour; an internal
dashboard usually is not. Some mitigations meaningfully harm usability or latency, and
recording an accepted risk with a named owner is a legitimate outcome, far better than an
unrecorded one.

**Connection to other practices.** Threat modeling finds design flaws; code review, SAST
and dependency scanning find implementation flaws; penetration testing validates both
empirically. They are complements, and the model is what tells the penetration tester where
to look first. Each mitigation that becomes an automated test in
[CI/CD](/concept/ci-cd) is a finding that cannot silently regress.
