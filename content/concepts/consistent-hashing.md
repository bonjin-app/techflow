---
id: consistent-hashing
name: Consistent Hashing
tagline: Add or remove a node and move 1/N of the keys, not all of them
category: distributed
tags: [Distributed System, Sharding, Cache, Scalability]
difficulty: 3
prerequisites: [sharding, cache, distributed-system]
learningPath:
  - cache
  - sharding
  - distributed-system
  - consistent-hashing
  - partitioning
  - replication
related:
  - { to: sharding, rel: SOLVES }
  - { to: partitioning, rel: RELATED_TO }
  - { to: cache, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: redis, rel: USED_WITH }
  - { to: cassandra, rel: USED_WITH }
  - { to: dynamodb, rel: RELATED_TO }
  - { to: distributed-cache, rel: USED_IN }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

The obvious way to spread keys across N machines is `hash(key) % N`. It works perfectly until
N changes: add one machine and almost every key maps somewhere new, so a [cache](/concept/cache) empties itself
and a sharded database has to move nearly all its data. Consistent hashing puts both keys and
nodes on the same circular number space and gives each key to the next node clockwise.
Adding a node then steals keys only from its immediate neighbour, so roughly **1/N of the
keys move instead of all of them**. Virtual nodes — many points on the circle per machine —
fix the uneven distribution that the naive circle produces.

## Why it matters

The cost of the modulo approach is not gradual, it is a cliff.

A cache fleet of ten nodes at a 95% hit rate adds an eleventh during a traffic spike. With
`% N`, about 90% of keys now hash to a different node, so the hit rate collapses to near
zero at the exact moment the system is already under strain, and every miss becomes a
database query. This is how adding capacity takes a service down — the scaling event causes
the outage.

For a sharded database the same arithmetic is a migration rather than a blip: nearly every
row belongs on a different machine, so growing the cluster means moving the whole dataset
while serving traffic. Teams respond by never resizing, which is how a cluster ends up
permanently over-provisioned and still unbalanced.

Consistent hashing turns both into a local event. One neighbour hands over a slice; everyone
else is untouched.

## Visual

```steps
title: Why the modulo breaks and the ring does not
Four cache nodes, hash(key) % 4 | key "user:42" hashes to 7 → 7 % 4 = node 3
Add a fifth node | the same key: 7 % 5 = node 2 — it moved, and so did ~80% of the others
The cache is now cold | every miss goes to the database, during the spike that made you scale
Same four nodes on a ring | the hash space is a circle from 0 to 2³²; each node sits at a point
A key is placed clockwise | "user:42" walks the circle until it meets a node — that is its owner
Add a fifth node on the ring | it lands between two existing nodes and takes only their overlap
Keys that moved | only those between the new node and its predecessor — about 1/5 of the total
Remove a node | its keys fall to the next one clockwise; nothing else changes
The distribution is lumpy | four random points do not divide a circle evenly
Give each node 150 virtual points | the law of large numbers smooths it to within a few percent
```

## Solutions

**Use virtual nodes, always.** A handful of real nodes placed at random on the ring produces
shares that differ by a factor of two or more. Giving each machine 100–200 points spreads it
to within a few percent, and it also makes heterogeneous hardware easy: a machine with twice
the memory gets twice the points. Every serious implementation does this, and a hand-rolled
ring that skips it will be unbalanced in production.

**Replicate to the next R distinct nodes.** Walking clockwise past the owner to the next
R−1 *physical* nodes gives you replicas, and a node failure promotes the next one
automatically. The word "distinct" is the detail: without it, virtual nodes will happily put
all your replicas on one machine. Better implementations also skip to another rack or
availability zone.

**Decide what happens on a miss during a move.** While keys are migrating, a read may arrive
at the new owner before the data does. For a cache the answer is to treat it as a miss and
refill. For a database, the shard must either forward the read to the previous owner or block
until the range is handed over — and that choice is a consistency decision, not an
implementation detail.

**Consider a fixed slot table instead.** Redis Cluster splits the space into 16,384 fixed
slots and assigns slots to nodes; Kafka assigns partitions to brokers. This is consistent
hashing with the ring quantised in advance: rebalancing moves whole slots, the mapping is a
small table you can inspect and hand-edit, and there is no ring arithmetic in your code. It
is easier to operate and a better default when the number of slots can be chosen up front.

**Or hash to a bounded load.** Plain consistent hashing balances *keys*, not *traffic*, so one
very popular key still lands on one node. Bounded-load variants cap how much any node may
take and overflow the excess to the next, which is how a hot key stops being one machine's
problem.

## Deep Dive

**The ring is not the point; the locality is.** What consistent hashing guarantees is that
changing the node set perturbs a bounded region of the key space. Any scheme with that
property qualifies. Rendezvous hashing (highest random weight) gets the same guarantee by
computing `hash(key, node)` for every node and picking the maximum — no ring, no virtual
nodes, trivially correct, at the cost of O(N) work per lookup. For a few dozen nodes that
cost is nothing, and rendezvous is often the simpler choice for a hand-rolled system.

**Hot keys defeat it.** A celebrity's profile or a flash-sale product is one key, so it is one
node, however many virtual points you added. The fixes are not in the hash: replicate that
key to several nodes and read from a random one, or split it into sub-keys, or put a small
local cache in front of the shared one so the hot key is served from the caller's process.
[Social Feed](/architecture/social-feed) hits exactly this and solves it by treating popular
accounts differently.

**Where it already runs.** [Memcached](/technology/memcached) clients have used it for two decades to survive node
changes. [Cassandra](/technology/cassandra) and DynamoDB partition by token ranges on a ring, which is why their data
model insists you choose a partition key. Redis Cluster uses fixed slots. Content delivery
networks use it to decide which edge caches an object, and load balancers use it — as "ring
hash" — to keep a client on the same backend without sticky sessions, which is where it
meets [Load Balancing](/concept/load-balancing).

**Resharding is still work.** Moving 1/N of the keys is far better than moving all of them,
and it is not free: that slice must be copied while both nodes serve traffic, and the cutover
has to be atomic per key or you get lost writes. Most systems stream the range, then take a
brief pause per slot to hand over ownership. Plan the migration; do not assume the ring makes
it invisible.

**Choose the key with care.** The partition key determines everything the ring can do for
you. A key with low cardinality concentrates traffic no matter how good the hash; a key that
does not match your access pattern turns single-node reads into scatter-gather across the
cluster. [Sharding](/concept/sharding) is where that choice is made, and consistent hashing
only decides where the key lands once it is chosen.
