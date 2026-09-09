---
id: https
name: HTTPS
tagline: HTTP carried inside a TLS connection — encrypted, tamper-proof, server-authenticated
category: protocol
tags: [Security, Protocol, Web]
difficulty: 2
prerequisites: [http, tcp, tls]
learningPath:
  - tcp
  - http
  - tls
  - https
  - cdn
  - authentication
related:
  - { to: http, rel: REQUIRES }
  - { to: tls, rel: REQUIRES }
  - { to: dns, rel: RELATED_TO }
  - { to: nginx, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: authentication, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

HTTPS is not a separate protocol: it is ordinary [HTTP](/concept/http) sent through a
[TLS](/concept/tls) connection, by convention on port 443. TLS provides the
encryption, integrity and server identity; HTTP stays exactly the same on the inside.
Today it is the default for every public website and API, and the only way to get
HTTP/2 and HTTP/3 in browsers.

## Why it matters

Without HTTPS, every request is readable and modifiable by the networks it crosses.
That means stolen [Session](/concept/session) cookies, injected scripts and ads, and
tampered downloads. Browsers mark plain HTTP pages "Not secure", refuse to send
`Secure` cookies over it, and gate powerful APIs (geolocation, service workers, camera)
behind secure origins. Search engines and app stores penalise or reject unencrypted
endpoints.

For engineers the practical questions are operational: where the certificate lives,
how it is renewed, how much latency the handshake adds, how redirects and HSTS are
configured, and whether internal service-to-service traffic should also be encrypted.
An [E-commerce](/architecture/e-commerce) checkout, an [Authentication](/concept/authentication)
flow and a plain [REST](/concept/rest) API all depend on getting these right.

## Visual

```steps
title: What happens on the first HTTPS request
DNS lookup [dns] | name → IP address, usually cached
TCP handshake [tcp] | SYN, SYN-ACK, ACK — one round trip
TLS handshake [tls] | certificate check + key agreement — one more round trip (TLS 1.3)
ALPN chooses HTTP/2 or HTTP/1.1 | negotiated inside the TLS handshake, no extra trip
Encrypted HTTP request [http] | GET /cart with cookies and headers, all encrypted
Encrypted HTTP response | body, headers and status invisible to the network
Connection reused | keep-alive / HTTP/2 multiplexing amortise the setup cost
```

A cold HTTPS request costs at least two round trips before the first byte of HTTP;
everything afterwards on the same connection pays nothing extra.

## How it works

- **Ports and URLs** — `https://` implies port 443. A server usually also listens on
  80 only to redirect to HTTPS with a `301`.
- **Certificate for the hostname** — the certificate must cover the exact name in the
  URL (or a wildcard). Multi-tenant hosts pick the right certificate using SNI from the
  client's hello.
- **Termination point** — TLS is decrypted somewhere: a [CDN](/concept/cdn) edge, a
  cloud load balancer, an [nginx](/technology/nginx) reverse proxy, or the
  application server itself. Everything behind that point sees plain HTTP unless
  re-encrypted.
- **HSTS** — the `Strict-Transport-Security` header tells browsers to use HTTPS for
  this domain for a long period even if the user types `http://`, closing the
  downgrade window on the very first request. Preload lists bake this into browsers.
- **Mixed content** — an HTTPS page that loads a script or image over HTTP is
  downgraded or blocked. Every sub-resource must be HTTPS.
- **HTTP versions** — HTTP/2 is negotiated via ALPN inside TLS; HTTP/3 runs over QUIC
  on [UDP](/concept/udp) with TLS 1.3 built in, and is advertised through an
  `Alt-Svc` header or DNS record.

## Deep Dive

**What HTTPS guarantees — and what it does not.** It guarantees that the bytes you
receive came from a server holding the private key for a certificate a CA issued for
that hostname, and that nobody read or altered them in transit. It does *not* prove the
site is honest (phishing sites have valid certificates), hide the hostname or IP from
the network, hide traffic volume, or protect data once it reaches the server.

**Latency budget.** [DNS](/concept/dns) plus [TCP](/concept/tcp) plus TLS is three
round trips before the first request; over a 100 ms mobile link that is 300 ms of
nothing. Mitigations, in order of impact: keep connections alive; use HTTP/2 so one
connection serves all requests; enable TLS session resumption; terminate at a nearby
CDN edge so the round trips are short; consider HTTP/3 for lossy networks. Preconnect
hints let browsers start the handshake early.

**Redirects and cookies.** Redirecting `http://` to `https://` still exposes the first
request; HSTS fixes subsequent ones. Set `Secure` on every cookie so it is never sent
over HTTP, and `HttpOnly` so scripts cannot read it. Never let session ids appear in
URLs — HTTPS encrypts them in transit but they still land in logs and referrers.

**Internal traffic.** Terminating at the edge and running plaintext inside a private
network was long the norm. Zero-trust practice now encrypts east–west traffic too,
typically with mutual TLS from a service mesh, so a compromised pod cannot sniff the
neighbours. The cost is certificate distribution and rotation for every workload.

**Certificates as a failure mode.** An expired or misconfigured certificate is a hard
outage: clients refuse to connect. Monitor expiry, automate renewal, and test the full
chain (a missing intermediate works in browsers that cache it and fails in `curl`).
Staging environments should use real certificates from a real CA, not self-signed
ones, so client behaviour matches production.

**APIs and clients.** Server-to-server clients must actually verify certificates —
disabling verification "to make it work" silently removes all of HTTPS's guarantees.
Pin only when you control both ends and have a rotation plan.

## Related

- [TLS](/concept/tls) — the layer that does the actual work
- [HTTP](/concept/http) — unchanged inside the tunnel
- [CDN](/concept/cdn) — where most public HTTPS is terminated today
