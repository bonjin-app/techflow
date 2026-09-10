---
id: github-actions
name: GitHub Actions
tagline: CI/CD runner built into GitHub that reacts to repository events with YAML workflows
category: operations
tags: [CI/CD, Automation, DevOps, Pipeline]
difficulty: 2
usedFor: [ci-cd, infrastructure-as-code, availability]
prerequisites: [programming-fundamentals, backend, docker, ci-cd]
learningPath:
  - programming-fundamentals
  - backend
  - docker
  - ci-cd
  - github-actions
  - blue-green-deployment
  - canary-release
related:
  - { to: ci-cd, rel: IMPLEMENTS }
  - { to: docker, rel: USED_WITH }
  - { to: terraform, rel: USED_WITH }
  - { to: kubernetes, rel: USED_WITH }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: canary-release, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: multi-tenant-saas, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "GitHub Actions (hosted x64 and arm64 runners; Ubuntu 24.04 default image)", confidence: high }
---

## TL;DR

GitHub Actions runs YAML-defined workflows on virtual machines in response to repository
events: a push, a pull request, a tag, a schedule, a manual click, or an API call. Because
it lives inside GitHub, there is nothing to install and no separate identity system — the
pipeline sees the code, the pull request and the release it is building. Its distinguishing
feature is the Marketplace of reusable **actions** — also its main risk: every third-party
action runs with access to your secrets.

## Practical

The unit of work is a **workflow** in `.github/workflows/`, containing **jobs** (each on a
fresh runner) made of **steps** (shell commands or actions). Typical uses:

- **Pull-request checks** — lint, type-check, unit and integration tests, build. See
  [CI/CD](/concept/ci-cd).
- **Container builds** — build a [Docker](/technology/docker) image and push it to a
  registry, tagged with the commit SHA.
- **Deployment** — roll the image out to [Kubernetes](/technology/kubernetes) or a
  serverless platform, gated by an environment with required reviewers. Pairs with
  [Blue-Green Deployment](/pattern/blue-green-deployment) and
  [Canary Release](/pattern/canary-release).
- **Infrastructure plans** — `terraform plan` on the pull request, `apply` after merge. See
  [Terraform](/technology/terraform).
- **Scheduled chores** — dependency updates, drift detection, stale-issue cleanup, backups.

```yaml
name: ci
on:
  pull_request:
  push: { branches: [main] }
concurrency:                                  # cancel superseded runs on the same ref
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: test }
        options: >-
          --health-cmd=pg_isready --health-interval=5s --health-retries=10
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    environment: production                   # required reviewers live here
    permissions: { contents: read, id-token: write }   # OIDC, not a long-lived key
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: arn:aws:iam::111122223333:role/deployer, aws-region: eu-west-1 }
      - run: ./scripts/deploy.sh
```

The habits that matter: pin actions to a commit SHA, set `permissions` explicitly per job,
use `concurrency` so old runs cancel, cache dependencies, and prefer OIDC over stored keys.

## Deep Dive

**Runners and isolation.** Each job gets a clean VM (or container). Hosted runners cover
Linux, Windows and macOS on x64 and arm64, with larger and GPU classes available;
self-hosted runners exist for private networks, special hardware or cost control.
Clean-VM-per-job is great for reproducibility and terrible for build caches — every run
starts by downloading dependencies, so cache design is most of your pipeline's performance.

**Events and the trap in `pull_request_target`.** `pull_request` runs against the merge
commit with a *read-only* token and no secrets for forked contributions — safe by design.
`pull_request_target` runs in the base repository's context, with secrets, so checking out
the contributor's code in it hands an untrusted pull request your credentials. It is the
most common serious misconfiguration in public repositories.

**Permissions and OIDC.** The automatic `GITHUB_TOKEN` is scoped per job by the
`permissions` block; default it to read-only organisation-wide and widen where needed. For
cloud access, `id-token: write` lets the job exchange a short-lived OIDC token for a cloud
role, removing long-lived keys from your secret store — the strongest available mitigation
for pipeline credential theft.

**Supply chain.** `uses: some/action@v3` executes someone else's code inside your job.
Popular actions have been compromised in the wild, exfiltrating secrets from runner memory.
Pin to full commit SHAs, review third-party actions before adopting them, and restrict which
actions an organisation may use.

