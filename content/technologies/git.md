---
id: git
name: Git
tagline: Content-addressed version control — immutable objects, movable refs, cheap branches
category: tools
tags: [Version Control, Tools, Collaboration, DevOps]
difficulty: 2
usedFor: [ci-cd, infrastructure-as-code, programming-fundamentals]
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - git
  - ci-cd
  - github-actions
related:
  - { to: ci-cd, rel: RELATED_TO }
  - { to: github-actions, rel: USED_WITH }
  - { to: infrastructure-as-code, rel: USED_WITH }
  - { to: terraform, rel: USED_WITH }
  - { to: feature-flag, rel: RELATED_TO }
  - { to: schema-migration, rel: RELATED_TO }
  - { to: docker, rel: USED_WITH }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Git 2.x", confidence: high }
---

## TL;DR

Git is a content-addressed object store with a thin layer of naming on top. Every file
version, directory tree and commit is stored once, keyed by the hash of its own contents,
and a *branch* is nothing more than a 41-byte file holding one commit hash. Almost every
Git command you find confusing becomes obvious once you know which of those two things it
touches: the immutable objects, or the movable pointers. Because history is a graph of
immutable snapshots, branching is free and rewriting history means *building new commits*,
never editing old ones.

## Practical

Day to day you are moving refs and inspecting the graph, not "saving files":

```bash
# What state am I actually in? These three answer 95% of confusion.
git status --short --branch          # working tree vs index vs HEAD
git log --oneline --graph --all -20  # the commit graph, not a list

# A commit is a snapshot + parent pointer(s); the message is metadata.
git add -p && git commit -m "fix: expire idempotency keys after 24h"

# Refs are cheap. Branch, review, integrate, delete.
git switch -c fix/idempotency-ttl
git push -u origin fix/idempotency-ttl

# Rebase = replay my commits onto a new base (new hashes!).
git fetch origin && git rebase origin/main

# Undo without losing anything: reflog remembers where HEAD has been.
git reflog -10
git reset --hard HEAD@{2}
```

Two habits pay for themselves: small commits whose messages explain *why*, and a
`.gitignore` that keeps build output and anything secret out of history. A later commit does
not delete a committed secret — it stays reachable in the object store, so leaked
credentials must be rotated, not just removed. See
[Secrets Management](/concept/secrets-management).

## Deep Dive

**Four object types, one address space.** A *blob* is file content. A *tree* maps names to
blobs and other trees — a directory snapshot. A *commit* points to one tree plus zero or
more parents, with author, timestamp and message. A *tag* object names a commit. Each is
stored under the SHA of its own bytes, so identical content is stored once no matter how
many commits or branches contain it, and any change anywhere in a tree changes every hash
above it. Git stores **snapshots**, not diffs; the diffs you read are computed on demand
(packfiles do delta-compress on disk, but that is storage, not the model).

**Refs are the mutable part.** `refs/heads/main`, `refs/tags/v2.1`,
`refs/remotes/origin/main` and `HEAD` are small files containing hashes. `commit` creates
an object and advances a ref. `reset` moves a ref. `checkout`/`switch` moves `HEAD`. Nothing
is ever "in" a branch: a commit is reachable from a branch, and reachability is what keeps
it alive. Unreachable objects survive until garbage collection, which is why `reflog`
recovers almost every accident.

**The three states.** Working tree, index (the proposed next tree) and `HEAD` (the last
commit). `git status` diffs all three, and knowing which pair a command touches tells you
whether it destroys anything: `git restore` overwrites the working tree, `git reset --hard`
overwrites tree and index, `git commit` only adds.

**Merge versus rebase is a question about honesty, not tidiness.** A merge creates a commit
with two parents, preserving exactly what happened — including that two lines of work
existed in parallel. A rebase replays your commits onto a new base, producing *new commits
with new hashes* and a history that reads as if you had started from the latest `main`.
Merge keeps the record; rebase keeps the narrative. Rebase your own unpushed work freely,
never rebase a branch others have built on, and pick one integration style per repository.
Squash-merge trades per-commit `bisect` resolution for one clean commit per change.

