---
id: infrastructure-as-code
name: Infrastructure as Code
tagline: Declare servers, networks and policies in version-controlled files, then apply them
category: operations
tags: [DevOps, Automation, Infrastructure, Cloud]
difficulty: 3
prerequisites: [backend, docker, ci-cd]
learningPath:
  - backend
  - docker
  - ci-cd
  - infrastructure-as-code
  - kubernetes
  - observability
related:
  - { to: terraform, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: docker, rel: RELATED_TO }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: s3, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: multi-tenant-saas, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Infrastructure as Code describes the desired state of infrastructure — networks, clusters,
databases, DNS records, IAM policies — in files kept in version control, and lets a tool
compute and apply the difference between that description and reality. The declarative
model dominates: you write *what should exist*, run a **plan** to see the diff, then
**apply** it. The payoff is reviewable, repeatable, auditable infrastructure; the cost is
state management, drift and a new class of blast-radius mistakes.

## Why it matters

Infrastructure created by hand in a console has no history, no review, and no reliable way
to be recreated — the classic "we cannot rebuild this environment because only one person
knows what is in it". IaC makes environments diffable and disposable: staging can be an
exact structural copy of production, a change to a security group goes through review like
any code change, and a region outage is answered by applying the same definitions
elsewhere. It is also the precondition for meaningful [CI/CD](/concept/ci-cd) beyond the
application layer.

## Visual

```steps
title: The plan / apply loop
1. Write the desired state | declarative resources in version control, reviewed like code
2. Init and lock providers | pin provider and module versions so the plan is reproducible
3. Refresh | read the real attributes of every resource the state file tracks
4. Plan (diff) | desired vs actual → "+ 1 add, ~ 2 change, - 1 destroy", exit non-zero if any
5. Review the plan | a human reads the diff; replacement of a database is where you stop
6. Apply | execute in dependency order, one change at a time, honouring create-before-destroy
7. Write state | record real ids and attributes to the remote backend, holding a lock
8. Verify | smoke checks and policy tests confirm the change did what the plan claimed
9. Detect drift | scheduled plan in CI; a non-empty diff means someone edited by hand
10. Promote | the same modules applied to the next environment with different variables
```

## How it works

**Declarative versus imperative.** Declarative tools ([Terraform](/technology/terraform),
CloudFormation, Pulumi in declarative mode, and
[Kubernetes](/technology/kubernetes) manifests) take a target state and converge toward
it, so re-running is safe and idempotent. Imperative scripts (`aws cli` in a bash loop)
describe steps, and re-running them is rarely safe. Configuration-management tools
(Ansible, Chef) sit in between: they converge the *inside* of a machine, while the
declarative tools provision the machine itself.

**State.** The tool needs to know which real resource corresponds to which declaration.
Terraform keeps an explicit state file; Kubernetes stores desired state in the cluster and
runs controllers that reconcile continuously. Explicit state must live in a shared,
versioned, encrypted backend — an [S3](/technology/s3) bucket with locking, or the vendor's
managed backend — never on a laptop. State contains resource attributes, sometimes
including secrets, so it is sensitive data.

**Modules and composition.** Wrap a repeated unit (a service's cluster, queue and alarms)
in a module with a narrow input interface, version it, and instantiate it per environment
and per region. Keep environments as separate state files so a mistake in staging cannot
plan a change in production.

**Reconciliation loops (GitOps).** Instead of a pipeline pushing changes, an in-cluster
agent watches the repository and continuously converges the cluster toward the committed
manifests. Drift is corrected automatically and the repository is the audit log; the
trade-off is another moving part and less direct control over timing.

## Deep Dive

**The plan is the safety mechanism — read it.** Approving a plan without reading it is the
main way IaC causes outages. Watch specifically for *replacement*: changing an immutable
attribute makes the tool destroy and recreate a resource, which for a database or a load
balancer address means data loss or a changed endpoint. Use lifecycle rules to prevent
destruction of stateful resources, and run plan output through policy checks (OPA,
Sentinel, or a simple diff test) so a destroy of anything tagged critical fails
automatically.

**Drift.** Console edits during an incident are inevitable; the failure is leaving them
undiscovered. Run a scheduled plan and alert on a non-empty diff, then either import the
change into code or revert it. The longer drift persists, the more the next apply looks
terrifying and the less anyone wants to run it — the road to abandoned IaC.

**Secrets do not belong in the definitions.** Reference a secret manager and inject at
runtime; do not commit values, and remember that a secret passed through a resource
argument may be stored in plaintext in state and printed in a plan. Encrypt state at rest,
restrict who can read it, and prefer resources that generate credentials in place.

**Blast radius and dependency order.** One giant state file makes every change global,
slows plans, and turns a lock into a team-wide queue. Split by lifecycle and ownership:
networking (rarely changes), data stores (careful), application platform (often). Explicit
dependencies matter — a security group deleted before its instance detaches produces a
half-applied change, which is the most awkward state to recover from.

**Immutable over mutable.** Prefer replacing an instance built from a versioned image over
patching a running one, so environments cannot accumulate hand-made differences. This is
the same reasoning that makes container images better than long-lived VMs, and it pairs
naturally with [Blue-Green Deployment](/pattern/blue-green-deployment).

**Testing infrastructure code.** Validate and format on every commit; run static policy
checks for public buckets, permissive ingress or unencrypted volumes; apply modules to a
throwaway environment and assert behaviour; and keep a `plan`-only job on pull requests so
reviewers see the diff next to the code. Cost estimation in the same job catches the
accidentally oversized cluster before it bills.

**Limits.** IaC does not describe *runtime* behaviour — data migrations, cache warming and
traffic shifting still need orchestration. Provider APIs are eventually consistent, so
applies sometimes need retries. And a resource created outside the tool must be imported
deliberately: adopting IaC on an existing estate is mostly importing reality, not writing
files.
