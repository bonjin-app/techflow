---
id: airflow
name: Apache Airflow
tagline: Python-defined DAG scheduler for orchestrating batch data and operations workflows
category: data
tags: [Data, Orchestration, Workflow, Batch, Scheduling]
difficulty: 3
usedFor: [dimensional-modeling, idempotency, observability]
prerequisites: [programming-fundamentals, python, database, sql]
learningPath:
  - programming-fundamentals
  - python
  - sql
  - database
  - airflow
  - dimensional-modeling
  - spark
related:
  - { to: python, rel: REQUIRES }
  - { to: spark, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: s3, rel: USED_WITH }
  - { to: clickhouse, rel: USED_WITH }
  - { to: idempotency, rel: RELATED_TO }
  - { to: retry, rel: IMPLEMENTS }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: job-scheduler, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, version: "Airflow 3.x", confidence: medium }
---

## TL;DR

Airflow is a scheduler for workflows you describe as Python code. A *DAG* declares tasks
and the dependencies between them; Airflow works out what is runnable, hands tasks to
workers, retries failures, and records every attempt so you can see what ran, when, and
why it failed. It does not move or transform data itself — it tells other systems
([Spark](/technology/spark), a warehouse, an API, a container) to do that and waits for the
result. Think of it as `cron` with dependencies, retries, backfills, and a history you can
query.

## Practical

The unit of work is a DAG file. Modern Airflow uses decorators, so a pipeline reads like
ordinary Python:

```python
from datetime import datetime, timedelta
from airflow.sdk import dag, task

@dag(
    schedule="0 3 * * *",                     # nightly at 03:00
    start_date=datetime(2026, 1, 1),
    catchup=False,                            # don't backfill on deploy
    default_args={"retries": 3, "retry_delay": timedelta(minutes=5)},
    tags=["revenue"],
)
def daily_revenue():
    @task
    def extract(logical_date=None) -> str:
        # One partition per run, derived from the run's date — never "today"
        return export_orders_to_s3(day=logical_date.date())

    @task
    def load(path: str) -> int:
        return copy_into_warehouse(path)      # idempotent: DELETE partition, then INSERT

    @task
    def verify(rows: int) -> None:
        assert rows > 0, "empty partition"

    verify(load(extract()))

daily_revenue()
```

What teams actually run through it:

- **Nightly ELT** — extract to object storage such as [S3](/technology/s3), load into a
  warehouse, run transformations, publish tables. See
  [Analytics Pipeline](/architecture/analytics-pipeline).
- **Triggering heavy compute** — submit a [Spark](/technology/spark) job, poll it, fail the
  DAG if it fails. Airflow orchestrates; Spark processes.
- **Batch reconciliation** — replay a [Kafka](/technology/kafka) topic's landed files into
  the warehouse and compare against streaming results.
- **Operational chores** — retention deletes, index rebuilds, report emails, ML training
  runs, anything that needs "run this, then that, and tell me if it broke".

## Deep Dive

**Four moving parts.** The *scheduler* parses DAG files, decides which task instances are
runnable and queues them; *workers* execute them; a *metadata database* (usually
[PostgreSQL](/technology/postgresql)) holds every DAG run, task instance and attempt; the
*API server* serves the UI and, in Airflow 3, the task execution API that workers use
instead of connecting to the metadata database directly. The scheduler re-parses your DAG
files on a loop, so slow module-level code — an API call, a query, a heavy import — slows
the whole deployment. DAG files should *declare*, never *do*.

**Logical date, not "now".** Each run is stamped with the interval it represents, and tasks
should derive their inputs from that stamp — which is what makes reruns and backfills
meaningful: re-running yesterday's DAG recomputes yesterday's partition. A task calling
`datetime.now()` returns something different on every retry and destroys that property.

**Idempotency is the contract.** Airflow will retry your task; the orchestrator cannot know
whether a half-finished write happened. So every task must be safe to run twice: write to a
partition and replace it wholesale, use `MERGE`/upsert, or write to a staging location and
swap. See [Idempotency](/concept/idempotency) and the [Retry](/pattern/retry) pattern.
Partitioned targets make this natural — see [Partitioning](/concept/partitioning).

**XCom is for pointers, not payloads.** Task-to-task values go through the metadata
database, so passing a DataFrame through XCom bloats the database and slows the scheduler.
Pass an object-storage path or a table name and let the next task read it.

**Executors decide the scaling story.** A local executor runs tasks in the scheduler's
process (fine for development); Celery executors keep a pool of long-lived workers;
Kubernetes executors launch a pod per task, which gives per-task dependencies and resource
limits at the cost of pod start-up latency. The choice is mostly about isolation versus
start-up overhead. See [Kubernetes](/technology/kubernetes).

