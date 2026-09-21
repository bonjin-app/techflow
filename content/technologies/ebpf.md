---
id: ebpf
name: eBPF
tagline: Run sandboxed programs inside the Linux kernel without patching or rebooting it
category: infrastructure
tags: [Linux, Observability, Networking, Security, Performance]
difficulty: 5
usedFor: [observability, cloud-networking, tail-latency, threat-modeling]
prerequisites: [linux, distributed-system, observability]
learningPath:
  - linux
  - observability
  - cloud-networking
  - ebpf
related:
  - { to: linux, rel: REQUIRES }
  - { to: observability, rel: USED_IN }
  - { to: service-mesh, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: prometheus, rel: USED_WITH }
  - { to: tail-latency, rel: RELATED_TO }
  - { to: opentelemetry, rel: ALTERNATIVE_TO }
  - { to: incident-response, rel: USED_IN }
meta: { lastReviewed: 2026-09-21, version: "Linux 6.x; BTF and CO-RE assumed", confidence: medium }
---

## TL;DR

eBPF lets you load a small program into the running Linux kernel and attach it to an
event — a syscall, a network packet, a function entry, a scheduler decision. The kernel
verifies the program before it runs, so a mistake cannot panic the machine, and JIT
compiles it, so it runs at near-native speed. You get to ask questions of the kernel that
would otherwise require a kernel module, a patch, or a reboot.

The practical consequence: observability and networking tools that used to need an agent
inside every process now sit underneath all of them, in one place, seeing everything.

## Practical

You rarely write eBPF bytecode. You use something that generates it.

- **`bpftrace`** — a one-liner language for ad-hoc questions during an incident.
  `bpftrace -e 'tracepoint:syscalls:sys_enter_openat { @[comm] = count(); }'` counts which
  processes are opening files, live, on a production box.
- **`bcc` / `libbpf`** — write the kernel side in C, the user side in Python/Go/Rust. This
  is how the well-known tools (`execsnoop`, `biolatency`, `tcpretrans`) are built.
- **Cilium** — [Kubernetes](/technology/kubernetes) networking and policy implemented in
  eBPF rather than iptables, which is where most teams meet eBPF without knowing it.
- **Pixie, Parca, Falco** — respectively auto-instrumented tracing, continuous profiling,
  and runtime security, all built on the same hooks.

The attachment point decides what you can see:

```steps
title: Where an eBPF program can attach
kprobe / fentry | any kernel function, by name — powerful, and tied to kernel internals
tracepoint | stable, kernel-maintained events — prefer these when one exists
uprobe | a function in a user-space binary, including a library or a runtime
XDP | the earliest possible point in the network path, before an skb exists
tc | traffic control, after the packet is an skb — richer, slightly later
LSM | security hooks, to allow or deny an operation rather than watch it
```

## Deep Dive

**The verifier is the whole design.** Before loading, the kernel walks every possible path
through the program and rejects anything it cannot prove safe: unbounded loops, out-of-range
memory access, unchecked pointers. This is why eBPF is safe to run in the kernel and also
why writing it is unusual — you are not fighting the compiler, you are fighting a prover.
Loops need an explicit bound. A pointer read needs a preceding null check the verifier can
see. The error messages are notoriously opaque.

**Maps are the interface.** A program cannot call into user space. It writes to a *map* — a
hash, array, ring buffer, or per-CPU variant — and a user-space process reads it. Per-CPU
maps avoid the cache-line contention that would otherwise make a high-frequency probe more
expensive than the thing it measures.

**CO-RE solves the portability problem.** An eBPF program that reads a kernel struct field
is coupled to that kernel's layout. "Compile Once, Run Everywhere" uses BTF type information
shipped with the kernel to relocate field offsets at load time, so one binary works across
kernel versions. Without BTF — old or minimal kernels — you are back to compiling against
local headers.

**The cost is real but small.** A kprobe on a hot path costs on the order of tens to
hundreds of nanoseconds per event. That is nothing at a thousand events per second and a
serious tax at ten million, which is why production tools aggregate in the kernel (a
histogram in a map) rather than streaming every event to user space.

## Why

Before eBPF, seeing inside the kernel meant one of three bad options: a kernel module you
had to trust absolutely, a patched kernel you had to maintain, or sampling from outside and
guessing. The middle ground did not exist.

```sequence
title: Attributing slow requests, before and after
participants: Operator, App [observability], Kernel [linux], eBPF [ebpf]
Operator -> App: latency is up, why?
App --> Operator: my own timers say the DB call is slow
Operator -> Kernel: is it the disk, the network, or scheduling?
Kernel --> Operator: (no answer without a module or a reboot)
Operator -> eBPF: attach biolatency + tcpretrans
eBPF --> Operator: disk p99 is flat, TCP retransmits up 40x
```

The question "which layer is responsible" used to be answered by elimination and restarts.
eBPF answers it by measurement, on the machine that is currently misbehaving, without
changing what is running on it.

## Advantages

- Answers questions about a running production system without restarting or redeploying it
- The verifier makes a bad probe a load-time error rather than a kernel panic
- One vantage point below every process — no per-language agent, no code changes
- Aggregation in the kernel keeps overhead proportional to the summary, not the event count
- Replaces iptables for service networking at a scale where iptables rule chains collapse
- The same mechanism serves observability, networking and security policy

## Trade-offs

- Linux only, and effectively recent Linux — the useful features arrived across many releases
- Writing it means satisfying a verifier whose rejections are hard to read
- Needs elevated privileges (`CAP_BPF`, often effectively root), which is itself a risk surface
- kprobes attach to internal functions with no stability promise; a kernel upgrade can break them
- A careless probe on a hot path measurably slows the machine you are debugging
- Debugging is indirect: no printf worth the name, limited stack, small program size

## When to use

- You need to attribute latency to a layer and application metrics have run out
- Networking or policy at a scale where per-pod iptables rules have become the bottleneck
- Continuous profiling across a fleet, in languages that cannot all carry an agent
- Runtime security that must see syscalls, not just logs
- One-off forensic questions on a machine you cannot restart

## When not to use

- Don't reach for eBPF when an [OpenTelemetry](/technology/opentelemetry) span would answer
  the same question — application context is something the kernel cannot see
- Don't use it for business metrics; it knows about syscalls, not orders
- Don't build on kprobes into kernel internals if you need the tool to survive upgrades
  unattended — prefer tracepoints or accept the maintenance
- Don't deploy it fleet-wide on locked-down or non-Linux hosts and expect parity
- Don't add a probe to a path handling millions of events per second without measuring the
  probe itself first

## Real-world

Container networking is the most widespread production use: replacing per-Service iptables
chains with eBPF maps turns a linear rule walk into a hash lookup, which is the difference
between viable and not at a few thousand Services on a node. Continuous profilers use it to
sample stacks across a fleet with no per-process agent. Runtime security tools use the LSM
hooks to block an operation rather than report it afterwards. During incidents, `bpftrace`
one-liners are the usual way to decide whether a latency spike is disk, network, lock
contention or the scheduler — the question [observability](/concept/observability) dashboards
most often leave open.
