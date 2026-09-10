---
id: spark
name: Apache Spark
tagline: Distributed engine for large-scale batch and streaming data processing
category: data
tags: [Data, Big Data, Distributed System, Batch, Analytics]
difficulty: 4
usedFor: [partitioning, serialization, dimensional-modeling]
prerequisites: [programming-fundamentals, sql, database, distributed-system]
learningPath:
  - programming-fundamentals
  - python
  - sql
  - database
  - distributed-system
  - spark
  - partitioning
related:
  - { to: python, rel: USED_WITH }
  - { to: java, rel: REQUIRES }
  - { to: s3, rel: USED_WITH }
  - { to: kafka, rel: USED_WITH }
  - { to: airflow, rel: USED_WITH }
  - { to: clickhouse, rel: RELATED_TO }
  - { to: partitioning, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: iot-telemetry, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "Spark 4.x", confidence: medium }
---

## TL;DR

Spark runs one logical computation across many machines. You write what looks like a query
or a chain of DataFrame operations; Spark compiles it into a plan, splits your data into
*partitions*, and executes tasks on *executors* in parallel, keeping intermediate results in
memory where it can. It is a processing engine, not a database and not a scheduler: it reads
from object storage, a warehouse or [Kafka](/technology/kafka), transforms at scale, and
writes results back. Almost everything that goes wrong with Spark comes down to one
question — how much data has to move between machines.

## Practical

Most Spark today is DataFrame or SQL code, not hand-written RDDs:

```python
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder.appName("daily-revenue").getOrCreate()

orders = spark.read.parquet("s3://lake/orders/dt=2026-09-09/")   # partition pruning
users  = spark.read.parquet("s3://lake/dim_users/")

daily = (
    orders
    .filter(F.col("status") == "paid")        # pushed down into the Parquet scan
    .join(F.broadcast(users), "user_id")      # small side broadcast: no shuffle
    .groupBy("country", "dt")                 # wide transformation: this shuffles
    .agg(F.sum("amount").alias("revenue"),
         F.countDistinct("user_id").alias("buyers"))
)

(daily.write
      .mode("overwrite")                      # replace the partition — rerun-safe
      .partitionBy("dt")
      .parquet("s3://lake/marts/daily_revenue/"))
```

Where it earns its keep:

- **Batch ELT at scale** — clean, join and aggregate hundreds of gigabytes to terabytes that
  will not fit on one machine, writing partitioned Parquet to [S3](/technology/s3).
- **Reshaping into models** — building the fact and dimension tables an analytics warehouse
  or [ClickHouse](/technology/clickhouse) then serves. See
  [Analytics Pipeline](/architecture/analytics-pipeline).
- **Streaming with the same code** — Structured Streaming reads [Kafka](/technology/kafka)
  in micro-batches using the same DataFrame API, with checkpointed offsets.
- **Feature pipelines** — heavy joins and windowed aggregations over historical data.

Spark is normally *triggered* by an orchestrator rather than scheduling itself: an
[Apache Airflow](/technology/airflow) task submits the job and waits for it.

## Deep Dive

**Lazy plan, then stages.** Transformations build a logical plan; nothing runs until an
*action* (`write`, `count`, `collect`). Catalyst optimises the plan — predicate pushdown,
column pruning, join reordering — and splits it into *stages* separated by shuffles. Within
a stage, tasks run independently on partitions; between stages, data must be redistributed.
This is why reading the physical plan (`df.explain()`) is the primary debugging skill: the
number of shuffles is the shape of your job's cost.

**Narrow versus wide is the whole performance story.** `filter`, `select` and `withColumn`
are *narrow* — each output partition depends on one input partition, so they cost nothing
extra. `groupBy`, `join`, `distinct` and window functions are *wide*: they shuffle, writing
intermediate data to disk and sending it across the network. Reducing data before a shuffle,
and broadcasting a small side of a join instead of shuffling both, is most of practical
Spark tuning.

**Partitions are the unit of parallelism, and skew is the enemy.** Work is divided per
partition, so a job is only as fast as its slowest task. If one key holds 40% of the rows —
a null `user_id`, one enormous tenant — one task processes 40% of the data while the cluster
idles. Symptoms are unmistakable: 199 tasks finish in seconds, one runs for an hour. Fixes
are salting the key, splitting the heavy key out, or letting adaptive query execution split
skewed partitions at runtime. See [Partitioning](/concept/partitioning).

**Memory, spill and the JVM.** Executors are JVM processes ([Java](/technology/java) is the
runtime, even for PySpark) with memory divided between execution and storage. Exceeding it
means spilling to disk — slow but survivable — or the container being killed by the OS. In
PySpark, Python UDFs serialise every row between the JVM and a Python process, which is why
built-in functions and vectorised (Arrow-based) UDFs are dramatically faster than row-wise
Python. See [Serialization](/concept/serialization).

