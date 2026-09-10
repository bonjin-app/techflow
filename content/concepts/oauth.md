---
id: oauth
name: OAuth 2.0
tagline: Delegated authorization — let an app act for a user without holding their password
category: security
tags: [Security, Identity, Authorization, Protocol]
difficulty: 4
prerequisites: [http, https, session, authentication]
learningPath:
  - http
  - https
  - authentication
  - session
  - oauth
  - jwt
  - rbac
related:
  - { to: authentication, rel: RELATED_TO }
  - { to: jwt, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: https, rel: REQUIRES }
  - { to: rest, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: authentication-system, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

OAuth 2.0 is a **delegated authorization** framework: a user allows an application to
access part of their data on another service, and the application receives a scoped,
expiring **access token** instead of the user's password. The user's credentials only
ever reach the authorization server they already trust. OAuth answers "what may this app
do on the user's behalf?", not "who is this user?" — identity is layered on top by
OpenID Connect, which adds a signed **ID token**.

## Why it matters

Before delegated authorization, letting an app read your calendar meant giving it your
password: unlimited scope, no expiry, and no way to revoke one app without changing the
credential everywhere. OAuth replaces that with tokens that are narrow (`scope`),
short-lived (`exp`), and individually revocable. The same machinery now powers "Sign in
with…" buttons, mobile and single-page app login, and service-to-service calls inside
[Microservices](/architecture/microservices), so almost every non-trivial
[Authentication](/concept/authentication) design touches it.

## Visual

```sequence
title: Authorization code flow with PKCE
participants: User, App [react], Auth Server, API [backend]
App -> App: create code_verifier, challenge = S256(verifier)
App -> Auth Server: redirect /authorize?client_id&redirect_uri&scope&state&code_challenge
Auth Server -> User: login + consent screen
User --> Auth Server: approve requested scopes
Auth Server --> App: redirect back with ?code=…&state=…
App -> App: check state matches the value it sent
App -> Auth Server: POST /token {code, code_verifier, client_id}
Auth Server -> Auth Server: S256(code_verifier) == stored code_challenge?
Auth Server --> App: {access_token (10m), refresh_token, id_token}
App -> API: GET /me  Authorization: Bearer <access_token>
API -> API: verify signature, exp, iss, aud, scope
API --> App: 200 profile
```

## How it works

**Four roles.** The *resource owner* is the user. The *client* is the application asking
for access. The *authorization server* authenticates the user and issues tokens. The
*resource server* is the API that accepts them. Splitting the last two is what makes the
API stateless: it validates a token rather than running a login.

**Grants** are the ways a client can obtain a token, and only a few remain current:

- **Authorization code + PKCE** — the default for every interactive client: server-side
  web apps, single-page apps, mobile and desktop apps. The browser only ever carries a
  one-time `code`; the token is fetched over a direct back-channel call.
- **Client credentials** — machine-to-machine. The client authenticates as itself with a
  client id and secret (or a signed assertion / mutual TLS) and gets a token with no user
  attached.
- **Refresh token** — exchange a long-lived, server-tracked credential for a new access
  token without user interaction.
- **Device authorization** — for TVs and CLIs with no browser: the device shows a code
  the user types on a phone.

The **implicit** and **resource owner password** grants are discouraged by current
OAuth 2.0 security guidance and should not be used in new systems: implicit returns
tokens in a URL fragment where they leak through history and referrers, and the password
grant re-introduces credential handling in the client.

**Scopes and audiences.** A token names what it may do (`scope: invoices:read`) and which
API it is for (`aud`). Request the narrowest scope the feature needs, and issue separate
tokens per downstream API so a leak in one service cannot be replayed against another.

**Token formats.** Access tokens are either opaque random strings — validated by calling
the authorization server's introspection endpoint — or [JWT](/concept/jwt)s that any
service can verify locally with a published key. Opaque tokens are instantly revocable;
JWTs are cheap to verify. The choice is the classic
[JWT vs Session](/compare/jwt-vs-session) trade-off applied to APIs.

## Deep Dive

**PKCE is not optional.** Proof Key for Code Exchange binds the redirect to the client
instance that started the flow. The client generates a random `code_verifier`, sends only
its SHA-256 hash up front, and proves possession when redeeming the code. Without it, a
stolen authorization code — from a hijacked custom URL scheme, a malicious app on the
same device, or a logged redirect — can be exchanged by an attacker.

**Redirect URIs and `state`.** Authorization servers must match `redirect_uri` exactly
against a registered value; wildcard or prefix matching turns any open redirect on your
domain into token theft. The `state` parameter is an unguessable value the client stores
and re-checks, defeating CSRF on the callback. In OpenID Connect, `nonce` plays the same
role for the ID token.

**OAuth is not authentication.** An access token proves *someone* authorized this app; it
says nothing verifiable about who. Deriving user identity from an access token, or from a
`/userinfo` call whose token could have been minted for another client, is the classic
"confused deputy" mistake. Use the OIDC ID token, and validate `iss`, `aud`, `nonce`,
signature and expiry before trusting a single claim in it.

**Where tokens live.** In a browser, `localStorage` exposes tokens to any injected
script, so a single XSS is a full account takeover. Safer options: keep the access token
in memory only, or use a backend-for-frontend that holds the tokens server-side and gives
the browser an `HttpOnly; Secure; SameSite` [Session](/concept/session) cookie. On
mobile, use the system browser (not an embedded webview) plus the platform keystore.

**Revocation is the weak point.** Bearer tokens are valid until they expire; nothing
about presenting one proves the presenter is the original recipient. Practical answer:
minutes-long access tokens, refresh-token **rotation** with reuse detection (a replayed
old refresh token invalidates the whole chain), a revocation endpoint, and — where the
threat model demands it — sender-constrained tokens (DPoP or mTLS) so a stolen token is
useless without the matching key.

**Operational failure modes.** Clock skew rejecting valid tokens; key rotation without a
JWKS cache refresh; consent screens that request everything up front and train users to
approve blindly; refresh tokens that never expire, leaving abandoned integrations with
permanent access. Audit granted authorizations and let users see and revoke them.

## Related

- [Authentication](/concept/authentication) — the layer OAuth delegates to
- [JWT](/concept/jwt) — the usual access-token format
- [RBAC](/concept/rbac) — turning scopes into per-resource decisions
