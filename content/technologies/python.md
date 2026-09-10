---
id: python
name: Python
tagline: Dynamically typed language whose ecosystem dominates data, ML and glue code
category: languages
tags: [Language, Backend, Data, Scripting, Machine Learning]
difficulty: 1
usedFor: [backend, rest, serialization, concurrency]
prerequisites: [programming-fundamentals]
learningPath:
  - programming-fundamentals
  - python
  - http
  - backend
  - rest
  - database
  - postgresql
  - docker
related:
  - { to: go, rel: ALTERNATIVE_TO }
  - { to: nodejs, rel: ALTERNATIVE_TO }
  - { to: concurrency, rel: RELATED_TO }
  - { to: postgresql, rel: USED_WITH }
  - { to: redis, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: ai-rag, rel: USED_IN }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: search-system, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Python 3.14 (free-threaded build officially supported, not default)", confidence: high }
---

## TL;DR

Python is a dynamically typed, interpreted language optimised for how quickly a human can
express an idea rather than how fast the machine runs it. That trade paid off in libraries:
numerical computing, data engineering, machine learning, scripting and web APIs all have
mature Python ecosystems, and for ML there is effectively no alternative. The cost is
runtime speed and, historically, the Global Interpreter Lock, which prevented threads from
running Python bytecode in parallel. Since 3.13 a free-threaded build exists; since 3.14 it
is an officially supported option, though not the default.

## Practical

Four jobs cover most production Python:

- **HTTP APIs** — FastAPI (async, Pydantic-validated) or Django (batteries-included, ORM,
  admin) behind [NGINX](/technology/nginx) or a cloud load balancer. See
  [REST](/concept/rest).
- **Data pipelines** — extract, transform and load between object storage, warehouses and
  queues; orchestrated by Airflow, Dagster or Prefect. See
  [Analytics Pipeline](/architecture/analytics-pipeline).
- **ML and AI serving** — training with PyTorch, inference and retrieval behind an API. See
  [AI RAG](/architecture/ai-rag).
- **Glue and automation** — one-off migrations, report generators, internal CLIs, and the
  scripts that stitch two vendors together.

```python
# FastAPI: async I/O, typed request/response, cache-aside on Redis
@app.get("/orders/{order_id}", response_model=Order)
async def get_order(order_id: int) -> Order:
    if cached := await redis.get(f"order:{order_id}"):
        return Order.model_validate_json(cached)

    row = await db.fetch_one("select * from orders where id = :id", {"id": order_id})
    if row is None:
        raise HTTPException(status_code=404, detail="not found")

    order = Order.model_validate(dict(row))
    await redis.set(f"order:{order_id}", order.model_dump_json(), ex=60)
    return order
```

Toolchain in 2026 is much better than its reputation: `uv` or Poetry for dependency
resolution and lockfiles, `ruff` for linting and formatting, `mypy` or `pyright` for static
type checking, and `pytest` for tests. Pin an interpreter version and lock dependencies —
"works on my machine" is still Python's classic failure mode.

## Deep Dive

**The GIL, and life after it.** CPython reference-counts objects, and the Global
Interpreter Lock made that bookkeeping safe by allowing only one thread to execute bytecode
at a time. I/O releases the GIL, so threads have always helped for network work; CPU-bound
work needed `multiprocessing` (separate memory, pickling costs) or a native extension.
PEP 703 added a free-threaded build, supported officially from 3.14. It removes the GIL at
the cost of some single-thread performance and requires C extensions to be rebuilt and
audited, so adoption is gradual — check that your dependencies declare support before
counting on it.

**Async is a separate world.** `asyncio` gives you cooperative concurrency in one thread:
excellent for thousands of open sockets, useless for CPU-bound code, and incompatible with
blocking libraries. A single synchronous database driver in an async handler stalls the
whole event loop. The split between sync and async libraries is real friction. See
[Concurrency](/concept/concurrency).

**Performance comes from leaving Python.** NumPy, Polars, PyTorch and friends are thin
Python APIs over C, C++, Rust or CUDA. Idiomatic fast Python means moving loops into
vectorised library calls; hand-written per-row loops can be two orders of magnitude slower
than the equivalent [Go](/technology/go). The interpreter itself has been getting faster
(specialising adaptive interpreter since 3.11, an experimental JIT since 3.13), but this
narrows the gap rather than closing it.

