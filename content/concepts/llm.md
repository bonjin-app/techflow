---
id: llm
name: LLM
tagline: A model that predicts the next token — everything else follows from that
category: ai
tags: [AI, LLM, Probabilistic, Cost]
difficulty: 3
prerequisites: [programming-fundamentals, http, backend]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - llm
  - context-window
  - embedding
  - rag
related:
  - { to: context-window, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: rag, rel: RELATED_TO }
  - { to: fine-tuning, rel: RELATED_TO }
  - { to: llm-evaluation, rel: RELATED_TO }
  - { to: rate-limiting, rel: USED_WITH }
  - { to: ai-rag, rel: USED_IN }
  - { to: ai-chatbot, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

A large language model is a function that takes a sequence of tokens and returns a
probability distribution over the next token. Chat, summarisation, extraction and tool
calling are all that one operation run in a loop over a prefix you control. There is no
lookup step at inference time: the model's knowledge is whatever survived compression into
its weights, plus whatever you put into the [Context Window](/concept/context-window) for
this call. Cost and latency scale with tokens, and correctness is never guaranteed.

## Why it matters

An LLM is usually the first component a team adds that is *probabilistic by design*.
Everything around it is ordinary engineering, but four assumptions you normally rely on
are gone:

- **The same input can produce different output.** Sampling is random unless you pin the
  decoding parameters, and even then the hosted model behind an endpoint changes over time.
- **There is no error for "I don't know".** A missing fact gets completed with a plausible
  one, in the same confident register as a correct answer. That is *hallucination*, and it
  is not a defect waiting for a patch — it is what a next-token sampler does when the
  distribution over continuations is flat.
- **Cost is metered per token, not per request.** A prompt that quietly grew from 2k to 20k
  tokens is a 10× bill and a slower response, and it looks like a one-line diff.
- **Everything in the context reads as instruction.** Once retrieved documents, tickets or
  tool output enter the prompt, whoever wrote that text can try to steer the model. Treat
  context as untrusted input, not as data the model merely "reads".

## Visual

```steps
title: What one call actually does
Tokenise | your text becomes integers - words, word pieces, punctuation
Forward pass | one pass over the network scores every token in the vocabulary as a continuation
Sample | temperature and top-p decide how much of that distribution is allowed to win
Append | the chosen token joins the prefix, and the whole pass runs again
Stop | a stop token, your max-output cap, or a full context window ends the loop
```

```steps
title: Why it cannot know your data
Training froze the weights | anything private, internal or newer than the cut-off was never seen
No query runs at inference | a call is arithmetic over weights, not a read from a store
Absence is not an error | the sampler still returns fluent text, so gaps look like answers
So you supply the facts [rag] | retrieve the source text and place it in the prompt
And you make it citable [ai-rag] | an answer that names its source can be checked by a human
```

## How it works

- **Tokens, not words.** Billing, context limits and truncation are all counted in tokens.
  A token is a few characters of common English; identifiers, JSON, non-Latin scripts and
  long numbers cost more per character. Measure with the tokeniser, not `text.length`.
- **Attention over the prefix.** Each token is computed with access to earlier tokens, so
  reading the prompt costs more than linearly in its length. Long contexts are not free
  just because they fit.
- **Decoding parameters.** Temperature and top-p control how far down the distribution
  sampling may reach. Near-zero for extraction, classification and routing; higher only
  where variety is the point. Determinism is a useful goal, not a guarantee.
- **Model classes, not model names.** Choose by measurable property — context length, tokens
  per second, cost per input and output token, multimodality, whether it spends extra
  tokens on intermediate reasoning. Specific versions churn; a small fast model for routing
  plus a larger one for the hard path is a design that survives them.
- **Structured output.** Constraining decoding to a schema makes output parseable, not
  *correct*: validate it in your own code.
- **Tool calling.** The model emits a request to call a function; your code executes it and
  returns the result as more context. The model decides *whether* to call; only your code
  decides what is permitted. See [AI Agent](/pattern/ai-agent) for the loop this creates.

## Deep Dive

**Prompting is context engineering.** The system prompt, the retrieved chunks, the
conversation history and the expected answer all compete for one budget — see
[Context Window](/concept/context-window). Most "prompt engineering" wins in production are
really retrieval and truncation decisions: which 4 chunks instead of 40, and which parts of
the history to summarise.

**Grounding beats remembering.** If an answer must reflect your data, retrieve it and pass
it in: [RAG](/pattern/rag), realised in [AI RAG Application](/architecture/ai-rag). Answer
quality then depends mostly on retrieval quality — a model given the wrong three paragraphs
writes a confident wrong answer, and no prompt polish repairs that.
[Fine-tuning](/concept/fine-tuning) is the other lever, and it moves style and format far
more reliably than facts; [RAG vs Fine-tuning](/compare/rag-vs-fine-tuning) walks the
decision.

**Cost and latency are design inputs.** Estimate tokens per request times requests per day
before you build, then attack the bill structurally: a shorter prompt, a smaller model on
the easy path, an exact-match [Cache](/concept/cache) for repeated questions, a
[Semantic Cache](/pattern/semantic-cache) when near-duplicates dominate, and
[Rate Limiting](/concept/rate-limiting) at the edge so one runaway client cannot spend the
month's budget in an afternoon.

**Failure handling is boring and mandatory.** Provider calls are slow network calls that
fail: explicit timeouts, bounded retries with jitter, a circuit breaker, and a degraded
answer rather than a spinner. Stream tokens so a slow answer still feels alive.

**Measurement is the hard part.** There is no green-or-red assertion for "was this answer
good", so quality regressions ship silently. [LLM Evaluation](/concept/llm-evaluation)
covers golden sets, offline runs and regression gates; pair it with
[Observability](/concept/observability) on tokens, latency, refusal rate and feedback.

**Security.** Never place secrets in a prompt, and never let a model's output authorise an
action — check permissions in code. If untrusted content reaches the context and the model
can call tools, injection becomes a privilege-escalation path: keep tools least-privileged
and confirm anything destructive.
