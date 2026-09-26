---
id: nodejs-redis-kubernetes
name: Node.js + Redis on Kubernetes
tagline: Node.js and Redis as Deployments, with probes and a drain so rollouts drop no requests
environment: kubernetes
difficulty: 3
tags: [Kubernetes, Deployment, Cache, Zero Downtime]
components:
  - { ref: kubernetes, version: "1.30+", role: "Deployments, Services and probes; the native sleep hook needs 1.30 or later" }
  - { ref: nodejs, version: "22 LTS", role: "Stateless API with separate readiness and liveness endpoints, draining on SIGTERM" }
  - { ref: redis, version: "8", role: "In-cluster cache behind a Service, configured to evict rather than grow" }
related:
  - { to: health-check, rel: RELATED_TO }
  - { to: graceful-shutdown, rel: RELATED_TO }
  - { to: autoscaling, rel: RELATED_TO }
  - { to: cache-aside, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

What it takes to run a small service properly on [Kubernetes](/technology/kubernetes): the
[Node.js](/technology/nodejs) API as a Deployment of three replicas behind a Service, and
[Redis](/technology/redis) as a cache it reaches by name. The parts that matter are not the
Deployment itself but the three things around it — a readiness probe so traffic waits until
a pod can serve, a shutdown that drains before exiting, and a rollout strategy that never
takes capacity away — which together make `kubectl rollout` a non-event instead of a burst
of errors.

## Why this pairing

**A stateless service is what Kubernetes is best at.** Pods that keep nothing locally can be
replaced, rescheduled and multiplied freely; putting shared state in Redis is what makes the
Node.js pods stateless. Redis is reached through a Service name, so the application never
needs to know where it runs.

**What fits:**

- Node.js starts in well under a second and uses little memory, so replicas are cheap and
  rollouts are quick.
- A single event loop per pod maps cleanly onto a CPU request of a fraction of a core;
  scale by adding pods rather than threads.
- A cache is the one kind of Redis that is comfortable inside the cluster: losing it costs
  a burst of misses, not data.

**Where it rubs:**

- Kubernetes stops sending traffic to a terminating pod *eventually* — the endpoint update
  and the SIGTERM happen at nearly the same time, so a pod that exits instantly drops the
  requests still being routed to it. See [Graceful Shutdown](/concept/graceful-shutdown).
- Probes are easy to get subtly wrong. A liveness probe that checks Redis restarts every pod
  when Redis blips; readiness is the one that may depend on dependencies — see
  [Health Check](/pattern/health-check).
- Redis as a durable store in the cluster is a different project: persistence, a
  StatefulSet, replication and failover. This guide deliberately does not do that.

## Set it up

```steps
title: From a container image to a rollout that drops nothing
Application endpoints | /ready reports whether this pod can serve; /healthz only whether the process is alive
Redis | A Deployment and Service, capped memory, least-recently-used eviction
API Deployment | Three replicas, probes, resource requests, a drain on termination
Rollout | Add one new pod before removing an old one; watch it complete
```

**1. The service's side of the contract.** Readiness goes false as soon as shutdown
starts, so the pod leaves the Service before the server stops accepting.

```js
import http from "node:http";
import { createClient } from "redis";

const redis = await createClient({ url: process.env.REDIS_URL })
  .on("error", (err) => console.error("redis", err))
  .connect();

let shuttingDown = false;

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") return res.end("ok"); // alive: the process answers
  if (req.url === "/ready") {
    const ready = !shuttingDown && redis.isReady;
    res.writeHead(ready ? 200 : 503);
    return res.end(ready ? "ready" : "not ready");
  }
  const hits = await redis.incr("hits");
  res.end(JSON.stringify({ hits, pod: process.env.HOSTNAME }));
});
server.listen(3000);

process.on("SIGTERM", () => {
  shuttingDown = true;
  server.close(async () => {
    await redis.close(); // node-redis 5; `quit()` in 4.x
    process.exit(0);
  });
});
```

**2. `redis.yaml`** — one replica is enough for a cache; memory is capped both in Redis and
in the container, with Redis's limit below the container's so it evicts before it is killed.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels: { app: redis }
  template:
    metadata:
      labels: { app: redis }
    spec:
      containers:
        - name: redis
          image: redis:8
          args: ["--maxmemory", "200mb", "--maxmemory-policy", "allkeys-lru", "--save", "", "--appendonly", "no"]
          ports:
            - containerPort: 6379
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 256Mi }
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  selector: { app: redis }
  ports:
    - port: 6379
