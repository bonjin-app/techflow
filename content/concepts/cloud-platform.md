---
id: cloud-platform
name: Cloud Platforms
tagline: Renting compute, storage, network and identity — same primitives, different names
category: infrastructure
tags: [Cloud, Infrastructure, AWS, GCP, Azure]
difficulty: 2
prerequisites: [linux, dns, load-balancing]
learningPath:
  - linux
  - dns
  - load-balancing
  - cloud-platform
  - cloud-networking
  - infrastructure-as-code
  - cost-optimization
related:
  - { to: cloud-networking, rel: RELATED_TO }
  - { to: cost-optimization, rel: RELATED_TO }
  - { to: infrastructure-as-code, rel: RELATED_TO }
  - { to: rbac, rel: RELATED_TO }
  - { to: s3, rel: RELATED_TO }
  - { to: serverless, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: terraform, rel: USED_WITH }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A cloud provider rents you five things: compute, storage, networking, identity, and managed
services built on top of those. Every provider sells the same five with different names, so
the transferable skill is the primitives — a virtual machine, an object store, a private
network, a role with a policy — not one vendor's console. Two ideas do most of the work in
practice: **identity is the control plane** (almost everything is an authorisation decision,
and almost every serious incident is a permissions mistake), and **the region and
availability zone are your failure domains**, which means your architecture's resilience is
decided by where things are placed long before any code runs.

## Why it matters

Owning servers meant capacity was a purchase you made a quarter ahead, and a mistake was
capital. That single constraint shaped a generation of architecture: big machines, vertical
scaling, careful capacity planning, and an operations team whose job included the loading
dock.

Renting changes the shape of every decision. Capacity becomes an API call, so scaling out is
cheaper than scaling up, and failure becomes ordinary rather than exceptional — instances
are disposable, so the design has to assume one can vanish. It also moves the cost from
capital to an operating bill that grows with every architectural choice, which is why
[cost](/concept/cost-optimization) becomes an engineering concern rather than a finance one.

The other shift is the **shared responsibility model**. The provider is responsible for the
security *of* the cloud — physical facilities, hypervisor, managed service internals. You
are responsible for security *in* it: who can access what, how data is encrypted, what is
exposed to the internet, and whether your instances are patched. Almost every publicised
"cloud breach" is the second half: a public bucket, an over-broad role, a leaked key.

## Visual

```steps
title: The primitives, in the order you meet them
Account and organisation | the top-level boundary: separate production from everything else here
Identity and roles | who and what may act; a workload gets a role, never a long-lived key
Region and availability zone | your failure domains and your data-residency answer
Virtual network | private address space; most things should have no public address at all
Compute | virtual machines, containers, or [functions](/concept/serverless) — the same workload at three granularities
Object storage | cheap, durable, effectively unlimited — [S3](/technology/s3) and its equivalents
Managed database | the provider runs replication, backup and failover; you still own the schema
Load balancer | the public entry point and the [TLS](/concept/tls) termination
Observability | logs, metrics and traces, priced by volume — a real budget line
Everything as code | [Terraform](/technology/terraform) or the provider's own, because a console click is not reproducible
```

## Solutions

**Learn the primitives once, map the names later.** Compute (EC2 / Compute Engine / Virtual
Machines), object storage (S3 / Cloud Storage / Blob Storage), managed relational databases
(RDS / Cloud SQL / Azure Database), private networking (VPC / VPC / VNet), identity (IAM /
IAM / Entra ID), functions (Lambda / Cloud Functions / Azure Functions). Once you know what
a subnet, a role, a security group and an object store *are*, learning a second provider is
a week of vocabulary, not a retraining.

**Treat identity as the primary design surface.** Grant the narrowest permission that works,
attach roles to workloads rather than distributing keys, and use short-lived credentials
everywhere. Separate production from non-production at the account level, not with a naming
convention, so a mistake in staging cannot reach production data. This is
[RBAC](/concept/rbac) with the provider as the enforcement point, and it is where the real
failures happen.