**Conflicts are not a Git failure.** Three-way merge uses the merge base to distinguish
"you changed this" from "they changed this", and stops only where both sides touched the
same region. Semantic conflicts — two [schema migrations](/concept/schema-migration)
claiming the same version number, say — merge cleanly and still break, so only tests in
[CI/CD](/concept/ci-cd) catch them.

**Distributed by design.** Every clone holds the full object graph, so `log`, `bisect` and
`blame` are local and instant; `fetch`, `push` and `pull` are the only network operations.
The server is a convention, which is why the hosting platform, not Git, provides pull
requests, permissions and review.

## Why

Version control before content-addressed snapshots meant a central server that owned the
truth. Branching copied files, was expensive and was avoided; history was linear per file;
and being offline meant being unable to commit.

```steps
title: Before — a central server owns history
Check out files from the server; the server records who holds a lock
Branching is expensive, so everyone works on one line and breaks it together
Committing requires the network; offline means no history
"Who changed this and why" needs a server round trip per file
Reverting a bad release means restoring files by hand
```

Git inverts that. Cloning copies the whole object graph, so history is local; commits are
immutable snapshots addressed by content, so integrity is verifiable and duplication is
free; and branches are just pointers, so isolating work costs nothing.

```steps
title: After — a local graph of immutable snapshots
Clone once; the full history is on your disk [git]
Create a branch per change — it is one file holding a hash
Commit, amend, rebase and bisect offline at local speed
Push the branch; review happens on the diff, then integrate
Every artefact is traceable to one commit, so CI and rollback have an exact identity [ci-cd]
```

That last line is why Git underpins so much modern practice: a commit hash is a stable name
for "exactly this state of the world", so [CI/CD](/concept/ci-cd) can build it,
[Terraform](/technology/terraform) can plan it, and a container image can be tagged with it.

## Advantages

- Full history locally: `log`, `blame`, `bisect` and branch switching are instant and offline
- Content addressing makes history tamper-evident and deduplicated
- Branching and merging are cheap enough to isolate every change
- Nothing is truly lost until garbage collection — `reflog` recovers most mistakes
- One commit hash names an exact state, giving builds, deploys and rollbacks a precise identity
- Ubiquitous: every hosting platform, CI system and IDE assumes it

## Trade-offs

- The mental model must be learned before the CLI stops surprising you
- Command surface is large and inconsistent, with several ways to do the same thing
- Poor fit for large binaries: every clone carries every version, and diffs are meaningless
- Very large monorepos need extra tooling (partial clone, sparse checkout) to stay fast
- History rewriting is a real footgun on shared branches
- Anything committed once is effectively permanent without a disruptive history rewrite
- Git records text changes, not intent; semantic conflicts still pass through cleanly

## When to use

- Any source code, configuration or documentation that more than one person edits
- Infrastructure definitions, so environment changes get the same review as code — see [Infrastructure as Code](/concept/infrastructure-as-code)
- Anything a pipeline must build reproducibly from an exact identity
- Work that benefits from short-lived branches and reviewable diffs
- Investigations where `bisect` over history is faster than reasoning about a regression

## When not to use

- Don't use plain Git for large media or datasets — use Git LFS or object storage such as [S3](/technology/s3), and commit a pointer
- Don't use it as a deployment mechanism for secrets or environment-specific credentials — that is [Secrets Management](/concept/secrets-management) territory, e.g. [Vault](/technology/vault)
- Don't commit build output or dependency trees you can reproduce
- Don't reach for long-lived release branches when [Feature Flag](/pattern/feature-flag) plus trunk-based development would keep integration continuous
- Don't rewrite published history to make the graph pretty; the cost lands on everyone else

## Real-world

In practice Git is the entry point to the whole delivery chain. A branch push triggers
[GitHub Actions](/technology/github-actions), which builds a
[Docker](/technology/docker) image tagged with the commit SHA, runs tests, and — after
review and merge — promotes that exact image through environments. The same commit drives
[Terraform](/technology/terraform) plans, so infrastructure and application changes share
one audit trail. In a [Microservices](/architecture/microservices) platform the repository
layout becomes an architectural decision: a monorepo buys atomic cross-service changes at
the cost of tooling to keep checkouts fast, while repo-per-service keeps pipelines small and
pushes coordination into versioned APIs. Both rest on the same primitive — an immutable,
content-addressed snapshot that everything downstream can name.