**Reuse and its limits.** Composite actions bundle steps; reusable workflows
(`workflow_call`) share whole jobs across repositories. Both help, but YAML remains YAML:
expressions, `if` conditions and matrices get hard to read, and there is no way to run the
pipeline locally with full fidelity. Once workflows carry real logic, move it into scripts
the workflow simply invokes — that is also how you keep the option of changing CI provider.

**Cost model.** Free for public repositories; private repositories consume included minutes
then bill per minute, with multipliers for macOS and Windows. Long suites on expensive
runners, or a wide matrix on every push, produce bills that grow silently. Self-hosted
runners trade that cost for maintenance and a new security boundary.

## Why

Before pipelines lived beside the code, the build server was separate infrastructure with
its own credentials, plugin versions and idea of what "the project" was.
Configuration was clicked into a web UI and not versioned, so a branch could not change its
own build, and the sentence "it passes locally" was unanswerable.

```steps
title: Before — a build server nobody owns
Configuration is clicked into a UI and lives only on that server
A branch cannot change its own build steps, so new checks wait for an admin
Plugin upgrades break unrelated jobs; the server itself needs patching
Deploy credentials are long-lived keys pasted into the job configuration
The link between a commit, its checks and its release is manual
```

Actions moves the pipeline definition into the repository, where it is reviewed in the same
pull request as the change it tests. A branch can add a check; a revert also reverts the
pipeline; the run is attached to the commit and the pull request that produced it. Cloud
access becomes a short-lived token minted per run rather than a stored key.

```steps
title: After — the pipeline is code in the repository
Workflow YAML sits in .github/workflows and is reviewed like source [ci-cd]
Opening a pull request runs checks against the merge commit automatically
Merging to main builds a container image tagged with the commit SHA [docker]
An environment gate holds the deploy for a required reviewer
The job assumes a cloud role via OIDC — no stored credentials [github-actions]
```

The gain is traceability more than speed: every artefact has a run, every run has a commit,
and the pipeline itself changes through code review.

## Advantages

- No infrastructure to run; a pipeline exists as soon as you add a file
- Integrated with pull requests, releases, environments and required checks
- Pipeline definition is versioned with the code and reviewed in the same change
- OIDC federation removes long-lived cloud credentials from the secret store
- Large marketplace covers most routine steps; matrix builds are trivial to express

## Trade-offs

- Third-party actions are executable code with access to your job — a real supply-chain risk
- YAML with template expressions becomes unreadable as logic grows, and cannot be unit tested
- No faithful local execution; debugging often means pushing commits to find out
- Clean runner per job means dependency caching is your problem, and caches expire
- Minute-based billing on private repositories grows quietly with matrix fan-out
- `pull_request_target` and over-broad `permissions` are easy ways to leak secrets
- Couples your delivery process to GitHub as a vendor

## When to use

- The code already lives in GitHub and needs checks on every pull request
- Container build-and-push pipelines and simple rollouts
- Running `terraform plan`/`apply` with review gates and federated cloud credentials
- Scheduled maintenance jobs needing repository context
- Teams that would rather not operate a build system of their own

## When not to use

- Don't use it when your source of truth is not GitHub — use the CI that ships with your forge
- For complex build graphs with heavy caching needs, a dedicated build system (Bazel, Nx) should do the work and Actions merely invoke it
- When compliance requires builds inside your own network and you cannot operate self-hosted runners safely
- At very high build volume, where per-minute hosted pricing exceeds owned capacity
- As a general workflow engine or job scheduler for production traffic — it is a CI runner, not a durable orchestrator

## Real-world

In a typical [Microservices](/architecture/microservices) repository the flow is: the pull
request runs tests against ephemeral service containers, merge to `main` builds and pushes
an image, and a second workflow updates the deployment manifest so
[Kubernetes](/technology/kubernetes) rolls it out — often as a
[Canary Release](/pattern/canary-release) promoted by a manual approval on a protected
environment. In a [Multi-tenant SaaS](/architecture/multi-tenant-saas) the same mechanism
runs [Terraform](/technology/terraform) for tenant provisioning and nightly drift detection.
Mature setups look boring on purpose: thin workflows, real logic in scripts a developer can
run locally, actions pinned to commit SHAs, cloud access federated. Where risk tolerance is
lowest, release is decoupled from deploy entirely — Actions publishes the artefact and a
[Feature Flag](/pattern/feature-flag) decides when users see the change.
