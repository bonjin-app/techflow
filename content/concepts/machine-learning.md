---
id: machine-learning
name: Machine Learning Fundamentals
tagline: Learning a function from data instead of writing the rules, and everything that costs you
category: ai
tags: [AI, Machine Learning, Data, Fundamentals]
difficulty: 3
prerequisites: [programming-fundamentals, math-for-ml, sql]
learningPath:
  - programming-fundamentals
  - math-for-ml
  - machine-learning
  - deep-learning
  - model-serving
  - llm-evaluation
related:
  - { to: deep-learning, rel: RELATED_TO }
  - { to: math-for-ml, rel: REQUIRES }
  - { to: model-serving, rel: RELATED_TO }
  - { to: data-quality, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: llm, rel: RELATED_TO }
  - { to: python, rel: USED_WITH }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Machine learning is what you use when the rules are too numerous or too fuzzy to write
down: instead of coding the logic, you show a model labelled examples and it fits a
function that generalises to new ones. The engineering consequences matter more than the
algorithms. A model is only as good as the data and the labels behind it, its accuracy on
your laptop is not its accuracy in production, it decays as the world changes, and it is
never finished — an ML feature is a pipeline plus a deployment plus a monitor, not a
notebook. And for structured, tabular data, gradient-boosted trees still beat neural
networks more often than the discourse suggests.

## Why it matters

The decision to use machine learning is a decision to take on a permanent operational
liability, and it should be made deliberately.

Rules are debuggable: you can read them, test them, and explain a decision to a customer or
an auditor. A model gives you a number and no reason. Rules fail loudly; models fail
quietly, drifting from 94% to 78% over a quarter while every dashboard stays green because
nothing threw an exception. Rules do not need a labelled dataset, a training pipeline, a
feature store or a retraining schedule.

So the honest first question is whether a handful of rules or a SQL query would do. Plenty
of shipped "ML features" are a threshold on one column, wrapped in infrastructure. The cases
where ML genuinely earns its cost are the ones where the rule list would be thousands long
and change constantly: ranking, recommendation, fraud, forecasting, extraction from messy
text, anything perceptual.

## Visual

```steps
title: The lifecycle, where most of the effort actually goes
Frame the problem | what decision changes because of a prediction? if none, stop here
Establish a baseline | the dumbest rule or "predict the most common class" — beat this or stop
Collect and label data | usually the longest and most expensive step, and rarely mentioned
Split before you touch anything | train / validation / test, split by time or entity, never at random on time series
Engineer features | joins, aggregates, encodings — where domain knowledge lives
Train a simple model | logistic regression or gradient boosting first; it is often the final answer
Evaluate against the baseline | with a metric tied to the decision, not to accuracy by default
Ship behind a flag | shadow mode first: predict, log, do not act
Monitor inputs and outputs | [drift](/concept/data-quality) in features precedes drift in quality
Retrain on a schedule | with the same pipeline that trained it, or the two diverge
```

## Solutions

**Learn the three shapes.** *Supervised* learning maps inputs to known labels —
classification and regression — and is nearly all production ML. *Unsupervised* learning
finds structure without labels: clustering, anomaly detection, and the
[embeddings](/concept/embedding) that power semantic search. *Reinforcement* learning
optimises a policy through feedback, and is rare outside specific domains. Knowing which
you are doing determines what data you need and what metric can even be computed.

**Split the data honestly, then leave the test set alone.** Train to fit, validate to choose,
test once to report. Split by time when predicting the future and by entity when rows share
a user or an account, otherwise the same information appears on both sides and your score is
fiction. Anything computed over the whole dataset — a normalising mean, a target encoding —
must be computed inside the training fold only.

**Pick the metric from the decision.** Accuracy is misleading whenever classes are
imbalanced: 99% accuracy on a 1%-fraud dataset is achieved by predicting "no fraud" forever.
Precision is what a false positive costs you, recall is what a miss costs, and the
threshold between them is a product decision, not a modelling one. For ranking, use rank
metrics; for forecasts, use error in the units the business uses.

**Start with the simple model, and mean it.** Logistic regression gives you a baseline, an
interpretable coefficient per feature and a fast iteration loop. Gradient-boosted trees
(XGBoost, LightGBM) handle mixed types, missing values and non-linearity with little tuning
and remain the strongest default for tabular data. Reach for
[deep learning](/concept/deep-learning) when the input is perceptual — text, images, audio —
or when you have far more data than features.

**Treat data quality as the main lever.** More and cleaner labels beat a better architecture
in almost every real project. Label disagreement between annotators caps how good the model
can be, so measure it. Class imbalance, duplicated rows and silently changed upstream
semantics are all [data quality](/concept/data-quality) problems that surface as model
problems.

**Ship in shadow mode first.** Serve predictions, log them next to what actually happened,
and act on nothing. A week of that reveals feature pipeline mismatches, latency surprises
and label delays that no offline evaluation shows. Then enable it behind a
[feature flag](/pattern/feature-flag) for a fraction of traffic.

## Deep Dive

**Overfitting is memorising instead of generalising.** A model with enough capacity will fit
noise in the training set and score worse on unseen data. The symptoms are a training score
far above the validation score and a gap that widens with training. The tools are
regularisation, fewer parameters, more data, early stopping and cross-validation. The mirror
failure — underfitting — looks like both scores being equally bad, which is why you always
read the two together.

**Train/serve skew is the classic production bug.** The training pipeline computes a feature
one way (a batch SQL aggregate over a day of history) and the serving path computes it
another (a live query with a different time window or a different null handling). The model
receives inputs it was never trained on, and quality drops for reasons no offline test can
reproduce. The structural fix is one code path for feature computation in both places — the
reason feature stores exist.

**Drift comes in two kinds.** Feature drift is the input distribution moving: a new device
type, a changed currency, an upstream default. Concept drift is the relationship itself
changing: what fraud looks like after fraudsters adapt. Monitor input distributions per
feature, monitor the output score distribution, and only then monitor accuracy — because
labels usually arrive days or weeks late, so distribution monitoring is the early warning
you actually get.

**Labels are the hard part, and they are political.** Who defines the label defines the
model. A "spam" label from a moderation team and one from user reports produce different
systems. Delayed labels (did this loan default? did this user churn?) mean you cannot measure
today's model today. Weak supervision, heuristic labelling and active learning are ways to
buy labels more cheaply, all of them trading precision for volume.

**Interpretability is a requirement in some domains.** Credit, hiring, insurance and medicine
often need a reason, sometimes legally. Linear models and shallow trees are explainable by
construction; post-hoc tools (feature importance, SHAP) approximate explanations for
everything else and can mislead when features are correlated. If you owe a customer an
explanation, choose a model that can give one rather than an approximation of one.

**Where LLMs changed the calculus, and where they did not.** Large language models removed the
need to train a model for many text tasks: classification, extraction and summarisation are
often a prompt away, which collapses weeks of labelling into an afternoon — see
[LLM](/concept/llm) and [Prompt Engineering](/concept/prompt-engineering). They did not
change tabular prediction, ranking at scale, latency-critical scoring or anything where a
per-request cost of cents is prohibitive. The discipline transfers regardless: baseline,
split, metric, evaluation, monitoring. [LLM Evaluation](/concept/llm-evaluation) is this
section's checklist applied to a model whose output is text.
