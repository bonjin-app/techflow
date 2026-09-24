---
id: redis-postgresql-docker-compose
name: Redis + PostgreSQL on Docker Compose
tagline: A Node.js service reading through a Redis cache in front of PostgreSQL, on one machine
environment: local
difficulty: 2
tags: [Cache, Database, Docker, Local Development]
components:
  - { ref: postgresql, version: "17", role: "Source of truth — every write lands here first" }
  - { ref: redis, version: "8", role: "Cache Aside in front of the hot reads, evicting least-recently-used keys" }
  - { ref: nodejs, version: "22 LTS", role: "The service — node-postgres and node-redis clients" }
  - { ref: docker, version: Compose v2, role: "Runs all three with health checks and start-up order" }
related:
  - { to: cache-aside, rel: RELATED_TO }
  - { to: ttl, rel: RELATED_TO }
  - { to: cache-invalidation, rel: RELATED_TO }
  - { to: e-commerce, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: medium }
---

## TL;DR

The most common pairing in web backends: PostgreSQL holds the data, Redis holds copies of
the rows that are read far more often than they change, and the service checks Redis first.
This guide runs all three on one machine with Docker Compose — a PostgreSQL 17 container, a
Redis 8 container configured as a pure cache, and a Node.js 22 service that implements
[Cache Aside](/pattern/cache-aside) — and shows how to confirm the cache is actually being hit.

## Why this pairing

**They split the work cleanly.** PostgreSQL is built to keep data correct — transactions,
constraints, durability — and pays for it on every read with parsing, planning and disk.
Redis answers a key lookup from memory in well under a millisecond and makes no promise to
keep it. Put together, correctness stays in the database and read volume moves to the cache.

**What fits:**

- The data model maps well: a row, or a rendered object, becomes one Redis key with a
  [TTL](/concept/ttl). `product:42` → the JSON the API would have returned.
- Both have mature, well-maintained Node.js clients — `pg` and `redis` — with pooling and
  reconnection built in.
- Redis's `allkeys-lru` eviction keeps the hot set in a fixed amount of memory without any
  code deciding what to drop.

**Where it rubs:**

- Two copies can disagree. Every write path has to delete the cached key, or readers see the
  old value until the TTL runs out — see [Cache Invalidation](/concept/cache-invalidation).
- Nothing crosses the boundary transactionally. Write PostgreSQL first, then delete the key;
  never the other way round, or a concurrent reader can refill the cache with the old row.
- A cold cache is slow: after a Redis restart every read goes to PostgreSQL at once.

## Set it up

```steps
title: From an empty directory to a cached read
Compose file | PostgreSQL and Redis with health checks; the app starts after both are healthy
Schema | One table and a seed row, applied by the Postgres image on first start
Service | Read Redis, fall back to PostgreSQL, write the result back with a TTL
Invalidate on write | Update the row, then delete the key
```

**1. `compose.yaml`** — Redis is started as a cache, not a store: a memory limit, LRU
eviction, and persistence turned off.

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: shop
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      retries: 10

  redis:
    image: redis:8
    command: ["redis-server", "--maxmemory", "256mb", "--maxmemory-policy", "allkeys-lru", "--save", "", "--appendonly", "no"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  app:
    build: .
    environment:
      DATABASE_URL: postgres://app:app@postgres:5432/shop
      REDIS_URL: redis://redis:6379
    ports:
      - "3000:3000"
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }

volumes:
  pgdata:
