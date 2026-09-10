---
id: semantic-cache
name: Semantic Cache
tagline: Reuse a stored answer when the new question is close enough in embedding space
category: data
tags: [AI, Caching, Cost, Performance]
difficulty: 3
prerequisites: [cache, embedding, vector-database]
learningPath:
  - cache
  - cache-aside
  - embedding
  - semantic-search
  - semantic-cache
related:
  - { to: cache-aside, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: context-window, rel: SOLVES }
  - { to: rag, rel: USED_WITH }
  - { to: ai-chatbot, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## Problem

Model calls are the expensive part of an AI feature: seconds of latency and a bill that
scales with every token in and out. And the questions repeat. On an internal assistant the
same handful of topics dominate — "how do I reset my password", "what is the refund
window" — asked hundreds of times a day in slightly different words.

An ordinary [Cache Aside](/pattern/cache-aside) keyed on the exact question barely helps.
"What is the refund window?" and "How long do I have to ask for a refund?" hash to
different keys, so both pay full price. Normalising whitespace and case moves the hit rate
a little; it does not solve the actual problem, which is that natural language has
unlimited ways to ask the same thing.

## Solution

Key the cache on **meaning** instead of on bytes. Embed the incoming question, search the
cache for the nearest stored question, and if its similarity is above a threshold, return
the stored answer without calling the model. Otherwise run the normal path and store the
new question vector together with its answer.

It is a variant of Cache Aside, not an alternative to it: same lazy fill, same TTL, same
"the application owns both lookups". Only the key comparison changes — from equality to
nearest-neighbour above a threshold.

```sequence
title: Lookup — hit above the threshold, otherwise the full path
participants: API [backend], Embedder [embedding], Cache [vector-database], LLM [llm]
API -> Embedder: embed the question
Embedder --> API: query vector
API -> Cache: nearest stored question (scoped to tenant + prompt version)
Cache --> API: best match, similarity 0.94
API -> API: 0.94 >= threshold 0.93 → HIT
API --> API: return stored answer (no model call)
API -> Cache: nearest for a different question → 0.81
API -> API: 0.81 < 0.93 → MISS
API -> LLM: prompt (with retrieved context if this is RAG)
LLM --> API: answer
API -> Cache: store question vector + answer, TTL 1h
```

## How it works

```steps
title: Cache path
Embed the incoming question [embedding] | the same model that embedded the stored questions
Nearest-neighbour search [vector-database] | filtered by tenant, locale and prompt version
Above threshold → return the stored answer | record it as a semantic hit, with the matched question
Below threshold → call the model [llm] | the ordinary path, RAG included
Store vector + answer with a TTL [ttl] | short, because your documents change
```

The cache entry must be scoped by everything that changes the answer, not just the
question: tenant, user permissions, locale, model configuration and prompt version. A
semantic cache that ignores the permission scope will happily serve one tenant's answer to
another — a data leak dressed as a cache hit.

```ts
async function ask(q: string, ctx: Ctx) {
  const v = await embed(q);
  const [best] = await cache.search(v, {
    filter: { tenant: ctx.tenant, promptVersion: PROMPT_V, locale: ctx.locale },
    k: 1,
  });
  if (best && best.score >= THRESHOLD) {
    metrics.hit(best.question, q, best.score);   // log BOTH questions — you will need them
    return best.answer;
  }
  const answer = await generate(q, ctx);
  await cache.upsert({ vector: v, question: q, answer, ttl: 3600, ...ctx.scope });
  return answer;
}
```

**The threshold is a correctness knob, not a performance knob.** Two questions can sit
very close in embedding space and mean different things — "can I cancel my subscription"
and "can I cancel my order", "is the API rate limited" and "is the API rate limit
configurable", or anything that differs by a negation, a date or a number. Embeddings
capture topic far better than they capture the specific ask, so a threshold loose enough
to give an impressive hit rate is also loose enough to answer the wrong question
confidently, with no error anywhere in your logs.

Practical consequences: pick the threshold from a labelled set of real question pairs
rather than by feel, log every hit with both questions so false hits are auditable, keep
the cache off anything where a wrong answer is expensive, and treat a sudden jump in hit
rate as a regression to investigate rather than a win.

## Advantages

- Cuts cost and latency on the questions users actually repeat, which are a large share of traffic
- Absorbs traffic spikes: a viral question is answered once and served from memory afterwards
- Reduces load on the whole downstream chain — retrieval, reranking and generation all skipped
- Sits in front of any model or pipeline; nothing downstream needs to change
- Doubles as a source of truth about what users ask, since the stored questions cluster naturally

## Disadvantages

- False hits: near-identical embeddings with different meanings return a confidently wrong answer
- Threshold tuning trades correctness against hit rate, and needs labelled data to do honestly
- Every lookup costs an embedding call plus a vector search, so a low hit rate makes things slower and more expensive
- Staleness is worse than in a normal cache — an answer grounded in a document that has since changed stays cached
- Scope bugs become leaks: forgetting the tenant or permission filter serves other people's answers
- Personalised or conversational answers are usually not cacheable at all, because the answer depends on history
- Hits break streaming's illusion — the cached answer arrives at once, which is a UX difference to decide on deliberately

## When to use

- High volume of paraphrased but genuinely equivalent questions (FAQ-shaped traffic)
- Answers depend only on a shared corpus, not on the individual user or the conversation so far
- A wrong answer is inconvenient rather than harmful, and there is a visible way to report it
- You can measure the false-hit rate on real traffic and are willing to keep measuring it
- Cost or latency is a real constraint today — not a hypothetical one

## When not to use

- Correctness-critical or regulated answers: medical, legal, financial, billing amounts
- Answers that depend on the user, their permissions, their data or the conversation history
- Questions that hinge on small differences — numbers, dates, negations, entity names
- Low or highly diverse question volume, where the cache never earns its extra hop
- Rapidly changing source documents, unless the TTL is short enough to make hits rare anyway
- You have no evaluation set — start with exact-match caching, which is boring and safe

## Real-world

Semantic caching typically appears once an assistant's model bill becomes visible, sitting
in front of a [RAG](/pattern/rag) pipeline with the question vectors in the same store as
the document vectors and the answers in [Redis](/technology/redis). The
[AI RAG](/architecture/ai-rag) architecture starts with exact-match caching for this
reason, and the [AI Chatbot](/system-design/ai-chatbot) system design introduces the
semantic variant only in step 4, next to per-tenant rate limits and token budgets — after
there is an evaluation set that can detect the false hits it will introduce.
