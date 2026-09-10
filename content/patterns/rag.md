---
id: rag
name: RAG (Retrieval-Augmented Generation)
tagline: Retrieve the relevant text first, then let the model answer only from it
category: ai
tags: [AI, RAG, Retrieval, LLM]
difficulty: 3
prerequisites: [llm, embedding, vector-database]
learningPath:
  - llm
  - embedding
  - vector-database
  - semantic-search
  - rag
  - llm-evaluation
related:
  - { to: llm, rel: SOLVES }
  - { to: embedding, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: semantic-search, rel: RELATED_TO }
  - { to: fine-tuning, rel: ALTERNATIVE_TO }
  - { to: llm-evaluation, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: ai-chatbot, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## Problem

A [language model](/concept/llm) answers from what it absorbed during training. It has
never seen your wiki, your tickets, your contracts or anything written after its training
data was collected. Asked about them it does not refuse — it produces something plausible,
because producing plausible text is exactly what it was trained to do. It also cannot tell
you where an answer came from, so nobody can check it.

The obvious fixes do not work. Retraining the model every time a document changes is slow
and expensive, and it still leaves you unable to cite a source or revoke a document.
Pasting the whole corpus into the prompt fails against the
[context window](/concept/context-window) and, long before that, against cost: you pay per
token on every single question.

What you actually need is narrow: for *this* question, find the handful of passages that
matter and put only those in front of the model.

## Solution

Split the work into an offline **ingest** path and an online **query** path. Ingest chunks
your documents, embeds each chunk and stores the vectors with metadata. Query embeds the
question with the *same* model, retrieves the nearest chunks, and builds a prompt that
contains the question, the retrieved text and an instruction to answer only from it and to
cite what it used.

```sequence
title: Ingest — offline, once per document version
participants: Source [s3], Worker [backend], Embedder [embedding], Vector DB [vector-database]
Source -> Worker: new or updated document
Worker -> Worker: extract text, split into overlapping chunks
Worker -> Embedder: embed batch of chunks
Embedder --> Worker: vectors
Worker -> Vector DB: upsert vectors + metadata (doc id, tenant, version)
Vector DB --> Worker: OK (old chunks of this doc deleted)
```

```sequence
title: Query — per question
participants: API [backend], Embedder [embedding], Vector DB [vector-database], LLM [llm]
API -> Embedder: embed the question
Embedder --> API: query vector
API -> Vector DB: top-k nearest, filtered by tenant + permissions
Vector DB --> API: chunks + source metadata
API -> API: build prompt: instructions + chunks + question
API -> LLM: prompt
LLM --> API: answer with citations
API --> API: log question, chunks, answer for evaluation
```

## How it works

```steps
title: The five decisions that decide whether RAG works
Chunking | size and overlap; split on structure, not every 500 characters
Embedding [embedding] | the same model for documents and queries, or distances are meaningless
Retrieval [vector-database] | top-k plus metadata filters, ideally hybrid with keyword search
Reranking | a second, slower scorer reorders candidates before they reach the prompt
Prompting [llm] | ground the answer, allow "I don't know", require citations
```

Retrieval quality dominates answer quality. If the right passage is not in the top-k, no
prompt wording recovers it — the model will answer from the wrong chunks with the same
confident tone. Almost all effort on a struggling RAG system belongs in the retrieval
half, not in prompt tweaking.

The grounding instruction is the other half:

```text
Answer the question using ONLY the passages below.
If the passages do not contain the answer, say you do not know.
Cite the passage id after each claim.

[1] (handbook.md#refunds, v7) Digital goods may be refunded within 14 days …
[2] (policy.md#exceptions, v3) Subscriptions renewed automatically are …

Question: Can I refund a subscription renewal?
```

Two things this instruction does *not* do. It does not guarantee the model stays inside the
passages — grounding reduces invention, it does not eliminate it. And it does not make the
retrieved text trustworthy: the moment a chunk comes from user-uploaded content, a web
page or a ticket, that text is untrusted input sitting in the same prompt as your
instructions. Retrieved content is data, and treating it as instructions is the standard
prompt-injection hole in RAG systems.

## Advantages

- Answers reflect the current corpus — reindex a document and the next answer changes
- Citations make answers checkable, which is often the whole reason the system is allowed in production
- Per-document access control is possible: filter retrieval by tenant, team or ACL before the model sees anything
- Removing a document removes its influence, which fine-tuning cannot offer
- Far cheaper than retraining, and the corpus can grow to sizes no context window would hold
- Failures are diagnosable: you can inspect which chunks were retrieved

## Disadvantages

- Retrieval quality caps answer quality, and retrieval is the hard, unglamorous part
- Grounding reduces but does not remove hallucination, especially when retrieved chunks are partially relevant
- Retrieved text is untrusted input — prompt injection arrives through your own documents, and worse once an [AI Agent](/pattern/ai-agent) can act on it
- Chunking destroys structure: tables, cross-references and "see section 4" break apart
- Two systems to operate and keep in sync; a stale index silently produces confidently outdated answers
- Latency is embedding + search + generation, and cost grows with every token of retrieved context
- [Evaluation](/concept/llm-evaluation) is genuinely hard — "the answer looks good" does not scale past a demo

## When to use

- Answers must come from a body of text you control, and that text changes
- Users need sources they can click, verify or audit
- Different users may see different subsets of the corpus
- The corpus is far larger than a prompt, and only a small slice is relevant per question
- You need to add or revoke knowledge in minutes rather than in a training run

## When not to use

- The task is about *form* rather than facts — tone, output schema, a domain style. That is
  [fine-tuning](/concept/fine-tuning) territory; see [RAG vs Fine-tuning](/compare/rag-vs-fine-tuning)
- The whole relevant context is small enough to include every time — just include it
- The answer requires aggregation over a whole dataset ("average revenue per region"). That is a
  [SQL](/concept/sql) query, not nearest-neighbour retrieval
- The corpus is unstructured, contradictory or wrong — retrieval will faithfully surface the mess
- Nobody has agreed how the answers will be judged; without an evaluation set you cannot tell an improvement from a regression

## Real-world

RAG is the default shape of internal question-answering over documentation, support
knowledge bases, contracts and code. The [AI RAG](/architecture/ai-rag) architecture shows
the full component layout, and the [AI Chatbot](/system-design/ai-chatbot) system design
shows it arriving in step 3 of five, after streaming and history and before cost controls —
which is the usual order in practice. Small deployments run retrieval inside their existing
database with [pgvector](/technology/pgvector); large multi-tenant corpora move to a
dedicated [vector database](/concept/vector-database) with hybrid retrieval and a reranker.
