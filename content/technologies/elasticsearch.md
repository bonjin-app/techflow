---
id: elasticsearch
name: Elasticsearch
tagline: Distributed search engine on inverted indexes for full-text, vector and analytics queries
category: data
tags: [Search, Analytics, Distributed System, Full-text]
difficulty: 4
usedFor: [sharding, replication, eventual-consistency]
prerequisites: [backend, database, distributed-system]
learningPath:
  - programming-fundamentals
  - database
  - sql
  - backend
  - distributed-system
  - sharding
  - elasticsearch
  - eventual-consistency
  - cqrs
related:
  - { to: postgresql, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: mongodb, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: eventual-consistency, rel: RELATED_TO }
  - { to: sharding, rel: RELATED_TO }
  - { to: e-commerce, rel: USED_IN }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Elasticsearch 9.x", confidence: high }
---

## TL;DR

Elasticsearch indexes JSON documents so that questions like "products matching *wireless
headphones* under $100, ranked by relevance, with counts per brand" return in tens of
milliseconds over millions of records. It does this with inverted indexes from Apache
Lucene, spread across shards on many nodes. It is a **secondary** store fed from your
system of record — excellent at search, aggregation and log analytics, deliberately weak
at transactions and immediate consistency.

## Practical

In a typical system Elasticsearch sits beside the primary database. Writes go to
[PostgreSQL](/technology/postgresql) or [MongoDB](/technology/mongodb); a sync process
copies the searchable projection of each record into an index; search requests go to
Elasticsearch and return ids that the application may enrich from the database.

What you will actually do:

- **Define mappings** — which fields are `text` (analysed for full-text), `keyword`
  (exact filter/aggregation), numeric, date, `dense_vector`. Dynamic mapping is
  convenient in development and a trap in production.
- **Choose analyzers** — tokenisation, lowercasing, stemming, synonyms, language
  specifics. Search quality is mostly analyzer and mapping work, not query work.
- **Keep the index in sync** — from change events ([Kafka](/technology/kafka) topic,
  [Outbox](/pattern/outbox) table, change data capture) rather than dual writes from
  application code, which drift.
- **Write queries** in the Query DSL: `bool` with `must`/`filter`/`should`, `multi_match`
  with field boosts, aggregations for facets, `knn` for vector similarity.
- **Plan reindexing** — mappings are mostly immutable; use index aliases so you can build
  a new index and switch atomically.

```json
POST /products/_search
{
  "query": {
    "bool": {
      "must":   [{ "multi_match": { "query": "wireless headphones", "fields": ["name^3", "description"] } }],
      "filter": [{ "range": { "price": { "lte": 100 } } }, { "term": { "inStock": true } }]
    }
  },
  "aggs": { "brands": { "terms": { "field": "brand", "size": 10 } } },
  "size": 20
}
```

Operationally you will size shards (tens of GB each, not thousands of tiny ones), watch
heap and disk watermarks, set replica counts, and run it as a managed service or a
cluster of three or more nodes. Kibana usually comes along for exploring data and logs.

## Deep Dive

**Inverted index.** For each term, Lucene stores the list of documents containing it,
positions and frequencies. A query for "wireless headphones" intersects two posting lists
and scores each hit with BM25 (term frequency, inverse document frequency, field length).
This is why full-text search that would be a sequential `LIKE '%…%'` scan in a relational
database becomes a few index lookups — and why exact-match filters on `keyword` fields are
cheap while updates are not.

**Segments and near-real-time.** Documents are written to an in-memory buffer and a
transaction log, then flushed into immutable Lucene segments on a `refresh` (every
second by default). Until refresh, a written document is not searchable; hence "near
real time". Updates are a delete plus a re-index of the whole document; deleted documents
linger as tombstones until segment merges. Write-heavy indexes pay a constant merging
cost.

**Shards and replicas.** An index is split into primary shards, each a Lucene index on
one node, with configurable replica copies for redundancy and read throughput. Documents
are routed to shards by hash of `_id` (or a routing key). A search fans out to one copy
of every shard and merges results — so the primary shard count fixes the parallelism and
cannot be changed without reindexing. Too many small shards waste heap; too few large ones
limit recovery and parallelism. See [Sharding](/concept/sharding) and
[Replication](/concept/replication).

**Consistency model.** Writes are acknowledged after primaries and in-sync replicas
persist them, but the cluster is an [eventually consistent](/concept/eventual-consistency)
system relative to your source of truth: the sync pipeline, refresh interval and replica
lag all mean a user can create a record and not find it in search for a second or two.
Designs that need read-your-writes go back to the primary database for that path.

