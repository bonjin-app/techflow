---
id: math-for-ml
name: Maths for Machine Learning
tagline: The linear algebra, probability and statistics you use — and the parts you can skip
category: fundamentals
tags: [AI, Fundamentals, Statistics, Linear Algebra]
difficulty: 3
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - math-for-ml
  - machine-learning
  - deep-learning
  - embedding
  - llm-evaluation
related:
  - { to: machine-learning, rel: RELATED_TO }
  - { to: deep-learning, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: semantic-search, rel: RELATED_TO }
  - { to: llm-evaluation, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: python, rel: USED_WITH }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

You do not need a maths degree to build products on machine learning, and you cannot skip
maths entirely without shipping systems you cannot debug. The useful middle is small:
vectors and dot products (because that is what an
[embedding](/concept/embedding) is and how similarity search works), probability
distributions (because a model outputs one, and temperature reshapes it), and enough
statistics to know whether a difference between two evaluation runs means anything. Matrix
calculus and optimisation theory matter if you are training models; if you are calling and
evaluating them, they are background.

## Why it matters

The gap shows up as a specific class of bug that no framework catches.

A team ships semantic search where cosine similarity is compared across embeddings from two
different models — mathematically meaningless, and the results look plausible enough that
nobody notices for a month. Another compares a new prompt against the old one on 30 examples,
sees 73% versus 68%, and ships a change that is inside the noise. A third normalises features
after splitting the data, leaks the test set's statistics into training, and reports an
accuracy that never survives production.

Each of those is a maths misunderstanding presented as an engineering result. The maths is
also what makes cost and latency legible: knowing that inference is a stack of matrix
multiplies over a batch explains why a GPU helps, why batching helps more, and why doubling
the [context window](/concept/context-window) costs more than twice as much.

## Visual

```steps
title: The maths you meet, in the order you meet it
Vectors and dot products | an [embedding](/concept/embedding) is a vector; similarity is a dot product
Norms and cosine similarity | why you normalise before comparing, and why magnitude is not meaning
Matrix multiplication | one layer of a network, and the operation a GPU exists to do fast
Probability distributions | a model predicts a distribution, not an answer
Softmax and temperature | how scores become probabilities, and how sampling is tuned
Expectation and variance | why one benchmark number is not a result
Sampling and confidence intervals | how many examples an [evaluation](/concept/llm-evaluation) needs
Precision, recall and base rates | why 99% accuracy on a rare event is worthless
Gradients and gradient descent | how training moves weights; enough to read a loss curve
Dimensionality | why high-dimensional distance behaves unlike the 3D intuition
```

## Solutions

**Linear algebra, at the level of geometry.** A vector is a point with a direction; a dot
product measures alignment; a matrix is a transformation of space. That is enough to
understand embeddings, similarity search in a
[vector database](/concept/vector-database), attention as weighted averaging, and
dimensionality reduction. Two rules save real incidents: only compare vectors from the same
model, and normalise before comparing unless you deliberately want magnitude to count.

**Probability, at the level of distributions.** A classifier outputs class probabilities; a
language model outputs a distribution over next tokens. Temperature flattens or sharpens
that distribution, top-p truncates its tail, and both are why the same prompt gives
different answers. Conditional probability and Bayes' rule are the vocabulary for "given
this evidence, how likely is that" — the shape of every retrieval and ranking decision.

**Statistics, at the level of not fooling yourself.** Averages hide distributions, so read
percentiles. Differences need a sample size and an interval before they are results. Base
rates dominate rare-event metrics, which is why precision and recall exist and why accuracy
is the wrong metric for fraud, spam or defect detection. This is the same discipline as
reading [load testing](/concept/load-testing) output, applied to model quality.

**Calculus, at the level of reading a curve.** A gradient is the direction of steepest
increase; training walks downhill on a loss surface in small steps. Knowing that is enough
to interpret a loss that plateaus, oscillates or diverges, and to know what a learning rate
does. Deriving backpropagation by hand is a teaching exercise, not a job requirement.

**Learn it against your own data.** Compute a cosine similarity by hand over two embeddings
from your product, then plot the score distribution for known-good and known-bad pairs. Half
an hour of that teaches more than a term of lectures, because the numbers are yours and you
already know which answers are right.

## Deep Dive

**High-dimensional space breaks 3D intuition.** In 1,536 dimensions, almost all random
vector pairs are close to orthogonal, distances concentrate in a narrow band, and "nearest"
becomes a weaker statement than it sounds. This is why approximate nearest-neighbour indexes
work at all — exactness buys little — and why a similarity threshold tuned on one corpus
does not transfer to another. Always look at the *distribution* of similarity scores before
choosing a cutoff.

**Embeddings are a coordinate system, not a universal language.** Each model defines its own
space. Cosine similarity between vectors from different models, or different versions of the
same model, is noise dressed as a number. Store the model identity alongside every vector,
and treat a model upgrade as a full re-index — the same discipline as a
[schema migration](/concept/schema-migration).

**Evaluation is a sampling problem.** With 50 test cases, a five-point difference is
routinely noise. The honest options are more examples, paired comparisons on the same inputs
(which removes much of the variance), or reporting an interval instead of a point. Fixing
the random seed makes a run reproducible; it does not make it significant. See
[LLM Evaluation](/concept/llm-evaluation).

**Data leakage is the most expensive statistical mistake.** Any statistic computed over the
whole dataset — a mean for normalisation, a vocabulary, a feature derived from a future
value — before splitting into train and test moves information across the boundary. The
model then scores brilliantly in the notebook and badly in production, and the gap is
usually diagnosed as "distribution shift" rather than as the arithmetic error it is.

**Attention is a weighted average, and cost is quadratic.** Each token attends to others
with weights from a softmax over dot products. The consequence for anyone building
applications is budgetary: attention cost grows roughly with the square of sequence length,
so a longer [context window](/concept/context-window) is not free, and stuffing a whole
document into a prompt is a different economic decision from retrieving the three relevant
paragraphs — which is the argument for [RAG](/pattern/rag).

**What to skip until you need it.** Measure theory, convex optimisation proofs, manual
backpropagation derivations and most information theory are researcher tools. If your job is
to build a feature on an existing model — retrieve, prompt, evaluate, serve, monitor — the
list above is genuinely enough, and depth is better added when a specific problem demands it.
