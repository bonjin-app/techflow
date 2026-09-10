---
id: rbac
name: RBAC
tagline: Grant permissions to roles and roles to users, instead of users to resources
category: security
tags: [Security, Authorization, Identity, Backend]
difficulty: 3
prerequisites: [backend, database, authentication]
learningPath:
  - backend
  - authentication
  - session
  - jwt
  - rbac
related:
  - { to: authentication, rel: RELATED_TO }
  - { to: jwt, rel: RELATED_TO }
  - { to: oauth, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
  - { to: multi-tenant-saas, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Role-Based Access Control puts a named role between users and permissions: permissions
are granted to roles (`support` may read orders), and users are assigned roles. Checks
then ask "does this user hold a role that grants `orders:refund`?" rather than listing
individuals per resource. It is the default authorization model because it collapses
*users × resources* into a handful of reviewable role definitions — and it starts to
strain when decisions depend on the specific record rather than the action.

## Why it matters

[Authentication](/concept/authentication) establishes *who*; authorization decides *what
they may do*, and it is where most real breaches happen — a support tool that exposes any
account, an API that trusts a client-side check, an admin flag nobody can audit.
Encoding permissions directly on users produces a table nobody can reason about and rules
that drift between services. Roles make access reviewable: you can answer "who can issue
refunds?" with one query, and revoke a whole capability by editing one role.

## Visual

```compare
Model            | Access is granted by                     | Fits                              | Cost
ACL per resource | list of users on each object             | file shares, small object sets     | explodes as users × objects
RBAC             | permissions → role → user                | most apps, admin consoles          | roles multiply for edge cases
ABAC             | policy over attributes (dept, amount)    | fine-grained, contextual rules     | hard to audit and test
ReBAC            | relationship graph (owner of, member of) | sharing, hierarchies, tenants      | needs a dedicated engine
```

```steps
title: One request through an RBAC check
Identify the caller [authentication] | session cookie or verified JWT gives a stable user id
Load role assignments | user 7 → {support} in tenant acme, from the DB or a cached claim
Expand roles to permissions | support → {orders:read, orders:refund, tickets:write}
Resolve the required permission | POST /orders/88/refund needs orders:refund
Check scope of the token [oauth] | the client app must also be allowed to ask for this action
Check the object, not just the verb | does order 88 belong to tenant acme?
Decide and log | allow → audit {who, action, object, decision}; deny → 403 with no detail leak
Enforce server-side | UI hiding a button is presentation, never the control
```

## How it works

**The four pieces.** *Permissions* are the atomic verbs on a resource type
(`invoice:create`, `user:disable`) — keep them fine-grained, because roles can always be
coarse. *Roles* are named bundles of permissions. *Assignments* bind a user to a role,
usually scoped to something: a tenant, a project, an organisation. *Checks* happen at the
point of enforcement in the backend.

**Where roles are stored.** Two tables and a join get you most of the way:
`roles(id, name)`, `role_permissions(role_id, permission)`, `user_roles(user_id, role_id,
scope_id)`. Cache the expanded permission set per user with a short
[TTL](/concept/ttl) so the hot path is a set lookup, and invalidate on assignment change.

**Roles in tokens versus roles from the store.** Embedding roles as [JWT](/concept/jwt)
claims removes a lookup per request, but the claim is a snapshot: a revoked role stays
effective until the token expires. Reading from the store (or a shared cache) is always
current at the cost of a dependency. A common split is to put coarse, slow-changing roles
in the token and re-read authoritative state for sensitive actions such as payouts or
deletions.

**Where the check lives.** Enforce inside the service that owns the data, close to the
query. An [API Gateway](/concept/api-gateway) can reject obviously unauthorized traffic
early, but it does not know whether order 88 belongs to this tenant. In
[Microservices](/architecture/microservices), pass a scoped token downstream rather than
re-deriving permissions from a user id in each service.

**Role hierarchy.** Letting `admin` inherit `editor` keeps definitions small, but makes
the effective permission set non-obvious. Keep hierarchies shallow and provide a tool
that prints the expanded set for a role.

## Deep Dive

**Object-level checks are the real gap.** RBAC answers "may this user refund orders?",
not "may this user refund *this* order?". Missing the second question is one of the most
common serious API flaws: an endpoint that authorizes the verb and then fetches the
record by an id from the URL. Always scope the query itself —
`WHERE id = $1 AND tenant_id = $2` — so an unauthorized id returns nothing instead of
relying on a separate check that someone will forget.

**Role explosion.** Every exception ("support, but only for EU customers, and no
refunds over $500") tempts a new role. Left unchecked you get hundreds of near-duplicate
roles that nobody dares delete. Mitigations: keep permissions fine-grained and roles few;
scope assignments (role *within* a tenant or project) instead of minting
`support-eu-acme`; and when rules genuinely depend on request attributes, add a small
attribute-based layer on top rather than encoding data into role names.

**Multi-tenancy.** In a shared-database SaaS, every assignment and every check is
tenant-scoped, and a user may hold different roles in different tenants. Make the tenant
part of the identity that reaches the query layer, and consider database-level defence
such as row-level security in [PostgreSQL](/technology/postgresql) so a missing
application check cannot leak across tenants.

**Least privilege and separation of duties.** Default to no access and add explicitly.
Split powerful capabilities so one role cannot both request and approve a sensitive
operation, and prefer time-bounded elevation ("break-glass" access that expires and is
logged) over standing admin rights. Service accounts deserve the same treatment: they
are usually the most over-permissioned identities in a system.

**Auditing.** Log every decision with the actor, action, object and outcome, and keep
those logs outside the reach of the roles they describe. Periodic access review — who
holds which role, and did they use it — catches privilege accumulated during incidents
and never removed.

**Testing.** For each endpoint, assert that an anonymous caller, a wrong-tenant user and
a lower-privileged role all receive 403 — not just that the happy path works.
Deny-by-default routing, where a middleware requires an explicit permission declaration
per route, turns a forgotten check into a startup error instead of a silent hole.
