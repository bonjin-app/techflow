---
id: pgvector
name: pgvector
tagline: PostgreSQL extension that stores embeddings and indexes them for nearest-neighbour search
category: database
tags: [Database, Vector, Search, PostgreSQL, Extension]
difficulty: 3
usedFor: [vector-database, semantic-search, embedding, indexing]
prerequisites: [database, sql, postgresql, indexing, embedding]
learningPath:
  - database
  - sql
  - postgresql
  - indexing
  - embedding
  - vector-database
  - pgvector
  - semantic-search
  - rag
related:
  - { to: postgresql, rel: REQUIRES }
  - { to: vector-database, rel: IMPLEMENTS }
  - { to: elasticsearch, rel: ALTERNATIVE_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: semantic-search, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "pgvector 0.8.x", confidence: medium }
---

## TL;DR

pgvector adds a `vector` column type to [PostgreSQL](/technology/postgresql), distance
operators for it, and two approximate nearest-neighbour index types (HNSW and IVFFlat). An
[embedding](/concept/embedding) becomes a column next to the text it describes, so
retrieval is a `SELECT ... ORDER BY embedding <=> $1 LIMIT 10` with your normal `WHERE`
clauses, joins and transactions. Up to a few million vectors it removes the need for a
separate [Vector Database](/concept/vector-database) entirely; past that, memory and
single-node throughput are the reasons to move on.

## Practical

