---
id: terraform
name: Terraform
tagline: Declarative infrastructure as code with a state file and a plan/apply loop
category: infrastructure
tags: [Infrastructure, IaC, DevOps, Provisioning, Cloud]
difficulty: 3
usedFor: [infrastructure-as-code, ci-cd, availability]
prerequisites: [backend, docker, infrastructure-as-code]
learningPath:
  - programming-fundamentals
  - backend
  - docker
  - infrastructure-as-code
  - terraform
  - kubernetes
  - ci-cd
  - github-actions
related:
  - { to: infrastructure-as-code, rel: IMPLEMENTS }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
  - { to: kubernetes, rel: USED_WITH }
  - { to: s3, rel: USED_WITH }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: microservices, rel: USED_IN }
  - { to: multi-tenant-saas, rel: USED_IN }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Terraform 1.x (BUSL-licensed since 1.6; OpenTofu is the MPL-licensed fork)", confidence: high }
---

## TL;DR

Terraform describes infrastructure — networks, databases, clusters, DNS records, IAM
policies — as declarative HCL files, then makes reality match them. It reads the current
state, diffs it against your configuration, shows you a **plan** of exactly what it will
create, change or destroy, and applies it only when you agree. The whole model hangs on one
artefact: the **state file**, a record of which real resource corresponds to which block of
config. Learn state and you understand Terraform; ignore it and you will eventually
recreate a production database by accident.

## Practical

What teams actually manage with it:

- **Cloud primitives** — VPCs and subnets, managed databases, object storage, queues,
  load balancers, DNS, certificates, IAM roles. See
  [Infrastructure as Code](/concept/infrastructure-as-code).
- **Clusters, not workloads** — provision the [Kubernetes](/technology/kubernetes) cluster
  and its node pools with Terraform; deploy the applications inside it with Helm/Argo/kubectl.
  Mixing the two lifecycles in one state is a common regret.
- **Repeatable environments** — the same modules instantiated for dev, staging and prod
  with different variable files, so environment drift stops being a mystery.
- **Per-tenant infrastructure** — in a [Multi-tenant SaaS](/architecture/multi-tenant-saas)
  with isolated tenants, one module invoked per tenant.

```text
# Remote state with locking, so two engineers cannot apply at once.
terraform {
  required_version = "~> 1.9"
  backend "s3" {
    bucket       = "acme-tfstate"
    key          = "prod/api/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

module "api_db" {
  source = "../../modules/postgres"

  name              = "api-prod"
  instance_class    = "db.r6g.xlarge"
  multi_az          = true
  backup_retention  = 14
  allowed_cidrs     = [module.vpc.private_cidr]
}

output "db_endpoint" { value = module.api_db.endpoint }
```

The loop is always `terraform init` → `plan` → review the diff → `apply`. In CI the plan is
posted for review on the pull request and the apply runs only after merge, using short-lived
cloud credentials from OIDC rather than static keys. See
[GitHub Actions](/technology/github-actions).

## Deep Dive

**State is the source of truth about mappings.** The state file maps `module.api_db` to a
concrete resource id and caches its last-known attributes. It must be stored remotely
(object storage plus a lock) so a team shares one view, and it must be treated as
sensitive: state frequently contains secrets in plain text. Losing state does not delete
your infrastructure, but Terraform will then propose to create everything again — recovery
means `import`. Splitting state per environment and per blast-radius boundary is the single
highest-value design decision.

**The plan is a graph walk, not a script.** Terraform builds a dependency graph from
references between resources, then walks it in parallel. Ordering you did not express with
a reference is not guaranteed; `depends_on` is the escape hatch. Because the plan is derived
by refreshing real resources, a plan taken minutes ago can be stale — hence
`-out=plan.bin` and applying the saved plan.

**Providers do the real work.** A provider is a plugin that translates resource blocks into
API calls. Its coverage and bug surface, not Terraform itself, is what you feel day to day:
new cloud features arrive in the provider weeks after launch, and provider upgrades can
change diffs. Pin versions and upgrade deliberately.

**HCL is declarative on purpose, and it chafes.** There are no loops in the imperative
sense, only `count` and `for_each`; no functions you define, only modules; conditionals are
ternaries. Moving a resource between modules changes its address and would destroy it, so
Terraform added `moved` blocks and `import` blocks to make refactors declarative. Complex
logic in HCL is a signal to move that logic into a module boundary or out of Terraform.

