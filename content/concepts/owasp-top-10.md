---
id: owasp-top-10
name: OWASP Top 10 & Web Attacks
tagline: What actually breaks web applications, led by the unglamorous one — access control
category: security
tags: [Security, Web, OWASP, Vulnerability]
difficulty: 3
prerequisites: [http, authentication, cryptography]
learningPath:
  - http
  - authentication
  - cryptography
  - owasp-top-10
  - threat-modeling
  - rbac
related:
  - { to: authentication, rel: RELATED_TO }
  - { to: rbac, rel: RELATED_TO }
  - { to: cors, rel: RELATED_TO }
  - { to: threat-modeling, rel: RELATED_TO }
  - { to: cryptography, rel: RELATED_TO }
  - { to: rate-limiting, rel: RELATED_TO }
  - { to: secrets-management, rel: RELATED_TO }
  - { to: jwt, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

The OWASP Top 10 is a periodically updated list of the categories that actually cause web
application breaches, ranked by how often they appear in real assessments. Its most useful
property is the ranking: the top entry is **broken access control** — not an exotic exploit
but an endpoint that returns another user's record because nobody checked ownership. Read it
as a list of *design questions* rather than a checklist to tick, because half the entries
cannot be fixed by a scanner or a library. Injection is largely solved by parameterised
queries; authorisation is solved only by deciding, per endpoint, who is allowed and
enforcing it server-side.

## Why it matters

Security work drifts towards whatever is easiest to demonstrate. A scanner produces a
hundred findings about headers and library versions, so those get fixed, while the endpoint
that accepts `?userId=` and trusts it goes unnoticed — because no tool knows which user
should have been allowed.

That is the gap this list closes. It is compiled from assessment data, so it tells you where
the real failures cluster, and it consistently contradicts intuition: the most common serious
vulnerability is not a clever injection, it is a missing ownership check. Most of the rest are
similarly mundane — a default credential, an unpatched dependency, a debug endpoint left
exposed, an internal service reachable because someone needed it to be during an incident.

It is also a shared vocabulary. "This is an IDOR" or "that is SSRF" communicates a whole
class of problem and its standard mitigation in three words, which matters when a finding has
to travel from a security review to the team that will fix it.

## Visual

```steps
title: The ten categories, and the question each one asks of your code
Broken access control | does every endpoint verify that *this* user may touch *this* object?
Cryptographic failures | is sensitive data in transit and at rest, with keys you can rotate?
Injection | is every query, command and template parameterised rather than concatenated?
Insecure design | was the abuse case considered — not just the happy path?
Security misconfiguration | defaults changed, debug off, admin interfaces unreachable, headers set?
Vulnerable components | do you know your dependency tree, and can you patch it this week?
Authentication failures | is credential stuffing rate-limited, and are sessions invalidated on logout?
Integrity failures | are updates, packages and deserialised payloads verified before use?
Logging and monitoring failures | would you detect this, and could you reconstruct it afterwards?
Server-side request forgery | can a user-supplied URL make your server fetch something internal?
```

## Solutions

**Enforce authorisation on every request, server-side, against the object.** Not "is this
user logged in" but "does this user own, or have a role granting access to, this specific
record". Deny by default; derive the subject from the session, never from a parameter; and
apply the tenant or owner filter in the query rather than after it. Hiding a button is not a
control. [RBAC](/concept/rbac) gives you the model; the discipline is that the check is on
the server for every endpoint, including the ones only your admin UI calls.

**Parameterise everything, and never build a query by concatenation.** Prepared statements
for [SQL](/concept/sql), parameterised commands for NoSQL, an argument array instead of a
shell string, an auto-escaping template engine for HTML, and a whitelist for anything that
becomes a column name or a sort order. This eliminates the class rather than filtering it —
input sanitisation as a primary defence is a losing position.

**Validate input by shape, and encode output by context.** Reject anything that does not
match a schema at the boundary. Then encode on the way out according to where it lands: HTML
body, attribute, JavaScript, URL and SQL each need different escaping, which is why "we
sanitise on input" produces cross-site scripting anyway. A content security policy is the
useful second layer.

**Treat every outbound URL from user input as hostile.** SSRF is how cloud metadata endpoints
and internal admin services get read. Allowlist hosts and schemes, resolve the name and
validate the resulting IP against private ranges (re-checking after redirects), block
redirects you did not expect, and give the fetching service a network path that cannot reach
anything internal — see [Networking & VPC](/concept/cloud-networking).

**Make dependency patching routine.** A lockfile, automated update pull requests, a
vulnerability scan in [CI/CD](/concept/ci-cd), and a generated inventory of what you ship.
The measure that matters is time-to-patch: a team that can ship a dependency bump the day it
lands is safe from most of this category, and a team that cannot is not helped by knowing
about it.

**Harden authentication against the attack that actually happens.** Credential stuffing with
leaked password lists, not cryptanalysis. That means [rate limiting](/concept/rate-limiting)
per account and per address, breached-password checks, multi-factor for anything valuable,
generic error messages, and sessions invalidated server-side on logout and password change.
See [Authentication](/concept/authentication).

**Log the security-relevant events, and make them usable.** Authentication outcomes,
authorisation denials, privilege changes, exports and admin actions — with the actor,
resource and result, in a store the application cannot rewrite. The failure mode is not
"logs missing" but "logs exist, nobody alerts on them, and they were rotated out before
anyone looked".

## Deep Dive

**Access control is hard because it is distributed across your code.** There is no single
place to fix it: every handler, every GraphQL resolver, every batch job and every export path
makes its own decision. The structural answers are to centralise the check (a policy layer or
middleware that must be invoked, with a test that fails when an endpoint has no policy), to
scope data access at the query layer so an un-filtered read is impossible, and to write
automated tests that call each endpoint as the wrong user and assert a 403. Insecure direct
object reference — reading `/orders/1002` when you own `1001` — is the canonical instance,
and unguessable ids are a delay, not a defence.

**Mass assignment is access control wearing a different hat.** Binding a request body
straight onto a model lets a user set `role`, `isAdmin`, `balance` or `tenantId`. Accept an
explicit allowlist of fields per endpoint and per role. Frameworks that make binding
effortless make this bug effortless too.

**"Insecure design" is on the list because some flaws have no patch.** A password reset that
emails a token valid for a week, a refund flow with no second approval, an API that lets a
client set the price, a rate limit that resets per instance. These are correct
implementations of a bad design, and the only place to catch them is before they are built —
which is what [Threat Modeling](/concept/threat-modeling) is for. Ask what an abusive user
would do with each feature, at design time, and write the answer down.

**Deserialisation and supply chain are integrity problems.** Deserialising untrusted data
into arbitrary objects has produced remote code execution in every major ecosystem; use a
data format and an explicit schema instead. Upstream, a compromised package or a poisoned
build step means your own code was never the weak link — which is why lockfiles, pinned
digests, verified signatures on artefacts, minimal build permissions and short-lived
credentials in [CI/CD](/concept/ci-cd) belong in the same conversation as application code.

**Misconfiguration is the entry most often found, and the cheapest to prevent.** Default
credentials, verbose error pages exposing stack traces, directory listing, an unauthenticated
metrics or debug endpoint, an over-broad [CORS](/concept/cors) policy that reflects any
origin with credentials, a storage bucket readable by the world. The fix is a hardened
baseline enforced as [infrastructure as code](/concept/infrastructure-as-code) with a policy
check, so a new environment cannot be created insecure.

**Browser-side controls are defences in depth only.** CORS restricts which origins may read a
response; it does not stop a request from arriving, and it is not authorisation. Content
security policy limits the damage of injected script. `SameSite` cookies mitigate cross-site
request forgery, and state-changing endpoints should still verify a token or require a custom
header. Every one of these is bypassable by a client that is not a browser — which is every
attacker's client.

**Use the list as a starting map, not the boundary.** It covers the common web categories and
says little about business-logic abuse, multi-tenancy isolation, insider access, or the
newer surface of LLM features, where an injected instruction in retrieved content is the
equivalent of injection with no parameterised query available — see
[Guardrails, Safety & Privacy](/concept/ai-safety). The list tells you what usually breaks;
threat modelling tells you what would break *here*.
