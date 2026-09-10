---
id: embedding
name: Embedding
tagline: A vector that places a piece of text so that nearby means similar in meaning
category: ai
tags: [AI, Vector, Search, Data]
difficulty: 3
prerequisites: [programming-fundamentals, database, llm]
learningPath:
  - programming-fundamentals
  - llm
  - embedding
  - vector-database
  - semantic-search
  - rag
related:
  - { to: vector-database, rel: RELATED_TO }
  - { to: semantic-search, rel: RELATED_TO }
  - { to: pgvector, rel: USED_WITH }
  - { to: llm, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: rag, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

An embedding is a fixed-length list of numbers a model produces from a piece of text (or an
image, or audio). The model is trained so that inputs with similar meaning land close
together, which turns "is this about the same thing?" into a distance calculation.
Embeddings are what make [Semantic Search](/concept/semantic-search) and
[RAG](/pattern/rag) possible — and they are lossy, model-specific and uninterpretable one
number at a time.

## Why it matters

Keyword indexes match strings. A user asking "how do I get my money back" shares no useful
term with a document titled "Refund policy", so exact matching fails on exactly the queries
where users need help most. Embeddings match *meaning*, so paraphrases, synonyms and
translations land near each other without a synonym list to maintain.

That comes with constraints worth knowing on day one:

- **Both sides must use the same model.** Query and document vectors are comparable only if
  they came from the same model with the same settings. Changing the model means re-embedding
  the entire corpus — plan it as a migration, not a config change.
- **The vector says nothing about *why*.** Debugging retrieval means looking at what came
  back, not at the numbers; dimension 412 means nothing on its own.
- **Similar is not relevant.** Two texts about the same topic can be near each other while
  one answers the question and the other contradicts it. Distance ranks candidates; it
  never decides correctness.
- **Storage and cost are real.** Hundreds or thousands of float dimensions per chunk add
  up: millions of chunks is gigabytes of vectors that all want to be in memory, plus one
  embedding call per chunk at ingest and one per query.

## Visual

```steps
title: Text to vector to distance
Chunk the text | split documents into passages of a few hundred tokens, with slight overlap
Embed each chunk | one model call returns a fixed-length vector, the same length every time
Normalise and store [vector-database] | keep the vector next to its text and its metadata
Embed the query | the same model, so both sides share one space
Rank by distance | cosine or inner product, then take the top k as candidates
Re-rank or filter | a cross-encoder or a metadata filter decides the final order
```

A two-dimensional example — real models use hundreds or thousands of dimensions, but the
arithmetic is identical:

```text
"cat"    -> [0.90, 0.10]
"kitten" -> [0.80, 0.20]
"car"    -> [0.10, 0.95]

cosine(a, b) = dot(a, b) / (norm(a) * norm(b))

cat vs kitten: 0.74 / (0.906 * 0.825) = 0.99   -> distance 0.01  (near)
cat vs car   : 0.185 / (0.906 * 0.955) = 0.21  -> distance 0.79  (far)
```

Nothing about "cat" and "kitten" is textually similar; only their positions are. That is
the whole trick, and the whole limitation: the model's idea of similarity is the one you
inherit.

## How it works

- **Chunking is a retrieval decision, not a formatting one.** A vector summarises its whole
  input, so a 20-page document embedded as one vector is a blur that matches nothing
  precisely. Split on structure (headings, sections, list items) where you can, keep chunks
  in the low hundreds of tokens, and carry a little overlap so a sentence spanning a
  boundary is not lost.
- **Metadata travels with the vector.** Tenant, document id, page, section title, language,
  version, timestamp. Filters on those fields do more for perceived quality than tuning the
  distance metric, and multi-tenant correctness *depends* on them.
- **Distance metrics.** Cosine ignores magnitude and is the usual default; inner product is
  equivalent once vectors are normalised; Euclidean is rarely what you want for text. Pick
  one, normalise once at write time, and use the matching index operator class.
- **Batch at ingest, cache at query time.** Batch hundreds of chunks per embedding request
  during ingestion, and cache query vectors for repeated questions. Ingestion should be
  idempotent, keyed by document id and content hash, so a re-run replaces a document's
  chunks instead of duplicating them.
- **Dimensions are a trade-off.** Larger vectors capture more nuance and cost more memory
  and index time. Some models support truncating dimensions with modest quality loss —
  measure on your own queries before assuming bigger is better.

## Deep Dive

**Retrieval quality dominates answer quality.** In a RAG system the model can only reason
over what retrieval hands it. Teams routinely spend weeks on prompts when the actual defect
is that the right paragraph was ranked eleventh. Build a small labelled set of real queries
with their correct chunk and measure recall at k before touching anything else — that
harness belongs to [LLM Evaluation](/concept/llm-evaluation).

**Pure vector search has predictable blind spots.** Exact identifiers, negation ("invoices
*not* paid"), rare proper nouns and numeric ranges are all things keyword matching does well
and embeddings do badly. Hybrid search — run both, fuse the rankings — is the default for a
reason; see [Semantic vs Keyword Search](/compare/semantic-vs-keyword-search).

**Re-embedding is a schema migration.** Store the model identifier and dimension alongside
every vector. When the model changes, write new vectors into a new column, backfill, compare
quality on your labelled set, then switch reads. Mixing vectors from two models in one index
silently produces nonsense distances.

**Where they live.** Below a few million vectors, an extension in the database you already
run is usually enough: [pgvector](/technology/pgvector) inside
[PostgreSQL](/technology/postgresql) keeps vectors, metadata and joins in one transaction.
Beyond that, or when you need per-tenant sharding and heavy write throughput, a dedicated
[Vector Database](/concept/vector-database) earns its operational cost.

**Privacy.** An embedding is derived from its source text and can leak information about
it; approximate reconstruction of short texts is a known result. Give vectors of personal
data the same access controls, retention rules and deletion path as the text itself.

**Not only for search.** The same vectors support topic clustering, deduplication of
near-identical records, classification by nearest labelled example and item-similarity
recommendation — all easier to evaluate than a chatbot, and often more valuable.
