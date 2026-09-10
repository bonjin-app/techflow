---
id: jwt-vs-session
name: JWT vs Session
tagline: A self-contained signed token, or a server-side session the server can revoke
category: decision
tags: [Authentication, Security, Session, Token, Decision]
difficulty: 3
subjects: [jwt, session]
related:
  - { to: authentication, rel: RELATED_TO }
  - { to: oauth, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: authentication-system, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Both answer "who is calling me". A [session](/concept/session) stores the answer on the
server: the client holds an opaque id, and every request looks that id up in a shared store.
A [JWT](/concept/jwt) puts the answer inside the token itself, signed, so any service can
verify it with a key and no lookup at all. That single difference produces every other
trade-off. Sessions cost a read per request but can be revoked instantly and can hold as
much data as you like. JWTs cost nothing to verify but are valid until they expire, travel
on every request, and cannot be un-issued. Most production systems end up using both: a
short-lived JWT access token plus a server-side refresh session.

## Comparison

```compare
Feature            | JWT [jwt]                                      | Session [session]
Where state lives  | In the token, on the client                     | In a server-side store, keyed by id
Verification cost  | Signature check, no I/O                        | One lookup per request (Redis or DB)
Revocation         | Not possible before expiry without a blocklist  | Delete the record; effective immediately
Size on the wire   | 300 B - 2 KB, sent with every request           | Opaque id, typically 32-64 bytes
Payload visibility | Base64, readable by anyone holding it          | Nothing readable leaves the server
Horizontal scaling | Any service verifies with the public key       | All servers need the shared session store
Logout everywhere  | Requires a version or blocklist check          | Delete all records for the user
Rotating claims    | Stale until the token expires                  | Next request sees the new value
Cross-domain / API | Natural fit for mobile clients and service calls | Needs cookie scoping or a token bridge
Failure mode       | Key compromise means every token is forgeable   | Store outage means nobody can log in
```

## Decision

```decision
? Must you be able to log a user out, or drop their permissions, within seconds?
  YES -> ? Is a shared low-latency store (Redis) already available to every server?
    YES -> Session [session]
    NO -> ? Can you tolerate a short-lived token plus a revocation list check?
      YES -> JWT [jwt]
      NO -> Session [session]
  NO -> ? Do independent services or third parties need to verify the caller without calling you?
    YES -> JWT [jwt]
    NO -> ? Is this a first-party browser app served from one domain?
      YES -> Session [session]
      NO -> JWT [jwt]
```

## When JWT

- Several services, possibly owned by different teams, must authenticate the same caller
  without a network hop to an auth service on every request.
- The client is a mobile app or another server, where cookies are awkward and a bearer
  token in an `Authorization` header is the natural transport.
- You are already inside an [OAuth](/concept/oauth) / OIDC flow — ID tokens and access
  tokens are JWTs, so the format is chosen for you.
- The claims are stable for the token's lifetime: user id, tenant, a coarse role. Nothing
  that must change mid-session.
- Access tokens are short-lived (5-15 minutes) and paired with a refresh token, so the
  revocation window is bounded by design rather than by hope.

## When Session

- Revocation must be immediate: banning an account, a password change, a stolen device, or
  a role that was just downgraded.
- The application is a first-party web app on one domain. An `HttpOnly`, `Secure`,
  `SameSite=Lax` cookie holding an opaque id is the simplest secure default there is.
- Session data is larger or more sensitive than a token should carry — cart contents, a
  multi-step form, feature entitlements, anything you do not want base64-decoded by the user.
- You want one place to see and end active sessions, which is both a security feature and a
  support feature ("sign out my other devices").
- You already run [Redis](/technology/redis); a session lookup is a sub-millisecond `GET`
  with a [TTL](/concept/ttl), which is cheap enough that "stateless" buys you little.

## Deep Dive

**Revocation is the real decision.** A JWT is a claim signed at issue time; the verifier has
no idea what happened since. The standard mitigations all reintroduce state: a short expiry
plus refresh tokens (the refresh token is a session in everything but name), a denylist of
revoked `jti` values checked on each request, or a per-user `tokenVersion` claim compared
against a stored counter. Each of those requires the lookup that JWTs were supposed to
avoid — so if instant revocation is a requirement, be honest that you are building a session
with extra steps, and check whether a plain session is simply cheaper. What JWTs genuinely
buy in that design is that the *frequent* call (access) is stateless and only the *rare* call
(refresh) touches the store.

**Size is not free.** A session id is a few dozen bytes. A JWT with user id, tenant, roles,
issuer, audience and expiry is commonly 500 B to 1.5 KB, and it is sent on every request,
including image and API calls if it lives in a cookie. That inflates request headers,
can exceed proxy header limits, and matters on mobile networks. Keep claims to identifiers,
never embed a permission list that will grow, and resolve details server-side.

**Where to store the token.** For browsers the safest place is an `HttpOnly`, `Secure`,
`SameSite` cookie: JavaScript cannot read it, so an XSS bug cannot exfiltrate it, at the
cost of needing CSRF protection (which `SameSite` plus a token on state-changing requests
handles). `localStorage` is the common shortcut and the common vulnerability — any injected
script reads it, and there is no expiry the browser enforces. `sessionStorage` narrows the
blast radius to one tab but not to zero. In-memory only, with a refresh cookie to re-obtain
it, is the strongest browser option and costs a refresh call on page load. For native and
service-to-service clients, use the platform keystore and never a plain file.

**Signing and keys.** Prefer asymmetric signatures (RS256/ES256) when more than one party
verifies, so only the issuer holds the private key; HS256 with a shared secret means every
verifier can also mint tokens. Always pin the expected algorithm and validate `iss`, `aud`
and `exp` — accepting whatever `alg` the token declares (including `none`) is the classic
JWT vulnerability. Rotate keys with a `kid` header so rotation does not invalidate every
live token at once. Sessions have their own key management problem: the store is now a
single point of failure and must be replicated, or nobody can authenticate.

## Related

- [Authentication](/concept/authentication) — the problem both solve
- [Session](/concept/session) — the server-side state model
- [OAuth](/concept/oauth) — the flow that usually hands you a JWT
- [Authentication System](/architecture/authentication-system) — both approaches wired into a real design
- [Redis](/technology/redis) — where sessions and revocation lists usually live
