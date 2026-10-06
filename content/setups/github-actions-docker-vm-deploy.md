---
id: github-actions-docker-vm-deploy
name: GitHub Actions → Docker image → VM deploy
tagline: Build an image on each push to main, publish it to GHCR, roll it out to a server over SSH
environment: vm
difficulty: 3
verification: static
validates: workflow and Compose file
tags: [CI/CD, Deployment, Docker, GitHub]
components:
  - { ref: github-actions, version: "checkout v7, Docker actions v4–v7", role: "Builds, tags and pushes the image, then deploys it — behind an environment that can require approval" }
  - { ref: docker, version: "Engine 27+ with Compose v2", role: "The image is the release; Compose on the server pulls and restarts it" }
  - { ref: linux, version: "Ubuntu 24.04 LTS", role: "The server, reached as a dedicated deploy user with a single SSH key" }
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: nginx-nodejs-single-vm, rel: RELATED_TO }
  - { to: nextjs-postgresql-docker-vm, rel: RELATED_TO }
  - { to: blue-green-deployment, rel: RELATED_TO }
  - { to: feature-flag, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

The deployment pipeline most small teams actually need: every push to `main` builds a Docker
image in [GitHub Actions](/technology/github-actions), tags it with the commit it came from,
pushes it to the GitHub Container Registry, and tells the server to pull that exact tag and
restart. The image is the release — the same bytes that passed CI are the ones running — and
rolling back is deploying an older tag. The server needs nothing but Docker and one SSH key.

## Why this pairing

**The registry is the handover.** CI produces an artifact with a name that says exactly what
it contains (`sha-<commit>`); production consumes that name. Nothing is built on the server,
so a deploy cannot fail because of a missing compiler or a slow `npm install` competing with
live traffic.

**What fits:**

- The workflow's own `GITHUB_TOKEN` can push to GHCR with `packages: write` — no personal
  token stored in the repository.
- Docker's official actions handle BuildKit, layer caching in the Actions cache and
  consistent tag names, so the workflow stays short.
- GitHub environments put a manual approval, and environment-scoped secrets, in front of the
  production job without any extra service.

**Where it rubs:**

- A restart drops in-flight requests unless the app drains on SIGTERM and something routes
  around it — `docker compose up -d` replaces the container, it does not overlap two.
- The server needs to pull the image. For a private package that means a read-only token
  logged in once on the server, which is one more secret to rotate.
- Database migrations do not roll back with the image. A deploy that changes the schema must
  be compatible with the previous release, or the rollback breaks.

## Set it up

```steps
title: From a push to main to the new version running
Server | A deploy user allowed to run Docker, and a Compose file that names the image by tag
Secrets | The deploy key, the server's host key and the host name, scoped to a production environment
Workflow | Build with cache, tag with the commit, push to GHCR
Deploy job | SSH to the server, pull that tag, restart, check health
```

**1. On the server** — a user that can run Docker but has no password or shell history of
its own, and a Compose file that takes the tag from the environment.

```sh
sudo useradd --create-home --shell /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /srv/app && sudo chown deploy:deploy /srv/app
# as deploy: add the public half of the deploy key to ~/.ssh/authorized_keys
# for a private package, once: docker login ghcr.io -u <user> with a read:packages token
```

```yaml file=server/compose.yaml
# /srv/app/compose.yaml
services:
  app:
    image: ghcr.io/example/app:${IMAGE_TAG:-latest}
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env
```

**2. Repository settings.** Create an environment named `production` (optionally with
required reviewers) and add to it:

```sh
ssh-keygen -t ed25519 -f deploy_key -N ""          # DEPLOY_SSH_KEY = contents of deploy_key
ssh-keyscan -t ed25519 server.example.com          # DEPLOY_KNOWN_HOSTS = this output
# variable DEPLOY_HOST = server.example.com
```

**3. `.github/workflows/deploy.yml`**

```yaml file=.github/workflows/deploy.yml
name: deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  image:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      tag: sha-${{ github.sha }}
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha,format=long
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: image
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Pull and restart on the server
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          HOST: ${{ vars.DEPLOY_HOST }}
          TAG: ${{ needs.image.outputs.tag }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh deploy@"$HOST" "cd /srv/app && export IMAGE_TAG=$TAG && docker compose pull && docker compose up -d"
          ssh deploy@"$HOST" "curl -fsS --retry 10 --retry-delay 2 --retry-all-errors http://127.0.0.1:3000/healthz"
```

`metadata-action` lower-cases the image name, which GHCR requires, and `type=sha,format=long`
produces the `sha-<commit>` tag the deploy job asks for.

```text file=server/.env hidden
NODE_ENV=production
```

```sh run hidden
docker pull rhysd/actionlint:1.7.12
```

## Verify

Push a commit to `main` and follow the run in the Actions tab: `image` pushes two tags,
`deploy` waits for approval if the environment requires it, then pulls and checks health.
On the server:

```sh
docker compose -f /srv/app/compose.yaml ps                            # the app container, recently created
docker inspect --format '{{.Config.Image}}' $(docker compose -f /srv/app/compose.yaml ps -q app)
# ghcr.io/example/app:sha-<the commit you pushed>
```

Roll back by deploying an earlier tag — the image is still in the registry:

```sh
ssh deploy@server.example.com "cd /srv/app && export IMAGE_TAG=sha-<previous commit> && docker compose pull && docker compose up -d"
```

```sh check hidden
# 1. The workflow is valid: syntax, expression contexts, action inputs, and shellcheck over every run: script
docker run --rm -v "$PWD":/repo --workdir /repo rhysd/actionlint:1.7.12 -color .github/workflows/deploy.yml

# 2. Every action it names, at the version it names, exists — a v7 that was never released fails here, not on a push
refs=$(grep -oE 'uses: [A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+' .github/workflows/deploy.yml | sed 's/uses: //' | sort -u)
echo "$refs"
for ref in $refs; do
  repo=${ref%@*}; tag=${ref#*@}
  found=$(git ls-remote "https://github.com/$repo" "refs/tags/$tag" "refs/heads/$tag")
  [ -n "$found" ] || { echo "no such version: $ref"; exit 1; }
done

# 3. The server's Compose file resolves, and the tag the workflow sends is the tag that gets pulled
cd server
resolved=$(IMAGE_TAG=sha-0123abc docker compose config --format json)
echo "$resolved" | jq -r '.services.app.image'
[ "$(echo "$resolved" | jq -r '.services.app.image')" = "ghcr.io/example/app:sha-0123abc" ]
[ "$(echo "$(docker compose config --format json)" | jq -r '.services.app.image')" = "ghcr.io/example/app:latest" ]
# published on the loopback interface only, for a reverse proxy to reach
[ "$(echo "$resolved" | jq -r '.services.app.ports[0].host_ip')" = "127.0.0.1" ]
```

## Going to production

- **Run the tests before the image job.** Make `image` depend on a test job so nothing that
  failed CI is ever pushed — see [CI/CD](/concept/ci-cd).
- **Deploy without a gap.** Either accept the few seconds a container restart takes, or run
  two containers behind a reverse proxy and replace them one at a time — the same idea as a
  [blue-green deployment](/pattern/blue-green-deployment) on one machine.
- **Keep migrations expand-then-contract** so the previous image still works against the new
  schema; that is what makes rolling back by tag safe.
- **Restrict the deploy key.** An `authorized_keys` entry with `command=` and `restrict`
  limits it to the deploy command, so a leaked key cannot open a shell.
- **Prune old images** on the server (`docker image prune`) on a schedule, and set a
  retention policy for untagged versions in GHCR.
- **Pin third-party actions to a commit SHA** if your security policy requires it; the
  official Docker actions publish immutable releases, but pinning is the only guarantee.

## When not to

- **Several servers or services.** SSH loops across machines stop being a deployment system;
  that is the point where an orchestrator or a managed container platform earns its cost.
- **Changes should reach a few users first.** Push-to-restart replaces everything at once;
  a canary needs traffic control this setup does not have.
- **The server is not reachable from the internet.** GitHub-hosted runners connect over SSH
  from outside; for a private network, use a self-hosted runner inside it, or have the server
  pull on its own schedule.

## References

- [GitHub Actions: workflow syntax](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions)
- [GitHub: publishing packages from a workflow — `packages: write`](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions)
- [GitHub: the Container registry (ghcr.io)](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [GitHub: deployment environments — reviewers and scoped secrets](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment)
- [Docker: GitHub Actions for building images](https://docs.docker.com/build/ci/github-actions/)
- [Docker: GitHub Actions cache backend (`type=gha`)](https://docs.docker.com/build/cache/backends/gha/)
- [docker/metadata-action — tag types and `is_default_branch`](https://github.com/docker/metadata-action)
