---
id: contract-testing
name: Contract Testing
tagline: Each consumer's expectations become a contract the provider verifies in its own CI
category: quality
tags: [Testing, Quality, Microservices, CI/CD]
difficulty: 3
prerequisites: [http, rest, ci-cd]
learningPath:
  - http
  - rest
  - testing
  - contract-testing
  - api-versioning
  - ci-cd
related:
  - { to: testing, rel: RELATED_TO }
  - { to: api-versioning, rel: RELATED_TO }
  - { to: ci-cd, rel: REQUIRES }
  - { to: rest, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
  - { to: database-per-service, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Contract testing checks that a consumer and a provider still agree about the messages
between them — without ever running the two together. The consumer's own test suite
exercises a mock and records exactly which requests it sends and which parts of the
response it depends on; that recording is the **contract**. The provider replays those
recorded requests against the real implementation in its own pipeline and fails its build
if it can no longer satisfy them. You get the speed of mocks plus proof that the mocks are
still true.

## Why it matters

The obvious way to test an integration is to deploy everything and call it end to end. That
works for three services and collapses somewhere after ten. A shared integration
environment has one state, so it is broken by whoever deployed last; a failure there tells
you *something* is wrong but not whose change caused it; and the feedback arrives hours
after the commit, when the author has moved on. Teams respond by adding retries to the
suite, then by ignoring it.

The alternative — mock every dependency in unit tests — is fast and isolated, and quietly
wrong. A mock encodes what the provider did on the day you wrote it. The provider renames a
field, tightens a validation rule or starts returning `null` where it used to return an
empty array, and every consumer test stays green until production disagrees. Contract
testing closes exactly that gap: the mock and the verification come from the same artifact,
so a drifting provider breaks a build instead of a customer.

## Visual

```sequence
title: Consumer test to contract to provider verification
participants: Consumer CI [ci-cd], Mock, Broker, Provider CI [github-actions], Orders API [backend]
Consumer CI -> Mock: GET /orders/42, expects id, status, total
Mock --> Consumer CI: 200 with a stubbed body
Consumer CI -> Broker: consumer test green, publish contract for version abc123
Provider CI -> Broker: fetch contracts for orders, deployed plus latest
Broker --> Provider CI: three consumer contracts
Provider CI -> Orders API: replay GET /orders/42 in the provider state "order 42 exists"
Orders API --> Provider CI: 200, field total was renamed to amount
Provider CI -> Broker: publish verification, failed for consumer web
Broker --> Consumer CI: can-i-deploy says no, abc123 is unverified
```

## How it works

**The consumer writes the contract, not the provider.** A contract lists only what this
consumer actually uses. If the order payload has forty fields and the checkout page reads
three, the contract covers three. That is the whole trick: the provider learns which parts
of its surface are load-bearing, and may change everything else freely.

**Match on types and shapes, not on exact values.** A contract that pins `total: 19.99`
fails the first time the fixture data changes. Contract tools use matchers — "a decimal",
"an ISO-8601 timestamp", "an array with at least one element of this shape" — so the
assertion is about structure, which is what an interface is.

**Provider states replace shared fixtures.** Each interaction names the precondition it
needs ("an order 42 exists", "the user has no payment method"). During verification the
provider sets that state through a test hook and then answers the replayed request. No
seeded shared database, no ordering between tests.

**A broker connects the two pipelines.** The consumer publishes its contract, tagged with
its git SHA and branch; the provider fetches every contract from consumers currently
deployed to each environment, verifies them, and publishes the result. The interesting
query is the reverse one, usually called `can-i-deploy`: before a release, ask the broker
whether the version you are about to ship has been verified against everything already
running in that environment. That turns a matrix of compatibility questions into one gate
in the [CI/CD](/concept/ci-cd) pipeline.

**Schema-first is a valid variant.** When the provider already publishes an OpenAPI or
protobuf schema, you can verify contracts against the schema rather than against a running
service — cheaper to adopt, weaker guarantee, because a schema says what is possible and a
contract says what is used.

## Deep Dive

**What contract testing does not test.** It checks message shape and, weakly, semantics.
It says nothing about whether the number in `total` is correct, whether the endpoint is
fast enough, whether authorisation is enforced, or whether a two-call sequence behaves.
Keep a small set of end-to-end journeys for the paths where money or safety is involved,
and stop pretending an integration environment can cover the rest.

**Messaging is the better fit than people expect.** For an event on a queue there is no
request/response to record, so the contract covers the payload the producer emits and the
fields the consumer reads. Because the transport is asynchronous, verification is purely
about serialisation — which is precisely where
[Event-Driven Architecture](/pattern/event-driven-architecture) breaks in practice, when a
producer adds a required field or changes an enum.

**Evolution needs the same discipline as any API.** A provider that must break a contract
follows [API Versioning](/pattern/api-versioning): add the new field, keep the old one,
verify both contracts, wait for the consumer to publish a contract without the old field,
then remove it. Most brokers support "pending" contracts so a consumer can publish a new
expectation without instantly failing the provider's build — that is how you avoid a
deadlock where neither side can merge first.

**It is an organisational tool.** Contract testing works when both sides run CI, both
publish to the broker, and a red verification actually blocks a release. Where one team
does not participate, the contract becomes documentation nobody enforces. It pays off most
in [Microservices](/architecture/microservices) with independent deploys, and hardly at all
in a modular monolith, where the compiler already checks the interface.

**Common failure modes.** Contracts that mirror the provider's full schema, so every
provider change breaks every consumer. Exact-value matchers. Verification run against a
stubbed provider rather than the real one. And a broker with contracts from consumer
versions that were retired years ago, which slowly makes every provider release impossible.

## Related

- [Testing](/concept/testing) — where contract tests sit in the wider pyramid
- [API Versioning](/pattern/api-versioning) — how a provider changes a verified surface
- [CI/CD](/concept/ci-cd) — contracts are only useful as a release gate
- [Microservices](/architecture/microservices) — the setting that makes this necessary
- [Database per Service](/pattern/database-per-service) — the other half of independent deploys
