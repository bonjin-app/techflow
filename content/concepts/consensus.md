---
id: consensus
name: Consensus
tagline: Getting a group of machines to agree on one value when some of them are unreachable
category: distributed
tags: [Distributed System, Consistency, Replication, Availability]
difficulty: 4
prerequisites: [distributed-system, replication, cap-theorem]
learningPath:
  - distributed-system
  - replication
  - cap-theorem
  - consensus
  - leader-election
  - distributed-lock
related:
  - { to: distributed-system, rel: REQUIRES }
  - { to: leader-election, rel: SOLVES }
  - { to: replication, rel: RELATED_TO }
  - { to: cap-theorem, rel: RELATED_TO }
  - { to: distributed-lock, rel: RELATED_TO }
  - { to: consistency, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Consensus is how a group of machines agrees on one value — who the leader is, what the next
entry in the log is, whether a lock is held — while some of them are slow, restarting or
unreachable, and no one can tell which. The workable answer is a **quorum**: decisions need a
majority, so any two decisions overlap in at least one machine and cannot contradict each
other. Raft and Paxos are the two algorithms you will meet; Raft is the one you can read.
You will almost never implement consensus. You will constantly *depend* on it — in etcd
behind [Kubernetes](/technology/kubernetes), in a database's failover, in
[Kafka](/technology/kafka)'s controller — and what matters is knowing what it costs and what
it refuses to do.

## Why it matters

Without agreement, a distributed system does the two things that hurt most.

It **splits**. A network partition leaves two halves each convinced the other is dead, each
promotes a leader, and both accept writes. When the partition heals you have two divergent
histories and no principled way to merge them. Split-brain is not a rare theoretical event;
it is the normal outcome of a naive failover.

It **forgets**. A leader acknowledges a write, dies before replicating it, and a replica that
never saw the write is promoted. The client was told "committed". The data is gone.

Quorums fix both by making a decision require a majority. Two majorities of the same group
must share a member, so two leaders cannot both be elected and a committed write cannot be
lost — that one overlapping node remembers. The price is that a minority can make no
progress at all, which is the [CAP theorem](/concept/cap-theorem) stated concretely: when
the network splits, the smaller side stops serving rather than disagreeing.

## Visual

```steps
title: A leader election, and why the majority rule is the whole trick
Five nodes, one leader | writes go to the leader, which replicates to the rest
The leader stops responding | the others cannot tell whether it crashed or the network did
A follower times out | it increments the term and asks the others to vote for it
Each node votes at most once per term | this is what stops two winners existing
Three votes arrive — a majority of five | the candidate becomes leader for that term
The old leader comes back | its term is now stale; the others reject it and it steps down
A write arrives | the leader appends it to its log and sends it to the followers
Three acknowledge | the entry is committed — a majority holds it, so it survives any two failures
The client is told "committed" | only after the quorum, never before
The network splits 3 / 2 | the side of three keeps serving; the side of two refuses, and does not diverge
```

## Solutions

**Use a system that has already solved it.** etcd, ZooKeeper, Consul, or the consensus built
into your database or broker. Implementing Raft correctly is a multi-year exercise in edge
cases — membership changes, log compaction, snapshot transfer — and the bugs do not appear
until an unlucky failure. The engineering decision is which dependency to take, not which
algorithm to write.

**Size the cluster to the failures you want to survive.** A cluster of `2f+1` tolerates `f`
failures: three nodes survive one, five survive two. Even numbers buy nothing — four
tolerates the same single failure as three and costs one more machine. Three is the default;
five when a single machine's loss during maintenance must not be a risk. Beyond seven, the
replication cost outweighs the added resilience.

**Keep the consensus group small and the data small.** Every decision is a round trip to a
majority, so throughput is bounded by the slowest member of that majority and latency by the
network between them. Consensus stores are for metadata — leases, configuration, cluster
membership, leader identity — not for your application's data. Putting a hot workload behind
a consensus store is the standard way to discover this.

**Keep the members close.** Spread a cluster across regions and every write pays a
cross-region round trip, because every commit needs a remote majority. Most deployments put
the group in one region across availability zones, and accept that a region loss means a
deliberate, manual recovery.

**Fence whatever the leader controls.** Consensus can tell you who *was* leader as of a given
term; it cannot stop an old leader whose lease expired mid-operation from finishing its
write. The remedy is a fencing token — a monotonically increasing number handed out with the
lease and checked by whatever the leader writes to, so a stale leader's request is rejected
by the storage layer. [Distributed Lock](/concept/distributed-lock) covers this in detail; a
lock without fencing is an optimisation, not a guarantee.

**Do not build agreement out of timeouts.** "If I have not heard from the leader in 10
seconds, I am the leader" is not an algorithm, it is two leaders waiting to happen. The
majority vote, not the timeout, is what makes the election safe.

## Deep Dive

**Raft, in four moves.** Time is divided into numbered **terms**; each term has at most one
leader. A node that hears nothing from a leader becomes a **candidate** and requests votes;
each node grants one vote per term, so only a candidate with a majority wins. The leader
appends entries to its **log** and replicates them; an entry is **committed** once a majority
has stored it, and only committed entries are applied and acknowledged. Every message
carries the term, so a stale leader is detected the moment it speaks. Paxos proves the same
properties and is famously harder to follow; Raft was designed for comprehensibility and won
the implementations.

**Quorum reads are not free either.** A follower may be behind, so reading from one can
return stale data even though the write was committed. Systems that promise linearizable
reads either route them through the leader (and the leader confirms it is still leader with
a round trip, or holds a lease) or read from a quorum. That is why "read from a replica to
reduce load" quietly changes your consistency model — see
[Eventual Consistency](/concept/eventual-consistency).

**Liveness is not guaranteed, and that is a theorem.** FLP impossibility says no
deterministic algorithm can guarantee agreement in an asynchronous network where even one
node may fail. Real algorithms sidestep it with randomised timeouts: a partition can prevent
progress indefinitely, but in practice elections converge in milliseconds. This is why
consensus systems choose consistency over availability — they stop rather than guess.

**Membership changes are the sharp edge.** Adding or removing a node changes what "majority"
means, and doing it naively can create two overlapping majorities that each elect a leader.
Raft handles this with joint consensus, which is why you should change membership one node at
a time using the tooling, and never by editing configuration files and restarting.

**Not everything needs it.** Consensus is expensive and many problems that look like
agreement are not. Conflict-free replicated data types converge without coordination for
counters, sets and text. A single-writer design with a durable log avoids the question
entirely. A queue with [at-least-once delivery](/concept/delivery-semantics) and an
idempotent consumer replaces a distributed transaction in most product code. Reach for
consensus for the small number of facts that must have exactly one value — who is leader,
which configuration is current, who holds the lease — and leave the rest eventually
consistent.

**What it does not give you.** Consensus makes a group agree on a value; it does not make
your application correct. It will not stop a leader from writing bad data, will not make a
non-idempotent operation safe to retry, and will not span systems — agreeing inside etcd says
nothing about the payment provider you call next.
