---
id: cloud-networking
name: Networking & VPC
tagline: Private address space, subnets and firewall rules — where a service can be reached from
category: networking
tags: [Cloud, Networking, VPC, Security, Infrastructure]
difficulty: 3
prerequisites: [tcp, dns, cloud-platform]
learningPath:
  - tcp
  - dns
  - cloud-platform
  - cloud-networking
  - load-balancing
  - tls
related:
  - { to: cloud-platform, rel: REQUIRES }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: dns, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: rbac, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: service-mesh, rel: RELATED_TO }
  - { to: cost-optimization, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A virtual private cloud is your own private address space inside a provider's network. You
carve it into subnets, decide which of them can reach the internet, and attach firewall
rules that say who may talk to whom. The defining rule is simple and routinely broken:
**almost nothing should have a public address**. A load balancer and a gateway face the
internet; application servers sit in private subnets; databases sit deeper still and accept
connections only from the application's security group. Most cloud data breaches are a
database or a bucket that was reachable from the internet because someone found the private
path inconvenient.

## Why it matters

Network placement is the one security control that does not depend on your code being
correct. Authentication can be bypassed by a bug, authorisation by a logic error, input
validation by an encoding trick. A database in a private subnet with no route to the
internet cannot be reached by someone who has none of those bugs to exploit — it is not
reachable at all.

It is also the control that is hardest to add later. Address ranges are chosen once and
become expensive to change when they overlap with a partner, an acquisition or another
region; a flat network where everything can reach everything cannot be segmented after
fifty services depend on it. And the same layout that provides isolation determines your
data-transfer bill, because cross-zone and egress traffic is charged per gigabyte — see
[Cost Management](/concept/cost-optimization).

## Visual

```steps
title: One request, from the internet to the database
DNS resolves your domain | [DNS](/concept/dns) returns the load balancer's public address
Internet gateway | the only door into the VPC; the load balancer's subnet is the only public one
Load balancer | terminates [TLS](/concept/tls) and picks a healthy target — see [Load Balancing](/concept/load-balancing)
Security group on the app tier | allows port 8080 *from the load balancer's group only*, not from a CIDR
App server in a private subnet | it has no public address; nothing on the internet can dial it
Security group on the database | allows 5432 from the app's security group, and nothing else
Database in an isolated subnet | no route to an internet gateway at all
App needs to call an external API | out through a NAT gateway — egress only, no inbound path
App needs the object store | through a private endpoint, staying on the provider's network
Another availability zone | the whole layout is repeated; cross-zone traffic is billed per GB
```

## Solutions

**Plan the address space before the first subnet.** Choose a private range large enough for
every environment and region you will plausibly have, and make sure it does not collide with
your office, your VPN, or a partner you may one day peer with. Overlapping CIDRs are the
single most tedious mistake in cloud networking: the fix is renumbering a live environment.
Leave room — a /16 per VPC with /20 subnets costs nothing today and prevents a migration
later.

**Use three tiers of subnet.** Public for the load balancer and NAT gateway only; private
for application workloads, with outbound internet via NAT and no inbound route; isolated for
databases and caches, with no internet route in either direction. Spread each tier across at
least two availability zones, because a subnet lives in exactly one zone and a single-zone
deployment fails with that zone.

**Reference security groups, not IP ranges.** A rule that says "allow 5432 from the app
tier's security group" stays correct as instances come and go and cannot be satisfied by
anything else in the VPC. A rule that says "allow 5432 from 10.0.0.0/16" allows every
compromised workload in the network. Security groups are stateful and attach to workloads;
network ACLs are stateless, attach to subnets, and are best reserved for a coarse deny.

**Keep provider traffic off the public internet.** Private endpoints (PrivateLink, Private
Service Connect, Private Endpoint) let a private subnet reach object storage, queues and
managed databases over the provider's network. This removes a NAT hop, removes the public
path entirely, and usually removes an egress charge — it is the rare change that improves
security, latency and cost together.

**Make DNS explicit.** Inside a VPC, private zones resolve service names to private
addresses. Name services rather than hardcoding IPs, and decide early how on-premises and
cloud resolvers forward to each other — hybrid DNS is where "it works from the VPC but not
from the office" comes from.

**Log the flows.** Flow logs answer "who talked to what, and what was rejected", which is
how you debug a security-group change and how you investigate an incident. They are also
billed by volume, so sample in large environments and keep full capture on the sensitive
subnets.

## Deep Dive

**Security groups are not a substitute for authentication.** Network reachability is one
layer; a service inside the VPC must still authenticate its callers. The modern framing is
that the network is a blast-radius control, not a trust boundary: an attacker who compromises
one workload is *inside*, and everything they can reach is everything you allowed that
workload to reach. This is the argument for per-service rules rather than a permissive
intra-VPC allow, and for mutual TLS between services — the job a
[service mesh](/concept/service-mesh) automates.

**Connecting networks: pick the simplest thing that works.** Peering is a direct link between
two VPCs — cheap, simple, and non-transitive, so a full mesh grows quadratically. A transit
gateway is a hub that routes between many networks, at a per-attachment and per-gigabyte
cost. A VPN connects to on-premises over the internet, and a dedicated interconnect does it
with a private circuit and a predictable latency. Most organisations arrive at "peering until
about five VPCs, then a hub", and regret only the overlapping CIDRs.

**Kubernetes adds a second network on top of yours.** Pods get their own address space,
services are virtual IPs, and network policies are a separate firewall from the provider's
security groups. That means two layers to reason about, two places a connection can be
blocked, and an address plan that must accommodate pod CIDRs as well as node subnets — pod
IP exhaustion in a large [Kubernetes](/technology/kubernetes) cluster is a real and
surprisingly common outage.

**NAT gateways are a cost and a bottleneck.** Every byte a private subnet sends to the
internet passes through one, billed per hour and per gigabyte, and cross-zone NAT adds a
second charge. Teams frequently discover their largest network bill is container images and
package downloads going out through NAT — the fixes are a private endpoint for the registry,
a NAT gateway per zone to avoid cross-zone hops, and caching what you download repeatedly.

**Egress pricing shapes where you put things.** Traffic within a zone is usually free,
between zones is charged, and out to the internet is charged more. A chatty service split
across zones for redundancy pays for that chattiness on every call, which is why zone-aware
routing exists, and why a [CDN](/concept/cdn) in front of user-facing assets is a cost
decision as much as a latency one.

**IPv6 and address exhaustion.** Large environments run out of private IPv4 space, especially
with Kubernetes. IPv6 removes that constraint and is increasingly well supported, but dual
stack means every firewall rule, every allowlist and every application assumption has to be
reviewed twice. Worth planning for in a new network; rarely worth retrofitting into a working
one without a forcing reason.

**Test the isolation you think you have.** From a private instance, try to reach the internet
directly; from the internet, try to reach the database's address; from one service, try a
port on another. Isolation that nobody has verified is a diagram, not a control — and the
diagram is usually out of date.
