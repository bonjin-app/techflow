---
id: llm-evaluation
name: LLM Evaluation
tagline: Turning "the answers seem worse today" into a number a pipeline can block on
category: operations
tags: [AI, Testing, Quality, CI/CD]
difficulty: 4
prerequisites: [programming-fundamentals, llm, ci-cd]
learningPath:
  - programming-fundamentals
  - llm
  - ci-cd
  - llm-evaluation
  - slo
  - observability
related:
  - { to: slo, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: llm, rel: RELATED_TO }
  - { to: rag, rel: RELATED_TO }
  - { to: fine-tuning, rel: RELATED_TO }
  - { to: load-testing, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
  - { to: ai-chatbot, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

LLM evaluation is the practice of measuring whether a system built on an
[LLM](/concept/llm) still does its job after a change. There is no assertion for "this
answer was good", so you build a *golden set* of representative inputs with expected
properties, run it offline on every change, and gate releases on the aggregate score. It
is genuinely hard, partly subjective, and never complete — and a project without it has no
way to tell a prompt improvement from a regression.

## Why it matters

Every input to an LLM feature is mutable: the prompt, the retrieval corpus, the chunking,
the top-k, the model behind the endpoint, the decoding parameters, and the tool set. Any of
them can change answer quality, and none of them makes a test go red. The usual failure is
not dramatic — it is a slow drift discovered from support tickets weeks later.

- **Unit tests do not apply.** Output is free text and non-deterministic; string equality is
  meaningless for most tasks.
- **The provider changes under you.** A hosted model is a moving dependency, so "we changed
  nothing" is never a valid explanation for a behaviour change.
- **Vibes do not scale.** Trying five questions by hand after a prompt edit finds
  catastrophic breakage and misses everything subtler, which is most of it.
- **Retrieval dominates.** In a [RAG](/pattern/rag) system, most bad answers are bad
  retrieval. Evaluating end-to-end answers without separately measuring retrieval tells you
  something broke but not where.

## Visual

```steps
title: Golden set, offline run, regression gate
Collect real inputs | mine production logs and support tickets, not questions you invented
Label what "right" means | expected facts, required citation, forbidden claim, acceptable refusal
Freeze the set [git] | version it with the code so a score is always tied to a commit
Run offline on every change | same inputs, current prompt and retrieval, record every output
Score each case | exact match and rules where possible, a model judge only where necessary
Aggregate and compare | per-category scores against the last known-good baseline
Gate the pipeline [ci-cd] | block the merge on a drop beyond the agreed threshold
Sample production traffic [observability] | score a slice of live answers to catch what the set never covered
Feed failures back | every real-world miss becomes a new labelled case in the set
```

The loop is the point. A golden set is not a milestone you reach; it is a file that grows
every time something goes wrong in production.

## Solutions

Different question types need different scoring, and cheap deterministic checks should
always come first:

- **Deterministic checks.** Valid JSON against a schema, required fields present, numbers
  within range, no PII in output, every cited id actually exists in the retrieved set, latency
  and token budgets respected. These are ordinary tests and they catch a surprising share of
  real regressions.
- **Reference-based scoring.** For extraction, classification and routing there *is* a right
  answer: measure accuracy, precision and recall like any classifier. Convert vague tasks into
  this shape wherever you can — it is the only cheap, stable signal available.
- **Retrieval metrics, measured separately.** Label the correct chunk for each query and
  track recall at k and mean reciprocal rank. When end-to-end quality drops, this tells you
  immediately whether the retriever or the generator moved.
- **Rubric scoring by a model judge.** For open-ended answers, a second model scores against
  an explicit rubric (grounded in sources, answers the question, no invented facts). Useful
  and cheap, but biased: judges favour longer answers, their own family's style, and the first
  option in a pair. Calibrate against a few hundred human labels, keep the rubric in version
  control, and never let the judge be the only gate.
- **Human review where it counts.** A small weekly sample reviewed by someone who knows the
  domain remains the ground truth that keeps automated scores honest.
- **Adversarial cases.** Prompt injection attempts inside retrieved documents, questions the
  corpus cannot answer (the correct answer is a refusal), ambiguous questions, and
  out-of-scope requests. These belong in the golden set from the first week.

## Deep Dive

**Offline and online are different jobs.** Offline evaluation on a frozen set answers "is
this change safe to ship". Online measurement — thumbs up/down, answer-accepted rate, escalation
to a human, retry rate, refusal rate — answers "is it working for real users". Wire both;
the online signal is what fills the offline set.

**Define an SLO in user terms.** "Grounded-answer rate above 90% on the golden set, p95
latency under 4 seconds, refusal rate between 2% and 8%" is something a team can hold
against a release. Bare accuracy numbers with no threshold get admired and ignored — see
[SLO](/concept/slo) for the framing, and [Observability](/concept/observability) for the
traces (prompt tokens, retrieved chunk ids, model, latency) that make a bad answer
reproducible.

**Cost and flakiness are real constraints.** A thousand-case set run on every commit costs
money and minutes. The workable shape is a fast subset on every pull request, the full set
nightly and before release, near-zero temperature during evaluation for stability, and
several seeds on the cases that matter most. Cache model responses keyed by prompt hash so
unchanged cases are free.

**Beware the benchmark trap.** Public leaderboard scores say little about your corpus, your
users' phrasing and your definition of a good answer, and popular sets leak into training
data. Your own two hundred labelled real questions are worth more than any published
benchmark for a shipping decision.

**Small sets lie.** Twenty cases cannot distinguish a two-point improvement from noise.
Report per-category scores with the sample size, look at the failures rather than the mean,
and treat a change inside the noise band as no change.

**It is the prerequisite for the other work.** Choosing between [RAG](/pattern/rag) and
[Fine-tuning](/concept/fine-tuning), raising top-k, switching to a cheaper model class,
enabling a semantic cache — each of these is a guess without a score to compare against. Build
the harness before the optimisations, or the optimisations are unfalsifiable.
