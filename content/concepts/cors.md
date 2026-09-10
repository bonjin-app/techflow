---
id: cors
name: CORS
tagline: The browser rule that decides which origins may read another origin's responses
category: networking
tags: [Security, Browser, HTTP, Frontend]
difficulty: 2
prerequisites: [http, https, rest]
learningPath:
  - http
  - https
  - rest
  - cors
  - authentication
  - api-gateway
related:
  - { to: http, rel: REQUIRES }
  - { to: rest, rel: RELATED_TO }
  - { to: https, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: nginx, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Browsers enforce the **same-origin policy**: script on `https://app.example.com` may send
a request to `https://api.other.com` but cannot read the response unless that server opts
in. Cross-Origin Resource Sharing is the opt-in — a set of `Access-Control-*` response
headers, sometimes preceded by a **preflight** `OPTIONS` request. CORS is enforced by the
browser and granted by the server; it protects users, not the API, and it replaces
nothing on the server side.

## Why it matters

Without the same-origin policy, any page you visit could call your bank's API with your
cookies attached and read the answer. CORS is what makes a modern split between a
[React](/technology/react) frontend on one origin and a [REST](/concept/rest) API on
another workable without dropping that protection. It is also the single most common
"works in curl, fails in the browser" bug: the request succeeds, the server logs a 200,
and the browser refuses to hand the body to the script. Understanding which headers,
methods and credential modes trigger a preflight turns a frustrating class of errors into
a two-line configuration change.

## Visual

```sequence
title: Preflight OPTIONS, then the real request
participants: Page [react], Browser, API [backend]
Page -> Browser: fetch("https://api.example.com/orders", {method:"PATCH", headers:{Authorization}})
Browser -> Browser: cross-origin + non-simple method/header → preflight required
Browser -> API: OPTIONS /orders  Origin: https://app.example.com
Browser -> API: Access-Control-Request-Method: PATCH
Browser -> API: Access-Control-Request-Headers: authorization, content-type
API --> Browser: 204  Access-Control-Allow-Origin: https://app.example.com
API --> Browser: Allow-Methods: GET,PATCH  Allow-Headers: authorization,content-type
API --> Browser: Access-Control-Max-Age: 600  (cache this preflight)
Browser -> API: PATCH /orders  Origin: …  Authorization: Bearer …
API --> Browser: 200 {…}  Access-Control-Allow-Origin: https://app.example.com
Browser --> Page: resolve — response readable
Page -> Browser: fetch same API from https://evil.test
Browser -> API: OPTIONS /orders  Origin: https://evil.test
API --> Browser: 204 with no matching Allow-Origin
Browser --> Page: TypeError — blocked, body never exposed
```

## How it works

An **origin** is the triple *scheme + host + port*. `https://app.example.com` and
`https://api.example.com` are different origins; so are `http://` and `https://` on the
same host, and `:3000` versus `:8080`.

Requests split into two kinds:

- **Simple requests** — `GET`, `HEAD` or `POST` with only CORS-safelisted headers and a
  `Content-Type` of `application/x-www-form-urlencoded`, `multipart/form-data` or
  `text/plain`. These are sent straight away; the browser then checks
  `Access-Control-Allow-Origin` before revealing the response.
- **Preflighted requests** — anything else: `PUT`, `PATCH`, `DELETE`, a custom header
  like `X-Request-Id`, an `Authorization` header, or `Content-Type: application/json`
  (which is why almost every JSON API sees preflights). The browser first sends an
  `OPTIONS` request advertising the method and headers it intends to use and waits for
  permission.

The response headers that matter:

- `Access-Control-Allow-Origin` — one specific origin, or `*`. Echo the request's
  `Origin` only after checking it against an allowlist.
- `Access-Control-Allow-Methods` / `-Allow-Headers` — answered on the preflight.
- `Access-Control-Allow-Credentials: true` — required for cookies or TLS client certs to
  be sent, and incompatible with `*` for the origin.
- `Access-Control-Expose-Headers` — script can otherwise read only a handful of response
  headers; list anything else you want visible (pagination, `ETag`, request ids).
- `Access-Control-Max-Age` — how long the browser may cache this preflight, removing the
  extra round trip from subsequent calls.

## Deep Dive

**CORS is not a server-side authorization control.** It constrains browsers running
someone else's script; `curl`, mobile apps, and server-to-server callers ignore it
entirely. Every endpoint still needs [Authentication](/concept/authentication) and
per-resource checks. Conversely, a permissive CORS policy does not by itself expose
data — but it removes a layer the browser was giving you for free.

**The `*` plus credentials trap.** `Access-Control-Allow-Origin: *` with
`Allow-Credentials: true` is rejected by browsers. The common workaround — reflecting
whatever `Origin` arrived and always allowing credentials — is effectively "allow every
site to make authenticated calls as the logged-in user and read the results". Keep an
explicit allowlist, including per-environment preview domains, and be careful with naive
suffix matching (`endsWith("example.com")` also accepts `evil-example.com`).

**CORS does not stop CSRF.** A cross-origin `POST` from a form or a simple `fetch` is
still *sent* with cookies; only the response is hidden. State-changing endpoints need
`SameSite` cookies, a CSRF token, or a check that the request came from an expected
origin.

**Where to implement it.** Put the policy in one place — the
[API Gateway](/concept/api-gateway), a reverse proxy such as
[Nginx](/technology/nginx), or a single middleware. Policies duplicated per service drift
apart, and two layers both adding `Access-Control-Allow-Origin` produce a duplicated
header that browsers reject. Preflights must also bypass authentication: an `OPTIONS`
request carries no credentials, so a middleware that returns 401 breaks every call.

**Debugging.** The browser console names the specific missing header — read it rather
than guessing. Check whether the failing call is even a CORS problem: a redirect to a
login page, a 5xx whose error page lacks the headers, or a `Vary: Origin` omission that
lets a [CDN](/concept/cdn) serve one origin's cached response to another all present as
"CORS errors". Always send `Vary: Origin` when the allow-origin value depends on the
request.

**Avoiding it.** Serving frontend and API from the same origin (a path prefix like
`/api` behind one proxy) removes CORS from the picture, keeps cookies first-party, and
saves the preflight round trip — often the simplest fix when the split was accidental
rather than intentional.
