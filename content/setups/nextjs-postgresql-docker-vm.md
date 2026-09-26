---
id: nextjs-postgresql-docker-vm
name: Next.js + PostgreSQL on a VM with Docker Compose
tagline: A self-hosted Next.js standalone image reading and writing PostgreSQL on one server
environment: vm
difficulty: 3
tags: [Next.js, Self-hosting, Database, Docker]
components:
  - { ref: nextjs, version: "16", role: "App Router pages query the database in Server Components; forms write through Server Functions" }
  - { ref: postgresql, version: "17", role: "The application's data, on a named volume, reached over the Compose network" }
  - { ref: docker, version: "Compose v2", role: "Builds the standalone image and runs both services with health checks" }
related:
  - { to: nginx-nodejs-single-vm, rel: RELATED_TO }
  - { to: react, rel: RELATED_TO }
  - { to: nodejs, rel: RELATED_TO }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: ci-cd, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

Running [Next.js](/technology/nextjs) on your own server rather than a hosting platform:
`output: "standalone"` produces a self-contained server that ships in a small Docker image,
and Docker Compose runs it next to [PostgreSQL](/technology/postgresql). Server Components
query the database directly with `pg`; a Server Function handles the form that writes. The
one thing that catches everyone is the build: pages that read the database must say so, or
`next build` tries to query a database that does not exist yet.

## Why this pairing

**The server is part of the framework.** With the App Router, data fetching happens in
Server Components on the Node.js server, so the database client lives in the same process
as the page. There is no separate API to build for the app's own pages; a query result
becomes HTML in one step.

**What fits:**

- The standalone output copies only the files the server needs, so the runtime image holds
  no build tooling and no full `node_modules`.
- PostgreSQL's `pg` driver works unchanged in Server Components and Server Functions, with a
  pool shared by every request in the process.
- Forms that call Server Functions work before the JavaScript has loaded, and
  `revalidatePath` refreshes the page that shows the new row.

**Where it rubs:**

- Prerendering. `next build` renders pages ahead of time unless they depend on the request.
  A page whose only dynamic input is a database query has to opt out, with
  `await connection()`, or the build connects to PostgreSQL — see the `connection` reference.
- Caching and revalidation are per process by default. One instance is simple; two need a
  shared cache handler, a common Server Functions encryption key and a deployment id.
- Development re-imports modules on every change, so a naively created pool opens new
  connections each time until PostgreSQL refuses them.

## Set it up

```steps
title: From a Next.js app to a running server
Standalone build | Tell Next.js to trace and copy only what the server needs
Database module | One pg pool per process, reused across hot reloads in development
Page and form | Query in a Server Component, insert in a Server Function
Image and Compose | Multi-stage Dockerfile, PostgreSQL with a health check, the app after it
```

**1. `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

**2. `lib/db.ts`** — the pool is kept on `globalThis` so that development reloads reuse it
instead of opening another.

```ts
import pg from "pg";

const g = globalThis as unknown as { pool?: pg.Pool };
export const pool = g.pool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g.pool = pool;
```

**3. `app/page.tsx`** — `connection()` stops prerendering, so the query runs per request and
never at build time.

```tsx
import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";

export default async function Page() {
  await connection();
  const { rows } = await pool.query<{ id: number; body: string }>(
    "SELECT id, body FROM notes ORDER BY id DESC LIMIT 20",
  );

  async function addNote(formData: FormData) {
    "use server";
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    await pool.query("INSERT INTO notes (body) VALUES ($1)", [body]);
    revalidatePath("/");
  }

  return (
    <main>
      <form action={addNote}>
        <input name="body" required />
        <button type="submit">Add</button>
      </form>
      <ul>{rows.map((n) => <li key={n.id}>{n.body}</li>)}</ul>
    </main>
  );
}
```

**4. `init.sql`** — run once by the PostgreSQL image on an empty volume. A real project
applies versioned migrations instead; see Going to production.

```sql
CREATE TABLE notes (
  id         bigserial PRIMARY KEY,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**5. `Dockerfile`** — condensed from the Next.js `with-docker` example: dependencies,
build, then a runtime stage with only the standalone server and its static files.

```dockerfile
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

**6. `compose.yaml`** — the app is published only on the server's loopback interface, for a
reverse proxy in front of it.

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      retries: 10
    restart: unless-stopped

  web:
    build: .
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped

volumes:
  pgdata:
```

```sh
echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env
docker compose up -d --build
```

## Verify

```sh
docker compose ps                                   # db healthy, web running
curl -s localhost:3000 | grep -o "<form"            # the page renders on the server
docker compose logs web | tail -5                   # "Ready" from the standalone server
```

Add a note through the form in a browser, then confirm it reached the database rather than a
cache:

```sh
docker compose exec db psql -U app -d app -c "SELECT id, body FROM notes ORDER BY id DESC LIMIT 3"
```

Finally, check the build never needs the database: stop it and rebuild the image. The build
should succeed, because no page queries PostgreSQL while prerendering.

```sh
docker compose stop db && docker compose build web && docker compose start db
```

## Going to production

- **Put a reverse proxy in front.** The Next.js self-hosting guide recommends one for slow
  clients, payload limits and TLS; the Nginx configuration in the single-VM guide applies
  unchanged, with `proxy_pass http://127.0.0.1:3000`.
- **Run migrations as a step, not at start-up.** Apply versioned migrations once per deploy,
  before the new containers start, with whichever tool the project uses — see
  [Schema Migration](/concept/schema-migration). `init.sql` only ever runs on an empty volume.
- **Before a second instance:** set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` to the same value
  everywhere, configure a `deploymentId` for version-skew protection, and move caching to a
  shared cache handler — the in-memory default is per process.
- **Size the pool against PostgreSQL's limit.** Each instance holds up to `max` connections;
  instances × `max` must stay well under `max_connections`.
- **Back the database up off the machine.** A volume on the same disk is not a backup;
  schedule `pg_dump` or use a managed PostgreSQL with point-in-time recovery.
- **Build in CI, deploy an image.** Building on the production server competes with the
  running app for memory; push a tagged image from [CI/CD](/concept/ci-cd) and pull it.

## When not to

- **The site is entirely static.** `output: "export"` produces plain files for any CDN, with
  no server to run or patch.
- **Traffic is global and latency matters everywhere.** One server in one region is far from
  most of the world; a platform with regional compute, or a CDN in front of cacheable pages,
  serves it better.
- **Nobody wants to operate a database.** A managed PostgreSQL takes backups, upgrades and
  failover off the team — worth more than the VM it replaces.

## References

- [Next.js: `output` — standalone mode](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next.js: self-hosting — reverse proxy, caching, multi-server deployments](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js: `connection()` and prerendering](https://nextjs.org/docs/app/api-reference/functions/connection)
- [Next.js: mutating data with Server Functions](https://nextjs.org/docs/app/getting-started/mutating-data)
- [Next.js `with-docker` example](https://github.com/vercel/next.js/tree/canary/examples/with-docker)
- [PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/index.html)
- [Docker official image for PostgreSQL](https://hub.docker.com/_/postgres)
