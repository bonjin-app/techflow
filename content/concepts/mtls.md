---
id: mtls
name: Mutual TLS
tagline: Both ends present a certificate, so the server knows who is calling as well as the reverse
category: security
tags: [Security, TLS, Authentication, Zero Trust]
difficulty: 3
prerequisites: [tls, cryptography, authentication]
learningPath:
  - tls
  - https
  - cryptography
  - mtls
  - service-mesh
  - rbac
related:
  - { to: tls, rel: REQUIRES }
  - { to: service-mesh, rel: USED_IN }
  - { to: authentication, rel: RELATED_TO }
  - { to: cryptography, rel: RELATED_TO }
  - { to: cloud-networking, rel: RELATED_TO }
  - { to: rbac, rel: RELATED_TO }
  - { to: secrets-management, rel: RELATED_TO }
  - { to: service-discovery, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-15, confidence: high }
---

## TL;DR

Ordinary [TLS](/concept/tls) authenticates one side: the client verifies the server's
certificate, and the server has no idea who the client is until the application checks a
token. Mutual TLS adds the other direction — the client presents a certificate too, and the
connection only completes if both sides verify. The identity is then a property of the
connection rather than a string in a header, which is why it is the standard way services
authenticate each other inside a cluster. The reason people avoid it is not the handshake;
it is that every workload now needs a certificate, and certificates expire. Whoever issues
and rotates them is the whole project.

## Why it matters

Inside a private network, most services authenticate callers with a shared secret in a
header, or with nothing at all — the network is the boundary. Both assumptions fail the same
way: one compromised workload, one leaked token, one misconfigured security group, and the
attacker is a legitimate client of everything.

A bearer token has a structural weakness: it is a string, so anyone who obtains it can use
it. It appears in logs, in environment variables, in a crash dump, in an error message. A
client certificate cannot be replayed in the same way, because using it requires the private
key, and the key never leaves the workload.

mTLS also answers a question a token cannot: *which workload is this?* The identity is bound
to the connection, established before a single byte of your protocol is exchanged, and it is
the same whether the caller speaks HTTP, gRPC or a database wire protocol. That is what makes
it the foundation of a zero-trust design, where the network gives no privileges and every
call is authenticated on its own.

## Visual

```sequence
title: A handshake where both sides prove who they are
participants: Client [backend], Server [rest], CA [secrets-management]
CA --> Client: short-lived cert + key for spiffe://prod/orders
CA --> Server: short-lived cert + key for spiffe://prod/payments
Client -> Server: ClientHello
Server --> Client: ServerHello, its certificate, and a certificate request
Client -> Client: verify the server chains to the trusted CA, and the name matches
Client -> Server: its own certificate, plus a signature proving it holds the key
Server -> Server: verify the chain, the name, and that the cert is not revoked
Server -> Server: authorise — is spiffe://prod/orders allowed to call this endpoint?
Server --> Client: handshake complete; the identity is now a property of the connection
Client -> Server: the request, carrying no credential of its own
```

## Solutions

**Let a mesh or the platform do it.** A [service mesh](/concept/service-mesh) issues a
certificate to every workload, rotates it every few hours, and terminates mTLS in a sidecar,
so application code sees a plain local connection and never handles a key. This is the only
version most teams should attempt: hand-rolled mTLS across dozens of services is a
certificate-distribution problem that will eventually page someone at 3am.

**Make certificates short-lived and automatic.** An identity valid for hours, renewed
continuously, removes the two failure modes of long-lived certificates: the expiry nobody
diarised, and the leaked key that stays useful for a year. Short lifetimes also make
revocation mostly unnecessary, which matters because revocation checking is the part of the
X.509 design that works least well in practice.

**Separate identity from authorisation.** The handshake proves the caller is
`orders`. It says nothing about whether `orders` may issue a refund. Keep a policy layer —
which identity may call which method — and treat the certificate as the input to it, not the
answer. This is [RBAC](/concept/rbac) with a certificate as the subject.

**Name workloads, not machines.** An identity like `spiffe://prod/orders` survives
rescheduling, autoscaling and a new IP; an identity tied to a hostname or an address does not.
SPIFFE exists to standardise exactly this, and it is why mTLS composes with
[service discovery](/concept/service-discovery) instead of fighting it.

**Terminate at the edge, re-establish inside.** Public clients cannot present workload
certificates, so the internet-facing edge does ordinary TLS plus user authentication, and
opens a separate mTLS connection inwards. Trying to extend workload identity to browsers is
the usual way this goes wrong.

**Keep the private keys out of your code and your images.** Keys are issued to the workload
at start-up by the platform or a secrets system, held in memory or a tmpfs, and never
committed, logged or baked into an image — see
[Secrets Management](/concept/secrets-management).

## Deep Dive

**What the handshake actually adds.** Standard TLS already proves the server's identity and
derives a session key. Mutual TLS adds a `CertificateRequest` from the server, a certificate
from the client, and a `CertificateVerify` — a signature over the handshake transcript that
proves the client holds the matching private key. Because the signature covers the transcript,
it cannot be replayed on another connection. Under TLS 1.3 this costs one extra message in
the same round trip, so the latency argument against mTLS is largely obsolete; the cost is
CPU for the signature and, more importantly, operational.

**Revocation is the weak joint.** Certificate revocation lists and OCSP are slow, often
unavailable, and frequently soft-failed — a checker that cannot reach the responder usually
allows the connection. This is why short lifetimes are the real mitigation: a certificate
that expires in an hour is a revocation list that maintains itself. If you must revoke
faster, that is a property of your issuing system, not of X.509.

**Trust is a decision about the CA, not about TLS.** Every workload that trusts your internal
CA will accept any certificate it signs, so the CA's key is the crown jewel and the scope of
what it may issue matters. Intermediate CAs per environment, and a policy about which names
each may sign, stop a staging compromise from minting a production identity. A private CA is
correct here — public CAs are for public names, and using one for internal workloads exposes
your service names in certificate transparency logs.

**Clock skew breaks it in a confusing way.** Certificates are valid between two timestamps,
so a workload whose clock is minutes off rejects perfectly good certificates with an error
that names validity rather than time. With hour-long certificates the margin is thin; NTP is
a dependency of your authentication layer whether you planned it that way or not.

**Debugging gets harder, and you should plan for it.** `curl` against an mTLS endpoint needs
a client certificate; a packet capture shows nothing useful; a mesh means the connection your
application opens is not the connection on the wire. Provide a documented way to make an
authenticated call by hand, keep the sidecar's logs accessible, and make sure a failed
handshake produces a message that names the identity and the reason rather than "connection
reset".

**Where it does not fit.** Between a browser and your server — the certificate provisioning
problem has no good answer for end users outside tightly managed devices. For a public API,
where an API key or OAuth token is what integrators expect, though mTLS is common in banking
and payment integrations precisely because both ends are managed. And inside a single process
or a trusted local socket, where it is cost with no threat model behind it.
