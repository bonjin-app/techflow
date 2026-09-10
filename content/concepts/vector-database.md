---
id: vector-database
name: Vector Database
tagline: A store whose primary index answers "which rows are nearest to this vector"
category: data
tags: [Database, Vector, Search, ANN]
difficulty: 3
prerequisites: [database, indexing, embedding]
learningPath:
  - database
  - indexing
  - embedding
  - vector-database
  - pgvector
  - semantic-search
  - rag
related:
  - { to: pgvector, rel: RELATED_TO }
  - { to: elasticsearch, rel: ALTERNATIVE_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: indexing, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: semantic-search, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

A vector database stores [embeddings](/concept/embedding) together with their metadata and
answers one question fast: *given this vector, which stored vectors are nearest?* It does
that with an approximate nearest-neighbour (ANN) index, trading exactness for speed — you
get "almost certainly the closest ten" in milliseconds instead of "definitely the closest
ten" after a full scan. Everything else a database does — transactions, joins, aggregates,
constraints — it usually does less well than the relational database you already run.

## Why it matters

Nearest-neighbour search over a few thousand vectors needs no special machinery: compute
every distance in a loop. That brute-force scan grows linearly with the corpus and with
dimensions, so at a million chunks of a few hundred dimensions each you are doing hundreds
of millions of multiply-adds per query, and latency crosses from milliseconds into seconds.
An ANN index restores sub-second search by visiting only a small, cleverly chosen part of
the space.

This becomes a component rather than a library call because of the surrounding
requirements, which look like ordinary database requirements:

- **Filtering.** Real queries are "nearest chunks *for this tenant*, in this language, from
  documents this user may read". Without correct filtering, semantic search is a data-leak
  mechanism.
- **Writes that keep arriving.** Documents change; vectors must be upserted and deleted
  while queries run, and the index has to absorb that without a nightly rebuild.
- **Recall you can reason about.** Approximate means some true neighbours are missed. Which
  ones, how often and at what latency is a tuning decision you must be able to measure.
- **Operational surface.** Backups, replication, memory sizing, and — once the corpus outgrows
  one machine — [Partitioning](/concept/partitioning) by tenant.

## Visual

```sequence
title: Upsert, then a filtered k-NN query
participants: Worker [backend], Embedder, VectorDB [vector-database], API [backend]
Worker -> Embedder: embed 200 chunks (batched)
Embedder --> Worker: 200 vectors
Worker -> VectorDB: upsert (id, vector, tenant, doc_id, page)
VectorDB --> Worker: 200 upserted, index updated
API -> Embedder: embed the user question
Embedder --> API: query vector
API -> VectorDB: k-NN top 20 where tenant = acme and lang = en
VectorDB --> API: 20 ids with distances and metadata
API -> VectorDB: fetch chunk text for the 20 ids
VectorDB --> API: passages ready for re-ranking
```

The upsert path and the query path are the whole API surface. Note that the filter is part
of the search, not applied afterwards: filtering *after* retrieval means asking for 20 and
receiving 3 once the tenant filter is applied.

## How it works

- **HNSW** builds a multi-layer proximity graph and walks it greedily from a sparse top
  layer down to the dense bottom one. Best recall-per-latency in practice, supports
  incremental inserts, and costs the most memory — the graph and the vectors both want RAM.
  Build quality is governed by how many neighbours each node keeps; search quality by how
  wide the search frontier may grow.
- **IVF** clusters vectors and searches only the clusters nearest the query. Much cheaper to
  build and smaller in memory, but it must be trained on a representative sample, and recall
  drops for vectors near a cluster boundary. Adding many vectors after training degrades it
  until a rebuild.
- **Quantisation** (scalar or product) shrinks each vector to fewer bits, cutting memory
  several-fold at some recall cost. The usual production shape is a quantised index for the
  broad search plus exact re-scoring of the top candidates against full-precision vectors.
- **Filtering strategies.** Pre-filtering restricts the candidate set before the graph walk
  (correct, can be slow when the filter is very selective); post-filtering searches first
  and discards (fast, but returns too few rows); partitioned indexes give each tenant its
  own index (predictable, and the usual answer for multi-tenancy).
- **The knobs are always the same three.** Build parameters, search-effort parameters, and
  k — each trading recall against latency and memory. No setting is simply "better".

## Deep Dive

**You may not need one.** Below roughly a million vectors, [pgvector](/technology/pgvector)
inside [PostgreSQL](/technology/postgresql) keeps embeddings in the same transaction as the
rows they describe, so a document and its chunks are deleted together and joins to
permissions tables are ordinary SQL. That removes a whole system from your architecture. If
you already run [Elasticsearch](/technology/elasticsearch) for full-text, its vector support
plus its existing filtering and ranking is often the shortest path to hybrid search — see
[Semantic vs Keyword Search](/compare/semantic-vs-keyword-search). A dedicated vector store
earns its place at tens of millions of vectors, high write rates, or when per-tenant
sharding and horizontal scale-out are hard requirements. [AI RAG
Application](/architecture/ai-rag) records exactly that trade-off as a decision.

**Recall is a metric you must own.** Compute ground truth by brute force on a sample of a
few hundred real queries, then measure the fraction of true top-k your index returns.
Without that number, "the search feels worse since we tuned the index" is unanswerable, and
index parameters get changed by superstition.

**The index is not the source of truth.** Vectors are derived data. Keep chunk text,
metadata and the model identifier in durable storage so the index can be rebuilt from
scratch — after a corruption, a model change, or a parameter change that needs a fresh
build. Rebuilds are routine; design for them by writing into a new index and switching
reads.

**Consistency is looser than you expect.** Many stores index asynchronously, so a document
upserted a second ago may not be searchable yet. Users need a visible "indexing" state, and
tests need to wait for the index rather than assume read-your-writes.

**Deletion is a compliance path.** Removing a document must remove its vectors, and
graph-based indexes often only mark entries as deleted until a compaction actually reclaims
them. Verify that a deleted document stops appearing in results, and know how long tombstones
survive.

**Cost is memory.** A million vectors of a thousand 4-byte dimensions is about 4 GB of raw
floats before the index structure, and ANN indexes want to be resident. Quantisation,
smaller dimensions and per-tenant partitions are the levers.
