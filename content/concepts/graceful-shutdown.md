---
id: graceful-shutdown
name: Graceful Shutdown
tagline: Stop taking new work, finish what is in flight, then exit before the kill deadline
category: operations
tags: [Operations, Reliability, Deployment, Kubernetes]
difficulty: 3
prerequisites: [backend, load-balancing, docker]
learningPath:
  - backend
  - load-balancing
  - docker
  - kubernetes
  - graceful-shutdown
related:
  - { to: kubernetes, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: backpressure, rel: RELATED_TO }
  - { to: load-balancing, rel: REQUIRES }
  - { to: health-check, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: connection-pooling, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Graceful shutdown is the sequence a process runs when it is asked to stop: fail its
readiness check so traffic stops arriving, refuse new work, finish requests and messages
already in flight, release resources, and exit — all before the platform's kill deadline
turns `SIGTERM` into `SIGKILL`. Getting it wrong produces a burst of 502s and half-done
work on every deploy, which is why it is the difference between a rollout nobody notices
and one that shows up in the error budget.

## Why it matters

Pods restart constantly, not only during releases: rollouts, autoscaling, node drains,
spot-instance reclamation and OOM evictions all terminate processes. If each termination
drops in-flight requests, the failure rate scales with deploy frequency — so the
organisation quietly learns to deploy less. Worse, dropped work is not always a failed HTTP
request: a consumer killed mid-message can lose an acknowledgement and reprocess, or lose
the message entirely, depending on which side of the ack it died on.

## Visual

```sequence
title: SIGTERM to exit, with the SIGKILL deadline
participants: Control plane [kubernetes], Endpoints, LB [load-balancing], App [backend], Client
Control plane -> App: preStop hook, then SIGTERM
Control plane -> Endpoints: remove pod from the Service endpoints
App -> App: readiness probe now fails, keep serving existing traffic
Endpoints -> LB: endpoint removed (propagation takes time)
Client -> App: requests still arrive during propagation, must be served
LB -> LB: stops routing new requests to this pod
App -> App: close listener, stop consuming from the queue
App -> Client: finish in-flight responses, Connection close
App -> App: drain worker pool, flush metrics and logs
App -> App: close DB pool and broker connections
App --> Control plane: exit 0 before terminationGracePeriodSeconds
Control plane -> App: SIGKILL if the deadline passes
```

## How it works

**One signal, one handler.** The container runtime sends `SIGTERM` to PID 1. Two common
traps: a shell wrapper (`sh -c "node server.js"`) that never forwards the signal, and a
process that ignores `SIGTERM` because it has no handler at all — in both cases the
platform waits out the whole grace period and then kills the process, so shutdown always
takes the maximum time and never drains. [Docker](/technology/docker) with `--init`, or an
`exec` form entrypoint, fixes the PID 1 half.

**Flip readiness before you stop serving.** In [Kubernetes](/technology/kubernetes),
endpoint removal and the resulting reconfiguration of every proxy is *eventually*
consistent. The pod will keep receiving new connections for a second or more after
`SIGTERM`. So the correct order is: fail readiness, keep accepting and serving for a short
sleep (a `preStop` hook of 5–15 seconds is the usual mechanism), and only then close the
listener. Closing immediately is the single most common cause of deploy-time 502s. Liveness
must not fail during this window, or the pod is killed instead of drained. See
[Health Check](/pattern/health-check).

**Drain, do not abort.** Stop accepting new connections, let keep-alive connections finish
their current request and send `Connection: close` so clients reconnect elsewhere, and wait
for the worker pool with a bounded timeout. For queue consumers: stop the fetch loop first,
finish and acknowledge the messages already claimed, then close the consumer so the broker
can rebalance the partitions to a live member.

**Budget the time.** Grace period = drain delay + longest acceptable in-flight request +
cleanup. Requests longer than that budget (streaming responses, long polls, WebSockets)
need their own strategy: send a close frame and let clients reconnect, or set the grace
period from the p99 of the actual work.

## Deep Dive

**Failure modes.** A shutdown hook that blocks forever waiting on a hung dependency — every
wait needs a timeout, and exiting non-gracefully at the deadline is better than being
killed at it. Load balancers with their own health interval: an external LB checking every
10 seconds needs at least that long in the drain delay, otherwise it keeps sending traffic
to a socket that is already closed. In-memory state that was never flushed: buffered
metrics, batched log lines, an unsaved local cache. Background timers that fire during
shutdown and enqueue new work. And `SIGKILL` itself, which is not gracious about anything —
if the process regularly hits the deadline, the drain logic is broken, not slow.

**Trade-offs.** A long grace period drains cleanly but makes rollouts and node drains slow,
and delays the removal of a genuinely sick pod; a short one is fast and drops work. The
resolution is usually asymmetric: a generous grace period with an application that
normally exits in a second, so the ceiling only matters in the bad case. Adding a drain
delay also means the pod is deliberately serving traffic while marked not-ready, which
looks wrong on a dashboard until you know why.

**Idempotency beats perfect draining.** No shutdown path survives a kernel panic or a
vanished spot instance, so the durable answer is work that can be safely retried:
at-least-once delivery plus [Idempotency](/concept/idempotency) keys, and a
[Retry](/pattern/retry) policy in the caller. Graceful shutdown reduces how often retries
are needed; it does not replace them.

**Interaction with load shedding.** Refusing new work while draining is a form of
[Backpressure](/concept/backpressure): the correct response to a caller is a clear signal
(503 with `Retry-After`, or a `GOAWAY`) rather than a dropped connection, so its
[Circuit Breaker](/pattern/circuit-breaker) and retry logic can react intelligently instead
of guessing from a timeout.

**Connections and pools.** Closing a [connection pool](/concept/connection-pooling) too
early aborts the queries the in-flight requests still need; closing it too late leaves
server-side sessions and prepared statements behind. Close it after the request drain, and
make it the last resource released.

**Verify it, do not assume it.** The test is mechanical: put steady load through the
service, roll it, and assert zero 5xx and no lost messages. Deploy-time error spikes are
the metric that tells you whether the sequence above is actually implemented, and it is
worth asserting on it in a rollout the same way you would gate a
[Canary Release](/pattern/canary-release).
