---
id: docker
name: Docker
tagline: Packages an app and its dependencies into a portable image that runs the same everywhere
category: infrastructure
tags: [Infrastructure, Containers, DevOps, Deployment]
difficulty: 2
usedFor: [backend, distributed-system]
prerequisites: [programming-fundamentals, backend]
learningPath:
  - programming-fundamentals
  - http
  - backend
  - docker
  - load-balancing
  - kubernetes
related:
  - { to: kubernetes, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: redis, rel: USED_WITH }
  - { to: backend, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: simple-web-app, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "Docker Engine 28.x / Compose v2", confidence: high }
---

## TL;DR

Docker builds an **image** — a read-only snapshot of a filesystem containing your code,
runtime and libraries — and runs it as a **container**: an isolated process on a shared
Linux kernel. Because the image carries everything the application needs, it behaves
identically on a laptop, in CI and on a server. Containers start in milliseconds and
cost far less than virtual machines, which is why they became the unit of deployment
that platforms like [Kubernetes](/technology/kubernetes) schedule.

## Practical

Day to day, Docker is three files and a handful of commands: a `Dockerfile` describing
how to build the image, a `compose.yaml` describing the services a project needs
locally, and a registry where CI pushes tagged images.

What you will actually do:

- **Write a Dockerfile** — base image, copy dependencies, install, copy source, define
  the start command. Use multi-stage builds so the final image has the runtime but not
  the compiler or test tooling.
- **Run dependencies locally with Compose** — `postgres`, `redis`, a message broker —
  instead of installing them on the machine. `docker compose up` gives every developer
  the same versions.
- **Tag and push images** from CI (`app:1.42.0`, `app:sha-abc123`) and deploy by image
  reference; rollback is redeploying the previous tag.
- **Treat containers as disposable.** State lives in volumes or external services; a
  container can be killed and recreated at any time.
- **Pass configuration through environment variables and secrets**, never baked into
  the image.

```bash
# Dockerfile (multi-stage, Node example)
# FROM node:22-alpine AS build
# WORKDIR /app && COPY package*.json ./ && RUN npm ci && COPY . . && RUN npm run build
# FROM node:22-alpine
# WORKDIR /app && COPY --from=build /app/dist ./dist && COPY --from=build /app/node_modules ./node_modules
# USER node && EXPOSE 3000 && CMD ["node", "dist/server.js"]

docker build -t registry.example.com/shop/api:1.42.0 .
docker run --rm -p 3000:3000 -e DATABASE_URL=postgres://db/shop shop/api:1.42.0
docker compose up -d            # api + postgres + redis from compose.yaml
docker push registry.example.com/shop/api:1.42.0
```

Operationally: pin base image versions, scan images for known CVEs, run as a non-root
user, keep images small, and remember that `latest` is a moving target that makes
deployments non-reproducible.

## Deep Dive

**Containers are processes, not machines.** Isolation comes from Linux kernel
features: namespaces (separate views of PIDs, network, mounts, users) and cgroups (CPU
and memory limits). There is no guest kernel; a container is a normal process the host
kernel confines. This is why start-up is milliseconds and overhead is near zero — and
why containers share the host kernel's security boundary. On macOS and Windows, Docker
runs a lightweight Linux VM and containers run inside it.

**Images are layered and content-addressed.** Each Dockerfile instruction produces a
layer; layers are cached and shared between images, so ten services on the same base
image store the base once. The build cache invalidates from the first changed
instruction downward — copying `package.json` and installing before copying source is
what makes rebuilds fast. Image and layer identities are digests, so `app@sha256:…`
is immutable while a tag such as `1.42` can be moved.

**The OCI standard.** Image format and runtime are specified by the Open Container
Initiative. Docker builds OCI images that any compliant runtime — containerd, CRI-O,
Podman — can run. Kubernetes talks to containerd directly and no longer needs the
Docker daemon on nodes; Docker remains the build and developer tooling most teams use.

