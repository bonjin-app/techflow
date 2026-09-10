---
id: linux
name: Linux
tagline: The kernel every server runs on — processes, file descriptors, signals, cgroups
category: operating-system
tags: [Operating System, Fundamentals, Ops, Kernel, Containers]
difficulty: 3
usedFor: [observability, concurrency, graceful-shutdown]
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - linux
  - backend
  - docker
  - observability
  - kubernetes
related:
  - { to: docker, rel: RELATED_TO }
  - { to: backend, rel: RELATED_TO }
  - { to: observability, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: nginx, rel: USED_WITH }
  - { to: graceful-shutdown, rel: RELATED_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: connection-pooling, rel: RELATED_TO }
  - { to: observability-stack, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Linux 6.x kernel, systemd-based distributions", confidence: high }
---

## TL;DR

Almost every backend process you write runs as a Linux process, inside a Linux cgroup, on a
Linux network stack. You do not need kernel-development skills, but you do need the handful
of primitives your runtime hides: processes and their exit status, file descriptors and their
limits, signals and what your process does when it gets one, the cgroups and namespaces that
are all a container really is, and the `/proc`-backed tools that answer "why is this slow".
Every mysterious incident — a container killed at 512 MB, a deploy that drops connections,
"too many open files" — is one of those primitives leaking through.

## Practical

The commands that answer real questions during an incident:

```bash
# Who is running, and what is the process actually doing?
ps -eo pid,ppid,stat,rss,etime,cmd --sort=-rss | head
cat /proc/1234/status                 # threads, memory, signal masks
strace -p 1234 -f -e trace=network    # which syscalls it is stuck in

# File descriptors: sockets, files, pipes — all the same thing.
ls -l /proc/1234/fd | wc -l           # current count
cat /proc/1234/limits | grep files    # the ceiling that causes EMFILE

# Sockets and listeners, not "ports".
ss -tulpn                             # what is listening, in which process
ss -tan state time-wait | wc -l       # exhausted ephemeral ports?

# Resources as the kernel accounts for them
cat /sys/fs/cgroup/memory.max         # the real ceiling inside a container
vmstat 1 5                            # run queue, context switches, IO wait
dmesg -T | grep -i oom                # was I killed, or did I crash?

# Under systemd, the service is a unit and the logs are structured.
systemctl status api.service
journalctl -u api.service -p warning --since "-15min"
```

Reach for these before adding print statements: they report what the kernel observed, not
what your application assumed.

## Deep Dive

**Processes, not programs.** `fork` + `exec` creates a process; it inherits the parent's
environment, working directory, open file descriptors and cgroup. A process that exits
becomes a zombie until its parent reaps it — which is why a container whose PID 1 is your
application, and not an init that reaps children, slowly accumulates defunct processes.
Exit status matters: 0 is success, 1–125 are the application's own, 128+*n* means "killed by
signal *n*", so exit 137 is `128 + 9` — SIGKILL, usually the OOM killer or an impatient
orchestrator.

**Everything is a file descriptor.** An open file, a TCP socket, a pipe and an epoll
instance are all small integers in a per-process table. This uniformity is why one API
(`read`, `write`, `epoll_wait`) drives both disk and network IO, and why every event-loop
runtime is built on `epoll`. It also gives you a hard limit: `RLIMIT_NOFILE`. A service that
opens a connection per request without pooling hits `EMFILE` ("too many open files") long
before it runs out of CPU. See [Connection Pooling](/concept/connection-pooling).

**Signals are the shutdown protocol.** `SIGTERM` is a polite request your process can
handle; `SIGKILL` cannot be caught and gives you no chance to finish anything. Orchestrators
send `SIGTERM`, wait a grace period (30 s by default in Kubernetes), then `SIGKILL`. If your
process ignores `SIGTERM` — very common when a shell wrapper is PID 1 and does not forward
signals — every deploy drops in-flight requests. Handling it properly means: stop accepting
new work, fail readiness checks so the load balancer stops routing to you, finish what is in
flight, close pools, exit. See [Graceful Shutdown](/concept/graceful-shutdown).

**Namespaces and cgroups are the container.** Namespaces virtualise what a process can
*see* — PIDs, mounts, network interfaces, users; cgroups limit what it can *use* — CPU
shares and quota, memory, IO. [Docker](/technology/docker) and
[Kubernetes](/technology/kubernetes) are user-space tools that configure these kernel
features. The practical consequence: `free` and `/proc/cpuinfo` report the *host*, so a
runtime sizing thread pools or heap from them over-allocates inside a limited container —
read `/sys/fs/cgroup/memory.max` and `cpu.max` instead. The limit is enforced by the OOM
killer, which kills without warning: no exception, no stack trace, just exit 137.

**Memory is not what your dashboard says.** RSS includes shared pages, the page cache makes
"used memory" look alarming while staying reclaimable, and cgroup accounting charges you for
the page cache your process caused.

**systemd is the supervisor contract.** A unit file declares the command, user, resource
limits, restart policy and dependencies; `journalctl` gives structured, per-unit logs.
`Restart=`, `TimeoutStopSec=` and `LimitNOFILE=` decide whether a service self-heals or
restart-loops silently.

**Where time actually goes.** High load average with low CPU means tasks blocked on IO;
high `%sy` means syscall or context-switch churn. `/proc`, `ss`, `vmstat`, `pidstat`, `perf`
and eBPF tools attribute latency to a subsystem: application metrics tell you *that* it is
slow, these tell you *where*. See [Observability](/concept/observability).

## Why

Treating the operating system as an implementation detail works until something outside your
process misbehaves. The application's own view cannot explain that failure, because it
happened *to* the process rather than in it.

```steps
title: Before — the server is a black box
Deploys drop requests; nobody knows why, so the fix is "retry harder"
A container dies with exit 137 and no log line, blamed on a "memory leak"
"Too many open files" appears under load and is worked around by raising a limit blindly
Latency doubles; dashboards show CPU at 30%, so the conclusion is "the database is slow"
Debugging means adding print statements and redeploying
```

Learning the primitives turns each of those into a question with an answer you can look up
on a running system, without changing any code.

```steps
title: After — the kernel's own account
SIGTERM is handled: drain, fail readiness, close pools, exit 0 [graceful-shutdown]
Exit 137 is read as SIGKILL and confirmed against the cgroup limit and dmesg
File-descriptor count and RLIMIT_NOFILE point at a missing connection pool [connection-pooling]
ss and vmstat show IO wait and TIME_WAIT sockets, not a slow query
strace, /proc and journalctl answer questions on the live process [observability]
```

The payoff is not sysadmin skill — it is that you stop guessing, and your container images,
health checks and shutdown paths start being written on purpose.

## Advantages

- One consistent model — processes, file descriptors, signals — behind every language runtime
- The kernel exposes its own accounting through `/proc` and `/sys`, answerable on a live system
- Namespaces and cgroups make containers cheap and inspectable rather than magic
- Enormous, stable tooling surface: `ss`, `strace`, `perf`, eBPF, `journalctl`
- Overwhelmingly the deployment target, so knowledge transfers across clouds and stacks
- Free, open source, and reproducible from an image or a Dockerfile

## Trade-offs

- Broad surface area: dozens of tools with terse flags and inconsistent output
- Distribution and version differences leak into every runbook
- Defaults are conservative and often wrong for servers — descriptor limits, ephemeral port ranges, keepalive timers
- The abstractions leak in exactly the wrong direction inside containers: host-level views mislead runtimes
- Failure modes are blunt: the OOM killer offers no diagnostics beyond a `dmesg` line
- Kernel-level performance work (eBPF, `perf`) has a steep learning curve

## When to use

- Any server-side service, container image or CI runner you are responsible for
- Diagnosing latency, memory or connection problems that application metrics cannot explain
- Writing correct startup and shutdown behaviour for a deployed process
- Sizing containers: memory limits, CPU quota, thread pools, descriptor limits
- Building minimal, reproducible images and understanding what is inside them

## When not to use

- Don't debug at the kernel level when a request trace or query plan would answer the question
- Don't hand-tune sysctls or hand-build servers when a managed platform or [Kubernetes](/technology/kubernetes) already encodes those decisions
- Don't run stateful, pet servers configured by hand; prefer immutable images built from [Infrastructure as Code](/concept/infrastructure-as-code)
- Don't assume Linux behaviour on other targets: macOS and Windows differ in signals, descriptor limits and networking defaults
- Don't reach for `strace` in production without knowing its overhead — it stops the process on every syscall

## Real-world

Every layer above it inherits these primitives. A [Docker](/technology/docker) image is a
filesystem plus a process spec; a [Kubernetes](/technology/kubernetes) pod is cgroups and
namespaces with a lifecycle wrapped around `SIGTERM`; an [Nginx](/technology/nginx) worker
is an `epoll` loop over sockets. In an
[Observability Stack](/architecture/observability-stack), node exporters read exactly the
`/proc` and cgroup files listed above and turn them into the CPU, memory, descriptor and
socket metrics [Prometheus](/technology/prometheus) stores. When a
[Microservices](/architecture/microservices) rollout "loses" requests, the cause is almost
always one of two Linux facts: PID 1 not forwarding `SIGTERM`, or readiness not failing
before the process stops accepting connections.