**Choose failure domains deliberately.** A region is a geography; an availability zone is an
isolated datacentre within it. Spreading across zones is cheap and handles the common
failure; spreading across regions is expensive, complicates data consistency, and is
justified by a regulatory requirement or a genuine business need rather than by ambition.
Decide what you would do if one zone vanished, and test it.

**Prefer managed services until they constrain you.** A managed database gives you
replication, backups, patching and failover for a premium over raw instances. That premium
is usually smaller than the engineer-time it replaces, and the honest reasons to self-host
are a version or extension the service does not support, a cost crossover at large scale, or
a portability requirement you have actually priced.

**Define everything as code, from the first week.** Console clicking is undocumented,
unreviewable and unrepeatable, and a hand-built environment cannot be recreated after an
incident. [Infrastructure as Code](/concept/infrastructure-as-code) with
[Terraform](/technology/terraform) or a provider-native tool makes the environment a
reviewable artefact — and makes a second environment an afternoon rather than a project.

**Put a cost and a security guardrail in place before you need one.** Budget alerts,
mandatory resource tagging, blocking public access to storage by default, and an
organisation-level policy that prevents the worst mistakes. These take an hour and are
almost never added retroactively in time.

## Deep Dive

**The provider differences that actually matter.** AWS has the broadest service surface and
the deepest ecosystem, and the highest cognitive load. Google Cloud's networking and data
tools are strong and its abstractions are generally cleaner. Azure wins on integration with
Microsoft identity and enterprise agreements, which is often the deciding factor regardless
of technical merit. For most workloads the choice is decided by existing commitments,
pricing agreements and the team's experience — not by a feature comparison, because the
primitives are equivalent.

**Lock-in is real but frequently mispriced.** Compute, storage and networking are close to
portable. Managed databases are portable with effort. Proprietary event, workflow, identity
and data-warehouse services are where migration becomes a project. The useful question is
not "is this lock-in?" but "if we had to leave, how long and how much?" — and then whether
avoiding that is worth building and operating the alternative yourself for years. Deliberate
lock-in on a service that saves a team-year is a good trade; accidental lock-in on a
convenience is not.

**Multi-cloud is usually an expensive answer to the wrong question.** Running the same
workload across two providers means the lowest common denominator of both, doubled
operational surface, and a team that is expert in neither. The defensible versions are
narrow: a specific service from another provider, a regulatory requirement, or an
acquisition you now have to absorb. Availability is better bought with multiple zones and a
tested recovery plan than with a second provider.

**Pricing shapes architecture more than most teams expect.** Compute is billed per second or
per request, storage per gigabyte-month plus request counts, and *egress* — data leaving the
provider — is the line that surprises people, especially between zones or out to the
internet. That pricing is why a [CDN](/concept/cdn) in front of static assets pays for
itself, why chatty cross-zone traffic is a design smell, and why log and metric volume is an
architectural decision. Commitment discounts and spot capacity can halve a bill, at the cost
of flexibility and of workloads that must tolerate interruption. See
[Cost Management](/concept/cost-optimization).

**The abstraction ladder is a trade, not a progression.** Virtual machines give you control
and require you to own patching, scaling and configuration. Containers on
[Kubernetes](/technology/kubernetes) give you portability and a scheduler, and cost a
platform team. [Serverless](/concept/serverless) removes the servers and constrains you to
its execution model, with cold starts and per-request pricing. None is more advanced than
the others; a small team is often best served by the highest abstraction that fits, and a
large one by whichever matches its existing operational competence.

**Quotas, limits and the failure you did not design for.** Every account has service quotas,
and hitting one mid-incident — instance launches, API rate limits, IP allocations — turns a
scaling event into an outage. Know the limits on your critical path, request increases
before you need them, and include them in [capacity planning](/concept/capacity-planning).
The cloud is elastic within the limits someone else set.
