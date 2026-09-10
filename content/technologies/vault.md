---
id: vault
name: HashiCorp Vault
tagline: Identity-based secrets management with dynamic credentials and short-lived leases
category: security
tags: [Security, Secrets, Identity, Infrastructure, Encryption]
difficulty: 4
usedFor: [secrets-management, authentication, rbac]
prerequisites: [backend, authentication, tls, secrets-management]
learningPath:
  - backend
  - authentication
  - tls
  - secrets-management
  - vault
  - kubernetes
related:
  - { to: secrets-management, rel: IMPLEMENTS }
  - { to: authentication, rel: RELATED_TO }
  - { to: rbac, rel: RELATED_TO }
  - { to: kubernetes, rel: USED_WITH }
  - { to: terraform, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: sidecar, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: multi-tenant-saas, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Vault 1.x (BUSL-licensed since 1.15; OpenBao is the MPL-licensed fork)", confidence: medium }
---

## TL;DR

Vault stores secrets, but its more interesting job is *not* storing them: it authenticates a
workload against a trusted identity (a Kubernetes service account, a cloud IAM role, an OIDC
login), decides what that identity may access, and then **generates a credential on demand**
with a short lifetime and an automatic revocation. Every secret handed out is leased,
auditable and attributable. The mental shift is from "where do we keep the database password"
to "no long-lived database password exists".

## Practical

Vault is a single API behind everything, and the CLI mirrors it:

```bash
# 1. A workload authenticates as itself — no bootstrap password.
vault write auth/kubernetes/login \
  role=api jwt="$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)"
# → a client token, bound to a policy, with a TTL

# 2. Static secrets: versioned key/value.
vault kv put secret/api/stripe key=sk_live_…
vault kv get -field=key secret/api/stripe

# 3. Dynamic secrets: Vault creates the DB user, then destroys it.
vault read database/creds/api-role
#   username  v-kubernetes-api-7f3a…
#   password  …
#   lease_id  database/creds/api-role/9Xk…      lease_duration  1h

# 4. Encryption as a service — the key never leaves Vault.
vault write -field=ciphertext transit/encrypt/pii plaintext="$(base64 <<< 'card')"

# 5. Anything leased can be revoked immediately, everywhere.
vault lease revoke -prefix database/creds/api-role
```

In practice applications rarely call this API themselves. A Vault Agent or the Kubernetes
injector runs as a [Sidecar](/pattern/sidecar), logs in with the pod's identity, writes the
rendered secret to a shared memory volume or an environment file, and renews the lease in
the background — so application code just reads a file. See
[Secrets Management](/concept/secrets-management).

## Deep Dive

**Everything routes through identity.** An *auth method* trades an externally verifiable
identity for a Vault token: the Kubernetes method validates a service-account token against
the cluster API, cloud methods validate instance or role identity, OIDC/JWT covers humans
and CI. That token carries *policies* — path-and-capability rules over the secret tree,
deny-by-default and composable, which makes them the practical expression of
[RBAC](/concept/rbac) over secrets. Getting the first identity right is the whole trick:
hand a workload a static Vault token and you have recreated the problem you were solving.

**Secret engines do different jobs.** *KV v2* is versioned static storage — API keys you did
not issue. The *database* engine creates and drops real users in
[PostgreSQL](/technology/postgresql), MySQL and others on request. *PKI* issues short-lived
X.509 certificates, which is how service-to-service [TLS](/concept/tls) gets automated.
*Transit* encrypts and signs without exposing the key. Cloud engines mint short-lived cloud
credentials instead of static access keys.

**Leases are the reason dynamic secrets are safe.** Every dynamic secret comes with a lease:
renew it, or Vault revokes the underlying credential when it expires. A leaked credential is
useful for its remaining TTL, not forever. Revocation is cascading, so revoking a token
revokes everything it created — the incident-response primitive that static secrets never
offer.

**Sealed by default.** Vault's data is encrypted with a master key, itself encrypted by an
unseal key split with Shamir's secret sharing among several holders. A freshly started Vault
is *sealed* and serves nothing until enough shares are supplied, or until an auto-unseal
backend (a cloud KMS or HSM) does it. That is a real security property and a real
operational burden: the failure mode is "all secrets unavailable".

**It sits on the critical path.** If workloads fetch secrets at start-up, Vault's
availability is your platform's availability: run several nodes with integrated Raft
storage, replicate across zones, cache in the agent, and treat upgrades like a database's.
See [Availability](/concept/availability).

**Audit is first-class.** Audit devices log every request and response with values hashed,
which is how "who read this secret, when" becomes answerable — often the actual reason an
organisation adopts Vault.

**Provisioning and licensing.** Auth methods, engines and policies are configuration, usually
managed with [Terraform](/technology/terraform) — with the usual caution, since Terraform
state can contain what Vault issued. HashiCorp moved Vault to the Business Source License
with 1.15, and OpenBao is the Linux-Foundation-hosted MPL fork; both are in production use,
and the choice is about licensing rather than capability.

## Why

Most systems start with secrets as configuration: a password in an environment variable, the
same value in CI, in a `.env` on someone's laptop, and in a chat message from the day it was
set up. Nothing about that is auditable, and rotation requires coordinating every consumer.

```sequence
title: Before — one long-lived shared password
participants: Dev, CI [github-actions], App [backend], DB [postgresql]
Dev -> CI: store DB_PASSWORD as a CI secret
CI -> App: inject the same value into every environment
App -> DB: connect with the shared credential
Dev -> Dev: same value in a local .env, a wiki page and a chat thread
App --> DB: rotation needs a coordinated restart, so it never happens
```

With Vault the application proves *who it is* and receives a credential minted for it alone,
valid for an hour, revocable centrally, and recorded in an audit log.

```sequence
title: After — identity-derived, short-lived credentials
participants: App [backend], Vault [vault], DB [postgresql]
App -> Vault: login with its Kubernetes service-account token
Vault --> App: token bound to a policy (TTL 1h)
App -> Vault: read database/creds/api-role
Vault -> DB: CREATE ROLE v-api-7f3a … VALID UNTIL now() + 1h
Vault --> App: username + password, lease 1h
App -> DB: connect with a credential no one else holds
Vault -> DB: DROP ROLE on lease expiry or revocation
```

The change is not "the secret is encrypted at rest" — most secret stores do that. It is that
secrets become *short-lived, attributable and revocable*, which turns a leak from a rotation
project into a revoke command.

## Advantages

- Dynamic credentials remove long-lived shared passwords from the system entirely
- Access follows a workload's deployment identity rather than a copied file
- Central, cascading revocation — a real answer to "we think a token leaked"
- Complete audit trail of secret access
- Encryption and signing as a service, so applications never handle key material
- Automated short-lived PKI, making mutual TLS between services maintainable
- One interface across clouds, databases and certificate authorities

## Trade-offs

- Real operational complexity: HA topology, storage, unseal keys, backups, upgrades
- Becomes a hard dependency on the start-up path of every workload that uses it
- The seal/unseal model needs a documented, rehearsed human procedure
- Policy and path design is easy to get wrong and awkward to refactor later
- Dynamic database credentials mean churning database roles and a connection pool that must handle rotation
- Integration is rarely "just an env var" — you adopt an agent, injector or client library
- BUSL licensing since 1.15 split the ecosystem, with OpenBao as the open-source fork

## When to use

- Several services and environments needing database, cloud or third-party credentials
- Any requirement to prove who accessed which secret, and when
- Regulated or audited environments where credential rotation must be demonstrable
- Service-to-service mTLS at a scale where issuing certificates by hand has stopped working
- Applications that must encrypt fields without holding the encryption key
- Multi-tenant platforms needing per-tenant credential and key isolation

## When not to use

- Don't run Vault for one application when the cloud provider's managed secret manager covers it
- Don't use it as an application database or a general key/value store; it is a secrets API with strict access paths
- Don't adopt it before you have workload identity — otherwise you are just moving a static token
- Don't put user credentials or sessions in it — that is [Authentication](/concept/authentication) with [JWT](/concept/jwt) or sessions
- Don't add it to a small team's stack with no one to own unseal keys, backups and upgrades
- Don't treat it as a substitute for keeping secrets out of [Git](/technology/git) in the first place

## Real-world

In a [Microservices](/architecture/microservices) platform on
[Kubernetes](/technology/kubernetes), the usual shape is: the pod's service account is its
identity, an injector sidecar logs in with it, and the pod receives database credentials on
a one-hour lease plus a service certificate from Vault's PKI engine. CI pipelines
authenticate with OIDC instead of storing static keys — the same pattern
[GitHub Actions](/technology/github-actions) uses for cloud access. In an
[Authentication System](/architecture/authentication-system), the transit engine holds token
signing keys so no service loads a private key, and rotation becomes a Vault operation. In a
[Multi-tenant SaaS](/architecture/multi-tenant-saas) it commonly holds per-tenant keys,
which makes "delete a tenant's data" implementable as "destroy that tenant's key". The
recurring lesson is unglamorous: design the policy tree and the unseal runbook early,
because both are painful to change once every service depends on them.
