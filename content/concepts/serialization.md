---
id: serialization
name: Serialization
tagline: Turning in-memory objects into bytes that can be stored, sent and read back later
category: data
tags: [Data, Fundamentals, Interoperability]
difficulty: 2
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - serialization
  - rest
  - rpc
  - grpc
  - kafka
related:
  - { to: programming-fundamentals, rel: REQUIRES }
  - { to: rpc, rel: RELATED_TO }
  - { to: grpc, rel: RELATED_TO }
  - { to: kafka, rel: RELATED_TO }
  - { to: rest, rel: RELATED_TO }
  - { to: message-queue, rel: RELATED_TO }
  - { to: redis, rel: RELATED_TO }
  - { to: mongodb, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-09, confidence: high }
---

## TL;DR

Serialization converts an in-memory data structure into a sequence of bytes — JSON,
Protocol Buffers, Avro, MessagePack — so it can cross a network or sit on disk;
deserialization reverses it. The format you choose decides payload size, parsing
speed, how strictly types are enforced, and — most importantly over time — how safely
producers and consumers can evolve independently.

## Why it matters

Every boundary in a system is a serialization boundary: the [REST](/concept/rest)
response to a browser, the [RPC](/concept/rpc) between services, the event on a
[Kafka](/technology/kafka) topic, the value in [Redis](/technology/redis), the document
in [MongoDB](/technology/mongodb). The format is easy to pick on day one and painful to
change on day 500, because data written in the old format still exists in queues,
caches and archives.

The cost of getting it wrong is subtle: a 64-bit id silently rounded by a JSON parser,
a consumer crashing on a new field, a `Date` that lost its time zone, a queue full of
messages nobody can decode after a "harmless" rename. Schema evolution, not raw speed,
is where most teams get burned.

## Visual

```compare
Feature             | JSON                        | Protocol Buffers               | Avro
Encoding            | Text                        | Binary                         | Binary
Schema              | Optional (JSON Schema)      | Required, compiled (.proto)    | Required, stored or in registry
Self-describing     | Yes (field names in data)   | No (field numbers only)        | No, but schema travels with data
Size                | Largest                     | Small                          | Smallest (no field tags)
Human readable      | Yes                         | No                             | No
Code generation     | Not needed                  | Required                       | Optional (dynamic possible)
Schema evolution    | Ad hoc                      | Field numbers, reserved ids    | Reader/writer schema resolution
Typical use         | Web APIs, config, logs      | gRPC, internal services        | Kafka events, data lakes
```

## How it works

- **Text formats** (JSON, XML, YAML) encode field names and values as characters.
  Any language can produce and read them, humans can inspect them, and the schema, if
  any, is external. They are verbose and slower to parse.
- **Schema-first binary formats** (Protocol Buffers, Thrift, Cap'n Proto) compile a
  schema into code. The wire format carries only field numbers and values, so the
  reader needs the schema to interpret the bytes. Compact and fast; requires a build
  step and discipline around field numbers.
- **Schema-with-data binary formats** (Avro) write the schema alongside the data (per
  file) or reference it by id in a schema registry (per message). The reader compares
  the *writer's* schema with its own *reader* schema and resolves differences — renamed
  fields via aliases, added fields via defaults.
- **Schemaless binary** (MessagePack, CBOR, BSON) is JSON's data model in a compact
  binary encoding: self-describing but smaller and faster. MongoDB stores BSON.
- **Language-native serialization** (Java serialization, Python pickle, PHP
  `unserialize`) reconstructs arbitrary objects, which makes deserializing untrusted
  input a remote-code-execution risk. Avoid across trust boundaries.

## Deep Dive

**Compatibility is the design goal.** *Backward compatible*: new readers can read old
data. *Forward compatible*: old readers can read new data. You need both when
producers and consumers deploy independently — and in a
[Message Queue](/concept/message-queue) the old data may sit for days. Rules that hold
across formats: only add optional fields with defaults; never change a field's type or
meaning; never reuse a removed field's name or number; treat unknown fields as
ignorable, not as errors.

**Protobuf specifics.** Fields are identified by number, so renaming is free and
renumbering is catastrophic. Mark removed numbers `reserved`. Proto3 has no notion of
"field absent" for scalars unless you use `optional` or wrapper types — a zero and a
missing value look identical, which matters for partial updates.

**Avro specifics.** Because no field tags are written, Avro is the most compact, but
the reader must know exactly which writer schema produced the bytes. In
[Event-Driven Architecture](/pattern/event-driven-architecture) on Kafka this is the
job of a schema registry: each message carries a schema id, and the registry enforces a
compatibility mode (backward, forward, full) on every new version before producers can
publish it.

**JSON pitfalls.** JSON numbers are IEEE doubles in most parsers: integers above 2^53
lose precision, so 64-bit ids should be strings. There is no date type — use ISO 8601
strings with an explicit offset. Key order and duplicate keys are undefined. `null`
versus missing key is a distinction many libraries erase. Large JSON payloads dominate
CPU in high-throughput services; consider a binary format between services and JSON
only at the public edge.

**Size and speed in perspective.** A binary format may be 3–10× smaller than JSON
and several times faster to parse, but compression (gzip, zstd) narrows the size gap
considerably for text. Measure with your payloads; the win is often in CPU and GC
pressure rather than bytes on the wire.

**Serialization is a security boundary.** Deserializers parse attacker-controlled
bytes. Enforce size limits, depth limits and strict typing; reject unknown types;
never deserialize into executable object graphs. Billion-laughs (XML) and pickle
exploits are the same class of bug.

**Caches and versioning.** Objects serialized into Redis outlive deploys. Prefix cache
keys with a schema version, or make every reader tolerant of the previous shape, or
you will read yesterday's structure with today's code.

## Related

- [RPC](/concept/rpc) and [gRPC](/technology/grpc) — Protobuf's main habitat
- [Kafka](/technology/kafka) — where Avro and schema registries earn their keep
- [REST](/concept/rest) — JSON's main habitat