A chunk table, a real index, and the query that uses it:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE doc_chunk (
  id          bigserial   PRIMARY KEY,
  document_id bigint      NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  tenant_id   bigint      NOT NULL,
  page        int,
  content     text        NOT NULL,
  embedding   vector(768) NOT NULL,   -- dimension is fixed by the embedding model
  model       text        NOT NULL,   -- which model produced it, for re-embedding later
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Operator class must match the operator you ORDER BY, or the index is ignored:
-- vector_cosine_ops <=> | vector_l2_ops <-> | vector_ip_ops <#>
CREATE INDEX doc_chunk_embedding_hnsw
  ON doc_chunk USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX doc_chunk_tenant ON doc_chunk (tenant_id);

-- Per-session recall/latency knob: higher ef_search = better recall, slower query.
SET hnsw.ef_search = 100;

SELECT id, document_id, page, content,
       embedding <=> $1::vector AS distance
FROM doc_chunk
WHERE tenant_id = $2
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

Things that bite people in the first week:

- **The `ORDER BY` expression must use the indexed operator.** `<=>` is cosine, `<->` is
  L2, `<#>` is negative inner product. A different operator, a wrapping function, or
  ordering by a computed similarity instead of the distance silently produces a sequential
  scan. Check with `EXPLAIN` that the plan says `Index Scan using ...hnsw`.
- **Ingest before you index.** Bulk-load the rows, then `CREATE INDEX`; building HNSW
  incrementally during a large import is many times slower. Raise `maintenance_work_mem`
  for the build.
- **Upsert by a natural key.** `(document_id, chunk_no)` with `ON CONFLICT DO UPDATE`, or
  delete-then-insert per document in one transaction. Re-ingesting must replace a document's
  chunks, never duplicate them — this is where `ON DELETE CASCADE` pays off.
- **Dimension is part of the type.** `vector(768)` rejects any other length, which stops a
  second embedding model quietly polluting the table.

## Deep Dive

**HNSW versus IVFFlat.** HNSW builds a layered proximity graph: better recall at a given
latency, no training step, and it accepts inserts from the first row. Its cost is memory and
build time — the graph plus the vectors want to be in shared buffers or the page cache.
IVFFlat clusters vectors into lists and probes only the nearest ones; it builds quickly and
is much smaller, but the clustering is trained on the data present, so an index built on
1,000 rows is wrong once you have 1,000,000. Default to HNSW unless build time or memory
forces the alternative.

**The knobs.** `m` and `ef_construction` at build time trade build cost and memory for
recall; `hnsw.ef_search` at query time trades latency for recall (IVFFlat's equivalents are
`lists` and `ivfflat.probes`). All are recall dials, and recall is invisible unless you
measure it: take a few hundred real queries, compute exact ground truth with the index
disabled (`SET enable_indexscan = off`), and compare.

**Filtered search is the hard case.** A `WHERE tenant_id = $2` next to an ANN order-by is
awkward for any vector index: the graph walk does not know your predicate, so a very
selective filter can make the index return too few matching rows. pgvector's iterative index
scans let a search continue past the initial candidate set instead of returning short. The
alternatives are partial indexes per large tenant,
[Partitioning](/concept/partitioning) by tenant, or accepting a sequential scan when the
filter is selective enough to make it cheap.

**Memory arithmetic.** A 768-dimension `vector` is about 3 KB plus row overhead, so a
million rows is roughly 3 GB before the index. `halfvec` halves that at a small recall cost,
and binary quantisation with exact re-scoring of top candidates cuts it further. Keeping
index and hot vectors resident is the difference between single-digit and triple-digit
milliseconds.

**Hybrid search in one query.** PostgreSQL's own full-text search (`tsvector`, `ts_rank`)
lives in the same table, so keyword and vector candidates fuse with a CTE per retriever and
a reciprocal-rank-fusion join — no second system, no cross-store consistency problem. That
covers the blind spots described in [Semantic Search](/concept/semantic-search).

**Operationally it is just PostgreSQL** — the same backups, replicas, pooling and migrations.
The caveats: HNSW builds are heavy and should be scheduled; vector-heavy tables inflate WAL
and replication traffic; `VACUUM` matters because deleted vectors linger in the graph until
reclaimed; and managed platforms carry a version that lags upstream.

## Why

Adding semantic retrieval to an application that already has a relational database used to
mean running a second datastore beside it.

```steps
title: Before - a separate vector service beside the database
Write the row to PostgreSQL, then the vector to another store [postgresql]
No shared transaction, so a crash between the two leaves them disagreeing
A deleted document keeps answering queries because its vectors were never removed
Permission and tenant filters live in SQL, but the search happens elsewhere
Retrieval returns ids, so every query needs a second round trip
Two systems to back up, upgrade, monitor and pay for
```

```steps
title: After - one table, one transaction
The chunk and its embedding are columns in the same row [pgvector]
Insert, update and delete are ordinary transactional SQL [transaction]
ON DELETE CASCADE removes a document's vectors with the document
Tenant and permission filters are the WHERE clause of the search itself
Distance and content come back together, in one round trip
Backups, replicas and migrations are the ones you already operate [postgresql]
```

The point is not that pgvector searches faster than a dedicated engine — often it does not.
It is that the vectors stop being a second, weakly consistent copy of your data.

## Advantages

- Vectors, text and metadata in one row: no dual writes, no sync job, no drift
- Filters, joins, aggregates and ACID [transactions](/concept/transaction) apply to search
- Exact and approximate search from the same table, so ground-truth recall is measurable
- Hybrid keyword plus vector ranking without a second system
- Reuses existing backups, replicas, access control, pooling and dashboards
- Widely available on managed PostgreSQL, and a small, well-scoped extension to review
- Removes an entire component — and its failure modes — from the architecture

## Trade-offs

- Single-node write and index-build throughput; scaling out means sharding PostgreSQL yourself
- HNSW indexes are memory-hungry, and build time grows steeply with rows and dimensions
- Filtered ANN queries need care (iterative scans, partial indexes or partitioning) to keep recall
- Fewer purpose-built features: no built-in re-ranker, sparse vectors or managed namespaces
- Index rebuilds after a model change are heavy maintenance on a live primary
- Vector-heavy tables inflate WAL, replication lag and backup size
- Managed-platform extension versions lag upstream, so a needed feature may be unavailable
- High query concurrency competes with your OLTP workload on the same instance

## When to use

- You already run PostgreSQL and want semantic retrieval without a new datastore
- Up to a few million vectors, with room to grow via partitioning and quantisation
- Search must respect relational constraints: tenancy, ownership, ACLs, soft deletes
- Vectors must stay transactionally consistent with the rows they describe
- Hybrid keyword plus semantic ranking over the same corpus
- Prototypes and first production versions of a [RAG](/pattern/rag) pipeline

## When not to use

- Don't use it at tens of millions of vectors with heavy write rates — a dedicated [Vector Database](/concept/vector-database) or [Elasticsearch](/technology/elasticsearch) is built for that scale
- Don't use it when your database instance is already at its CPU or memory ceiling; ANN search is not free
- Don't use it if you need managed sharding, per-namespace isolation or built-in re-ranking out of the box
- Don't use it for a corpus of a few thousand vectors — an exact scan in the application is simpler and fast enough
- Don't use it when the embedding model changes constantly and rebuilds would run against a busy primary

## Real-world

The typical shape is unremarkable, which is the point: a `document` table, a `doc_chunk`
table with an `embedding` column, an ingestion worker that chunks and embeds uploads and
upserts them per document, and an API that embeds the question and runs one filtered
nearest-neighbour query before calling the model. [AI RAG
Application](/architecture/ai-rag) is that architecture with a dedicated vector store, and
records the opposite decision explicitly — below a few million chunks, pgvector inside the
existing database removes a whole component.

The same column supports work unrelated to chatbots: deduplicating near-identical support
tickets or catalogue entries, "more like this" recommendations, clustering feedback into
topics, and matching free text against a controlled vocabulary. Those uses are easier to
evaluate than generated answers and often deliver value first.

The failure most teams hit at least once is a query that stopped using the index — an
`ORDER BY` rewritten to sort by similarity, or a mismatched operator class — turning a 5 ms
search into a 5 s sequential scan under load. The second is finding that recall was quietly
poor because `ef_search` sat at its default while the corpus grew tenfold. Both are caught
by the same habit: an `EXPLAIN` assertion in the test suite and a recall number in the
harness described in [LLM Evaluation](/concept/llm-evaluation).
