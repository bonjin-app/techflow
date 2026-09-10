---
id: semantic-search
name: Semantic Search
tagline: Ranking by meaning instead of by matching words — and why you still need both
category: data
tags: [Search, AI, Vector, Relevance]
difficulty: 3
prerequisites: [database, indexing, embedding, vector-database]
learningPath:
  - database
  - indexing
  - embedding
  - vector-database
  - semantic-search
  - rag
related:
  - { to: elasticsearch, rel: ALTERNATIVE_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: pgvector, rel: USED_WITH }
  - { to: rag, rel: RELATED_TO }
  - { to: semantic-vs-keyword-search, rel: RELATED_TO }
  - { to: search-system, rel: USED_IN }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Semantic search ranks documents by the distance between their
[embedding](/concept/embedding) and the query's embedding, so "get my money back" finds a
page titled "Refund policy" with no shared words. It is excellent at paraphrase, synonyms
and cross-language matching, and weak at exactly the things keyword search is good at:
identifiers, rare proper nouns, negation and precise numbers. Production systems almost
always run both and fuse the results — hybrid search — rather than choosing.

## Why it matters

Search failures are asymmetric. A user who types the same words as your documents finds
them with any technology; a user who describes their problem in their own words is the one
who needs help, and lexical matching returns nothing. That gap is where semantic search
pays for itself: support portals, internal wikis, catalogues with inconsistent vocabulary,
and every [RAG](/pattern/rag) pipeline, where retrieval quality sets the ceiling on answer
quality.

The counterweight is a set of failure modes lexical search does not have:

- It always returns *something*. There is no such thing as zero results, so an irrelevant
  top hit looks identical to a relevant one until a human reads it.
- It cannot do exact. An order id, an error code or a version number needs the literal
  string; nearest-neighbour ranking will happily return a similar-looking one.
- It ignores small words that reverse meaning. "Invoices not yet paid" and "invoices paid"
  embed to nearly the same place.
- Its idea of similarity is the model's, and it changes when you change the model — which
  means re-embedding the whole corpus.

## Visual

```compare
Aspect            | Keyword (BM25)              | Semantic (vectors)            | Hybrid
Matches on        | terms, stems, phrases       | meaning of the whole passage  | both, then fused
Paraphrase        | fails                       | strong                        | strong
Exact ids, codes  | strong                      | unreliable                    | strong
Negation, numbers | literal, so usually right   | usually wrong                 | keyword side rescues it
Rare proper nouns | strong                      | weak if unseen in training    | strong
Zero results      | possible, and informative   | never                         | possible, by threshold
Explainability    | highlighted terms           | a distance number             | partial
Index cost        | small, cheap to update      | large, RAM-hungry             | both
Setup effort      | low                         | model plus vector index       | highest
```

```sequence
title: One hybrid query
participants: Client [http], Search [backend], Keyword [elasticsearch], Vectors [vector-database], Reranker
Client -> Search: q = "why was my card declined twice"
Search -> Keyword: BM25 top 50, filtered to this tenant
Keyword --> Search: 50 hits with lexical scores
Search -> Vectors: k-NN top 50 on the query vector, same filter
Vectors --> Search: 50 hits with distances
Search -> Search: fuse both rankings into one candidate list
Search -> Reranker: score the top 25 candidates against the query
Reranker --> Search: reordered candidates
Search --> Client: top 10 results with highlights and sources
```

## How it works

- **Two indexes, one query.** The lexical index (inverted, BM25-scored) and the vector index
  answer the same filtered query independently. Both are asked for more candidates than you
  will show, because fusion needs overlap to work with.
- **Fusion.** Scores from the two systems are not comparable — one is a relevance score, the
  other a distance. Reciprocal rank fusion sidesteps this by combining *positions* rather
  than scores, needs no tuning, and is the sensible default. Weighted score blending can beat
  it, but only after normalisation and only if you measure.
- **Re-ranking.** A cross-encoder reads the query and each candidate *together* and scores
  the pair. Far more accurate than vector distance, and far too slow for the whole corpus,
  so it runs on the top few dozen candidates only. In most RAG systems adding a re-ranker is
  the single largest quality win available.
- **Filters are part of the query, not a post-step.** Tenant, language, permissions, date
  range and document status must constrain both retrievers. Filtering after retrieval is how
  a "top 10" becomes a top 2 — or how one tenant sees another's content.
- **Thresholds give you back "no results".** Because distance always returns neighbours,
  define a minimum fused score below which you say "nothing found" instead of showing noise.
  For a RAG answer, that threshold is what lets the system say "I don't know".

## Deep Dive

**Chunking decides recall.** Embeddings summarise their whole input, so passage-level chunks
retrieve precisely while whole-document vectors retrieve vaguely. A common shape is to
retrieve small chunks for matching, then expand to the surrounding section before sending
text to the model, so the model gets context that the matcher never had to blur.

**Measure with real queries.** Take a few hundred queries from logs, label the correct
result for each, and track recall at k, mean reciprocal rank and the click-through or
thumbs-up rate. Then change one thing at a time. Without that harness, tuning is folklore —
and the harness doubles as the retrieval half of [LLM Evaluation](/concept/llm-evaluation).

**Query understanding still matters.** Short keyword-ish queries ("refund 4029") behave
lexically; long natural-language questions behave semantically. Routing by query shape,
expanding acronyms, and rewriting a follow-up question into a standalone one using the
conversation history all move quality more than swapping the embedding model.

**Where to run it.** If you already operate [Elasticsearch](/technology/elasticsearch), it
holds the inverted index, vectors, filters and aggregations — the shortest path to hybrid. If
your data lives in [PostgreSQL](/technology/postgresql), full-text search plus
[pgvector](/technology/pgvector) gives the same two retrievers in one transactional
database. A dedicated [Vector Database](/concept/vector-database) is for scale and
per-tenant sharding, not for getting started;
[Semantic vs Keyword Search](/compare/semantic-vs-keyword-search) lays the choice out side
by side.

**When not to reach for it.** If your users search by identifier, SKU or exact filename; if
a `LIKE` query and a few filters satisfy everyone; if you cannot maintain a re-embedding
path when the model changes; or if you have no way to measure relevance — keyword search with
good filters and facets is the better engineering decision, and far cheaper to operate.
