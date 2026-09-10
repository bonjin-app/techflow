---
id: schema-migration
name: Schema Migration
tagline: Change a live database schema in versioned steps without breaking running code
category: data
tags: [Database, Deployment, Operations, Data]
difficulty: 3
prerequisites: [database, sql, ci-cd]
learningPath:
  - database
  - sql
  - transaction
  - schema-migration
  - blue-green-deployment
related:
  - { to: postgresql, rel: USED_WITH }
  - { to: mysql, rel: USED_WITH }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: transaction, rel: REQUIRES }
  - { to: indexing, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A schema migration is a versioned, ordered change to a database's structure — a new
column, an index, a renamed table, a backfilled value — applied by a tool that records
which migrations have run. On a live system the schema and the application are deployed
separately, so every migration must be **backward compatible**: the old code must keep
working against the new schema, and often the new code must work against the old one too.
The standard way to get there is **expand → migrate → contract**, spread over at least two
deploys.

## Why it matters

Deployment strategies that promise zero downtime —
[Blue-Green Deployment](/pattern/blue-green-deployment) and
[Canary Release](/pattern/canary-release) — all share one property: for a window of time,
two versions of the application run against **one** database. A migration that drops a
column the old version still selects breaks the half of the fleet you have not replaced
yet, and it breaks the rollback path, which is the last thing you want during an incident.
Migrations are also the only part of a deploy that is not trivially reversible: code rolls
back in seconds, deleted data does not come back.

## Visual

```steps
title: Expand, migrate, contract across two deploys
1. Expand (migration A) | add the new nullable column full_name, no default rewrite, no constraint
2. Deploy 1 | new code writes BOTH first_name/last_name and full_name, reads the old fields
3. Backfill in batches | UPDATE ... WHERE id BETWEEN, few thousand rows per batch, pause on replica lag
4. Verify | count rows where full_name IS NULL, compare against the old fields
5. Deploy 2 | new code reads full_name, still writing both so a rollback to Deploy 1 is safe
6. Add the constraint | NOT NULL or CHECK once the data is known clean, validated concurrently
7. Contract (migration B) | stop writing the old columns, then drop them a deploy later
8. Rollback rule | every step is safe to stop at, and only the contract step is irreversible
```

```compare
Change              | Safe on a live table            | Why
Add nullable column | yes                             | metadata-only in modern engines
Add column DEFAULT  | usually, engine dependent       | older versions rewrite the whole table
Add index           | with CONCURRENTLY / ONLINE      | plain CREATE INDEX blocks writes
Rename column       | no, do it as add plus backfill  | old code selects a name that vanished
Change type         | no, add a new column instead    | rewrite plus a full-table lock
Drop column         | only after code stops using it  | breaks rollback to the previous version
```

## How it works

**A migration tool, not hand-run SQL.** Migrations live in the repository as ordered files
with a checksum, and a `schema_migrations` table records what has been applied. That gives
every environment the same schema by construction and makes the change reviewable in the
same pull request as the code that needs it.

**Forward-only by default.** Down-migrations are attractive on paper and misleading in
practice: dropping a column that a backfill has populated loses data, so the real recovery
path is a new forward migration. Keep down-migrations for local development.

**Where migrations run.** Three common placements, in increasing safety: as an application
startup step (simple, but N replicas race and a failed migration crash-loops), as a
[CI/CD](/concept/ci-cd) job before the deploy (the usual choice — needs a lock so parallel
pipelines cannot collide), or as a deliberate manual step for large or risky changes.
Either way, exactly one process must hold an advisory lock while applying.

**Transactional DDL matters.** [PostgreSQL](/technology/postgresql) runs DDL inside a
transaction, so a failed multi-statement migration rolls back cleanly.
[MySQL](/technology/mysql) does not for most DDL, so a migration that fails halfway leaves
a partially changed schema — which is why each MySQL migration should contain one
statement.

**Backfills are jobs, not migrations.** A single `UPDATE` over 200 million rows holds locks
and bloats the write-ahead log. Batch it, commit per batch, make it resumable and
idempotent, and throttle on replication lag.

## Deep Dive

**Locks are the failure mode.** Most damaging incidents are not "the migration failed" but
"the migration took a lock and everything queued behind it". `ALTER TABLE` needs a brief
exclusive lock even for metadata-only changes; if a long-running query or an idle
transaction holds a conflicting lock, the `ALTER` waits — and every subsequent query waits
behind it, because lock queues are ordered. Always set a short `lock_timeout` and retry:
failing in 2 seconds is far better than stalling the table for 5 minutes. Watch for
`autovacuum` and long analytics queries as the usual blockers.

**Constraints and indexes.** Adding a foreign key or `NOT NULL` validates every existing
row while holding a lock. Both engines offer a two-phase path: add the constraint as
not-valid, then validate it in the background. Index creation should always use the online
or concurrent variant, which is slower, cannot run inside a transaction, and can leave an
invalid index behind if it fails — drop and retry. See [Indexing](/concept/indexing).

**Very large tables.** Beyond a certain size, in-place `ALTER` is not viable and teams use
a shadow-table copy: create the new shape, copy in chunks, keep it in sync with triggers or
the replication log, then swap names atomically. Partitioned tables can often be migrated
partition by partition instead — see [Partitioning](/concept/partitioning).

**Trade-offs.** Expand/migrate/contract costs three deploys and a window where the
application writes data twice; the alternative is a maintenance window, which is honest and
sometimes correct for a small internal service. Dual-writing risks divergence if one write
path is missed, so the backfill should be re-runnable as a reconciliation pass. Very
aggressive compatibility (supporting N-2 versions) makes code messy — bound it by deleting
the compatibility branches in the contract step and tracking them as work, not as
permanent complexity.

**Services and shared schemas.** Under
[Database per Service](/pattern/database-per-service) a migration affects one team and one
codebase. A shared database inverts that: every consumer, including analytics jobs and
read replicas, is part of the compatibility contract, and views are a useful way to keep an
old shape alive while the underlying tables change.

**What to check before merging.** Does the old version still run against this schema? Does
the new version run against the old schema? Is the lock time bounded? Is the backfill
batched and resumable? Is the destructive step in a separate, later migration?