**Aggregations and analytics.** Doc values (columnar storage per field) power `terms`,
`histogram`, percentile and cardinality aggregations across millions of documents — the
basis for faceted navigation and for log/metrics dashboards. High-cardinality `terms`
aggregations are memory-hungry; approximate algorithms (HyperLogLog++) are used for counts.

**Vector and hybrid search.** `dense_vector` fields with HNSW indexes support approximate
k-nearest-neighbour search, and queries can combine BM25 and vector scores (reciprocal
rank fusion). This lets one engine serve keyword search, semantic retrieval and
filtering for retrieval-augmented generation without a separate vector database, at the
cost of extra memory for the HNSW graphs.

## Why

Relational databases answer exact questions well: "orders for user 17", "products with
price < 100". They answer fuzzy, ranked, human-language questions badly. "Wireless
headfones" with a typo, ranked by how well it matches, with brand and price facets, over
five million products — in SQL that is `ILIKE` scans, no ranking, and a separate
`GROUP BY` per facet.

```sequence
title: Before — full-text search on the relational database
participants: Browser, API [backend], DB [postgresql]
Browser -> API: GET /search?q=wireless headfones
API -> DB: SELECT … WHERE name ILIKE '%wireless%' OR … (seq scan)
DB --> API: rows, unranked, typo finds nothing (900 ms)
API -> DB: SELECT brand, count(*) … GROUP BY brand (facets)
DB --> API: rows (another scan)
API --> Client: 200 results (slow, poor relevance)
```

With Elasticsearch the product projection is indexed once per change; search hits a
purpose-built index that tokenises, stems, tolerates typos, scores by relevance and
computes facets in the same request. The database keeps serving transactions.

```sequence
title: After — search served from a dedicated index
participants: Browser, API [backend], ES [elasticsearch], Kafka [kafka], DB [postgresql]
DB --> Kafka: product.updated (CDC / outbox)
Kafka --> ES: index product:42 (near real time)
Browser -> API: GET /search?q=wireless headfones
API -> ES: _search bool + fuzziness + aggs
ES --> API: ranked hits + brand facets (30 ms)
API --> Browser: 200 results
```

## Advantages

- Relevance-ranked full-text search with analyzers, fuzziness, synonyms and highlighting out of the box
- Facets and analytics over large document sets via aggregations
- Horizontal scaling through sharding and replicas; fan-out search across nodes
- Near-real-time indexing (about one second) for user-generated content
- Vector and hybrid search in the same engine as keyword search and filters
- Mature ecosystem for log and metrics analytics (Kibana, ingest pipelines, ILM)

## Trade-offs

- Not a system of record: no transactions, weak multi-document guarantees, data must be reproducible from elsewhere
- Keeping the index in sync is your pipeline to build and monitor; drift is common
- Mappings are largely immutable — schema changes mean reindexing behind an alias
- Memory-hungry (JVM heap, file cache, HNSW graphs); cluster sizing and shard planning are real work
- Search results lag writes by the refresh interval and sync latency
- Licensing has shifted over the years (Elastic License, SSPL, AGPL option); check what your policy accepts. OpenSearch is an Apache-2.0 fork

## When to use

- Product, content or document search with relevance ranking, typo tolerance and facets
- Log, event and metrics analytics at volume — the classic observability backend
- Faceted navigation and aggregations over millions of records that a relational `GROUP BY` cannot serve interactively
- Hybrid keyword + vector retrieval for search or [AI RAG](/architecture/ai-rag) pipelines
- Read models in a [CQRS](/pattern/cqrs) design where the query side needs search-shaped access

## When not to use

- As the primary database for data you cannot regenerate — it is a projection, not a source of truth
- Simple full-text needs on a small dataset; PostgreSQL's `tsvector`/`pg_trgm` avoid a second system
- Exact-match lookups by key, joins and transactional updates — that is [PostgreSQL](/technology/postgresql) or [MongoDB](/technology/mongodb) territory
- Workloads dominated by frequent updates of large documents; each update re-indexes the whole document and churns segments
- The team cannot operate a JVM cluster and a managed service is out of budget — search quality suffers more from neglect than from a simpler engine

## Real-world

In an [E-commerce](/architecture/e-commerce) system Elasticsearch serves the search box,
category facets and autocomplete, fed by product change events from
[Kafka](/technology/kafka) while [PostgreSQL](/technology/postgresql) remains the source of
truth for orders and inventory. In an [AI RAG](/architecture/ai-rag) application it holds
document chunks with both BM25 text and vector embeddings, returning the hybrid-ranked
passages the model is given as context. Most centralised logging stacks are the same
engine wearing a different hat.
