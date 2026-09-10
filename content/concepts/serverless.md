---
id: serverless
name: Serverless
tagline: Managed execution that scales to zero, in exchange for limits you do not control
category: infrastructure
tags: [Infrastructure, Cloud, Operations, Scaling]
difficulty: 3
prerequisites: [http, backend, api-gateway]
learningPath:
  - http
  - backend
  - docker
  - serverless
  - kubernetes
related:
  - { to: docker, rel: ALTERNATIVE_TO }
  - { to: kubernetes, rel: ALTERNATIVE_TO }
  - { to: api-gateway, rel: USED_WITH }
  - { to: message-queue, rel: USED_WITH }
  - { to: connection-pooling, rel: RELATED_TO }
  - { to: observability, rel: REQUIRES }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: graceful-shutdown, rel: RELATED_TO }
  - { to: file-storage-service, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

Serverless means a provider owns the execution environment: you hand over a function or a
container image plus a trigger, and the platform decides when to start instances, how many
to run, and when to destroy them. Servers still exist — you simply have no host to patch,
no capacity to reserve and no process to keep alive. The bill follows requests rather than
hours, idle costs nothing, and in return you accept cold starts, hard execution limits, a
weaker local development story and real coupling to one platform's model.

## Why it matters

Most of the work in running a service has nothing to do with the service: node pools, OS
patches, autoscaling rules, rolling restarts, an on-call rotation for the platform itself.
For a team whose product is not infrastructure, that work is pure overhead, and it is
overhead with a fixed cost — the same effort whether the service handles ten requests a day
or ten thousand.

Serverless removes that fixed cost and replaces it with a constraint: your code must fit a
shape the platform can start, stop and duplicate at will. That constraint is the whole
subject. It is cheap and obvious for a webhook handler or an image resizer, and expensive
and subtle for a long-running job, a WebSocket server or anything that assumed a warm
process with local state.

## Visual

```sequence
title: Cold start, then a warm invocation
participants: Client, Gateway [api-gateway], Platform, Sandbox, Handler [nodejs], DB [postgresql]
Client -> Gateway: POST /thumbnails, first request in hours
Gateway -> Platform: invoke, no warm instance exists
Platform -> Sandbox: allocate compute, unpack the image or bundle
Sandbox -> Handler: start the runtime, run top-level init
Handler -> DB: open a connection
DB --> Handler: connected
Handler --> Platform: ready after 900 ms
Platform -> Handler: deliver the event
Handler --> Client: 200 OK, 1.2 s end to end
Client -> Gateway: POST /thumbnails, 30 s later
Gateway -> Platform: invoke
Platform -> Handler: reuse the warm sandbox, skip init entirely
Handler --> Client: 200 OK, 40 ms end to end
```

## How it works

**A trigger, not a port.** You do not listen on a socket; you register a handler against an
event — an HTTP request through an [API Gateway](/concept/api-gateway), a message on a
queue, an object written to storage, a schedule. The platform is the thing that receives
the event and finds or creates an instance to run it.

**Concurrency is instance-per-request, by default.** Most function platforms send one
request to one instance at a time and start another instance for the next concurrent
request. Scaling from zero to a thousand instances in seconds is the headline feature and
the biggest operational trap: a thousand instances each opening a database connection will
exhaust the pool of a database that was sized for twenty application servers. This is why
[connection pooling](/concept/connection-pooling) moves to an external proxy in serverless
architectures.

**The instance lifecycle is yours to exploit.** Code outside the handler runs once per
instance, so clients, model loads and config parsing belong there; code inside runs per
request. But the instance may be frozen between invocations and destroyed without warning,
so background work started after the response often never finishes, and in-process caches
have an unpredictable hit rate.

**Limits are contractual, not advisory.** Maximum request duration, memory ceiling, payload
size, ephemeral disk, concurrent instances per account, and how long a response may stream.
Exceeding one is not a slow request; it is a killed invocation. Design starts by checking
your longest realistic operation against the platform's timeout.

**Managed containers sit in the middle.** A serverless container runtime takes the same
[Docker](/technology/docker) image you would deploy to [Kubernetes](/technology/kubernetes),
allows several concurrent requests per instance, and still scales to zero. It keeps the
build and the local loop portable, which makes it the pragmatic default when the workload
is a normal HTTP service rather than an event handler.

## Deep Dive

**Cold starts, honestly.** The cost is unpacking the image or bundle, starting the runtime
and running your initialisation. Interpreted runtimes with small dependency graphs start in
tens of milliseconds; a JVM with a heavy framework and a large dependency tree can take
several seconds. Mitigations exist — trim dependencies, initialise lazily, keep a minimum
number of instances warm — but the last one reintroduces exactly the idle cost you came to
avoid. If your p99 budget on a customer-facing path is 100 ms, treat cold starts as a
design constraint, not a tuning problem.

**Cost shape, not cost level.** Per-request billing means the cost curve passes through the
origin and rises linearly with traffic. Reserved capacity means a flat cost that you
amortise by keeping utilisation high. Serverless wins decisively when traffic is bursty or
low, loses at sustained high throughput, and the crossover is computable from your own
traffic curve — usually somewhere in the low hundreds of requests per second. Do not forget
the invisible line item on the other side: the salary cost of the people operating the
cluster.

**Local reproduction is genuinely worse.** The platform contributes routing, authentication,
retry semantics, event shapes, per-instance concurrency and identity-based permissions.
Emulators approximate a subset. Teams end up testing against a real deployed environment
per developer, which is workable but slower than `docker compose up`, and it makes fast
[CI/CD](/concept/ci-cd) feedback something you have to engineer rather than something you
get.

**Observability is the part people underestimate.** There is no host to log into, no process
to attach a profiler to, and instances vanish. Structured logs, distributed tracing across
the platform boundary and per-invocation metrics are not optional extras; without them a
latency problem in a function is nearly undebuggable. See
[Observability](/concept/observability).

**Vendor coupling is a spectrum.** Business logic in a plain function is portable; the glue
around it — event shapes, IAM, queue semantics, the deployment descriptor, per-service
quotas — is not. Keep handlers thin and push logic into framework-free modules, and a move
becomes a rewrite of the edges rather than of the system. A container image is the strongest
portability hedge available inside the model.

**Retries and idempotency are part of the contract.** Event sources redeliver on failure,
sometimes more than once even on success. Any handler with a side effect needs
[Idempotency](/concept/idempotency) and a dead-letter path, or a transient error becomes
duplicated work.
