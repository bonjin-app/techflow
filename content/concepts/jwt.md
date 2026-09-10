---
id: jwt
name: JWT
tagline: A signed, self-contained token any service can verify without a database lookup
category: security
tags: [Security, Identity, Token, Backend]
difficulty: 3
prerequisites: [http, session, authentication]
learningPath:
  - http
  - authentication
  - session
  - jwt
  - oauth
  - rbac
related:
  - { to: authentication, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: oauth, rel: RELATED_TO }
  - { to: https, rel: REQUIRES }
  - { to: serialization, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

A JSON Web Token is three base64url segments — header, payload, signature — joined by
dots. The payload carries claims (`sub`, `exp`, `iss`, `aud`, roles), and the signature
lets any holder of the verification key confirm the token was issued by a trusted party
and has not been altered. That makes authentication **stateless**: no session store
lookup per request. The price is that a JWT stays valid until it expires, so revocation
and short lifetimes need explicit design.

## Why it matters

In a system with several services, checking a [Session](/concept/session) id means every
service talks to a shared store on every request — a hot dependency and a latency floor.
A signed token moves the check into the process: verify a signature, read the claims,
done. This is why JWTs are the default access-token format for
[OAuth 2.0](/concept/oauth) APIs and for service-to-service calls in
[Microservices](/architecture/microservices). It is also why misusing them — long
lifetimes, secrets in the payload, tokens in `localStorage` — turns a convenience into a
breach. See [JWT vs Session](/compare/jwt-vs-session) for the choice itself.

## Visual

```steps
title: Anatomy and verification of a JWT
1. Header | base64url of {"alg":"RS256","typ":"JWT","kid":"2026-03"} — algorithm and key id
2. Payload | base64url of {"sub":"7","iss":"auth.example","aud":"api","exp":1789…,"scope":"orders:read"}
3. Signature | sign(header + "." + payload) with the issuer's private key
4. Client sends | Authorization: Bearer header.payload.signature
5. Fetch key | look up kid in the cached JWKS from the issuer, refresh on miss
6. Pin the algorithm | verify with RS256 only — never trust alg from the header
7. Check the signature | over the exact received bytes, before parsing any claim
8. Check the claims | exp / nbf with small leeway, iss and aud must match this API
9. Authorize | map sub and scope to a per-resource decision — a valid token is not permission
```

## How it works

**Issuing.** After a successful login the authorization server builds a claim set, signs
it, and returns it as the access token. Standard registered claims are `iss` (issuer),
`sub` (subject — the user id), `aud` (intended audience), `exp` (expiry), `nbf` (not
before), `iat` (issued at) and `jti` (unique token id). Everything else is
application-specific: tenant, roles, scopes, plan.

**Signing algorithms** come in two families:

- **HMAC (HS256)** — one shared secret both signs and verifies. Fine when a single
  service does both. If you distribute the secret so ten services can verify, all ten can
  also mint tokens.
- **Asymmetric (RS256, ES256, EdDSA)** — the issuer signs with a private key; everyone
  verifies with the public key, published at a JWKS endpoint and selected by the `kid`
  header. This is the right default whenever more than one party verifies.

**Verifying.** Reject the token unless the signature checks out, the algorithm is the one
you expect, `exp`/`nbf` are satisfied, and `iss` and `aud` name your issuer and this API.
Verification must happen before the payload is used for anything — the segments are
merely encoded, not encrypted, so any client can read them.

**Refresh.** Because a JWT cannot be recalled, access tokens are kept short (5–15
minutes) and paired with a long-lived refresh token that *is* stored server-side. Losing
an access token costs one short window; deleting the refresh record logs the user out.

## Deep Dive

**Algorithm confusion — the classic break.** Libraries that pick the verification
algorithm from the token's own `alg` header let an attacker choose it. Two well-known
variants: `alg: none`, where a token with an empty signature is accepted, and swapping
`RS256` for `HS256`, where the server is tricked into HMAC-verifying with the *public* key
as the shared secret — a value the attacker already has. Defence: configure the expected
algorithm and key explicitly, and use a maintained library that requires it.

**Other verification bugs.** Accepting any issuer (a token from an unrelated tenant or a
public identity provider passes); ignoring `aud`, so a token minted for a low-value
service unlocks a high-value one; skipping `exp`; comparing claims with loose equality;
trusting `kid` enough to fetch a key from an attacker-supplied URL.

**Never put secrets in the payload.** A JWT is signed, not encrypted. Personal data,
internal ids and feature flags in a token are readable by the client and by anything that
logs the header. If the content must be confidential, use encrypted tokens (JWE) or keep
the data server-side and reference it by id.

**Revocation.** This is the real trade-off. Options, roughly in order of cost: short
expiry plus refresh rotation (good enough for most systems); a denylist of `jti` values
in [Redis](/technology/redis) with a [TTL](/concept/ttl) equal to each token's remaining
lifetime (small, bounded, restores instant logout); a per-user `tokens_valid_after`
timestamp checked against `iat` (one cheap lookup, invalidates everything on password
change or role change); or full introspection on every call — at which point you have
rebuilt sessions and should compare the two honestly.

**Storage in the browser.** `localStorage` and `sessionStorage` are readable by any
script on the page, so one XSS exfiltrates the token, and it keeps working from the
attacker's machine until it expires. Prefer an `HttpOnly; Secure; SameSite` cookie for
the refresh credential and keep the access token in memory, or terminate tokens at a
backend-for-frontend and hand the browser an ordinary session cookie.

**Size and drift.** Tokens ride on every request; a claim set stuffed with roles and
permissions can outgrow proxy header limits and adds bytes to each call. Claims are also
a snapshot — a user demoted a minute ago still carries `admin` until the token expires,
which is exactly why authorization decisions for sensitive actions should re-read
authoritative state rather than trusting a stale claim.

**Clock skew and key rotation.** Allow a small leeway (30–60 s) on time claims, publish
new keys before you sign with them, and keep old keys in the JWKS until every issued
token has expired. Cache JWKS responses, but honour cache headers so rotation propagates.
