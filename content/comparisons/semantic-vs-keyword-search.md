---
id: semantic-vs-keyword-search
name: Semantic vs Keyword Search
tagline: Match meaning with embeddings, or match terms with an inverted index
category: decision
tags: [Search, AI, Retrieval, Decision]
difficulty: 3
subjects: [semantic-search, elasticsearch]
related:
  - { to: rag, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
  - { to: ai-rag, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Keyword search — the classic inverted index in [Elasticsearch](/technology/elasticsearch)
and every relational full-text index — scores documents by the query's *terms*. It is
exact, explainable, fast, cheap, and blind to synonyms and paraphrase.

[Semantic search](/concept/semantic-search) scores documents by proximity in
[embedding](/concept/embedding) space. It finds the passage that answers "how long do I
have to send something back" from a document that only ever says "return window", and it
also cheerfully returns things that are merely *about the same topic* while missing an
exact product code the user typed verbatim.

Their failure modes are almost exactly complementary, which is why the answer in production
is **usually both, in this order**: run keyword and vector retrieval in parallel, fuse the
two ranked lists, and rerank the top of the fused list. Hybrid retrieval beats either mode
alone on realistic query mixes, and it is the default for serious [RAG](/pattern/rag)
systems for that reason rather than for novelty.

## Comparison

```compare
Feature             | Semantic [semantic-search]                        | Keyword [elasticsearch]
Matches on          | Meaning — nearest vectors                          | Terms — inverted index with BM25 scoring
Synonyms, paraphrase | Handled without configuration                      | Needs synonym lists and analysers per language
Exact identifiers   | Weak — SKUs, error codes, names drift in embedding space | Exact by construction
Rare terms          | Weak; rare tokens get averaged away                 | Strong — rare terms carry the most signal
Explainability      | Low — a distance, not a reason                       | High — you can see which terms matched
Filters and facets  | Metadata filters, usually pre or post filter          | Mature filters, facets, aggregations, sorting
Index cost          | Embedding every chunk, re-embedded on model change   | Cheap analysis at write time
Query cost          | An embedding call plus an ANN search                 | Index lookup, sub-millisecond at small scale
Operational shape   | Vector store or pgvector, ANN index tuning           | Well-understood ops, decades of tooling
Typos               | Tolerant — close enough in vector space               | Needs fuzzy matching configured
```

## Decision

```decision
? Do queries contain exact tokens that must match — codes, SKUs, names, error strings?
  YES -> ? Do users also ask in natural, paraphrased language?
    YES -> Hybrid — both, then fuse and rerank [rag]
    NO -> Keyword [elasticsearch]
  NO -> ? Are queries full questions or descriptions rather than a few terms?
    YES -> ? Do you need facets, aggregations or precise filtering alongside relevance?
      YES -> Hybrid — both, then fuse and rerank [rag]
      NO -> Semantic [semantic-search]
    NO -> ? Is a keyword index already in place and are users mostly satisfied?
      YES -> Keyword, and add semantic only for the queries it fails [elasticsearch]
      NO -> Hybrid — both, then fuse and rerank [rag]
```

## When Semantic Search

- Users ask questions in their own words and the documents use different vocabulary
- The corpus is prose: documentation, policies, support threads, meeting notes
- You are feeding an LLM, where "roughly the right passage" beats "no result at all"
- Cross-lingual retrieval, where a query in one language should find documents in another
- Typo tolerance and paraphrase matter more than exactness
- Nobody will maintain synonym lists and analysers over the long run

## When Keyword Search

- Queries contain identifiers, part numbers, error codes, file paths or people's names
- The result must be explainable — "it matched because the document contains X"
- You need facets, aggregations, sorting and precise structured filters as first-class features
- The corpus is short structured fields (titles, tags) where there is little meaning to embed
- Cost and latency budgets are tight, or the index changes constantly and re-embedding is impractical
- A keyword index already exists and works: measure before adding a second retrieval system

## Deep Dive

**How fusion works.** The usual method is Reciprocal Rank Fusion: take each engine's
ranked list and score a document by the sum of `1 / (k + rank)` across the lists it appears
in. It needs no score calibration, which matters because BM25 scores and cosine
similarities are not comparable quantities. Weighted score blending is possible but
requires normalising both sides and re-tuning whenever either engine changes.

**Reranking is where most of the gain is.** Fusion produces a good candidate set of maybe
50 documents; a cross-encoder reranker then scores each candidate *against the query
directly* rather than through a precomputed vector. It is far more accurate and far too
slow to run over the whole corpus — which is exactly why the cheap retrievers run first.
The pipeline is: retrieve wide and cheap, fuse, rerank narrow and expensive, then truncate
to what fits the prompt.

**Costs of hybrid, honestly.** Two indexes to keep in sync and two failure modes to
monitor; an extra embedding call on the query path; a reranker that adds real latency; and
a relevance system that is now hard to reason about — when a result is wrong you must work
out whether retrieval, fusion or reranking caused it. Changing the embedding model means
reindexing the entire corpus, an operation worth planning for before the corpus is large.

**Semantic search is not understanding.** Embeddings encode topic and register well and
encode specifics badly. Negation ("contracts *without* an arbitration clause"), numbers,
dates and closely related entities routinely retrieve the wrong passage while looking
confident. This is the same property that makes a [semantic cache](/pattern/semantic-cache)
risky, and it is why the exact half of a hybrid system is not a legacy component.

**Measure before you choose.** Collect real queries, label which documents should be
returned, and compute recall@k for each mode separately. Most teams find keyword search
already handles the majority of traffic and that semantic retrieval pays for itself on the
long tail of question-shaped queries — which is useful to know before running two systems.

## Related

- [Semantic Search](/concept/semantic-search) — retrieval by meaning, and its limits
- [Elasticsearch](/technology/elasticsearch) — the inverted index in practice
- [Embedding](/concept/embedding) — what a vector actually represents
- [Vector Database](/concept/vector-database) and [pgvector](/technology/pgvector) — where vectors live
- [RAG](/pattern/rag) — the pattern that consumes whichever retrieval you build
