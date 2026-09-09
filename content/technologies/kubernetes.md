---
id: kubernetes
name: Kubernetes
tagline: Schedules containers across a cluster and keeps them running in the declared state
category: infrastructure
tags: [Infrastructure, Orchestration, Containers, Distributed System]
difficulty: 4
usedFor: [load-balancing, distributed-system]
prerequisites: [backend, docker, load-balancing, distributed-system]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - docker
  - load-balancing
  - distributed-system
  - kubernetes
  - circuit-breaker
related:
  - { to: docker, rel: USED_WITH }
  - { to: load-balancing, rel: IMPLEMENTS }
  - { to: distributed-system, rel: RELATED_TO }
  - { to: replication, rel: RELATED_TO }
  - { to: circuit-breaker, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Kubernetes 1.3x", confidence: high }
---

## TL;DR

Kubernetes runs containers on a fleet of machines. You describe the desired state in
YAML — "three replicas of this image, reachable on port 80, with 512 MB memory each" —
and control loops make reality match: placing pods on nodes, restarting crashed ones,
replacing them when a node dies, rolling out new versions and routing traffic only to
healthy instances. It is the de facto platform for running many services, and also a
large distributed system of its own that a small team can easily underestimate.

## Practical

Most engineers touch Kubernetes through a few object kinds and `kubectl`. The platform
team (or a managed cloud offering) runs the cluster; application teams ship manifests.

Objects you will actually write:

- **Deployment** — desired replica count, container image, resource requests/limits,
  liveness and readiness probes, rolling-update strategy.
- **Service** — a stable virtual IP and DNS name (`orders.default.svc`) that
  load-balances across the pods matching a label selector. See
  [Load Balancing](/concept/load-balancing).
- **Ingress / Gateway** — HTTP routing from outside the cluster to Services, with TLS.
- **ConfigMap and Secret** — configuration injected as environment variables or files.
- **HorizontalPodAutoscaler** — scale replicas on CPU, memory or custom metrics.
- **StatefulSet + PersistentVolumeClaim** — for the few things that need stable
  identity and disks (databases, brokers), usually via an operator.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: orders-api }
spec:
  replicas: 3
  selector: { matchLabels: { app: orders-api } }
  template:
    metadata: { labels: { app: orders-api } }
    spec:
      containers:
        - name: api
          image: registry.example.com/shop/orders-api:1.42.0
          ports: [{ containerPort: 3000 }]
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
          readinessProbe: { httpGet: { path: /health/ready, port: 3000 }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /health/live,  port: 3000 }, periodSeconds: 10 }