```

**2. `init.sql`** — scripts in `/docker-entrypoint-initdb.d` run once, when the data volume
is empty.

```sql
CREATE TABLE products (
  id         bigint PRIMARY KEY,
  name       text NOT NULL,
  price      numeric(10, 2) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO products (id, name, price) VALUES (42, 'Espresso cup', 12.00);
```

**3. `server.js`** — the read path is Cache Aside; the write path invalidates after the
database commits.

```js
import http from "node:http";
import pg from "pg";
import { createClient } from "redis";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const redis = await createClient({ url: process.env.REDIS_URL })
  .on("error", (err) => console.error("redis", err))
  .connect();

const TTL = 60; // seconds — how stale a product may be if an invalidation is missed

async function getProduct(id) {
  const key = `product:${id}`;
  const hit = await redis.get(key);
  if (hit) return { source: "cache", product: JSON.parse(hit) };

  const { rows } = await pool.query("SELECT id, name, price FROM products WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  await redis.set(key, JSON.stringify(rows[0]), { EX: TTL });
  return { source: "database", product: rows[0] };
}

async function renameProduct(id, name) {
  await pool.query("UPDATE products SET name = $2, updated_at = now() WHERE id = $1", [id, name]);
  await redis.del(`product:${id}`); // after the commit, never before
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const id = Number(url.pathname.split("/")[2]);
    if (req.method === "POST") await renameProduct(id, url.searchParams.get("name") ?? "");
    const result = await getProduct(id);
    res.writeHead(result ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  })
  .listen(3000);
```

**4. `package.json` and `Dockerfile`**

```json
{ "type": "module", "dependencies": { "pg": "^8", "redis": "^5" } }
```

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
CMD ["node", "server.js"]
```

Then:

```sh
docker compose up --build
```

## Verify

Ask for the same product twice. The first answer comes from the database, the second from
the cache:

```sh
curl -s localhost:3000/products/42   # {"source":"database", ...}
curl -s localhost:3000/products/42   # {"source":"cache", ...}
```

Redis counts its own hits and misses, which is the number to watch once real traffic arrives:

```sh
docker compose exec redis redis-cli info stats | grep keyspace
# keyspace_hits:1
# keyspace_misses:1
```

Check that a write invalidates, rather than waiting out the TTL:

```sh
curl -s -X POST "localhost:3000/products/42?name=Lungo%20cup"   # {"source":"database", ... "Lungo cup"}
docker compose exec redis redis-cli ttl product:42               # close to 60: freshly refilled
```

## Going to production

- **Use managed services, or at least separate hosts.** A cache on the same machine as the
  database competes with it for memory, which is the resource both need most.
- **Size `maxmemory` from the hot set, not the table.** Watch `evicted_keys` and the hit
  ratio; a ratio that falls as traffic grows means the hot set no longer fits.
- **Turn on authentication and TLS.** The Compose file above trusts its private network; a
  production Redis needs an ACL user or `requirepass`, and `rediss://` for encrypted
  connections.
- **Add jitter to TTLs** so keys written together do not all expire together, and consider a
  per-key lock or request coalescing on the hottest keys to stop a stampede on a miss.
- **Put a connection pooler in front of PostgreSQL** once instances multiply — each Node
  process holds up to `max` connections, and PostgreSQL's per-connection cost is real.
- **Treat Redis as disposable.** The service must keep working, slower, when Redis is down:
  catch the error on the read path and go to the database.

## When not to

- **The database is not the bottleneck.** A table that fits in PostgreSQL's buffer cache
  answers primary-key lookups in well under a millisecond already; the cache adds a second
  system and a consistency problem for little gain.
- **Readers must never see stale data** — balances, stock levels at checkout. Read those
  from PostgreSQL, inside the transaction that depends on them.
- **Other systems write the tables** without deleting the keys. Then only the TTL bounds
  staleness; if that bound is not acceptable, change how writes are published before adding
  a cache.

## References

- [Redis: key eviction and `maxmemory-policy`](https://redis.io/docs/latest/develop/reference/eviction/)
- [Redis: Node.js client guide (node-redis)](https://redis.io/docs/latest/develop/clients/nodejs/)
- [PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/index.html)
- [node-postgres: pooling](https://node-postgres.com/features/pooling)
- [Docker official image for PostgreSQL — initialisation scripts and environment](https://hub.docker.com/_/postgres)
- [Docker Compose: control start-up order with health checks](https://docs.docker.com/compose/how-tos/startup-order/)
