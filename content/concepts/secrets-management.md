---
id: secrets-management
name: Secrets Management
tagline: Keep credentials out of code and hand workloads short-lived ones on demand
category: security
tags: [Security, Operations, Credentials, Infrastructure]
difficulty: 3
prerequisites: [authentication, tls, ci-cd]
learningPath:
  - authentication
  - tls
  - secrets-management
  - vault
  - infrastructure-as-code
related:
  - { to: vault, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: ci-cd, rel: RELATED_TO }
  - { to: infrastructure-as-code, rel: RELATED_TO }
  - { to: authentication, rel: REQUIRES }
  - { to: rbac, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: multi-tenant-saas, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Secrets management is the practice of storing credentials — database passwords, API keys,
signing keys, TLS private keys — outside application source and configuration, and giving
each workload only the secrets it needs, for only as long as it needs them. The modern
form issues **dynamic, short-lived credentials** from a central authority instead of
distributing long-lived static strings. The hard parts are not encryption but identity
("who is asking?"), rotation, and having an audit trail.

## Why it matters

A secret in a Git repository is permanently compromised: it lives in history, in every
clone, in CI caches and in developer laptops, and nobody can tell you who used it. Static
credentials also make rotation so painful that it never happens, so a single leak stays
exploitable for years. Concentrating secrets behind an authenticated, audited API changes
the blast radius of a leak from "forever, everywhere" to "one workload, for minutes", and
turns rotation from a coordinated outage into a routine background job.

## Visual

```sequence
title: A workload obtains a short-lived database credential
participants: Workload [kubernetes], Platform IdP, Vault [vault], DB [postgresql]
Workload -> Platform IdP: request identity token for its service account
Platform IdP --> Workload: signed identity assertion (audience vault)
Workload -> Vault: login (role orders-api) with the assertion
Vault -> Platform IdP: verify signature, issuer, audience, expiry
Platform IdP --> Vault: valid, subject is ns/orders sa/orders-api
Vault --> Workload: session token, TTL 20m, policy orders-read
Workload -> Vault: read database/creds/orders-api
Vault -> DB: CREATE ROLE v-orders-7f3 with grants, VALID UNTIL now+1h
Vault --> Workload: username, password, lease 1h
Workload -> DB: connect using the issued credential
Workload -> Vault: renew lease before expiry
Vault -> DB: DROP ROLE on lease expiry or revoke
```

## Solutions

**A dedicated secret store.** [Vault](/technology/vault) and the managed secret managers
offered by cloud providers expose secrets over an authenticated API, encrypt them at rest
with a key the store controls, and log every read. Reading through an API rather than a
file also means access can be revoked centrally.

**Workload identity instead of a bootstrap secret.** The oldest problem in the field is
the *secret zero* problem: whatever credential a service uses to fetch its other
credentials. The answer is to derive identity from the platform — a
[Kubernetes](/technology/kubernetes) projected service-account token, a cloud instance
identity document, or an OIDC token minted by
[GitHub Actions](/technology/github-actions) for one workflow run. The platform already
knows what the workload is; the secret store just needs to trust its signature.

**Dynamic secrets.** Rather than storing a database password, the store holds an admin
credential and creates a fresh, narrowly scoped user per lease. Nothing long-lived exists
to steal, and revocation is a `DROP ROLE`.

**Envelope encryption and KMS.** Data keys encrypt the data; a key-management service
encrypts the data keys and never releases the root key. Rotating the root key does not
require re-encrypting terabytes.

**Delivery to the process.** Environment variables are simple but visible to anything that
can read `/proc` and often leak into crash dumps and log lines. Mounted files (`tmpfs`),
or an in-process SDK call, are safer and support live rotation.

**Detection as a backstop.** Pre-commit hooks and repository scanning catch the mistakes
that policy alone will not. Treat every detection as a real leak and rotate.

## Deep Dive

**Rotation only works if the application cooperates.** A store can issue a new credential
every hour, but if the service reads it once at startup, rotation becomes a rolling
restart — and a failed renewal becomes an outage. Connection pools need to re-authenticate
on reconnect rather than cache a password for the process lifetime; see
[Connection Pooling](/concept/connection-pooling). Short TTLs plus a renewal loop with
jitter is the standard combination; identical TTLs across a fleet produce a synchronised
stampede against the store.

**The store becomes a hard dependency.** If it is unavailable, new pods cannot start and
leases cannot renew. That argues for high availability, cached leases that outlive brief
outages, and a documented break-glass path — usually a sealed offline copy of the root
key material held by multiple people.

**Auditing is the quiet payoff.** A read log answers "which workloads used this key in the
last 30 days?", which is what makes decommissioning a credential safe. Without it, teams
keep unused credentials alive out of fear.

**Trade-offs worth naming.** Dynamic secrets are strictly better for databases and cloud
APIs, but many third-party services only issue static keys — for those, the store is a
vault with rotation reminders, not a credential factory. Per-request fetches add latency
and a failure mode; caching adds staleness after revocation. Encrypting secrets into Git
(sealed-secrets, SOPS) keeps the GitOps workflow of
[Infrastructure as Code](/concept/infrastructure-as-code) intact but gives up central
revocation and read auditing, and the ciphertext is permanent — a leaked decryption key
retroactively exposes all history.

**Common failure modes.** One shared "app" policy that can read every secret, defeating
least privilege — scope policies the way you would scope
[RBAC](/concept/rbac). Secrets logged by well-meaning debug statements or echoed by a
health endpoint. Copies drifting into CI variables, ticket comments and shared password
files, so rotation misses one and breaks production. TLS trust in the client disabled to
"fix" a certificate error, which reduces the whole design to plaintext over the network —
[TLS](/concept/tls) verification is what stops an attacker from impersonating the store.

**Where it shows up.** Any pipeline that deploys needs registry, cloud and signing
credentials, so [CI/CD](/concept/ci-cd) is usually the first system to adopt short-lived
OIDC-based credentials. In [Multi-Tenant SaaS](/architecture/multi-tenant-saas), per-tenant
encryption keys and per-tenant integration credentials make the store part of the tenancy
model rather than an operational detail.

## Related

- [Vault](/technology/vault) — a widely used implementation with dynamic secrets and leases
- [Authentication](/concept/authentication) — the identity the store checks before issuing
- [RBAC](/concept/rbac) — the shape of policies that scope each read
- [CI/CD](/concept/ci-cd) — the highest-value place to remove static credentials
