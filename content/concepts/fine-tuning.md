---
id: fine-tuning
name: Fine-tuning
tagline: Training an existing model further on your examples to change how it behaves
category: ai
tags: [AI, LLM, Training, MLOps]
difficulty: 4
prerequisites: [programming-fundamentals, llm, llm-evaluation]
learningPath:
  - programming-fundamentals
  - llm
  - llm-evaluation
  - fine-tuning
  - rag
related:
  - { to: llm, rel: RELATED_TO }
  - { to: rag, rel: ALTERNATIVE_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: rag-vs-fine-tuning, rel: RELATED_TO }
  - { to: context-window, rel: RELATED_TO }
  - { to: ai-rag, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Fine-tuning continues training a pre-trained [LLM](/concept/llm) on a dataset of your own
examples, adjusting its weights so it behaves the way your examples do. It is the right
tool for changing *form* — output format, tone, a narrow classification task, following
your conventions without being told each time — and the wrong tool for teaching *facts*,
because facts change and weights do not. Most teams who think they need fine-tuning need
better retrieval, and should try [RAG](/pattern/rag) first.

## Why it matters

Fine-tuning is the one option in the LLM toolbox that creates a durable artefact you own
and must maintain. That is both its value and its cost.

It genuinely helps when:

- **The task is narrow and repetitive.** Classification, extraction into a fixed schema,
  routing, rewriting into a house style. A small fine-tuned model can match a much larger
  prompted one on such tasks at a fraction of the cost and latency.
- **The instructions have grown huge.** Twenty rules and eight examples in every prompt is
  tokens paid on every call; a fine-tune can absorb them and shrink the
  [Context Window](/concept/context-window) budget dramatically.
- **Style must be exact.** Legal phrasing, a documentation voice, a strict output shape that
  prompting only mostly achieves.

It is the wrong tool when:

- **The knowledge changes.** Every document edit would require a new training run, and the
  model still cannot cite a source. Retrieve instead.
- **You cannot measure quality.** Without the harness from
  [LLM Evaluation](/concept/llm-evaluation) you cannot tell whether the fine-tune helped,
  and you will not notice the capabilities it quietly lost.
- **You have a few dozen examples.** Data volume and, more importantly, data *consistency*
  are the binding constraints. Inconsistent labels teach inconsistency.
- **It is week one.** Prompting, then retrieval, then fine-tuning — in that order. Skipping
  ahead buys a maintenance obligation before you know what the task actually is.

## Visual

```steps
title: The fine-tuning loop
Define the task narrowly | one input shape, one output shape, written down as a spec
Collect examples | from production logs, human review or an existing labelled dataset
Clean and split | deduplicate, fix inconsistent labels, hold back a test set the training never sees
Hold the baseline [llm-evaluation] | score the prompted model on the same test set first
Train | usually a low-rank adapter rather than every weight, for a few epochs at a small learning rate
Evaluate against the baseline | the same golden set, plus checks for capabilities that may have degraded
Decide | ship only on a real win; a tie means keep the simpler prompted version
Deploy behind a flag [feature-flag] | route a slice of traffic, watch quality and latency in production
Watch for drift [observability] | inputs shift over time, so plan the next data collection round now
```

The loop never runs once. Every model upgrade, schema change and drift in user phrasing
sends you around it again — which is precisely the cost to weigh before starting.

## How it works

- **Supervised fine-tuning (SFT)** is the common case: a file of input/output pairs trained
  with the same next-token objective as pre-training, teaching the mapping you want.
- **Parameter-efficient methods** (low-rank adapters and similar) train a small set of extra
  weights and leave the base model frozen. Cheap, fast, artefacts of megabytes rather than
  gigabytes, swappable per tenant or task — and what almost everyone should use. Full
  fine-tuning of every weight is a platform-team activity.
- **Preference tuning** optimises against pairwise human judgements ("this answer is better
  than that one") rather than single correct outputs. It shapes behaviour where "correct" is
  a matter of degree, and needs considerably more data and care.
- **Distillation** trains a small model on a large model's outputs for one task — the standard
  route to a cheap production model once a large model has proven the task is doable. Check
  the licence terms of any model whose outputs you train on.
- **The knobs.** Learning rate, epochs and dataset size. Too many epochs on a small set
  memorises it: the test score plateaus while the model turns brittle and repetitive. Watch
  the held-out loss, not the training loss.

## Deep Dive

**Data quality is the whole game.** A few hundred consistent, carefully reviewed examples
beat tens of thousands of scraped ones. The commonest cause of a disappointing fine-tune is
contradictory labels — two examples with different outputs for equivalent inputs teach the
model to be inconsistent. Deduplicate aggressively, and keep near-duplicates out of the test
split, or your score measures memorisation.

**Fine-tuning and RAG are not rivals.** The productive combination is a fine-tune that fixes
format and behaviour plus retrieval that supplies current facts. [RAG vs
Fine-tuning](/compare/rag-vs-fine-tuning) works through the decision case by case; the short
version is that *what is true right now* belongs to retrieval and *how it should be said*
belongs to training.

**Catastrophic forgetting is real.** Training hard on one narrow task degrades unrelated
abilities — instruction following, other languages, refusing unsafe requests. Keep a
regression set of general capabilities and run it alongside your task metrics.

**Every fine-tune is a version you must carry.** When the base model is deprecated or
improved, your adapter does not come along: you re-run the loop, re-evaluate and re-ship.
Store the dataset, the split, the hyperparameters and the evaluation results with the
artefact, or you cannot reproduce a model you depend on.

**Cost lands in the wrong place.** Training is a one-off bill that is easy to approve;
inference on a custom model is the recurring one, and hosting a private model can cost more
per token than a shared endpoint unless throughput is high. Compare total cost per thousand
requests, including idle capacity.

**Security and privacy.** Training data ends up inside the weights, so confidential examples
can surface later from an unrelated prompt, and there is no delete path short of retraining.
Strip identifiers before training, keep provenance for every example, and never fine-tune on
data you would not be allowed to disclose.
