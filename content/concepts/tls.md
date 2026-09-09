---
id: tls
name: TLS
tagline: Encrypts and authenticates a connection so nobody in between can read or alter it
category: protocol
tags: [Security, Protocol, Networking]
difficulty: 3
prerequisites: [programming-fundamentals, tcp]
learningPath:
  - programming-fundamentals
  - tcp
  - tls
  - https
  - authentication
related:
  - { to: tcp, rel: REQUIRES }
  - { to: https, rel: RELATED_TO }
  - { to: nginx, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: dns, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: payment-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

TLS (Transport Layer Security) is the protocol that puts the "S" in
[HTTPS](/concept/https). A handshake authenticates the server through an X.509
certificate signed by a trusted certificate authority, agrees on a fresh shared key
using ephemeral Diffie–Hellman, and then encrypts every byte with an authenticated
cipher. The result is **confidentiality**, **integrity** and **server authentication**
over an untrusted network — at the cost of one extra round trip and some CPU.

## Why it matters

Anything sent in plaintext over the internet can be read and modified by every network
in between: coffee-shop Wi-Fi, ISPs, cloud providers, attackers who have hijacked a
route. TLS is the layer that makes login forms, API tokens, payment data and
[Session](/concept/session) cookies safe to send at all. Browsers now treat plain HTTP
as insecure, HTTP/2 and HTTP/3 are effectively TLS-only, and compliance regimes for a
[Payment System](/architecture/payment-system) require it.

For backend engineers TLS is also operational reality: certificates expire and cause
outages, handshakes add latency that keep-alive must amortise, and deciding where to
terminate TLS ([nginx](/technology/nginx), a load balancer, a [CDN](/concept/cdn), or
every service via mutual TLS) shapes the security model of the whole system.

## Visual

```sequence
title: TLS 1.3 handshake (one round trip)
participants: Client, Server
Client -> Server: ClientHello — TLS versions, cipher suites, key share, SNI, ALPN
Server --> Client: ServerHello — chosen suite, key share
Server --> Client: {Certificate, CertificateVerify, Finished} (already encrypted)
Client -> Server: Finished + first application data (encrypted)
Server --> Client: application data (encrypted)
```

Both sides derive the same session keys from their key shares without ever sending the
key. Everything after ServerHello is encrypted; the certificate is no longer visible
on the wire.

## How it works

- **Certificate and chain** — the server presents a certificate binding its hostname
  to a public key, signed by an intermediate CA, which is signed by a root the client
  already trusts (shipped with the OS or browser). The client checks the signature
  chain, the hostname (Subject Alternative Name), the validity period and, optionally,
  revocation status.
- **Key exchange** — ephemeral (EC)DHE produces a new shared secret per connection.
  Because the long-term certificate key only *signs* the handshake and never encrypts
  data, recording traffic today and stealing the key tomorrow reveals nothing
  (**forward secrecy**).
- **Record protection** — application data is split into records and protected with an
  AEAD cipher (AES-GCM or ChaCha20-Poly1305), which encrypts and authenticates in one
  step. Tampered records are rejected.
- **Extensions that matter** — SNI tells a server hosting many domains which
  certificate to present; ALPN negotiates the application protocol (`h2`, `h3`,
  `http/1.1`) so no extra round trip is needed to pick HTTP/2.
- **Resumption** — a client that connected recently can present a pre-shared key and
  skip certificate verification; TLS 1.3 even allows 0-RTT data with it, at the risk
  of replay for non-idempotent requests.
- **Mutual TLS (mTLS)** — the client presents a certificate too. Common between
  services inside a mesh, where it doubles as workload [Authentication](/concept/authentication).

## Deep Dive

**Versions.** TLS 1.3 (2018) is the current standard: one-RTT handshake, only forward-
secret key exchange, only AEAD ciphers, and a much smaller attack surface. TLS 1.2 is
still widespread and acceptable with a modern cipher configuration but needs two round
trips. SSL 3, TLS 1.0 and 1.1 are deprecated and disabled in browsers.

**Where to terminate.** Terminating at the edge — a [CDN](/concept/cdn), cloud load
balancer or [nginx](/technology/nginx) — centralises certificates and offloads CPU,
but traffic behind it is plaintext unless re-encrypted. Terminating in each service
(or via a sidecar with mTLS) protects east–west traffic and gives every service a
verifiable identity; [gRPC](/technology/grpc) deployments commonly do this. Many
systems do both: public TLS at the edge, mTLS inside.

**Certificates are an operations problem.** Public certificates now live at most ~13
months and the trend is shorter, so manual renewal is a guaranteed outage. Automate
with ACME (Let's Encrypt or a commercial CA), monitor expiry as a metric, and stage
renewal well before the deadline. Remember internal CAs, database TLS certs and the
ones baked into container images.

**Performance.** The handshake costs one RTT plus an asymmetric signature; the bulk
encryption is nearly free on hardware with AES instructions. The real cost is
handshakes per second, which is why connection reuse, session resumption and HTTP/2
multiplexing matter more than cipher choice. OCSP stapling avoids a client-side
revocation lookup that adds latency and leaks browsing.

**What TLS does not do.** It does not hide *that* you connected, to which IP, or
(without Encrypted Client Hello) to which hostname. It does not authenticate the
*user* — that is the application's job. And it protects data in transit only; data at
rest in the database is a separate concern.

**Trust store pitfalls.** Corporate proxies and some antivirus products install their
own root to inspect traffic; container images with outdated CA bundles reject valid
certificates; certificate pinning in mobile apps breaks on rotation. Each is a
frequent "works on my machine" mystery.

## Related

- [HTTPS](/concept/https) — HTTP carried over TLS
- [TCP](/concept/tcp) — the transport TLS runs on (QUIC embeds TLS 1.3 over UDP)
- [Authentication](/concept/authentication) — what TLS does for servers, apps must do for users