**Networking and storage.** By default each container gets its own network namespace
and joins a bridge network; Compose gives services DNS names so `api` can reach
`postgres:5432`. Published ports map host → container. The container filesystem is
ephemeral; named volumes or bind mounts persist data. Databases in containers are fine
for development and acceptable in production only with careful volume management.

**Resource limits and the OOM killer.** Without `--memory` and `--cpus`, a container
can consume the host. With limits, exceeding memory kills the process — JVMs and Node
need to be told the limit (`-XX:MaxRAMPercentage`, `--max-old-space-size`) or they
allocate as if they owned the machine.

## Why

Before containers, "it works on my machine" was a literal description of the problem:
each environment had its own OS packages, language runtimes and library versions, and
deployment was a sequence of steps performed on a long-lived server that slowly drifted
from every other server.

```steps
title: Before — configure every environment by hand
Developer installs Node 20, PostgreSQL 16, libssl on a laptop | versions differ per person
CI server has Node 18 from last year | tests pass locally, fail in CI
Ops runs an install script on the production VM | script drifts from what CI tested
Hotfix applied directly on the server | server now unlike staging
New team member spends a day getting the stack to run
```

With Docker the artifact that was tested is the artifact that runs: the same image
digest passes CI, is pushed to a registry and is pulled by production. Environments
differ only in configuration passed at run time.

```steps
title: After — build once, run the same image everywhere
Dockerfile pins the runtime and dependencies | one definition for all environments
CI builds image api:1.42.0 and runs tests inside it
CI pushes the image to the registry | immutable, content-addressed
Production pulls api:1.42.0 and starts a container | identical bytes to what CI tested
Rollback = start the previous tag | seconds, no reinstall
New developer runs `docker compose up` | full stack in minutes
```

## Advantages

- Reproducible builds: the same image runs identically in dev, CI and production
- Fast start-up and low overhead compared with virtual machines
- Layer caching makes rebuilds and image distribution efficient
- Compose spins up entire local stacks (database, cache, broker) with one command
- The image is a universal deployment artifact understood by every orchestrator and cloud
- Isolation of dependencies: two services with conflicting library versions coexist on one host

## Trade-offs

- Shares the host kernel — weaker isolation than a VM; a kernel exploit escapes all containers
- Dockerfiles rot: unpinned base images and `latest` tags reintroduce the drift containers were meant to end
- Image size and CVE scanning become ongoing chores
- Persistent data needs explicit volume design; the default filesystem is thrown away
- Networking, file permissions and user namespaces confuse newcomers, especially across macOS/Windows VMs
- Running a single container is easy; running many reliably needs an orchestrator and its complexity

## When to use

- Any service you deploy to more than one environment — packaging it as an image removes drift
- Local development stacks that need databases, caches and brokers at specific versions
- CI pipelines that must run tests in a known, reproducible environment
- Polyglot systems where services need different runtimes on shared hosts
- As the input to [Kubernetes](/technology/kubernetes), serverless container platforms or PaaS deployments

## When not to use

- Desktop or mobile applications — containers are a server-side packaging model
- Workloads that need a specific kernel, kernel modules or direct hardware access; use a VM
- Strong multi-tenant isolation between untrusted workloads without extra sandboxing (gVisor, Kata, firecracker-style micro-VMs)
- A single static binary deployed to one machine by a small team — containers add a layer without removing a problem
- Stateful databases at large scale without a platform that manages volumes, backups and failover

## Real-world

Docker is the packaging layer under nearly every architecture on this site. A
[Simple Web App](/architecture/simple-web-app) ships as one image next to a PostgreSQL
container; a [Microservices](/architecture/microservices) system builds an image per
service and hands them to [Kubernetes](/technology/kubernetes) to schedule. In development
the same Compose file starts [PostgreSQL](/technology/postgresql), [Redis](/technology/redis)
and a broker so the architecture diagrams can be reproduced on a laptop.
