---
id: sqlite
name: SQLite
tagline: Embedded SQL database that lives in one file inside your own process
category: database
tags: [Database, SQL, Embedded, Local-first, Testing]
difficulty: 2
usedFor: [sql, transaction, acid]
prerequisites: [programming-fundamentals, database, sql]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - sqlite
  - transaction
  - postgresql
related:
  - { to: postgresql, rel: ALTERNATIVE_TO }
  - { to: mysql, rel: ALTERNATIVE_TO }
  - { to: acid, rel: IMPLEMENTS }
  - { to: transaction, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: s3, rel: USED_WITH }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "SQLite 3.x", confidence: high }
---

## TL;DR

SQLite is a SQL database that is a *library*, not a server. Your process links it, opens a
file and issues SQL — no port, no daemon, no connection string, no user accounts. The whole
database, indexes included, is one file you can copy. It gives you real transactions and
[ACID](/concept/acid) guarantees, and its structural limit is writes: one writer at a time.
That is why it is the most widely deployed database in the world, and why it is the wrong
choice for a write-heavy service on many machines.

## Practical

Opening a database is opening a file, so the interesting part is the handful of settings
that separate a toy setup from a production one:

```sql
PRAGMA journal_mode = WAL;      -- readers don't block the writer (persistent)
PRAGMA synchronous  = NORMAL;   -- durable enough with WAL; FULL is safest, slower
PRAGMA busy_timeout = 5000;     -- wait 5s for the write lock instead of failing
PRAGMA foreign_keys = ON;       -- off by default, for historical compatibility

CREATE TABLE orders (
  id         INTEGER PRIMARY KEY,          -- rowid alias: the clustered key
  user_id    INTEGER NOT NULL REFERENCES users(id),
  status     TEXT    NOT NULL CHECK (status IN ('pending','paid','void')),
  amount_cents INTEGER NOT NULL,           -- integers, not floats, for money
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
) STRICT;                                  -- enforce declared types

CREATE INDEX orders_user_created ON orders(user_id, created_at DESC);

BEGIN IMMEDIATE;                           -- take the write lock up front
INSERT INTO orders (user_id, status, amount_cents) VALUES (7, 'pending', 4990);
COMMIT;

VACUUM INTO '/backups/app-2026-09-10.db';  -- consistent backup of a live database
```

Where it fits naturally:

- **Local and desktop applications** — editors, mail clients, mobile apps: durable storage
  with no install step.
- **Tests and development** — a real SQL engine per test, created and discarded in
  milliseconds (though not your production dialect).
- **Read-heavy small services** — a single-node site or internal tool where the data fits on
  one disk. See [Simple Web App](/architecture/simple-web-app).
- **Data files and caches** — an analytical extract or shipped read-only dataset: a
  queryable file instead of a bespoke format.
- **Edge and embedded** — routers, cars, browsers via WebAssembly.

## Deep Dive

**No server means no network, no auth, no pooling.** A query is a function call in your own
process, so latency is microseconds and there is nothing to secure at the network layer.
File permissions are the access control, and [Connection Pooling](/concept/connection-pooling)
is meaningless — the "connection" is a file handle. Machines cannot share a database: a
network filesystem breaks the locking assumptions and is unsupported.

**One writer, many readers.** In the default rollback-journal mode a write blocks readers.
With write-ahead logging (WAL) readers see a consistent snapshot while a writer appends, so
reads and one write proceed concurrently — but still only *one* write. A second writer gets
`SQLITE_BUSY`, which is why `busy_timeout` and short transactions matter, and why a
long-running write transaction is the classic way to make a SQLite application feel broken.

**Transactions are genuinely ACID.** Commits are atomic and durable given a working
filesystem, and the implementation is famously well tested. `synchronous = FULL` fsyncs on
every commit; `NORMAL` with WAL risks losing the last transactions on a power failure but
not corruption. See [Transaction](/concept/transaction).

**Typing is unusual.** Historically SQLite has dynamic *type affinity*: a column declared
`INTEGER` will happily store `'banana'`. `STRICT` tables, added in 3.37, enforce declared
types and are the sensible default for new schemas. There is no native `DATE`, `BOOLEAN` or
`DECIMAL` type — use text ISO-8601 timestamps and integers for money.

