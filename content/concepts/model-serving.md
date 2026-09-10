---
id: model-serving
name: Model Serving
tagline: Put a model behind an API — batching, concurrency and a latency budget you can hold
category: ai
tags: [AI, Infrastructure, Performance, Scaling]
difficulty: 4
prerequisites: [http, backend, llm]
learningPath:
  - http
  - backend
  - llm
  - model-serving
  - capacity-planning
  - observability
related:
  - { to: llm, rel: REQUIRES }
  - { to: serverless, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: backpressure, rel: RELATED_TO }
  - { to: capacity-planning, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: semantic-cache, rel: RELATED_TO }
  - { to: ai-rag, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Model serving is the engineering between "the model works in a notebook" and "the model
answers an API call under load". The hard parts are not the model: they are throughput
economics (accelerators are only efficient when several requests are computed together),
concurrency (one process, one device, many callers), a latency budget that has to survive
queueing, and autoscaling on an instance that takes minutes to become useful. Very often
the correct answer is to call a hosted API instead, and only self-host when a specific
constraint forces it.

## Why it matters

An accelerator is a throughput device rented by the second. Sent one request at a time it
sits mostly idle, and you pay full price for that idleness; sent a batch it does far more
work per second at slightly higher per-request latency. Every serving decision is some
version of that trade. Get it wrong and you either burn an order of magnitude more money
than necessary or you build a queue that quietly turns a 200 ms model into a 9-second
user-visible response.

Serving is also where the failure modes stop resembling normal web services. Requests have
wildly variable cost, memory is a hard wall rather than a soft one, a new replica is not
usable for minutes, and load shedding matters more than retrying — a retry against a
saturated accelerator makes everything worse.

## Visual

```sequence
title: A request joins a batch on its way to a GPU worker
participants: Client, Gateway [nginx], Queue [message-queue], Scheduler, GPU worker, Metrics [prometheus]
Client -> Gateway: POST /predict, budget 2 s
Gateway -> Queue: enqueue with a deadline, admission check passes
Queue --> Gateway: 202 accepted, queue depth 6
Scheduler -> Queue: pull up to 16 requests or wait 8 ms, whichever first
Queue --> Scheduler: batch of 11 requests
Scheduler -> GPU worker: run the batch as one forward pass
GPU worker --> Scheduler: 11 results in 180 ms
Scheduler --> Gateway: fan the results back out
Gateway --> Client: 200 OK, 210 ms total
Scheduler -> Metrics: queue wait, batch size, device utilisation, tokens per second
Metrics --> Scheduler: queue wait above target, scale up and shed low-priority traffic
```

## How it works

**Batching is the central mechanism.** A scheduler collects requests for a few milliseconds
and runs them as one forward pass. The window is a direct trade: longer windows raise
utilisation and throughput and add waiting time to every request. For generative models the
refinement that matters is **continuous batching** — new requests join the running batch at
the next step instead of waiting for the whole batch to finish, which removes the
head-of-line blocking that a long generation would otherwise cause.

**Concurrency is not the web model.** A device processes one batch at a time, so more
application threads do not create more parallelism; they create a queue. The useful knobs
are the number of replicas, the maximum batch size, the batch window, and a bound on
in-flight requests. Past that bound, reject or shed rather than accept — see
[Backpressure](/concept/backpressure). An unbounded queue in front of an accelerator is the
most common self-inflicted outage in this area.

**Split the latency budget explicitly.** A user-facing budget decomposes into network,
gateway, queue wait, batch wait, compute and post-processing. Only compute is about the
model. When p99 misses the target while the device is at 40% utilisation, the problem is
queueing, and the fix is more replicas or a shorter window — not a faster model.

**GPU or CPU is a question about the model and the shape of the traffic.** Small models —
classifiers, rerankers, most embedding workloads at modest volume — often run acceptably
and far more cheaply on CPU, and they scale like ordinary stateless services. Large
generative models are memory-bandwidth bound and effectively require an accelerator.
Between the two sits a wide band where quantisation, a smaller model or an optimised
runtime moves a workload onto CPU and removes an entire class of operational problems.

**Autoscaling has to cope with a slow cold start.** Pulling a multi-gigabyte image,
downloading weights and loading them onto the device takes minutes. Reactive autoscaling on
CPU utilisation is useless at that timescale. What works: scale on queue depth or queue wait
rather than utilisation, scale up early and down slowly, keep a warm floor of replicas,
bake weights into the image or a fast local volume, and pre-warm before known traffic
peaks. This is also why [Serverless](/concept/serverless) function platforms are a poor fit
for large models and a good fit for small ones.

## Deep Dive

**Two workloads, two sets of metrics.** Online serving cares about p95/p99 latency, queue
wait and time-to-first-token; batch scoring cares only about cost per million items and can
use big batches and spot capacity. Running both on the same replicas is how an offline job
takes down the interactive path: separate the pools, or give online traffic strict priority.

**Memory is a hard wall.** Weights, activations and per-request state must all fit. For
generative models the per-request key/value cache grows with context length, so the real
capacity limit is concurrent requests times their context, and a handful of long-context
requests can crowd out everything else. Admission control that accounts for requested
context length beats any batching tweak.

**Optimise the model before buying hardware.** Quantisation, distillation to a smaller
model, and compiled or fused runtimes routinely deliver multiples of throughput for a small
quality cost that [LLM Evaluation](/concept/llm-evaluation) can quantify. Measure the
quality delta on your own dataset rather than trusting a benchmark; the acceptable loss is a
product decision.

**Cache aggressively.** Identical and near-identical requests are common, so a
[Semantic Cache](/pattern/semantic-cache) can remove a real fraction of traffic before it
reaches a device. Prefix caching of a shared system prompt is the other easy win, and the
practical reason to keep static instructions at the front of a prompt.

**When a hosted API wins.** Almost always at the start, and often permanently: no capacity
to reserve, no weights to load, no on-call for accelerators, and elasticity you cannot
match at small scale. Self-hosting starts to make sense when volume is high and steady
enough that reserved capacity beats per-token pricing, when data residency or an air-gapped
environment forbids sending data out, when latency requires the model next to your service,
when you run a fine-tuned or otherwise custom model, or when you need version stability
that a vendor will not promise. Treat it as a build-versus-buy decision with a computable
crossover, and revisit it — the crossover moves.

**Observability is model-specific.** Beyond the usual RED metrics, track queue wait, batch
size, device utilisation, memory headroom, tokens per second, and rejection and truncation
rates. Log the input length too: a latency outlier here is nearly always an unusually large
request rather than a slow machine.
