---
id: session
name: Session
tagline: Server-side state that turns a series of stateless HTTP requests into one conversation
category: backend
tags: [Backend, State, Authentication]
difficulty: 2
prerequisites: [http, backend]
learningPath:
  - http
  - backend
  - session
  - authentication
  - redis
  - load-balancing
related:
  - { to: http, rel: REQUIRES }
  - { to: authentication, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: memcached, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

[HTTP](/concept/http) is stateless: each request arrives with no memory of the last. A
session gives a user a continuing identity across requests by storing state on the
server under a random **session id** and handing that id to the browser, usually in a
cookie. On each request the server looks the id up and recovers who the user is, what is
in their cart, and anything else the application stored.

## Why it matters

Almost every logged-in experience is a session. Without one, a user would authenticate
on every click. Sessions also decide how an application scales: state kept in one
server's memory ties a user to that server, which fights with
[Load Balancing](/concept/load-balancing) and breaks the moment the process restarts.
Where session data lives — memory, a shared store, or inside the token itself — is one
of the first architectural choices in a [Simple Web App](/architecture/simple-web-app),
and one of the hardest to change later.

## Visual

```sequence
title: Login creates a session; later requests reuse it
participants: Browser, App [backend], Store [redis]
Browser -> App: POST /login (credentials)
App -> Store: SET sess:8f3a {userId: 7} TTL 30m
Store --> App: OK
App --> Browser: 200 + Set-Cookie: sid=8f3a; HttpOnly; Secure
Browser -> App: GET /cart  Cookie: sid=8f3a
App -> Store: GET sess:8f3a
Store --> App: {userId: 7}
App --> Browser: 200 cart for user 7
```

## How it works

1. **Create.** After a successful login the server generates a long, unguessable random
   id (128 bits or more) and stores the session record under it.
2. **Transport.** The id is returned in a `Set-Cookie` header. The browser sends the
   cookie automatically on every subsequent request to that domain.
3. **Look up.** Middleware reads the cookie, fetches the record, and attaches the user
   to the request before handlers run.
4. **Expire.** Sessions have a lifetime — an idle timeout refreshed on activity, an
   absolute maximum, or both — implemented with a [TTL](/concept/ttl) on the record.
5. **Destroy.** Logout deletes the record server-side. Because the server owns the state,
   revocation is immediate.

**Where the record lives:**

- *In-process memory* — simplest, fastest, lost on restart, not shared between servers.
  Requires sticky routing at the load balancer.
- *Shared store* — [Redis](/technology/redis) or [Memcached](/technology/memcached).
  Any server can handle any request; the store's TTL handles expiry. The standard
  choice for horizontally scaled apps.
- *Database* — durable and queryable ("log out all devices") but adds a database read
  to every request; usually cached in front.
- *Client-side (stateless) sessions* — the state itself is signed (and possibly
  encrypted) and stored in the cookie or a token. No server lookup, but nothing can be
  revoked before expiry and size is limited. See [Authentication](/concept/authentication)
  for the token variant.

## Deep Dive

**Cookie attributes are security controls.** `HttpOnly` stops scripts from reading the
id, blunting theft via cross-site scripting. `Secure` restricts the cookie to HTTPS.
`SameSite=Lax` or `Strict` prevents the browser from attaching the cookie to
cross-site requests, which is the primary defence against CSRF. A session cookie without
these is a credential lying in the open.

**Session fixation.** If an attacker can plant a known session id in a victim's browser
before login, they share the session afterwards. Always issue a *new* id on
authentication and on privilege changes.

**Sticky sessions vs shared state.** Load balancers can hash on a cookie so a user
always reaches the same server. It works until that server dies, deploys, or becomes a
hotspot. Externalising the state to a shared store removes the constraint and lets
servers be treated as disposable, at the price of a network round trip per request —
sub-millisecond with Redis on the same network.

**Size and churn.** Store a user id and a few flags, not the user's profile. A session
store holding megabytes per user becomes the memory bottleneck, and fetching it on
every request negates the speed advantage.

**Expiry semantics.** Sliding expiry (reset the TTL on every request) keeps active users
logged in indefinitely; combine it with an absolute cap so a stolen id eventually dies.
Sensitive actions (changing email, paying) commonly require re-authentication regardless
of session age.

**Consistency.** A shared store is a cache of truth. If a user's role is revoked in the
database, sessions created earlier still carry the old role until they are refreshed or
invalidated — the same problem as [Cache Invalidation](/concept/cache-invalidation).
Store a version stamp or re-check permissions for high-impact actions.

**Failure of the store.** If Redis is unreachable, every request is effectively logged
out. Run the session store with [Replication](/concept/replication) and a failover
mechanism, and decide deliberately whether the app should fail closed (deny) or degrade
(serve anonymous content) while it is down.

**Server-side sessions vs tokens** is the recurring debate: sessions give instant
revocation and small cookies; self-contained tokens remove the lookup and work across
domains and services. Many systems combine them — a short-lived token for API calls,
backed by a server-side session that can be revoked.