```

**3. `api.yaml`** — `maxUnavailable: 0` means a rollout only removes an old pod once a new
one is ready; the `preStop` sleep gives the Service a few seconds to stop routing to the pod
before SIGTERM arrives.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: registry.example.com/api:1.0.0
          env:
            - name: REDIS_URL
              value: redis://redis:6379
          ports:
            - containerPort: 3000
          resources:
            requests: { cpu: 250m, memory: 128Mi }
            limits: { memory: 256Mi }
          readinessProbe:
            httpGet: { path: /ready, port: 3000 }
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 10
            failureThreshold: 3
          lifecycle:
            preStop:
              sleep: { seconds: 5 }
---
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector: { app: api }
  ports:
    - port: 80
      targetPort: 3000
```

```sh
kubectl apply -f redis.yaml -f api.yaml
kubectl rollout status deployment/api
```

## Verify

All three replicas should be ready and listed behind the Service:

```sh
kubectl get pods -l app=api            # 3/3 Running, READY 1/1
kubectl get endpointslices -l kubernetes.io/service-name=api
```

The real test is a rollout under load. In one terminal, send a steady stream of requests
through the Service; in another, roll the Deployment:

```sh
kubectl run load --rm -it --image=busybox:1.37 --restart=Never -- \
  sh -c 'while true; do wget -q -O- http://api/ || echo FAILED; sleep 0.1; done'

kubectl rollout restart deployment/api
kubectl rollout status deployment/api
```

The `pod` field in the responses changes as new pods take over, and no `FAILED` lines
appear. Remove `preStop` or set `maxUnavailable: 1` and repeat to see what they prevent.

## Going to production

- **Use a managed Redis, or an operator,** once the cache matters to latency targets: a
  single in-cluster pod is rescheduled, and restarted empty, whenever its node is drained.
- **Add a PodDisruptionBudget** (`minAvailable: 2`) so node maintenance cannot evict every
  API pod at once — see the disruptions page below.
- **Scale on the signal that saturates first.** A HorizontalPodAutoscaler on CPU works for
  compute-bound handlers; an I/O-bound Node.js service usually saturates on latency or
  concurrency first — see [Autoscaling](/concept/autoscaling).
- **Keep liveness dumb.** It should fail only when the process is wedged. Anything that
  depends on Redis, a database or another service belongs in readiness, or one outage
  restarts the whole fleet.
- **Set requests from measurements.** Requests decide scheduling and the HPA's arithmetic;
  a memory limit without a matching request is how pods get evicted under pressure.
- **Keep secrets out of manifests.** A password for Redis belongs in a Secret referenced by
  `env.valueFrom.secretKeyRef`, not in `value:`.

## When not to

- **One service, one team, modest traffic.** A single VM or a managed container platform is
  far less to operate; Kubernetes pays off when there are many services to schedule and
  deploy the same way.
- **Redis holds data you cannot lose.** Sessions you can recreate are fine; carts, queues or
  anything authoritative need persistence and failover this setup does not provide.
- **Nobody on the team will own the cluster.** Upgrades, node images, networking and
  certificates are continuous work; without an owner, use the managed options.

## References

- [Kubernetes: Deployments — rolling update strategy and rollout status](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes: configure liveness, readiness and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Kubernetes: container lifecycle hooks — `preStop` and the sleep handler](https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/)
- [Kubernetes: pod lifecycle — termination and the grace period](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Kubernetes: disruptions and PodDisruptionBudgets](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/)
- [Node.js 22: `process` — signal events](https://nodejs.org/docs/latest-v22.x/api/process.html)
- [Redis: key eviction and `maxmemory-policy`](https://redis.io/docs/latest/develop/reference/eviction/)
