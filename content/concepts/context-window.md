---
id: context-window
name: Context Window
tagline: The fixed token budget every model call must fit — prompt, history and answer
category: ai
tags: [AI, LLM, Cost, Limits]
difficulty: 2
prerequisites: [programming-fundamentals, llm]
learningPath:
  - programming-fundamentals
  - llm
  - context-window
  - rag
  - semantic-cache
related:
  - { to: llm, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: rag, rel: RELATED_TO }
  - { to: semantic-cache, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: ai-chatbot, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

The context window is the maximum number of tokens an [LLM](/concept/llm) can consider in
one call — and the generated answer is spent from the same budget. Everything you want the
model to know must be inside it: the system prompt, tool definitions, retrieved chunks,
conversation history, the user's message, and room for the reply. It is the single
constraint that shapes most design decisions in an LLM application, because it is
simultaneously a correctness limit, a latency limit and a cost limit.

## Why it matters

A context window is not a cache and not memory. It is re-sent, re-read and re-charged on
every call. Three consequences follow:

- **Cost is quadratic in disguise.** Each turn re-sends the whole history, so a 20-turn chat
  sends roughly 20 times its average prompt. Token growth that looks harmless per request is
  the line item that surprises teams at the end of the month.
- **Bigger windows do not mean better answers.** Models attend unevenly across a long
  prefix; material in the middle of a very long context is measurably less influential than
  material at its start or end. Filling a large window with fifty marginal chunks usually
  produces a worse answer than four good ones, more slowly and for more money.
- **Overflow is silent by default.** Naive truncation drops the oldest tokens, which is
  often where the system prompt or the user's original goal lived. The model does not
  report a missing instruction; it just stops following it.

## Visual

```compare
Slice           | Typical size          | Who controls it        | What goes wrong
System prompt   | hundreds of tokens    | you, fixed             | grows by accretion, never audited
Tool definitions| hundreds each         | you, per tool          | every unused tool is paid for on every call
Retrieved chunks| the largest slice     | your retrieval top-k   | k set by feel, chunks overlapping and redundant
Conversation    | grows every turn      | the user               | unbounded unless you summarise or window it
User message    | small, unpredictable  | the user               | a pasted log or PDF blows the budget
Answer          | reserved, not free    | your max-output cap    | forgotten, so long answers truncate mid-sentence
```

```steps
title: What happens when it overflows
The request is rejected | some endpoints simply refuse the call, which is the honest outcome
Or the oldest tokens are dropped | your framework truncates silently and the system prompt goes first
The model stops following rules | the instruction it is ignoring is no longer in the prompt
Citations disappear | retrieved chunks were cut, so the answer falls back on the model's own memory
The answer is cut mid-sentence | no output budget was reserved, so generation hits the ceiling
And nothing logs an error | the only symptom is quality, which is why you must count tokens yourself
```

## Solutions

- **Budget explicitly.** Decide up front: system prompt ≤ X tokens, retrieval ≤ Y, history
  ≤ Z, output reserved = W, and assert that the total fits with headroom. Count with the
  tokeniser at request time and log the breakdown per call — a budget you can see is one you
  can regress-test.
- **Retrieve less, better.** Ranking beats volume: retrieve a wide candidate set, re-rank,
  then pass the few chunks that earn their place — the core of [RAG](/pattern/rag). Deduplicate
  overlapping chunks; two near-identical passages waste half their tokens.
- **Compress history, do not drop it.** Keep the last few turns verbatim, replace older
  turns with a rolling summary, and pin durable facts (the user's account, the chosen
  product, constraints already agreed) in a small structured block that is always included.
- **Move state out of the prompt.** Anything you can look up should be looked up. A tool
  call returning 200 tokens on demand beats 2,000 tokens of "context just in case" per turn.
- **Cache the stable prefix.** Providers commonly charge less for a repeated prefix, so put
  invariant content (system prompt, tool definitions, few-shot examples) first and the
  variable content last. Pair that with an ordinary [Cache](/concept/cache) for identical
  questions and a [Semantic Cache](/pattern/semantic-cache) for near-identical ones.
- **Guard the input.** Clamp pasted content, chunk large uploads through the retrieval path
  instead of the prompt, and enforce [Rate Limiting](/concept/rate-limiting) on tokens as
  well as requests — per-request limits alone do not bound spend.

## Deep Dive

**Input tokens and output tokens are different resources.** Input is processed in one pass
and is comparatively cheap and fast; every output token is another forward pass, so it costs
more per token and dominates latency. "Answer in three sentences" is a performance
optimisation, not just a style preference.

**Long-context models change the economics, not the physics.** A window of hundreds of
thousands of tokens makes some problems tractable — a whole contract, a large diff — but a
full window is still a slow, expensive call, and attention over that much text is still
uneven. Use long context for tasks that genuinely need whole-document reasoning, not as a
substitute for retrieval.

**Truncation strategy is a product decision.** Dropping the oldest turns loses the goal;
dropping the newest loses the question; summarising loses detail. Whatever you choose, make
it visible: telling the user "earlier messages have been summarised" beats quietly
forgetting what they said.

**Everything in the window is untrusted.** Retrieved documents, tool output and pasted text
share the prompt with your instructions, and the model cannot reliably tell them apart. Mark
boundaries clearly, instruct the model to treat retrieved content as data, and — critically —
enforce permissions in code rather than in prose. Prompt injection is a context problem
before it is a model problem.

**Instrument it.** Track prompt tokens, completion tokens and truncation events per route,
alongside latency and cost. A regression traced to "top-k was raised from 4 to 12 last
Tuesday" takes minutes to find with those metrics and weeks without them; see
[LLM Evaluation](/concept/llm-evaluation) for the harness that catches it before release.