```

Manifests are rarely applied by hand: Helm or Kustomize templates them and a GitOps
controller (Argo CD, Flux) syncs the cluster from a Git repository. Deploying is a pull
request that changes an image tag.

## Deep Dive

**The reconciliation model.** Every object is stored in etcd; controllers watch for
differences between `spec` (desired) and `status` (observed) and act to close the gap.
The scheduler assigns pods to nodes based on requests, affinities and taints; the kubelet
on each node starts containers through a CRI runtime such as containerd. Nothing is
imperative — deleting a pod just causes the ReplicaSet controller to create another one.
This is what makes self-healing and declarative rollouts possible, and what makes
debugging feel indirect: you inspect events and conditions, not a log of commands.

**Requests, limits and scheduling.** `requests` reserve capacity and drive placement;
`limits` cap usage. Memory over the limit is an OOM kill; CPU over the limit is
throttling. Under-requesting packs nodes densely and produces noisy-neighbour latency;
over-requesting wastes money. Setting these well is the single most common tuning
problem, and it interacts with autoscaling of both pods (HPA) and nodes (cluster
autoscaler, Karpenter).

**Networking.** Every pod gets its own IP; a CNI plugin makes all pods routable across
nodes. A Service is a set of iptables/IPVS/eBPF rules on each node, not a process — it
gives connection-level load balancing without retries or circuit breaking. Application-
level resilience — [Retry](/pattern/retry), [Circuit Breaker](/pattern/circuit-breaker),
timeouts — still belongs in the client or in a service mesh (Istio, Linkerd, Cilium).

**Rollouts and probes.** A rolling update starts new pods, waits for readiness, then
terminates old ones. A readiness probe that returns healthy too early sends traffic to a
pod still warming up; a liveness probe that is too aggressive restarts pods under load
and causes cascading failures. Graceful shutdown matters: on `SIGTERM` the app should stop
accepting connections, finish in-flight work within `terminationGracePeriodSeconds`, and
exit.

**State is the hard part.** Kubernetes excels at stateless replicas. Databases and
brokers need StatefulSets, persistent volumes, ordered rollouts and backup — typically
delegated to an operator or moved to a managed service outside the cluster. Most teams
run stateless services in the cluster and stateful ones as managed offerings.

**Operational surface.** Version upgrades roughly three times a year with deprecations,
certificate rotation, RBAC, network policies, admission control, observability — a
cluster is a product to run. Managed control planes (EKS, GKE, AKS and others) remove
part of that, not the application-facing part.

## Why

Running one container on one server is easy. Running forty services with several
replicas each across twenty machines, surviving machine failures, deploying twenty times
a day without downtime and scaling with traffic is where hand-written scripts and static
server assignments break down.

```steps
title: Before — services pinned to machines by hand
Ops keeps a spreadsheet of which service runs on which VM | placement is manual
A VM dies at 3 a.m. | someone must notice and restart services elsewhere
Deploying a new version | SSH to each VM, stop, pull, start, hope
Traffic doubles | provision VMs, update load balancer configs by hand
One service leaks memory | it starves the other services on its VM
```

Kubernetes replaces the spreadsheet with a scheduler and the runbooks with controllers.
Desired state is declared once; the cluster continuously enforces it.

```steps
title: After — declare state, let controllers converge
Push a Deployment with replicas: 3 and an image tag | scheduler places pods across nodes
A node fails | pods are recreated on healthy nodes within seconds
Change the image tag | rolling update with readiness checks, automatic rollback on failure
Traffic doubles | HPA adds pods; cluster autoscaler adds nodes
A pod exceeds its memory limit | only that pod is killed and restarted
Service DNS name stays stable | clients never learn about any of this
```

## Advantages

- Declarative, self-healing deployment: crashed pods and failed nodes are handled automatically
- Rolling updates, rollbacks and autoscaling are built in and uniform across services
- Stable service discovery and load balancing inside the cluster
- Efficient bin-packing of many services onto shared machines
- Portable across clouds and on-premises; a huge ecosystem (Helm, operators, GitOps, meshes)
- Strong primitives for configuration, secrets, isolation (namespaces, RBAC, network policies)

## Trade-offs

- Steep learning curve and a large operational surface — a cluster is itself a distributed system to run
- YAML sprawl: even small services need several manifests, templates and pipelines
- Misconfigured requests, limits and probes cause outages that look like application bugs
- Stateful workloads remain awkward; most teams still use managed databases outside the cluster
- Debugging is indirect (events, conditions, controller logs) and demands good observability
- Cost: control plane, system add-ons and headroom for scheduling are paid even for tiny workloads

## When to use

- Many services with independent deploy cadence and scaling needs — the [Microservices](/architecture/microservices) case
- You need zero-downtime deploys, automatic recovery and autoscaling as standard behaviour
- Workloads must run across clouds or on-premises with one operational model
- A platform team exists (or a managed offering is used) and application teams ship containers
- Batch, cron and event-driven workers that should share compute with online services

## When not to use

- One or two services and a small team — a PaaS, serverless containers or a VM with [Docker](/technology/docker) Compose delivers the same outcome with far less to operate
- Nobody on the team can own cluster upgrades, security and capacity; the platform becomes the outage
- The workload is a single large stateful system (one big database) — orchestration adds little
- Latency-critical or hardware-bound workloads that need dedicated machines and kernel tuning
- Purely as a résumé item; the complexity is real and only pays off at a certain scale of services and change

## Real-world

Kubernetes is the substrate of the [Microservices](/architecture/microservices) architecture:
each service is a Deployment behind a Service, an Ingress or gateway terminates TLS, and the
message broker, [Redis](/technology/redis) and [PostgreSQL](/technology/postgresql) are
either operator-managed in the cluster or consumed as managed services. Larger
[E-commerce](/architecture/e-commerce) systems run their stateless tiers the same way,
autoscaling the checkout and catalogue services independently during traffic peaks.