**Waiting is expensive if done naively.** A classic sensor occupies a worker slot while it
polls, so a hundred "wait for file" tasks can deadlock the pool. Deferrable operators hand
the wait to a separate triggerer process and release the slot — the right default for
anything that waits on an external system.

**Data-aware scheduling.** Beyond cron expressions, a DAG can trigger when an *asset* it
depends on is updated by another DAG, replacing the fragile habit of guessing "upstream is
probably done by 04:00". Airflow 3 also added DAG versioning, so a run records which code
version it executed.

## Why

The first version of any batch pipeline is a few cron entries on a box. It works until the
steps depend on each other, and then every failure becomes a manual investigation with no
record of what actually ran.

```steps
title: Before — cron entries with implicit dependencies
03:00 cron exports orders to a file
03:30 cron loads the file, assuming the export finished
04:00 cron builds the daily report from the loaded table
The export runs long; the load reads yesterday's file and the report is silently wrong
Recovering means someone SSHes in and reruns steps by hand, in the right order
```

An orchestrator makes the dependency explicit instead of implied by a clock, and makes every
attempt a recorded, retryable, rerunnable event.

```steps
title: After — one DAG with declared dependencies
extract → load → verify, declared as a graph in Python [airflow]
Each task retries with backoff before the run is marked failed [retry]
Tasks derive their inputs from the run's logical date, so reruns are exact [idempotency]
The load fails loudly; downstream tasks never run on stale data
Backfill 30 days from the UI or CLI; every attempt has logs and a duration [observability]
```

The win is not scheduling — cron schedules fine. It is *dependencies, retries and history*:
a wrong result becomes a failed task rather than a silently stale table.

## Advantages

- Workflows are ordinary Python, so they get code review, tests, and dynamic generation
- Dependencies, retries, timeouts, SLAs and alerting are declarative instead of hand-rolled
- Backfills and reruns are first-class, which is what batch data work actually needs
- Complete execution history: per-attempt logs, durations and states in the UI
- Very large operator/provider ecosystem for clouds, warehouses, databases and SaaS APIs
- Data-aware scheduling lets downstream DAGs trigger on upstream output rather than a guessed time
- Open source with several managed offerings, so it is not a lock-in decision

## Trade-offs

- Real operational weight: scheduler, API server, workers, metadata database, all to be run and upgraded
- Scheduler latency is measured in seconds — it is not a low-latency job runner
- DAG parsing is a performance trap: slow imports or top-level work degrade the whole instance
- The metadata database becomes a bottleneck and needs its own retention and maintenance
- Local development and testing of DAGs is clumsier than testing plain functions
- Version upgrades have historically been disruptive; Airflow 1 → 2 → 3 each broke patterns
- Easy to abuse as a general application scheduler, holding logic nobody can test

## When to use

- Scheduled batch pipelines whose steps depend on each other
- Anything that needs backfills, reruns or "recompute last month" as a routine operation
- Orchestrating heavy compute run elsewhere — Spark jobs, warehouse transformations, container jobs
- Workflows that must be observable after the fact: what ran, how long, which attempt failed
- Cross-system chores where a failure needs to alert someone rather than disappear

## When not to use

- Don't use it for streaming or sub-second work — that is [Kafka](/technology/kafka) plus a stream processor
- Don't use it as a job queue for user-triggered work; use [RabbitMQ](/technology/rabbitmq) or [Redis](/technology/redis) with workers
- Don't run heavy transformations inside Airflow tasks; push the work to a data engine and let Airflow wait
- Don't reach for it when three cron lines and a shell script genuinely suffice — the operational cost is real
- Don't put business logic in DAG files; keep them thin declarations over tested code
- Don't use it as a scheduler for tasks that must fire on an exact wall-clock deadline

## Real-world

In an [Analytics Pipeline](/architecture/analytics-pipeline), Airflow is the layer that
sequences everything else: land raw events in [S3](/technology/s3), submit a
[Spark](/technology/spark) job to clean and partition them, load the result into a warehouse
or [ClickHouse](/technology/clickhouse), rebuild the dimensional models, then run
data-quality checks that fail the run before anyone reads a bad dashboard. It is also where
operational batch work accumulates — retention jobs, partner exports, nightly ML training.
The division of labour that keeps such deployments healthy is consistent: Airflow decides
*when* and *in what order*, another engine decides *how*, and every task is safe to run
twice. Teams that blur that line end up with a scheduler that is also their most fragile
compute cluster.