**Schema changes are limited.** `ALTER TABLE` adds, renames and drops columns, but cannot
change a column's type or add a constraint. The documented workaround — create a new table,
copy, drop, rename — is what migration tools do for you, which makes migrations on large
tables a rewrite. See [Schema Migration](/concept/schema-migration).

**It is faster than people expect, for the right shape.** Indexes are B-trees, the planner is
competent, and there is no round trip, so single-row lookups beat a networked database
easily. Full-text search and JSON functions are built in. What it lacks is intra-query
parallelism, rich statistics and a server database's extension ecosystem.

**Backups and replication are external concerns.** `VACUUM INTO` or the backup API gives a
consistent copy; copying the file under an active writer does not. Streaming the WAL to
object storage such as [S3](/technology/s3) is an established third-party pattern, and
several projects (libSQL/Turso, Cloudflare D1, rqlite) build networked or replicated services
on the SQLite file format — a different operational commitment from "it is just a file".

## Why

Applications that need to save structured data usually start by inventing a format: a JSON
file, a CSV, a directory of blobs. It works until two things happen at once, or the process
dies mid-write.

```steps
title: Before — a hand-rolled file format
Serialise the whole document to JSON and write it over the old file
A crash mid-write leaves a truncated file and no way back
Two processes write; the last one wins and silently discards the other's changes
"Find all orders for user 7 last month" means loading everything and filtering in code
Adding a field means writing migration code for every old file version
```

SQLite replaces that with a database engine linked into the process: SQL queries, indexes,
constraints and atomic commits, still with the deployment simplicity of a single file.

```steps
title: After — one file, one embedded SQL engine
Open a file; there is no server to install, configure or monitor [sqlite]
Every write is a transaction — a crash leaves the last committed state [transaction]
Indexes answer selective queries without loading the whole dataset [indexing]
Constraints and STRICT typing reject bad data at the boundary
Migrations are versioned SQL, and a backup is one consistent file copy [schema-migration]
```

The framing its authors use is precise: SQLite does not compete with client/server databases,
it competes with `fopen()`.

## Advantages

- Zero operational surface: no server, no ports, no users, no client/server version skew
- Microsecond queries — no network hop, no serialisation, no connection setup
- The whole database is one portable file you can copy, ship or attach
- Real transactions, indexes, window functions, CTEs, full-text search and JSON
- Exceptionally well tested, stable file format, public domain, available everywhere
- Ideal for local-first and offline applications, including in-browser via WebAssembly

## Trade-offs

- One writer at a time; concurrent write throughput is the hard ceiling
- Single machine only — no built-in replication, failover or network access
- Long write transactions block other writers, producing `SQLITE_BUSY` under load
- Legacy defaults surprise: foreign keys off, dynamic typing, no WAL
- Limited `ALTER TABLE`, so some migrations rewrite the whole table
- Dialect differences make it an imperfect stand-in for [PostgreSQL](/technology/postgresql) in tests
- Backup, monitoring and replication must be assembled from external tools

## When to use

- Local, mobile, desktop, embedded and browser apps needing durable structured data
- Test suites that want a real SQL engine with no shared state between tests
- Single-node services with modest, bursty writes and mostly reads
- Read-only or read-mostly data files that should be queryable rather than parsed
- Anywhere the alternative would be a hand-written file format

## When not to use

- Don't use it when several application servers must write to the same data — use [PostgreSQL](/technology/postgresql) or [MySQL](/technology/mysql)
- Don't use it for write-heavy or high-concurrency workloads; the single-writer lock is the bottleneck
- Don't put it on NFS or a shared network volume — the locking guarantees do not hold
- Don't use it when replication, failover or point-in-time recovery must be built in
- Don't rely on it as a faithful stand-in for your production database's SQL dialect in tests

## Real-world

SQLite's biggest deployments are invisible: browsers, mobile operating systems and countless
desktop applications use it for mail, messages, settings and caches. On the server it turns
up in two shapes. First, as the store for a [Simple Web App](/architecture/simple-web-app)
or internal tool — one process, one disk, WAL enabled, backups by file copy, far less work
than operating a database server for a few thousand rows. Second, as a *format*: analytics
extracts and geospatial or model-metadata datasets shipped as `.db` files that consumers
query directly instead of parsing. The failure mode worth remembering never changes — an
application holding a write transaction open across user interaction or a network call
produces `SQLITE_BUSY` errors that look like a database problem and are a transaction-scope
problem.
