---
id: deep-learning
name: Deep Learning
tagline: Stacked layers trained by gradient descent — why it wins on perception and what it costs
category: ai
tags: [AI, Deep Learning, Neural Networks, GPU]
difficulty: 4
prerequisites: [math-for-ml, machine-learning]
learningPath:
  - math-for-ml
  - machine-learning
  - deep-learning
  - llm
  - fine-tuning
  - model-serving
related:
  - { to: machine-learning, rel: REQUIRES }
  - { to: math-for-ml, rel: REQUIRES }
  - { to: llm, rel: RELATED_TO }
  - { to: fine-tuning, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: model-serving, rel: RELATED_TO }
  - { to: python, rel: USED_WITH }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A neural network is a stack of simple layers — a matrix multiply and a non-linear function,
repeated — whose weights are adjusted by gradient descent until predictions match examples.
Depth lets the network learn its own features instead of being handed engineered ones, which
is why it dominates anything perceptual: text, images, audio, video. The costs are equally
structural: it needs far more data than classical methods, it needs accelerators, it
produces a model nobody can explain, and training runs fail in ways that look like your
code working. In practice almost nobody trains from scratch. You take a pretrained model and
adapt it, which is why [fine-tuning](/concept/fine-tuning) and inference economics matter
more to most engineers than architecture.

## Why it matters

For twenty years the way to do machine vision or language work was to invent features by
hand — edge detectors, colour histograms, n-gram counts, part-of-speech tags — and feed them
to a classifier. The features were the intellectual work, they were domain-specific, and
they did not transfer.

Deep learning replaced that with representation learning: give the network enough raw data
and enough depth and it discovers the features itself, in layers that go from edges to
shapes to objects. This is why one architecture — the transformer — now underlies text,
code, images and audio, and why [embeddings](/concept/embedding) from a pretrained model are
useful for tasks nobody trained them on. It also explains the cost profile: the work moved
from human feature engineering into compute and data, and compute and data have a price
list.

Knowing this is not academic even if you only call APIs. It explains why inference costs
scale with tokens, why batching changes throughput by an order of magnitude, why a GPU is
required, why quantisation lets a model fit on smaller hardware, and why "just fine-tune it"
is sometimes an afternoon and sometimes a quarter.

## Visual

```steps
title: One training step, and the loop it lives in
Forward pass | input becomes a vector, then flows through layers of matrix multiply + non-linearity
Prediction | the last layer outputs scores, usually turned into probabilities by softmax
Loss | one number comparing prediction with the label — cross-entropy for classes
Backward pass | the chain rule attributes that error to every weight (backpropagation)
Optimiser step | each weight moves a little against its gradient; the learning rate sets how far
Repeat over a batch | many examples at once, because a GPU's throughput comes from parallelism
Repeat over epochs | the whole dataset, many times, while the loss curve is watched
Validate | if validation loss rises while training loss falls, it is memorising — stop early
Checkpoint | training runs fail; a run without checkpoints is a run you cannot resume
Export for inference | quantise, compile, batch — [serving](/concept/model-serving) is a separate discipline
```

## Solutions

**Do not train from scratch.** Pretraining a competitive model is a capital expense measured
in thousands of accelerator-hours. The practical ladder, cheapest first: prompt an existing
model; retrieve context for it with [RAG](/pattern/rag); adapt it with parameter-efficient
[fine-tuning](/concept/fine-tuning) on a few thousand examples; train a small task-specific
model on your own data; pretrain. Most products never leave the first two rungs, and
choosing a higher rung than the problem needs is the most common way an AI project runs out
of budget.

**Match the architecture to the input.** Convolutional networks exploit spatial locality and
still fit vision problems on modest hardware. Recurrent networks processed sequences one
step at a time and have largely been displaced. Transformers process a whole sequence in
parallel with attention, which is what made scaling to today's model sizes possible — see
[LLM](/concept/llm). Tabular data remains gradient-boosted trees' territory; using a network
there is usually a worse model that is harder to explain.

**Regularise, because capacity is not the constraint any more.** Dropout, weight decay, data
augmentation and early stopping all trade a little training fit for generalisation. Combined
with a validation set you never train on, they are what keeps a large model from memorising
a small dataset.

**Treat training as a pipeline, not a script.** Version the data, the code and the
hyperparameters together; log every run; checkpoint frequently. A result you cannot reproduce
is not a result, and the reason is usually an unversioned dataset rather than randomness.

**Budget inference before you choose the model.** Latency, memory and cost per request are
properties of the model you pick, and they are hard to change later. Quantisation (8-bit or
4-bit weights), distillation into a smaller student model, and batching are the three levers
that turn a research artefact into something you can afford to run —
[Model Serving](/concept/model-serving) covers the operational side.

## Deep Dive

**Why depth works, in one sentence.** Composing many simple non-linear transformations builds
a hierarchy of representations, and each layer can reuse what the previous one found. The
non-linearity is essential: a stack of linear layers collapses mathematically into a single
linear layer, so without an activation function depth buys nothing.

**Gradient descent is local, and that is fine.** The loss surface has no analytic minimum;
you walk downhill in small steps on random batches. Learning rate is the most important
hyperparameter — too large and the loss oscillates or diverges, too small and training
stalls — and warmup plus decay schedules exist because the right step size changes during
training. Vanishing and exploding gradients in deep stacks are what residual connections and
normalisation layers were introduced to fix.

**Attention, and why context is expensive.** Attention computes, for every position, a
weighted average of the others, with weights from a softmax over dot products. It removed the
sequential bottleneck of recurrence, which is what let training parallelise across a
sequence. The bill is that cost grows roughly with the square of sequence length, which is
the technical reason a longer [context window](/concept/context-window) is expensive and the
economic reason [RAG](/pattern/rag) exists: retrieving three relevant paragraphs beats
paying for a whole document on every request.

**Transfer learning is the real product story.** A model pretrained on a large corpus has
learned general structure; adapting it needs orders of magnitude less data than starting
over. Parameter-efficient methods train a small number of added weights and leave the base
model frozen, so a fine-tune costs hours instead of weeks and can be served alongside others.
This is also why pretrained embeddings are a reasonable default for search and clustering
without any training at all.

**GPUs, memory, and the number that actually limits you.** Training and inference are
dominated by matrix multiplication, which accelerators do in parallel — but the binding
constraint is usually memory bandwidth and capacity, not arithmetic. Weights, activations
and (during training) optimiser state must fit; the optimiser state alone can be several
times the size of the model. That is why batch size is limited, why quantisation helps so
much, and why "will it fit" precedes "how fast is it".

**Failure modes are quiet.** A network that is not learning still runs, still produces
output, still logs a loss. Common causes are a learning rate off by an order of magnitude, a
mislabelled dataset, a preprocessing mismatch between training and inference, or a leaked
test set. The habit that catches most of them: deliberately overfit a tiny sample first — if
the model cannot memorise fifty examples, the bug is in the code, not the data.

**Explainability is genuinely limited.** Attribution methods (saliency maps, integrated
gradients, attention visualisations) suggest what a model attended to; they are not a causal
account of its decision, and attention weights in particular are routinely over-interpreted.
Where a decision must be justifiable — credit, hiring, medicine — that is an argument for a
model class that can justify itself, not for a better post-hoc explanation.
