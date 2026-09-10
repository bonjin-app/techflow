---
id: serverless-vs-containers
name: Serverless vs Containers
tagline: Should this workload be a function on a managed runtime, or an image you run yourself?
category: decision
tags: [Infrastructure, Serverless, Containers, Cost, Decision]
difficulty: 3
subjects: [serverless, docker]
related:
  - { to: kubernetes-vs-serverless, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: capacity-planning, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

This is the question you answer before you choose an orchestrator: is this workload a
**function** handed to a managed runtime, or a **container image** you build, run and keep
alive? [Serverless](/concept/serverless) gives you scale to zero, no host to patch and a
bill that tracks requests — in exchange for cold starts, a hard execution ceiling, a weaker
local loop and coupling to one platform's event model. A [Docker](/technology/docker)
image gives you a process you fully control, any runtime duration, any protocol, a
reproducible local environment and portability — in exchange for capacity you must
provision and keep healthy. Neither wins in general; the workload's traffic shape and
duration decide. Once you have chosen containers, the follow-up question of *who runs them*
is [Kubernetes vs Serverless](/compare/kubernetes-vs-serverless).

## Comparison

```compare
Dimension            | Serverless functions [serverless]                  | Containers you run [docker]
Unit you ship        | A handler plus a trigger                           | An image with its own process and entrypoint
Startup              | Cold start of 50 ms to several seconds when idle   | Started once; warm for as long as it runs
Execution ceiling    | Hard timeout per invocation, often minutes         | None — hours-long jobs and long-lived sockets are fine
Memory and CPU       | Chosen per function, capped by the platform        | Whatever the host or node offers, including GPUs
Concurrency model    | Roughly one request per instance, scaled by count  | Many concurrent requests in one process, tuned by you
Cost shape           | Per request and per GB-second; idle is free        | Per hour of reserved capacity, idle included
Scaling              | Zero to thousands in seconds, automatic           | You size the pool and the autoscaler; nodes must exist first
Local development    | Emulators approximate the platform's edges         | The same image runs identically on a laptop
Portability          | Handler is portable, the glue around it is not     | The image runs on any host, cluster or managed runtime
Observability        | Platform logs and metrics; deep debugging is harder| Attach, profile, exec — the normal toolbox applies
Operational load     | No hosts, no upgrades, no capacity planning        | Patching, base images, capacity, health checks, on-call
```

## Decision

```decision
? Can every request finish inside a platform timeout, with no long-lived connection?
  NO -> Containers [docker]
  YES -> ? Is traffic bursty, low-volume or event-driven — webhooks, uploads, cron?
    YES -> ? Does a cold start of hundreds of milliseconds break your latency budget?
      YES -> ? Is a warm floor of instances cheaper than running your own capacity?
        YES -> Serverless [serverless]
        NO -> Containers [docker]
      NO -> Serverless [serverless]
    NO -> ? Do you need something the platform will not give you — GPUs, custom networking, large in-process state?
      YES -> Containers [docker]
      NO -> ? Is utilisation high and steady enough that reserved capacity beats per-request billing?
        YES -> Containers [docker]
        NO -> Serverless [serverless]
```

## When serverless

- **The work is a reaction, not a service.** A webhook receiver, an image thumbnailer on
  upload, a nightly report, a queue consumer. The platform's retries, dead-letter handling
  and concurrency controls are code you would otherwise write.
- **Traffic is spiky or tiny.** Internal tools, admin endpoints, seasonal load. Scaling to
  zero means an idle feature costs nothing, which changes what is worth building at all.
- **There is nobody to run infrastructure.** No node pool, no base-image CVE queue, no
  capacity plan. For a small team this is usually the dominant term, well ahead of unit cost.
- **The workload already fits the shape.** Stateless, short, request/response, with state in
  managed services. Fighting the shape is where serverless projects go wrong.
- **You want per-function blast radius.** One handler's runaway concurrency can be capped
  without touching anything else.

## When containers

- **Duration or protocol exceeds the model.** WebSocket and gRPC streams, batch jobs
  measured in hours, video encoding, anything holding a socket open. The timeout is a wall,
  not a tuning parameter.
- **Latency must be predictable.** A p99 budget in the tens of milliseconds on a
  customer-facing path does not survive cold starts, and the mitigations for cold starts
  are just reserved capacity with extra steps.
- **The process needs to keep things.** A large in-memory cache, a loaded model, a warm
  connection pool, local scratch disk. Instance-per-request throws all of it away
  repeatedly, and hundreds of instances opening database connections is its own outage.
- **Utilisation is steady and high.** Well-packed nodes at 60–70% are usually several times
  cheaper per request than per-invocation billing, and the crossover is computable from
  your own traffic curve.
- **Portability or reproducibility is a requirement.** Regulated or on-premise deployment,
  a deliberate exit plan, or simply a team that needs `docker compose up` to behave like
  production.

## Deep Dive

**The two are not opposites.** A managed container runtime takes the same image, runs
several concurrent requests per instance, scales to zero and bills per request. It is the
default answer for a normal HTTP service that wants serverless economics without giving up
the image, the local loop or the ability to move. Most "serverless versus containers"
arguments dissolve once that middle option is on the table — you keep the container as the
artifact and buy the operations model separately.

**Cost is about utilisation, not price lists.** Per-request billing traces your traffic
curve exactly; reserved capacity is flat and rewards packing. Below roughly single-digit
requests per second, or for anything quiet most of the day, serverless is cheaper by a wide
margin. At sustained throughput containers win, and the gap grows. Do the arithmetic with
your own numbers, and include the engineering time on the container side —
[capacity planning](/concept/capacity-planning) is a real recurring cost that never appears
on a cloud bill.

**Local development is the quiet decider.** A container is the same artifact everywhere,
which makes tests, CI and onboarding straightforward. Serverless pushes behaviour into the
platform — routing, auth, event shapes, retries, permissions — so faithful local testing
becomes an engineering project, and teams end up with a deployed environment per developer.
That is workable, but it slows the feedback loop that [CI/CD](/concept/ci-cd) exists to
tighten.

**Observability diverges more than people expect.** With a container you can exec in,
profile, and keep a process alive to inspect. With functions there is no host, instances
vanish, and traces often stop at the platform boundary — so structured logs, per-invocation
metrics and end-to-end tracing must be designed in from the start rather than added when
something goes wrong. See [Observability](/concept/observability).

**Migration is easier in one direction.** Container to managed runtime is usually a
deployment change. Function to container is a rewrite of the edges: you now own the HTTP
server, the queue consumer loop, graceful shutdown and health checks that the platform used
to provide. When the shape of the system is still moving, the container image is the option
that keeps both doors open.

## Related

- [Serverless](/concept/serverless) — the model, its limits and what it costs you
- [Docker](/technology/docker) — the image both sides can ship
- [Kubernetes vs Serverless](/compare/kubernetes-vs-serverless) — the next question: who operates the containers
- [API Gateway](/concept/api-gateway) — the usual front door for HTTP functions
- [Capacity Planning](/concept/capacity-planning) — the cost you take on when you own the capacity
