---
id: dns
name: DNS
tagline: The distributed, cached directory that turns names into addresses
category: networking
tags: [Networking, Infrastructure, Fundamentals]
difficulty: 2
prerequisites: [programming-fundamentals, tcp, udp]
learningPath:
  - programming-fundamentals
  - tcp
  - udp
  - dns
  - https
  - cdn
  - load-balancing
related:
  - { to: udp, rel: REQUIRES }
  - { to: cache, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: cdn, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: https, rel: RELATED_TO }
  - { to: availability, rel: RELATED_TO }
  - { to: kubernetes, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

DNS (Domain Name System) maps human-readable names such as `api.example.com` to IP
addresses and other records. It is a globally distributed, hierarchical database:
root servers delegate to top-level-domain servers, which delegate to the authoritative
servers for each zone. Every answer carries a [TTL](/concept/ttl) and is cached at
multiple layers, which makes DNS fast and also makes changes take time to be seen.

## Why it matters

Every request in a web system starts with a name lookup — the browser resolving your
domain, your service resolving the database host, one microservice finding another.
DNS is therefore on the critical path for latency and [Availability](/concept/availability):
a slow resolver adds tens of milliseconds to cold requests, and a DNS outage takes
down services whose servers are perfectly healthy.

DNS is also a control plane. Traffic steering to the nearest [CDN](/concept/cdn)
edge, blue/green cut-overs, regional failover and service discovery inside
[Kubernetes](/technology/kubernetes) all work by changing what a name resolves to.
Getting TTLs wrong turns a planned two-minute failover into an hour of partial
outage.

## Visual

```sequence
title: Resolving api.example.com (cold cache, then warm)
participants: Browser, Resolver, Root, TLD (.com), Authoritative
Browser -> Resolver: A api.example.com?
Resolver -> Root: A api.example.com?
Root --> Resolver: referral to .com servers
Resolver -> TLD (.com): A api.example.com?
TLD (.com) --> Resolver: referral to ns1.example.com
Resolver -> Authoritative: A api.example.com?
Authoritative --> Resolver: 203.0.113.10 (TTL 300)
Resolver --> Browser: 203.0.113.10
Browser -> Resolver: A api.example.com? (second lookup)
Resolver --> Browser: 203.0.113.10 (cache HIT, TTL remaining 240)
```

Only the first lookup walks the hierarchy. The resolver also caches the referrals, so
later lookups for any `*.example.com` skip the root and TLD entirely.

## How it works

- **Stub resolver** — the library inside your OS or runtime. It asks a recursive
  resolver (your ISP's, a public one, or the one in your cloud VPC) and usually keeps a
  small cache of its own.
- **Recursive resolver** — does the walking: root → TLD → authoritative, caching each
  answer for its TTL. Most queries never leave it.
- **Authoritative servers** — hold the zone file for a domain and give the final
  answer. Operated by you or your DNS provider; typically several, spread across
  networks and often advertised via anycast.
- **Record types** — `A`/`AAAA` (IPv4/IPv6 address), `CNAME` (alias to another name),
  `NS` (delegation), `MX` (mail), `TXT` (arbitrary text, used for verification and
  policy), `SRV` (service host and port).
- **Transport** — queries go over [UDP](/concept/udp) port 53; responses too large for
  one datagram set a truncation flag and the client retries over [TCP](/concept/tcp).
  DNS over TLS/HTTPS encrypts the client–resolver hop.
- **TTL** — the authoritative server sets how long each record may be cached. Clients
  and resolvers count it down; when it reaches zero they ask again.

## Deep Dive

**"Propagation" is cache expiry.** Changing a record does not push anything anywhere.
Resolvers keep the old answer until its TTL runs out. To move traffic at a known time,
lower the TTL to 60 seconds well in advance (at least one old-TTL period), make the
change, then raise it again. Short TTLs mean more queries hitting your authoritative
servers; long TTLs mean slower failover — the same trade-off as any
[Cache](/concept/cache).

**Negative caching.** "No such name" answers are cached too (for the zone's negative
TTL). Deploy the record *before* anything tries to resolve it, or a resolver that
saw NXDOMAIN will keep saying so.

**DNS as a load balancer.** Returning several A records (round-robin) spreads clients
across servers, but crudely: clients may pin to one address, and a dead server stays in
the list until its record is removed and TTLs expire. Health-checked DNS with low TTLs
handles coarse regional [Load Balancing](/concept/load-balancing) and failover;
per-request balancing belongs to a real balancer behind a single name.

**Client-side caching surprises.** Some runtimes cache resolved addresses far longer
than the TTL (older JVMs cached forever by default). A service that resolves the
database hostname once at startup will not notice a failover. Re-resolve on
connection errors and respect TTLs.

**CDNs and CNAME chains.** Pointing `www` at a CDN usually means a `CNAME` to the
provider, whose authoritative servers return an edge IP chosen by the resolver's
location. This is why users behind a distant public resolver can be routed to a
far-away edge; EDNS Client Subnet mitigates it.

**Inside the cluster.** Kubernetes gives every service a name
(`svc.namespace.svc.cluster.local`) served by an in-cluster resolver. High query rates
and the `ndots` search-path behaviour can make DNS a bottleneck; node-local caches
and fully qualified names help.

**Security.** Plain DNS is unauthenticated: a forged response poisons a cache. DNSSEC
signs records; DNS over HTTPS hides queries from the network. Also watch expiring
domains and dangling `CNAME`s pointing at de-provisioned cloud resources — a classic
takeover vector.

## Related

- [TTL](/concept/ttl) — the knob that controls every DNS trade-off
- [CDN](/concept/cdn) — steered almost entirely by DNS
- [Availability](/concept/availability) — failover plans live or die by TTLs
