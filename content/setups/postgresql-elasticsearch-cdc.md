---
id: postgresql-elasticsearch-cdc
name: PostgreSQL to Elasticsearch with CDC
tagline: Keep a search index in step with the database through its write log, deletes included
environment: local
difficulty: 4
tags: [Search, Data, Streaming, CDC, Docker]
components:
  - { ref: postgresql, version: "18", role: "The source of truth; logical decoding is switched on and the changes leave through a replication slot" }
  - { ref: kafka, version: "4.3", role: "Holds the change events between the database and the index, so either side can be down" }
  - { ref: elasticsearch, version: "9.5", role: "The search index, written by a small indexer that applies each change exactly as often as needed" }
  - { ref: docker, version: "Compose v2", role: "Runs the database, Kafka, Debezium, Elasticsearch and the indexer on one machine" }
related:
  - { to: change-data-capture, rel: USED_IN }
  - { to: outbox-vs-change-data-capture, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: elasticsearch-korean-nori, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
meta: { lastReviewed: 2026-10-07, confidence: medium }
---

## TL;DR

The database stays the source of truth and Elasticsearch becomes a copy built for searching.
To keep the copy right you need every insert, update and **delete**, in order, without changing
the application and without a second write that can fail on its own. [Change data capture](/concept/change-data-capture)
does that by reading the write-ahead log PostgreSQL already keeps. Debezium reads the log and
publishes one event per row change to Kafka; a small indexer turns each event into an
Elasticsearch write. The one design decision that matters is making that write **idempotent**:
every event carries its position in the log, and Elasticsearch is told to ignore anything older
than what it has. Then a restart, a replay or a duplicate delivery cannot leave the index wrong.

## Why this pairing

**PostgreSQL gives the events, Kafka holds them, Elasticsearch serves them.** Putting Kafka
between the database and the index is what makes the pipeline forgiving: the connector can
restart without losing its place, the indexer can be down for an hour and catch up, and a second
consumer — a cache, a warehouse — can read the same events later.

**What it buys you:**

- The index sees deletes. Polling for `updated_at > last_seen` cannot, and a search that still
  returns a deleted product is a visible bug.
- No change to the application and no dual write. The log entry is the commit, so there is no
  window in which the database says one thing and the index another for longer than the lag.
- Replay. Rebuilding the index is a matter of reading the topic again, not re-querying production.

**Where it rubs:**

- **You operate four moving parts** — a replication slot, Kafka Connect, Kafka and the indexer —
  where polling is one cron job. That is the price of correct deletes and low lag.
- **A replication slot holds WAL until it is read.** If the connector stops for good and nobody
  notices, PostgreSQL keeps every segment since, and the disk fills. This is the most common way
  CDC takes down the database it was meant to be harmless to.
- **You get database events, not business events.** An index of `products` rows shows what is
  in the table; an index of what a customer should see (joined, filtered, denormalised) is a
  separate design problem that CDC does not solve.
- **Order is only guaranteed per key.** Events for one row arrive in order; events across rows
  do not, so the index can briefly show a state the database never had.

This guide uses an indexer of about forty lines instead of a ready-made sink connector. The
sink is the right choice when its behaviour fits yours; writing the indexer once makes the
delete and ordering rules visible, which is what you need to judge a sink later.

## Set it up

```steps
title: From a table to a search index that follows it
Source | PostgreSQL with logical decoding on, a table, a replication user and a publication
Pipe | Kafka and Kafka Connect with Debezium, started together
Index | Elasticsearch with a mapping, and an indexer that writes each event once or harmlessly more
Connect | Register the connector; Debezium snapshots the rows that exist, then follows the log
Prove | Insert, update, delete, stop each part in turn, and compare the two sides
```

**1. The source.** Logical decoding needs `wal_level=logical`, which is a server setting rather than
something an application can ask for. A connector should not run as a superuser: it gets a role
that may replicate and read the one table, and a *publication* naming exactly which tables leave.

```yaml file=compose.yaml
services:
  postgres:
    image: postgres:18.6
    command: ["postgres", "-c", "wal_level=logical"]
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: shop
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d shop"]
      interval: 3s
      retries: 30
    volumes:
      - pgdata:/var/lib/postgresql

  kafka:
    image: apache/kafka:4.3.1
    hostname: kafka
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: CONTROLLER://:29093,PLAINTEXT://:19092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:29093
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092 > /dev/null"]
      interval: 5s
      retries: 20

  connect:
    image: quay.io/debezium/connect:3.7.0.Final
    environment:
      BOOTSTRAP_SERVERS: kafka:19092
      GROUP_ID: connect
      CONFIG_STORAGE_TOPIC: connect_configs
      OFFSET_STORAGE_TOPIC: connect_offsets
      STATUS_STORAGE_TOPIC: connect_statuses
      CONFIG_STORAGE_REPLICATION_FACTOR: 1
      OFFSET_STORAGE_REPLICATION_FACTOR: 1
      STATUS_STORAGE_REPLICATION_FACTOR: 1
      KAFKA_HEAP_OPTS: -Xms256m -Xmx512m
    ports:
      - "127.0.0.1:8083:8083"
    depends_on:
      kafka: { condition: service_healthy }
      postgres: { condition: service_healthy }

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:9.5.5
    environment:
      discovery.type: single-node
      ELASTIC_PASSWORD: ${ELASTIC_PASSWORD:?set ELASTIC_PASSWORD}
      xpack.security.http.ssl.enabled: "false"
      ES_JAVA_OPTS: -Xms512m -Xmx512m
    ports:
      - "127.0.0.1:9200:9200"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf -u elastic:$$ELASTIC_PASSWORD 'localhost:9200/_cluster/health?wait_for_status=yellow&timeout=2s' > /dev/null"]
      interval: 5s
      retries: 40
    volumes:
      - esdata:/usr/share/elasticsearch/data

  indexer:
    build: .
    restart: on-failure
    environment:
      KAFKA_BROKER: kafka:19092
      ES_URL: http://elasticsearch:9200
      ELASTIC_PASSWORD: ${ELASTIC_PASSWORD}
    depends_on:
      kafka: { condition: service_healthy }
      elasticsearch: { condition: service_healthy }

volumes:
  pgdata:
  esdata:
```

Two things to notice. The `connect` image bundles Debezium's connectors and runs Kafka Connect
in distributed mode, which keeps its own configuration and offsets in Kafka topics — hence the
three storage topics and the replication factor of 1 for a single broker. And Elasticsearch has
**security on** with a password but plain HTTP between containers: certificates are what the
[Elasticsearch guide](/setup/elasticsearch-korean-nori) sets up, and repeating them here would hide the
subject of this one.

**2. The indexer.** One consumer, one rule per event type. The part to read is `version`: each
event carries `source.lsn`, its position in the PostgreSQL log, which only ever grows. Telling
Elasticsearch to use that as an *external version* means a write is accepted only if it is newer
than what the index holds. An old event that arrives again is rejected with `409`, and the
indexer treats that as success — it is already reflected.

```js file=indexer.mjs
import { Kafka } from "kafkajs";

const INDEX = "products";
const auth = "Basic " + Buffer.from(`elastic:${process.env.ELASTIC_PASSWORD}`).toString("base64");

async function es(path, init = {}) {
  const res = await fetch(process.env.ES_URL + path, {
    ...init,
    headers: { authorization: auth, "content-type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

// One Debezium event becomes at most one Elasticsearch action.
function toAction({ value }) {
  if (!value) return null; // the tombstone Debezium sends after a delete carries nothing new
  const event = JSON.parse(value.toString());
  const version = event.source.lsn;
  if (event.op === "d") {
    return [{ delete: { _index: INDEX, _id: event.before.id, version, version_type: "external" } }];
  }
  const { id, name, category, price } = event.after;
  return [
    { index: { _index: INDEX, _id: id, version, version_type: "external" } },
    { name, category, price },
  ];
}

// A write that loses to a newer version, or deletes what is already gone, is already done.
const settled = (op, item) => item.status < 300 || item.status === 409 || (op === "delete" && item.status === 404);

async function bulk(messages) {
  const lines = messages.flatMap(toAction).filter(Boolean);
  if (lines.length === 0) return;
  const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const result = await es("/_bulk", { method: "POST", body, headers: { "content-type": "application/x-ndjson" } });
  const failed = result.items.filter((i) => !settled(Object.keys(i)[0], Object.values(i)[0]));
  if (failed.length) throw new Error("bulk failed: " + JSON.stringify(failed[0]));
}

await es(`/${INDEX}`, {
  method: "PUT",
  body: JSON.stringify({
    mappings: { properties: { name: { type: "text" }, category: { type: "keyword" }, price: { type: "integer" } } },
  }),
}).catch((e) => { if (!String(e).includes("resource_already_exists")) throw e; });

const consumer = new Kafka({ brokers: [process.env.KAFKA_BROKER] }).consumer({ groupId: "es-indexer" });
await consumer.connect();
await consumer.subscribe({ topic: "shop.public.products", fromBeginning: true });
// Offsets move forward only after Elasticsearch has accepted the batch: a crash replays it.
await consumer.run({ eachBatch: async ({ batch }) => bulk(batch.messages) });
console.log("indexer running");
```

```dockerfile file=Dockerfile
FROM node:24-slim
WORKDIR /app
RUN npm install --omit=dev kafkajs@2
COPY indexer.mjs .
CMD ["node", "indexer.mjs"]
```

```sh run
export POSTGRES_PASSWORD=$(openssl rand -hex 12) ELASTIC_PASSWORD=$(openssl rand -hex 12)
printf 'POSTGRES_PASSWORD=%s\nELASTIC_PASSWORD=%s\n' "$POSTGRES_PASSWORD" "$ELASTIC_PASSWORD" > .env
docker compose up -d --build --wait postgres kafka connect elasticsearch
```

**3. A table, a role, a publication.** Two rows exist before the connector does, on purpose: they are
what the first *snapshot* has to find. The role gets `REPLICATION` and read access to one table; the
publication lists which changes may leave the database.

```sh run
set -a; . ./.env; set +a
CDC_PASSWORD=$(openssl rand -hex 12)
echo "CDC_PASSWORD=$CDC_PASSWORD" >> .env
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d shop <<SQL
CREATE TABLE products (
  id       integer PRIMARY KEY,
  name     text    NOT NULL,
  category text,
  price    integer NOT NULL
);
INSERT INTO products VALUES (1, 'Mechanical keyboard', 'peripherals', 129), (2, 'USB-C dock', 'peripherals', 89);
CREATE ROLE cdc WITH REPLICATION LOGIN PASSWORD '$CDC_PASSWORD';
GRANT SELECT ON products TO cdc;
CREATE PUBLICATION shop_pub FOR TABLE products;
SQL
```

**4. Connect.** Registering the connector is one `PUT`. It names the database, the role, the
publication, and where in Kafka the events go (`<prefix>.<schema>.<table>`). `snapshot.mode:
initial` reads the existing rows once, then follows the log from that exact point, so nothing is
lost or doubled between the two. The converter writes plain JSON without the schema envelope.

```sh run
set -a; . ./.env; set +a
for i in $(seq 60); do curl -sf localhost:8083/connectors > /dev/null && break; sleep 2; done
curl -sf -X PUT -H 'content-type: application/json' localhost:8083/connectors/shop/config -d "$(
  jq -n --arg pw "$CDC_PASSWORD" '{
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres", "database.port": "5432",
    "database.user": "cdc", "database.password": $pw, "database.dbname": "shop",
    "topic.prefix": "shop",
    "plugin.name": "pgoutput",
    "publication.name": "shop_pub",
    "publication.autocreate.mode": "disabled",
    "slot.name": "shop_slot",
    "table.include.list": "public.products",
    "snapshot.mode": "initial",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false"
  }'
)" > /dev/null
for i in $(seq 60); do
  state=$(curl -sf localhost:8083/connectors/shop/status | jq -r '[.connector.state, .tasks[0].state] | join(" ")' || true)
  [ "$state" = "RUNNING RUNNING" ] && break
  sleep 2
done
[ "$state" = "RUNNING RUNNING" ]
docker compose up -d --wait indexer
```

## Verify

Wait for a given number of documents instead of sleeping for a guessed number of seconds. The first
call is the snapshot arriving; everything after it is the log:

```sh run
set -a; . ./.env; set +a
es() { curl -sf -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
psql_() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d shop -c "$1" > /dev/null; }
until_() { for i in $(seq 90); do if eval "$1"; then return 0; fi; sleep 1; done; echo "gave up waiting for: $1"; return 1; }
count() { es "localhost:9200/products/_count" | jq .count; }

# the two rows that existed before the connector were snapshotted
until_ '[ "$(count)" = 2 ]'

# an insert, an update and a delete, as an application would issue them
psql_ "INSERT INTO products VALUES (3, 'Noise-cancelling headphones', 'audio', 249)"
until_ '[ "$(count)" = 3 ]'
psql_ "UPDATE products SET price = 199 WHERE id = 3"
until_ '[ "$(es localhost:9200/products/_doc/3 | jq ._source.price)" = 199 ]'
psql_ "DELETE FROM products WHERE id = 2"
until_ '[ "$(count)" = 2 ]'
```

The delete is the line that polling cannot do. Two more cases show why the version matters. Two
updates to one row in one transaction produce two events, and the index must end on the second:

```sh run
set -a; . ./.env; set +a
es() { curl -sf -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
until_() { for i in $(seq 90); do if eval "$1"; then return 0; fi; sleep 1; done; echo "gave up waiting for: $1"; return 1; }
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d shop > /dev/null <<'SQL'
BEGIN;
UPDATE products SET price = 150 WHERE id = 1;
UPDATE products SET price = 140 WHERE id = 1;
COMMIT;
SQL
until_ '[ "$(es localhost:9200/products/_doc/1 | jq ._source.price)" = 140 ]'
```

And each part can be stopped without losing a change. With the indexer down, Kafka keeps the events;
with Connect down, PostgreSQL keeps the log behind the replication slot. Both catch up on return:

```sh run
set -a; . ./.env; set +a
es() { curl -sf -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
psql_() { docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d shop -c "$1" > /dev/null; }
until_() { for i in $(seq 120); do if eval "$1"; then return 0; fi; sleep 1; done; echo "gave up waiting for: $1"; return 1; }
count() { es "localhost:9200/products/_count" | jq .count; }

docker compose stop indexer
psql_ "INSERT INTO products VALUES (4, 'Webcam', 'video', 79)"
sleep 3
[ "$(count)" = 2 ]   # nothing indexed while the indexer is down
docker compose start indexer
until_ '[ "$(count)" = 3 ]'

docker compose stop connect
psql_ "INSERT INTO products VALUES (5, 'Microphone', 'audio', 99)"
docker compose start connect
until_ '[ "$(count)" = 4 ]'
```

```sh check hidden
set -a; . ./.env; set +a
es() { curl -sf -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
sql() { docker compose exec -T postgres psql -At -U postgres -d shop -c "$1"; }

# both sides hold the same ids, and the same prices
db_ids=$(sql "SELECT id FROM products ORDER BY id" | tr '\n' ' ')
es_ids=$(es "localhost:9200/products/_search?size=100&sort=_id" | jq -r '[.hits.hits[]._id | tonumber] | sort | map(tostring) | join(" ")')
[ "$db_ids" = "$es_ids " ]
db_prices=$(sql "SELECT id || ':' || price FROM products ORDER BY id" | tr '\n' ' ')
es_prices=$(es "localhost:9200/products/_search?size=100" | jq -r '[.hits.hits[] | "\(._id | tonumber):\(._source.price)"] | sort_by(split(":")[0] | tonumber) | join(" ")')
[ "$db_prices" = "$es_prices " ]

# the deleted row is gone, not just hidden
code=$(curl -s -o /dev/null -w '%{http_code}' -u "elastic:$ELASTIC_PASSWORD" localhost:9200/products/_doc/2)
[ "$code" = 404 ]

# and the index is searchable, not only present
hits=$(es "localhost:9200/products/_search" -d '{"query":{"match":{"name":"webcam"}}}' | jq -r '[.hits.hits[]._source.name] | join(",")')
[ "$hits" = "Webcam" ]
```

Compare the two sides yourself whenever you doubt the pipeline. Counts hide a wrong row, so compare
the rows:

```sh
docker compose exec -T postgres psql -At -U postgres -d shop -c "SELECT id, price FROM products ORDER BY id"
curl -s -u "elastic:$ELASTIC_PASSWORD" "localhost:9200/products/_search?size=100&sort=_id" \
  | jq -r '.hits.hits[] | "\(._id)|\(._source.price)"'
```

## Going to production

- **Watch the replication slot, and cap it.** `SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) FROM pg_replication_slots`
  tells you how much WAL the slot is holding. Alert on it, and set `max_slot_wal_keep_size` so a
  forgotten connector costs you the slot rather than the disk — then re-snapshot.
- **Give Connect a heartbeat on quiet tables.** A slot only advances when the connector reads
  something. If this table is idle but another table in the database is busy, the slot lags and WAL
  grows; `heartbeat.interval.ms` makes the connector acknowledge progress anyway.
- **Run more than one of everything that matters.** Three Kafka brokers with replication factor 3,
  a Connect cluster with more than one worker, and the indexer as several instances in one consumer
  group. The compose file here is a laboratory, not a topology.
- **Decide how a re-snapshot happens before you need one.** Reindexing means creating a new index,
  filling it from a snapshot or from the topic, and moving an alias — not deleting the index you are
  serving from. Keep the mapping in version control.
- **Know the delete window.** Elasticsearch remembers a deleted document's version for
  `index.gc_deletes` (60 seconds by default). A very late, older event for a row deleted longer ago than
  that could recreate it. For most pipelines the lag is far below it; if yours can exceed it, raise the
  setting.
- **Treat schema changes as events too.** Adding a nullable column flows through; renaming or retyping
  one breaks the indexer's `toAction`. Roll out the indexer before the migration, not after.
- **Secure the hops.** TLS on Elasticsearch and Kafka, secrets from a secret store rather than an
  `.env` file, and the connector's credentials kept out of the connector configuration — Kafka Connect
  has config providers for that.
- **Consider the ready-made sink.** Once you know the delete and version rules you need, a sink
  connector may carry them with less code to maintain. Check that it supports the Elasticsearch
  version you run and external versioning.

## When not to

- **A nightly rebuild is fine.** If the index may be a day behind and deletes are rare, a scheduled
  full reindex is one job and no new infrastructure.
- **You can change the application.** The [outbox pattern](/compare/outbox-vs-change-data-capture)
  writes an event in the same transaction and shapes it for the consumer, which CDC cannot — and it
  does not need `wal_level=logical` or a replication slot on your primary.
- **The data fits in PostgreSQL's own search.** `tsvector` full-text search covers a lot, with no copy
  to keep consistent. An index you do not run cannot drift.
- **You cannot afford to operate Kafka.** The same events can go straight from Debezium to a sink
  (Debezium Server), at the cost of the buffering that made this pipeline tolerant of downtime.

## References

- [Debezium: PostgreSQL connector — snapshots, publications, replication slots and the event format](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)
- [Debezium: running with Docker — the connect image and its environment variables](https://debezium.io/documentation/reference/stable/operations/containers.html)
- [PostgreSQL: logical replication and publications](https://www.postgresql.org/docs/current/logical-replication.html)
- [PostgreSQL: `max_slot_wal_keep_size`](https://www.postgresql.org/docs/current/runtime-config-replication.html)
- [Elasticsearch: optimistic concurrency control and external versioning](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/optimistic-concurrency-control)
- [Elasticsearch: bulk API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-bulk)
- [Apache Kafka: Docker image](https://hub.docker.com/r/apache/kafka)