**Types are optional and unenforced.** Annotations are metadata; nothing checks them at
runtime unless a library like Pydantic does. Type checkers catch real bugs, but only on the
code you have annotated, and third-party stubs vary in quality.

**Packaging and deployment.** Wheels, virtual environments, and native dependencies mean
"install" can mean compiling. Containerising with a pinned base image and a lockfile is the
usual answer. Cold start for a large ML image is measured in tens of seconds — plan for it.

## Why

Most systems work is not algorithmically hard; it is *integration* — read from here, reshape
it, write it there, and let an analyst see the result. In a statically compiled,
ceremony-heavy language each of those steps costs a type declaration, a build step and a
deployment artefact, and the exploratory loop of "look at the data, change one thing, look
again" is measured in minutes.

```steps
title: Before — integration work in a compile-and-deploy language
Define schema classes for the source format
Write a parser and a serialiser by hand
Add a build step, wait for compilation
Deploy to see whether the data actually matches the schema
Analyst asks for one more column — repeat the whole loop
```

Python collapses that loop. The REPL and notebooks let you inspect real data before
committing to a shape, `pandas`/`polars` and the standard library cover the reshaping, and
the same language runs the pipeline, the model and the API in front of it — so the person
who explored the data can ship it.

```steps
title: After — one language from exploration to production
Load a sample in a notebook, inspect it as it really is [python]
Reshape with a vectorised library call instead of a hand-written loop
Wrap the transform in a tested function
Schedule it in the orchestrator and expose results over an API [rest]
New column: change one line, rerun the notebook, ship
```

The payoff is not raw speed, it is the number of iterations you get per day — and for data
and ML work, iteration count is what determines the result.

## Advantages

- Unmatched library ecosystem for data, scientific computing, ML and automation
- Very low barrier to entry; readable enough to serve as executable specification
- The same language covers exploration (notebooks), pipelines and web APIs
- Strong optional typing story with Pydantic, mypy and pyright when a codebase grows
- Excellent C/C++/Rust interop, so hot paths can be pushed into native code
- Modern tooling (`uv`, `ruff`) has removed most of the historical setup pain

## Trade-offs

- Interpreted and dynamically typed: 10–100× slower than compiled languages on hot loops
- The GIL still shapes the default build; free-threading is opt-in and not yet universally supported by extensions
- Async and sync ecosystems are separate; mixing them accidentally blocks the event loop
- Type errors surface at runtime unless you invest in checking and keep it in CI
- Deployment artefacts are heavy — interpreter, virtualenv, native wheels, large images
- Refactoring large untyped codebases is genuinely risky; the compiler is not there to help

## When to use

- Anything data- or ML-shaped: training, feature engineering, ETL, analytics, retrieval
- Internal tools, automation and glue where development speed dominates runtime cost
- APIs whose latency budget is dominated by database and network calls, not CPU
- Prototypes and spikes that must be readable by non-specialists
- Teams whose existing expertise and libraries are already Python

## When not to use

- Don't use Python for CPU-bound hot paths measured in microseconds — use [Go](/technology/go) or [Rust](/technology/rust)
- When memory footprint and cold start matter (dense serverless, embedded, edge agents)
- For a single distributable binary with no runtime dependency
- When strict compile-time guarantees are a hard requirement (safety-critical, high-assurance)
- In a large team with no appetite for type checking and CI discipline — the codebase will drift

## Real-world

Python usually sits at the two ends of a system rather than in the middle. At the analytical
end it powers the transform steps of an [Analytics Pipeline](/architecture/analytics-pipeline)
— reading raw events from [S3](/technology/s3) or [Kafka](/technology/kafka), writing
modelled tables into a warehouse such as [ClickHouse](/technology/clickhouse). At the
product end it serves model inference and retrieval, as in
[AI RAG](/architecture/ai-rag), where embedding generation and vector search are both
Python-native. In a [Search System](/architecture/search-system) it commonly runs the
indexing and ranking jobs that feed [Elasticsearch](/technology/elasticsearch), while the
latency-critical query path may be written in something faster. For the language-level
comparison see [Go vs Python](/compare/go-vs-python).
