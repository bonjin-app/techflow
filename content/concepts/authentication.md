---
id: authentication
name: Authentication
tagline: Prove who the caller is, then carry that proof across requests with sessions or tokens
category: security
tags: [Security, Backend, Identity]
difficulty: 3
prerequisites: [http, backend, session]
learningPath:
  - http
  - backend
  - session
  - authentication
  - rest
  - rate-limiting
related:
  - { to: session, rel: REQUIRES }
  - { to: http, rel: REQUIRES }
  - { to: rest, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
  - { to: e-commerce, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Authentication answers "who is making this request?" — typically by verifying a
credential (password, one-time code, hardware key, or a token from an identity
provider) once, then issuing something the client presents on later requests: a
[Session](/concept/session) cookie or a bearer token. **Authorization** — "what may they
do?" — is a separate step that depends on it. Getting authentication wrong is the most
direct route to a data breach, so the mechanics are standardised and you should use the
standards rather than invent them.

## Why it matters

Every non-public endpoint in a [Backend](/concept/backend) depends on knowing the
caller. The design decides how logins scale across servers, whether a stolen credential
can be revoked, how [Microservices](/architecture/microservices) trust each other, and
how third-party apps act on a user's behalf. Password storage, token lifetimes and cookie
flags are the difference between a contained incident and every account compromised.

## Visual

```sequence
title: Login, access token and refresh
participants: Browser, API [backend], Store [redis]
Browser -> API: POST /login {email, password}
API -> API: verify password hash (bcrypt/argon2)
API -> Store: SET refresh:9c1e {userId: 7} TTL 30d
API --> Browser: 200 {access_token (15m JWT)}  Set-Cookie: refresh=9c1e; HttpOnly
Browser -> API: GET /me  Authorization: Bearer <access_token>
API -> API: verify signature + expiry (no store lookup)
API --> Browser: 200 {user 7}
Browser -> API: GET /me  Authorization: Bearer <expired token>
API --> Browser: 401 Unauthorized
Browser -> API: POST /token/refresh  Cookie: refresh=9c1e
API -> Store: GET refresh:9c1e
Store --> API: {userId: 7}
API --> Browser: 200 {new access_token}
```

## How it works

**1. Verify a credential.**

- *Passwords* are never stored; a slow, salted hash (argon2id, bcrypt, scrypt) is. On
  login the input is hashed the same way and compared in constant time. Login endpoints
  need [Rate Limiting](/concept/rate-limiting) and lockout to blunt credential stuffing.
- *Multi-factor* adds a second proof: a TOTP code, a push approval, or a
  WebAuthn/passkey signature from a device. Passkeys replace the password entirely with
  public-key cryptography and are phishing-resistant.
- *Federated login* (OpenID Connect on top of OAuth 2.0) delegates verification to an
  identity provider; your app receives a signed ID token asserting who the user is.

**2. Issue proof for subsequent requests.**

- *Server-side session*: a random id in an `HttpOnly; Secure; SameSite` cookie, mapped
  to user data in [Redis](/technology/redis) or a database. Revocable instantly; requires
  a lookup per request. See [Session](/concept/session).
- *Signed token (JWT)*: the server signs a JSON payload (`sub`, `exp`, roles). Any
  server holding the verification key can check it with no lookup — attractive for
  stateless [REST](/concept/rest) APIs and cross-service calls. It cannot be revoked
  before `exp`, so lifetimes are kept short (minutes).
- *Refresh token*: a long-lived, server-tracked credential used only to mint new short
  access tokens. Combines the statelessness of JWTs with revocability: delete the refresh
  record and the user is logged out within one access-token lifetime.

**3. Present it.** Cookies are attached automatically by the browser (convenient,
CSRF-prone without `SameSite`); bearer tokens travel in the `Authorization` header (no
CSRF, but scripts must store them somewhere readable, exposing them to XSS).

**4. Authorize.** With identity established, check permissions per resource — roles,
ownership, scopes. Never infer authorization from the fact that a token exists.

**Service-to-service.** Machines authenticate with client credentials (OAuth client id
and secret), mutual TLS, or short-lived tokens from the platform's identity system. Do
not reuse user tokens between services; pass a token scoped to the downstream call.

## Deep Dive

**Token contents and validation.** Verify signature, `exp`, `iss` and `aud` every time;
an accepted token from the wrong issuer or audience is a common flaw. Keep payloads
small — they ride on every request — and never put secrets in them: a JWT is signed, not
encrypted, and anyone can read it.

**Algorithm pitfalls.** Reject `alg: none`, pin the expected algorithm, and prefer
asymmetric signatures (RS256/ES256) when many services must *verify* but only one should
*issue*. Rotate keys and publish them via a JWKS endpoint so consumers pick up new keys
automatically.

**Revocation.** Short access tokens plus tracked refresh tokens is the pragmatic answer.
For immediate revocation of access tokens (compromised account, role change) keep a
small denylist of token ids with a [TTL](/concept/ttl) equal to the remaining lifetime —
this reintroduces a lookup but only for the denylist, which stays tiny.

**Storage in browsers.** `localStorage` is readable by any script on the page, so a
single XSS steals the token. `HttpOnly` cookies are not — but need CSRF defences.
Many apps use the cookie for the refresh token and keep the access token in memory only.

**Password reset and enumeration.** "Email not found" tells an attacker which accounts
exist. Respond identically whether or not the account exists, expire reset links quickly,
and invalidate all sessions on password change.

**Federation trade-offs.** Delegating to an identity provider removes password handling
and gives users single sign-on, but couples your availability to theirs and hands them
visibility into logins. Support at least one fallback path for account recovery.

**Common failures.** Long-lived JWTs with no refresh mechanism (cannot log anyone out);
sessions that survive password change; tokens logged in URLs or access logs; treating
authentication as authorization ("logged in, therefore admin"); home-grown crypto. Use
a maintained library for each layer and spend the saved effort on the parts that are
unique to your product.