**The driver is a single point of everything.** It holds the plan, schedules tasks and
collects results. `collect()` on a large DataFrame pulls the whole dataset into the driver's
heap and kills the job — the most common beginner failure.

**File format and layout dominate read cost.** Columnar formats (Parquet, ORC) plus a
directory layout matching your filters let Spark skip most of the data. Table formats such
as Delta Lake, Iceberg and Hudi add transactions, schema evolution and time travel on top of
object storage. The opposite failure is the "small files problem": millions of tiny objects
where per-file overhead swamps the work.

**Streaming is micro-batch, mostly.** Structured Streaming gives exactly-once semantics
against replayable sources and idempotent sinks via checkpointed offsets, at latencies of
hundreds of milliseconds to seconds. Watermarks and late data remain your responsibility.

## Why

The first version of a data transformation is a script on one machine. It works beautifully
until the input outgrows that machine's memory, and then every option is bad.

```steps
title: Before — one machine, one process
A script loads the day's orders into memory and joins them against users
The dataset doubles; the process is killed by the OS partway through
The workaround is chunking by hand, with hand-written checkpoints and resume logic
A rerun takes six hours, so nobody dares change the logic
Adding a second machine means rewriting the whole thing as a distributed program
```

Spark's contribution is that the *parallelism is in the engine, not your code*. You describe
the transformation; partitioning, task scheduling, retries on lost executors and shuffles
are the framework's job.

```steps
title: After — one plan, many partitions
Read partitioned Parquet from object storage; only needed columns and days are scanned [s3]
Catalyst plans the query and splits it into stages at each shuffle [spark]
Tasks run in parallel per partition; a lost executor's tasks are retried elsewhere
Write results back partitioned by date, so a rerun replaces one partition [partitioning]
An orchestrator submits the job and records the outcome [airflow]
```

The trade is real: you gain horizontal scale and fault tolerance, and you inherit shuffles,
skew and a distributed system to reason about.

## Advantages

- Scales one logical computation from gigabytes to petabytes without rewriting it
- One API across SQL, DataFrames, streaming and ML, in Python, SQL, Scala and Java
- Fault tolerance built in: failed tasks are recomputed rather than failing the job
- A real query optimiser, plus adaptive execution that fixes some bad plans at runtime
- Reads and writes almost everything: object storage, JDBC, Kafka, columnar and table formats
- Runs on Kubernetes, YARN or a managed platform, so it is not tied to one vendor

## Trade-offs

- Fixed overhead: JVM start-up and scheduling make small jobs slower than a plain script
- Shuffles and data skew dominate performance, and diagnosing them means reading physical plans
- Memory tuning (executor size, partition count, spill) is still hands-on despite adaptive execution
- PySpark's Python boundary is a serialisation cost that surprises people writing row-wise UDFs
- Cluster operations, dependency and version management are non-trivial work
- Cost scales with wasted work: a bad join can be quietly expensive rather than visibly broken
- Streaming latency is micro-batch, not per-event

## When to use

- Datasets too large for one machine, or growing towards that point
- Heavy joins and aggregations over historical data in object storage
- Building the tables a warehouse or OLAP store will serve
- Pipelines that must tolerate machine failure without a manual restart
- Batch and streaming versions of the same transformation, sharing one codebase

## When not to use

- Don't use it for data that fits on one machine — a plain script or a warehouse query is faster and cheaper
- Don't use it for interactive, low-latency queries; that is [ClickHouse](/technology/clickhouse) or [Elasticsearch](/technology/elasticsearch) territory
- Don't use it as a serving layer or an application database — it has no indexes or point lookups worth the name
- Don't use it for per-event, millisecond-latency stream processing
- Don't use it to orchestrate workflows; that belongs in [Apache Airflow](/technology/airflow)
- Don't reach for it when the transformation can be expressed as SQL inside the warehouse that already holds the data

## Real-world

In a typical [Analytics Pipeline](/architecture/analytics-pipeline), raw events land in
object storage from [Kafka](/technology/kafka) or an export job; Spark reads a day's
partitions, deduplicates, joins against dimensions and writes partitioned Parquet; then a
warehouse or [ClickHouse](/technology/clickhouse) serves the results to dashboards. An
[IoT Telemetry](/architecture/iot-telemetry) platform uses the same engine twice: Structured
Streaming for near-real-time rollups, and nightly batch jobs that recompute the same
aggregates once late data has arrived. The habits that keep such jobs sane are consistent —
partition inputs and outputs by time, overwrite whole partitions so reruns are safe, watch
shuffle bytes in the Spark UI, and let the orchestrator own the schedule.
