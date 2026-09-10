---
id: rag-vs-fine-tuning
name: RAG vs Fine-tuning
tagline: Supply knowledge at query time, or teach behaviour into the weights
category: decision
tags: [AI, RAG, Fine-tuning, Decision]
difficulty: 4
subjects: [rag, fine-tuning]
related:
  - { to: llm, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: llm-evaluation, rel: RELATED_TO }
  - { to: ai-rag, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

These are not competing solutions to one problem; they solve different problems and get
compared because both are described as "customising a model".

[RAG](/pattern/rag) changes what the model *knows for this request*: retrieve the relevant
passages and put them in the prompt. Knowledge is external, updated by reindexing a
document, scoped per user, and citable.

[Fine-tuning](/concept/fine-tuning) changes how the model *behaves in general*: continue
training on your examples so the output format, tone, vocabulary or task framing becomes
the default. Behaviour is baked in, cheap at inference time because prompts get shorter,
and unable to cite anything.

So: **RAG for facts that change, fine-tuning for form and behaviour.** In a real system the
answer is usually both, in this order — get retrieval working first, and fine-tune later
only if the remaining failures are about *how* the model answers rather than *what* it
knows. Reaching for fine-tuning to fix wrong facts is the most common and most expensive
mistake in this space.

## Comparison

```compare
Feature              | RAG [rag]                                        | Fine-tuning [fine-tuning]
Changes              | What is in the context for this request            | The model's default behaviour
Updating a fact      | Reindex one document, effective immediately        | Rebuild the dataset and retrain
Removing a fact      | Delete the chunks                                  | Hard — retrain, and verify it is gone
Citations            | Native — you know which passages were used          | None; the source is untraceable
Per-user permissions | Filter retrieval by tenant or ACL before generation | Impossible — weights are shared by all users
Cost profile         | Per request: embedding, search, longer prompts      | Upfront training, then cheaper short prompts
Latency              | Adds retrieval before generation                    | No added latency; often reduces it
Main failure mode    | Wrong passages retrieved → confidently wrong answer  | Overfitting, forgetting, silent drift from the base model
Data needed          | The documents you already have                       | Hundreds to thousands of curated examples
Iteration speed      | Minutes                                             | Hours to days per attempt
```

## Decision

```decision
? Do the answers depend on facts that change, or on documents you control?
  YES -> ? With retrieval working, is the remaining complaint wrong facts or bad wording?
    Wrong facts -> Stay in RAG — fix chunking, hybrid retrieval, reranking [rag]
    Bad wording -> Both, in this order — RAG for the facts, fine-tune the form [fine-tuning]
  NO -> ? Is the problem the shape of the output — format, tone, vocabulary, task framing?
    YES -> ? Do you have hundreds of curated, consistent examples and an evaluation set?
      YES -> Fine-tuning [fine-tuning]
      NO -> Prompt engineering and few-shot examples first [llm]
    NO -> ? Are prompts long, repetitive and expensive at high volume?
      YES -> Fine-tuning [fine-tuning]
      NO -> Neither — fix the prompt and the retrieval you already have [rag]
```

## When RAG

- Answers must reflect the current state of a corpus: documentation, policies, tickets, contracts, code
- Users need citations — for trust, review or audit
- Different users are entitled to different documents, so retrieval must be permission-filtered
- Knowledge must be revocable: deleting a document must remove its influence
- The corpus is far larger than any [context window](/concept/context-window), and only a slice matters per question
- You need to ship this week and iterate daily

## When Fine-tuning

- The model already has the knowledge but presents it wrong: verbose, off-tone, inconsistent structure
- You need reliable adherence to a strict output schema across a very large volume of calls
- Domain language and conventions are unusual enough that few-shot examples in the prompt do not carry them
- Prompt size is the dominant cost driver and a shorter prompt pays for the training run
- A smaller, cheaper model fine-tuned on your task can replace a larger general one
- You have a stable, curated dataset *and* an [evaluation](/concept/llm-evaluation) set to prove the result

## Deep Dive

**Why fine-tuning does not fix wrong facts.** Training adjusts weights towards the
statistical patterns in your examples. Feeding it 500 question–answer pairs teaches the
shape of your answers far more reliably than the content of them; the model happily
produces answers in exactly your house style that are wrong in the details, which is worse
than an obviously wrong answer because it now looks authoritative. Nothing in the process
makes a fact retrievable on demand, and nothing lets you check where an answer came from.

**Why RAG does not fix behaviour.** If the model rambles, ignores your output schema or
uses the wrong register, adding passages does not help — the passages are input, not
instruction. That is a prompt problem first and a fine-tuning problem second.

**They compose, and the order matters.** Build retrieval, then measure. Judge failures on a
real evaluation set and split them into two buckets: *did not have the right information*
(retrieval work — chunking, hybrid search, reranking) and *had it and answered badly*
(prompt work, then possibly fine-tuning). Fine-tuning on top of RAG is a legitimate final
step: the model learns to use retrieved context in your format, so prompts get shorter and
outputs more consistent — while facts still come from the index and stay citable.

**Costs that surprise people.** RAG's cost is per request and grows with the length of the
retrieved context, so a generous top-k is a permanent bill; it is also two systems to
operate, and a stale index produces confident, outdated answers with no error anywhere.
Fine-tuning's cost is mostly human: building and cleaning the dataset, and re-running it
every time the base model you depend on changes underneath you. Both need an evaluation
set, and building that honestly is harder than either technique.

**Prompt injection applies to both.** Once retrieved documents or user content enter the
context, that text is untrusted input. Fine-tuning a model to "follow only system
instructions" reduces the risk; it does not remove it.

## Related

- [RAG](/pattern/rag) — the retrieval pattern in full
- [Fine-tuning](/concept/fine-tuning) — what training on your own examples does and costs
- [LLM Evaluation](/concept/llm-evaluation) — the thing that decides which of these actually helped
- [Semantic Cache](/pattern/semantic-cache) — cutting cost once either approach is in production
- [AI RAG](/architecture/ai-rag) and [AI Chatbot](/system-design/ai-chatbot) — both in a full system
