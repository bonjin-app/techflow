---
id: kubernetes-vs-serverless
name: Kubernetes vs Serverless
tagline: Run your own containers on a cluster you operate, or hand them to a managed runtime
category: decision
tags: [Infrastructure, Containers, Serverless, Operations, Decision]
difficulty: 4
subjects: [kubernetes, docker]
related:
  - { to: microservices, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: infrastructure-as-code, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: medium }
---

## TL;DR

This is not containers versus no containers — both sides ship the same
[Docker](/technology/docker) image. The choice is **who runs it**. With
[Kubernetes](/technology/kubernetes) you operate the cluster: you declare desired state and
own the nodes, the autoscaler, the upgrades and the failure modes, and in exchange you can
run anything — stateful services, GPUs, sidecars, long-lived connections — with no platform
limits. With serverless (managed functions such as Lambda or Cloud Functions, and managed
container runtimes such as Cloud Run, Fargate or Container Apps) the provider runs it: you
give it an image or a handler and it scales, patches and bills per request. You trade
control and portability for a much smaller operations surface.

## Comparison

```compare
Feature              | Kubernetes [kubernetes]                            | Serverless / managed containers [docker]
Unit of deployment   | Pods you schedule on nodes you own                 | A function or a container image handed to the platform
Who patches the host | You (or your platform team)                        | The provider
Scaling              | HPA/KEDA on metrics; nodes must exist first        | Per request, to zero and back, automatically
Cold start           | None once pods are warm                            | 50 ms to several seconds depending on runtime and size
Cost shape           | You pay for reserved capacity, idle included        | You pay per request and per GB-second, idle is free
Long-lived work      | Any: WebSockets, streams, hours-long jobs          | Capped request duration; streaming support varies
State and storage    | Volumes, StatefulSets, local disk, sidecars        | Stateless by contract; state goes to managed services
Networking control   | Ingress, service mesh, egress rules, own CNI       | Platform ingress and rules you configure, not replace
Portability          | Same manifests on any conformant cluster           | Meaningful lock-in to one provider's runtime and limits
Team cost to run     | High: upgrades, capacity, RBAC, cluster on-call    | Low: no cluster, but deep debugging is harder
```

## Decision

```decision
? Is your traffic spiky, low-volume, or genuinely event-driven (uploads, webhooks, cron)?
  YES -> ? Does any request need to run longer than the platform's limit or hold a socket open?
    YES -> Kubernetes [kubernetes]
    NO -> Serverless [docker]
  NO -> ? Do you need control the platform will not give you (GPUs, sidecars, custom networking, stateful sets)?
    YES -> Kubernetes [kubernetes]
    NO -> ? Do you have — and want to keep — a team that can carry a cluster on-call?
      YES -> ? Is steady utilisation high enough that reserved capacity is cheaper than per-request billing?
        YES -> Kubernetes [kubernetes]
        NO -> Serverless [docker]
      NO -> Serverless [docker]
```

## When Kubernetes

- Utilisation is steady and high. Reserved nodes running at 60-70% are usually cheaper per
  request than per-invocation billing, and the crossover is easy to compute from your own
  traffic curve.
- Workloads exceed platform limits: WebSocket or gRPC streams, batch jobs measured in hours,
  large in-memory caches, GPU inference, or a service mesh with sidecars.
- You run many services and want one deployment model, one RBAC model and one set of
  [observability](/concept/observability) conventions across all of them.
- Portability is a real requirement — regulated environments, on-premise deployments, or a
  deliberate multi-cloud posture — and manifests plus [Docker](/technology/docker) images
  are the portable artifact.
- You already have the platform capability. Kubernetes is cheapest for teams that would have
  built the equivalent glue anyway.

## When Serverless

- Traffic is bursty or small: internal tools, webhooks, scheduled jobs, image processing on
  upload. Scaling to zero means an idle service costs nothing.
- The team is small and every hour spent on cluster upgrades is an hour not spent on the
  product. There is no node pool, no control-plane version, no cluster on-call rotation.
- The workload is a natural fit for the model: stateless request/response, or a consumer
  reacting to a queue or storage event with retries the platform manages.
- You are early and the shape of the system is still moving. A managed container runtime
  gives you the same image you would deploy later, so migrating to Kubernetes stays possible.
- Ops maturity matters more than unit cost: automatic patching, per-revision rollouts and
  built-in request logging arrive without being built.

## Deep Dive

**The two ends of one spectrum.** Between "operate your own cluster" and "upload a function"
sits a managed container runtime that takes the same image Kubernetes would run and applies
serverless economics to it. That middle option resolves most arguments: you keep the Docker
build, the local development loop and the ability to move, while the provider handles
scheduling and scaling. Managed Kubernetes control planes come at it from the other side —
you still own nodes, workloads and upgrades of your own components, which is where most of
the operational cost actually lives.

**Cost is a utilisation question, not a price-list question.** Serverless bills per request
and per GB-second, so cost tracks traffic exactly and idle is free. Kubernetes bills for
capacity whether it is used or not, so cost tracks your provisioning discipline. Below
roughly single-digit requests per second, or for workloads that are quiet most of the day,
serverless is usually cheaper by a wide margin. At sustained high throughput the same
workload on well-packed nodes is often several times cheaper — plus you keep paying the
salary cost of the people running the cluster, which never appears on the cloud bill.

**Cold starts and their mitigations.** A serverless instance that does not exist must be
created: pull or unpack the image, start the runtime, initialise your code. Small
dependency graphs, lazy initialisation, provisioned concurrency and minimum-instance
settings all reduce it, but each mitigation moves you back toward paying for idle capacity.
For a p99 latency budget in the tens of milliseconds on a customer-facing path, warm pods
behind a load balancer remain the predictable answer.

**Where the complexity goes.** Kubernetes makes complexity visible: YAML, controllers,
resource limits, `CrashLoopBackOff`, and a cluster upgrade every few months. Serverless
hides it, which is a real gain until you need to debug something the abstraction does not
expose — a connection-pool exhaustion caused by hundreds of concurrent instances hitting one
database, a distributed trace that stops at the platform boundary, or a quota you cannot
raise. Neither removes the need for [CI/CD](/concept/ci-cd),
[infrastructure as code](/concept/infrastructure-as-code) and real observability; they only
change what you write it against.

## Related

- [Docker](/technology/docker) — the container image both models deploy
- [Kubernetes](/technology/kubernetes) — the orchestrator you would operate yourself
- [Microservices](/architecture/microservices) — the architecture that raises this question
- [Observability](/concept/observability) — harder, and more necessary, on the managed side
- [API Gateway](/concept/api-gateway) — the usual front door for serverless HTTP endpoints
