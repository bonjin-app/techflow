---
id: storage-engine
name: Storage Engines
tagline: B-tree or LSM, a write-ahead log, and MVCC — the three decisions under every database
category: data
tags: [Database, Storage, Performance, Internals]
difficulty: 4
prerequisites: [database, indexing, transaction]
learningPath:
  - database
  - indexing
  - transaction
  - storage-engine
  - partitioning
  - replication
related:
  - { to: database, rel: REQUIRES }
  - { to: indexing, rel: RELATED_TO }
  - { to: transaction, rel: RELATED_TO }
  - { to: acid, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
  - { to: cassandra, rel: RELATED_TO }
  - { to: clickhouse, rel: RELATED_TO }
  - { to: sqlite, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Every database makes three decisions below the query layer, and they explain most of its
behaviour. **How rows are laid out on disk**: a B-tree updates in place and reads fast; an
LSM tree appends and merges later, so it writes fast and reads through several layers.
**How durability is achieved**: a write-ahead log records the change before the data pages
move, so a crash replays rather than corrupts. **How concurrent readers see the data**:
multi-version concurrency control keeps old row versions so readers never block writers. Read
a database's answers to those three and you can predict its write amplification, its
tail latency, why it needs vacuuming, and what a backup actually contains.

## Why it matters

These are not internals for their own sake. They surface as the operational problems people
actually hit.

A PostgreSQL table bloats and queries slow down: that is MVCC leaving dead row versions
behind and autovacuum falling behind. A Cassandra cluster's reads get slower over a week:
that is LSM levels accumulating and compaction not keeping up. A database's throughput
collapses when the working set exceeds memory: that is a B-tree doing a random read per
lookup instead of a memory hit. An analytics query over one column reads the whole table:
that is row storage where columnar was needed.

Choosing a database is largely choosing these trade-offs, and the marketing page will not
tell you which you are buying. The engine will.

## Visual

```compare
Decision             | B-tree (update in place)                       | LSM tree (append and merge)
Write path           | find the page, modify it, log it                | append to a memtable, flush sorted files
Write cost           | random I/O, one page per update                 | sequential I/O, cheap per write
Read path            | one tree descent, usually 3–4 pages             | check memtable, then several sorted levels
Read cost            | predictable                                     | more work; bloom filters skip most levels
Space                | pages partly empty, fragmentation               | compacted, but old copies until merge runs
Background work      | vacuum / page splits                            | compaction — a large, continuous cost
Predictable latency  | yes                                            | compaction causes periodic spikes
Typical of           | PostgreSQL, MySQL/InnoDB, SQLite                | Cassandra, RocksDB, LevelDB-derived stores
Fits                 | mixed read/write, transactional workloads       | write-heavy ingest, time series, logs
```

## Solutions

**Read the engine's write path before you pick it.** If your workload is dominated by writes
that are never read again for hours — events, metrics, audit logs — an LSM engine will
absorb them at sequential-I/O speed while a B-tree performs a random write per row. If the
workload is transactional and mixed, the B-tree's predictable read cost usually wins. The
question is not which is better; it is which shape your traffic has.

**Never disable the write-ahead log to go faster.** The WAL is what makes a commit durable
and a crash recoverable: the change is written to a sequential log and fsynced, and only
later do the data pages move. Turning it off or relaxing its sync makes the last few seconds
of commits a lie. If you need that speed, say out loud which commits you are prepared to lose
and write it down — see the durability discussion in [ACID](/concept/acid).

**Expect MVCC to have a cleanup cost.** Keeping old row versions so readers do not block
writers means the old versions must eventually go. In PostgreSQL that is autovacuum, and a
long-running transaction holds the cleanup horizon open — which is why one forgotten
`BEGIN` in a console can bloat a table for a day. Monitor the oldest transaction, not just
the table size.

**Give compaction the headroom it needs.** An LSM engine needs spare disk and spare I/O to
merge levels. A cluster run at 85% disk cannot compact, and a cluster that cannot compact
gets slower and then stops. Provision for the compaction, not for the data.

**Match the layout to the query.** Row storage reads whole rows, which is right when you
fetch entities by key. Columnar storage reads one column across millions of rows, which is
right for aggregation and compresses far better because a column is homogeneous. This is the
real difference between a transactional database and [ClickHouse](/technology/clickhouse),
and it is why "just add an index" does not turn one into the other.

**Size the buffer pool for the working set.** Both engine families live or die on whether the
pages they need are in memory. The performance cliff when the working set exceeds RAM is
steep and it looks like a sudden, unexplained slowdown. It is the most common capacity
surprise in database operations — see [Capacity Planning](/concept/capacity-planning).

## Deep Dive

**Write amplification is the number to compare.** A logical write costs more than one
physical write in both families. A B-tree writes the WAL record and the page, and rewrites
the whole page for a small change; page splits amplify further. An LSM writes the log and the
memtable flush, then rewrites the same data at every compaction level — often 10–30× the
logical bytes over its lifetime. On SSDs this is a wear and throughput budget, and it is why
tuning compaction matters more than tuning queries on a write-heavy cluster.

**Bloom filters are what make LSM reads tolerable.** Without them, a read would touch every
level. A bloom filter per sorted file answers "definitely not here" in constant time with a
small false-positive rate, so a read usually touches one file. The filter costs memory
proportional to the key count — another reason LSM clusters are memory-hungry.

**B-trees are optimised for the storage of forty years ago, and still win.** The design
minimises random page reads because a disk seek was the dominant cost. On SSDs that
assumption is weaker, which is why LSM engines became practical — but B-trees remain
excellent because the page cache turns most descents into memory reads, and in-place updates
keep the physical layout close to the logical order, which range scans depend on.

**MVCC versus locking is a visible product decision.** With MVCC, a reader sees a consistent
snapshot and never waits for a writer, which is why long analytical queries can run against a
live OLTP database. The costs are storage for versions, background cleanup, and write
conflicts surfacing at commit time rather than as a block — so the application must be
prepared to retry a serialization failure. Engines that lock instead make readers wait and
never bloat. [Transaction](/concept/transaction) covers how the isolation levels are built on
top of this.

**Fsync is the honest boundary of durability.** A commit is durable when the WAL record has
actually reached stable storage, and every layer between — the filesystem, the volume, the
virtual disk, the drive's own cache — can lie about that. This is what group commit
optimises, and what a "relaxed durability" setting trades away. When a cloud volume promises
durability, read which layer the promise is made at.

**Backups are engine-shaped too.** A copy of the data directory without the WAL is not a
backup; point-in-time recovery is exactly the WAL replayed to a chosen moment. LSM snapshots
are cheap because files are immutable — a snapshot is a set of hard links. Knowing this is
the difference between a restore plan and a folder of files.