**Drift is real.** Anything changed by hand in a console, by an autoscaler, or by another
tool shows up as drift on the next plan — sometimes as a destructive diff. Continuous
`plan` runs on a schedule turn drift into a notification instead of a surprise during an
incident.

**Licensing.** Terraform moved from MPL to the Business Source License with 1.6, and
OpenTofu is the community fork that stayed open source under the Linux Foundation. The
configuration language is largely compatible; the choice is mostly about licensing terms and
governance, and both are widely used.

## Why

Infrastructure built by hand in a web console has no record of *why* it looks the way it
does. The only description is the console itself, review means screenshots, and rebuilding
an identical environment depends on whoever remembers the click path.

```steps
title: Before — infrastructure by console
An engineer clicks through the cloud console to create a VPC, database and cluster
Staging is built later, slightly differently, by someone else
A setting is changed during an incident and never written down
Review means a screenshot in a chat thread
Rebuilding the environment after a region outage is an archaeology project
```

Terraform turns that into a text artefact under version control. The configuration is the
description, the plan is the review artefact, and the apply is the only sanctioned way to
change anything — so the history of your infrastructure lives in the same place as the
history of your code.

```steps
title: After — infrastructure as reviewed code
Describe the VPC, database and cluster in HCL modules [infrastructure-as-code]
Open a pull request; CI posts the plan diff for review [github-actions]
Merge triggers apply with short-lived OIDC credentials
Same modules, different variables, produce dev / staging / prod [terraform]
Scheduled plans report drift instead of hiding it
```

The deeper win is not automation but **reviewability**: a destructive change is visible as
a `-/+ destroy and then create` line before it happens, not after.

## Advantages

- One declarative description of infrastructure, versioned and reviewed like application code
- The plan step makes destructive changes visible before they happen
- Huge provider ecosystem — most clouds, SaaS vendors, DNS and identity systems are covered
- Modules make environments reproducible and per-tenant provisioning practical
- Cloud-agnostic tooling and syntax, even though each provider's resources are specific
- Well-understood CI integration and a large body of published patterns

## Trade-offs

- State is a fragile, sensitive, single-writer artefact you must operate carefully
- HCL is a configuration language, not a programming language; complex logic gets ugly
- Refactors change resource addresses; without `moved`/`import` blocks they destroy things
- Provider bugs and version upgrades produce diffs you did not ask for
- Slow feedback: a plan against a large account takes minutes, so the inner loop is long
- Not cloud-portable in practice — modules are written against specific provider resources
- BUSL licensing since 1.6 pushed part of the community to the OpenTofu fork

## When to use

- Provisioning and evolving cloud infrastructure that more than one person touches
- Standing up identical dev/staging/prod environments from the same definitions
- Long-lived resources with real blast radius: networks, databases, IAM, DNS
- Per-tenant or per-region infrastructure that must be created many times identically
- Any team that needs an audit trail for infrastructure change

## When not to use

- Don't use Terraform to deploy application versions — that belongs in a [CI/CD](/concept/ci-cd) pipeline with [Blue-Green Deployment](/pattern/blue-green-deployment) or [Canary Release](/pattern/canary-release)
- For in-cluster Kubernetes objects, a Kubernetes-native tool (Helm, Argo CD) fits the reconciliation loop better
- For configuring the inside of long-lived servers — that is Ansible/Chef/Puppet territory, or better, an immutable image
- For fast-churning, short-lived resources where the plan/apply latency dominates
- For a solo prototype in a sandbox account where the state file is more work than the infrastructure

## Real-world

Terraform is usually the first thing that runs in a new environment and the last thing
anyone wants to touch during an incident. In a [Microservices](/architecture/microservices)
platform it creates the cluster, the managed [PostgreSQL](/technology/postgresql) instances,
the [Kafka](/technology/kafka) topics and the [S3](/technology/s3) buckets, then hands off
to the deployment pipeline. In an
[Analytics Pipeline](/architecture/analytics-pipeline) it provisions the object storage,
warehouse and IAM roles that the transform jobs assume. In a
[Multi-tenant SaaS](/architecture/multi-tenant-saas) with isolated tenants, tenant
onboarding is often literally a Terraform module invocation. The state layout — one state
per environment per blast-radius boundary, stored remotely with locking — is the part
experienced teams get right early and everyone else fixes after their first accidental
`destroy`.
