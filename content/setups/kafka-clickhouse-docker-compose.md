---
id: kafka-clickhouse-docker-compose
name: Kafka → ClickHouse on Docker Compose
tagline: Events from a Kafka topic into a ClickHouse table through its Kafka engine, on one machine
environment: local
difficulty: 3
tags: [Streaming, Analytics, OLAP, Docker, Local Development]
components:
  - { ref: kafka, version: "4.3", role: "The event log — a single KRaft node, no ZooKeeper" }
  - { ref: clickhouse, version: "25.8 LTS", role: "Reads the topic with its Kafka engine and stores events in a MergeTree table" }
  - { ref: docker, version: "Compose v2", role: "Runs both, with ClickHouse waiting for a healthy broker" }
related:
  - { to: analytics-pipeline, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: event-driven-architecture, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: postgresql-vs-clickhouse, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

The shortest path from an event stream to fast analytical queries. Applications publish
JSON events to a [Kafka](/technology/kafka) topic; [ClickHouse](/technology/clickhouse)
subscribes to that topic itself, through a table using its **Kafka engine**, and a
materialized view copies every batch it reads into an ordinary `MergeTree` table you query.
There is no separate consumer service to write or run. This guide stands both up with
Docker Compose — Kafka 4.3 in KRaft mode and ClickHouse 25.8 — and shows how to watch
events arrive.

## Why this pairing

**They meet at the right boundary.** Kafka is a durable, replayable log that many
consumers can read at their own pace; ClickHouse wants data in large batches and answers
aggregations over billions of rows. The Kafka engine turns the stream into exactly the
batched inserts ClickHouse is built for, and Kafka's retention means ClickHouse can fall
behind, restart or be rebuilt without losing events.

**What fits:**

- Batching is automatic: the engine accumulates messages into blocks before inserting, so
  there are no row-at-a-time writes to bury ClickHouse's background merges.
- Offsets are committed by ClickHouse's own consumer group, so a restart resumes where it
  stopped, and the topic's partitions spread across `kafka_num_consumers`.
- `_topic`, `_partition` and `_offset` are available as virtual columns, which makes
  duplicates traceable and deduplication possible.

**Where it rubs:**

- Delivery is at least once. A failure between inserting a block and committing its
  offsets replays that block — see [Delivery Semantics](/concept/delivery-semantics).
- The Kafka table cannot be queried like a normal table: reading from it consumes the
  messages. Always read the `MergeTree` table the view writes to.
- A message that does not parse stops consumption by default. Decide what should happen to
  bad messages before one arrives.
- Changing the event schema means stopping the view, altering both tables and reattaching
  it — a short, planned operation rather than a deploy.

## Set it up

```steps
title: From an empty directory to queryable events
Compose file | A single-node Kafka and a ClickHouse server; ClickHouse starts once the broker is healthy
Topic | Create the events topic with three partitions
Tables and view | A Kafka engine table, a MergeTree table, and the materialized view joining them
Publish | Send JSON events to the topic and query them in ClickHouse
```

**1. `compose.yaml`** — the Kafka service follows Apache Kafka's own single-node Docker
example. `kafka:19092` is the listener other containers use; `localhost:9092` is for tools
on your machine.

```yaml
services:
  kafka:
    image: apache/kafka:4.3.1
    hostname: kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: CONTROLLER://:29093,PLAINTEXT_HOST://:9092,PLAINTEXT://:19092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT_HOST://localhost:9092,PLAINTEXT://kafka:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:29093
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 > /dev/null"]
      interval: 5s
      retries: 20

  clickhouse:
    image: clickhouse/clickhouse-server:25.8
    environment:
      CLICKHOUSE_USER: app
      CLICKHOUSE_PASSWORD: app
      CLICKHOUSE_DB: analytics
    ports:
      - "8123:8123"
    ulimits:
      nofile: { soft: 262144, hard: 262144 }
    volumes:
      - chdata:/var/lib/clickhouse
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    depends_on:
      kafka: { condition: service_healthy }

volumes:
  chdata:
```

The replication factors of 1 are only for a single broker; the default of 3 would leave the
internal topics unable to be created.

**2. Create the topic.** Partitions set the ceiling on parallel consumers, and are much
easier to choose now than to change later — see [Partitioning](/concept/partitioning).

```sh
docker compose up -d kafka
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 --create --topic events --partitions 3
```

**3. `init.sql`** — run by the ClickHouse image once, on an empty data volume. The Kafka
table is the subscription, `events` is the storage, and the view moves data between them.

```sql
CREATE TABLE analytics.events_queue
(
    ts      DateTime64(3),
    user_id UInt64,
    name    LowCardinality(String),
    page    String
)
ENGINE = Kafka
SETTINGS kafka_broker_list = 'kafka:19092',
         kafka_topic_list = 'events',
         kafka_group_name = 'clickhouse-events',
         kafka_format = 'JSONEachRow',
         kafka_num_consumers = 1;

CREATE TABLE analytics.events
(
    ts        DateTime64(3),
    user_id   UInt64,
    name      LowCardinality(String),
    page      String,
    kafka_partition UInt16,
    kafka_offset    UInt64
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (name, ts);

CREATE MATERIALIZED VIEW analytics.events_mv TO analytics.events AS
SELECT ts, user_id, name, page, _partition AS kafka_partition, _offset AS kafka_offset
FROM analytics.events_queue;
```

```sh
docker compose up -d clickhouse
```

**4. Publish events.** One JSON object per line, in the shape the Kafka table declares.

```sh
printf '%s\n' \
  '{"ts":"2026-09-26 10:00:00.000","user_id":7,"name":"page_view","page":"/pricing"}' \
  '{"ts":"2026-09-26 10:00:01.500","user_id":7,"name":"signup","page":"/pricing"}' \
  | docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh \
      --bootstrap-server localhost:9092 --topic events
```

## Verify

Events reach the `MergeTree` table within a few seconds — the engine flushes a block when
it is full or when its flush interval passes:

```sh
docker compose exec clickhouse clickhouse-client --user app --password app \
  -q "SELECT name, count() FROM analytics.events GROUP BY name"
# page_view  1
# signup     1
```

The consumer group is visible from Kafka's side, with the lag ClickHouse still has to read:

```sh
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group clickhouse-events
```

And from ClickHouse's side, including the last exception if a message failed to parse:

```sh
docker compose exec clickhouse clickhouse-client --user app --password app \
  -q "SELECT database, table, num_messages_read, last_exception FROM system.kafka_consumers FORMAT Vertical"
```

## Going to production

- **Plan for duplicates.** At-least-once delivery means a replayed block is inserted twice.
  Either make it harmless — a `ReplacingMergeTree` ordered by an event id, or by
  `(kafka_partition, kafka_offset)` — or accept small overcounts and say so where the numbers are shown.
- **Decide what a bad message does.** `kafka_handle_error_mode = 'stream'` keeps consuming
  and exposes the failure in `_error` and `_raw_message`, which a second view can route to a
  table of rejects; `dead_letter_queue` records it in a system table. The default stops.
- **Scale consumers with partitions.** `kafka_num_consumers` above the partition count does
  nothing; below it, one consumer reads several partitions.
- **Change the schema deliberately:** `DETACH TABLE analytics.events_mv`, alter the Kafka
  table and `events`, then `ATTACH TABLE` — consumption pauses while the view is detached,
  and Kafka holds the messages meanwhile.
- **Give Kafka real durability.** Three brokers, a replication factor of 3 and
  `min.insync.replicas = 2`, with retention long enough to rebuild ClickHouse from the topic
  if you ever need to.
- **On ClickHouse Cloud,** ClickHouse's documentation recommends its managed ClickPipes over
  the Kafka engine, which moves the consumers out of the database.

## When not to

- **Every event must be counted exactly once**, such as billing. Build that on an event id
  with deduplication you can prove, or keep the source of truth in a transactional store.
- **The volume is small.** A few thousand events a day fit comfortably in PostgreSQL, and one
  database is simpler than a broker and an analytical store — see
  [PostgreSQL vs ClickHouse](/compare/postgresql-vs-clickhouse).
- **Events need joining, enriching or reshaping in flight.** A materialized view is a
  `SELECT`; stateful stream processing belongs in a stream processor ahead of ClickHouse.

## References

- [Apache Kafka: Docker image examples, including the single-node KRaft setup](https://github.com/apache/kafka/blob/trunk/docker/examples/README.md)
- [Apache Kafka documentation — topic and broker configuration](https://kafka.apache.org/documentation/)
- [ClickHouse: Kafka table engine — settings, virtual columns, error handling](https://clickhouse.com/docs/reference/engines/table-engines/integrations/kafka)
- [ClickHouse: `CREATE VIEW` — materialized views](https://clickhouse.com/docs/sql-reference/statements/create/view)
- [ClickHouse official Docker image — users, initialisation scripts, ulimits](https://hub.docker.com/r/clickhouse/clickhouse-server)
