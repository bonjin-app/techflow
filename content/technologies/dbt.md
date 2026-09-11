---
id: dbt
name: dbt
tagline: Transformations as version-controlled SQL models with a dependency graph, tests and docs
category: data
tags: [Data, Analytics, SQL, Transformation, ELT]
difficulty: 2
usedFor: [dimensional-modeling, data-quality, sql]
prerequisites: [sql, database, dimensional-modeling]
learningPath:
  - sql
  - database
  - dimensional-modeling
  - dbt
  - data-quality
  - ci-cd
related:
  - { to: dimensional-modeling, rel: IMPLEMENTS }
  - { to: data-quality, rel: SOLVES }
  - { to: airflow, rel: USED_WITH }
  - { to: clickhouse, rel: USED_WITH }
  - { to: postgresql, rel: USED_WITH }
  - { to: spark, rel: ALTERNATIVE_TO }
  - { to: materialized-view, rel: RELATED_TO }
  - { to: analytics-pipeline, rel: USED_IN }
meta: { lastReviewed: 2026-09-10, version: "dbt Core 1.x", confidence: high }
---

## TL;DR

dbt is the **T** in ELT. You write each transformation as a `SELECT` statement in a file,
reference other models by name, and dbt works out the dependency order, materialises them
as tables or views *inside your warehouse*, runs tests against the results, and generates
documentation with lineage. It does not move data and it has no compute of its own — the
warehouse does the work. What it actually contributes is engineering discipline to a layer
that historically had none: version control, code review, environments, tests and a
dependency graph, for SQL.

## Practical

A dbt project is a directory of `.sql` and `.yml` files under version control. The whole
interface is a handful of commands: `dbt run` builds models, `dbt test` runs assertions,
`dbt build` does both in dependency order, and `dbt docs generate` produces the lineage
site.

- **Models** are `SELECT` statements. `ref('other_model')` declares a dependency, which is
  how the DAG is inferred — you never write the order down.
- **Sources** declare the raw tables loaded by an ingestion tool, with freshness
  expectations, so "the upstream load is late" is a first-class failure.
- **Tests** are assertions on the output: not null, unique, accepted values, referential
  integrity, plus any SQL that should return zero rows. See
  [Data Quality](/concept/data-quality).
- **Materialisations** decide how a model is built: a view, a table rebuilt each run, or an
  incremental table that only processes new rows.
- **Layers** are convention, not enforcement: staging (one model per source, renamed and
  typed), intermediate (joins and business logic), marts (the
  [dimensional model](/concept/dimensional-modeling) analysts query).

```sql
-- models/marts/fct_orders.sql
{{ config(materialized='incremental', unique_key='order_id') }}

select
    o.order_id,
    o.customer_id,
    date_trunc('day', o.created_at)          as order_date,
    sum(i.quantity * i.unit_price)           as order_total,
    count(i.item_id)                         as item_count
from {{ ref('stg_orders') }} o                -- ref() builds the DAG
join {{ ref('stg_order_items') }} i using (order_id)
{% if is_incremental() %}
  where o.created_at > (select max(order_date) from {{ this }})   -- only new rows
{% endif %}
group by 1, 2, 3
```

```yaml
# models/marts/schema.yml — the tests are part of the model, not a separate project
models:
  - name: fct_orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: customer_id
        tests:
          - not_null
          - relationships: { to: ref('dim_customers'), field: customer_id }
      - name: order_total
        tests:
          - dbt_utils.accepted_range: { min_value: 0, inclusive: true }
```

## Deep Dive

**The DAG is inferred, which is the whole trick.** Because dependencies are expressed by
`ref()` inside the SQL, they cannot drift from the code. dbt topologically sorts the graph,
runs independent branches in parallel, and can build just one model and everything downstream
of it. Compare this with hand-maintained schedule dependencies in an orchestrator, where the
graph and the code are two artefacts that disagree eventually.

**It is SQL plus Jinja, and that is a sharp edge.** Templating gives you incremental logic,
macros and environment switches. It also lets you build unreadable SQL generators. The
healthy line: use Jinja for configuration, incremental predicates and small reusable macros;
if a model needs a hundred lines of templating, the modelling is wrong.

**Incremental models are where correctness gets interesting.** Processing only new rows is
what keeps a large table affordable, but late-arriving data, updated rows and backfills all
break a naive `where created_at > max(...)`. The usual answer is a lookback window plus a
merge on a unique key, and a scheduled full refresh to correct drift. This is the same
at-least-once reasoning as [Idempotency](/concept/idempotency): a model must be safe to
re-run.

**Tests run against real output, not a fixture.** That makes them genuinely useful and
genuinely late — they fail after the table is built. Configure severity so a critical test
aborts downstream models rather than letting bad data propagate, and treat the failure as a
pipeline incident with an owner. Testing sources for freshness before building is the cheap
way to fail early.

**It does not replace an orchestrator.** dbt sequences models within a run; it does not
ingest data, wait for a file to land, call an API, trigger a retrain or coordinate with
non-SQL work. In practice [Airflow](/technology/airflow) (or an equivalent) triggers `dbt
build` as one task in a wider DAG. Teams that try to make dbt the scheduler end up
reimplementing an orchestrator in shell scripts.

**The warehouse is your runtime, so cost is your problem.** Every model is a query you now
run on a schedule. A view that is convenient at development scale can be a full table scan
executed hourly in production. Read the query plans, prefer incremental for large facts, and
watch the warehouse bill as a project metric — see [Cost Management](/concept/cost-optimization).

**Documentation and lineage are a side effect worth having.** Because descriptions live next
to the models and dependencies are inferred, the generated docs site is usually accurate,
which is rare for data documentation. Column-level lineage answers the question that
otherwise takes a day: if this field changes, what breaks?

## Why

Before dbt, the transformation layer was where engineering practice went to die: stored
procedures nobody could diff, scheduled scripts with dependencies encoded in cron times, and
business logic duplicated in six dashboards. There was no test suite, so the first signal of
a broken join was an analyst noticing revenue looked wrong.

```sequence
title: Before — untested SQL, hand-ordered, logic duplicated in dashboards
participants: Loader [airflow], Warehouse [postgresql], Script, Dashboard, Analyst
Loader -> Warehouse: raw tables land at 02:00
Script -> Warehouse: proc_build_orders (scheduled 02:30, hoping the load finished)
Warehouse --> Script: succeeds on a partial load — no freshness check
Dashboard -> Warehouse: its own definition of "active customer"
Analyst --> Dashboard: two dashboards, two revenue numbers, no lineage to compare
Analyst -> Script: which query produced this column? nobody knows
```

After: the transformation is code in a repository, the order is derived from the code, the
assertions run on every build, and one definition of a metric lives in one model that
everything else references.

```sequence
title: After — one repo, an inferred DAG, tests before anything downstream builds
participants: CI [github-actions], dbt [dbt], Warehouse [clickhouse], Docs, Analyst
CI -> dbt: pull request → build models in a scratch schema
dbt -> Warehouse: source freshness check, then models in dependency order
Warehouse --> dbt: results
dbt -> dbt: tests — unique, not null, relationships, accepted ranges
dbt --> CI: fail the PR on a broken join, before merge
dbt -> Docs: lineage and column descriptions regenerated
Analyst -> Docs: one definition, and the graph showing what depends on it
```

## Advantages

- Transformations become reviewable, versioned code with environments and a real CI story
- The dependency graph is inferred from the SQL, so it cannot drift from reality
- Tests run against actual output and can stop bad data reaching downstream models
- One definition of each metric, referenced everywhere instead of copied into dashboards
- Accurate lineage and documentation as a by-product of writing models
- SQL keeps analysts and analytics engineers productive without learning a framework
- Incremental materialisation makes large fact tables affordable to rebuild

## Trade-offs

- SQL-only: anything needing Python, an API call or ML belongs elsewhere in the pipeline
- Jinja templating can produce SQL nobody can read or debug
- Tests fire after the table is built, so they detect rather than prevent
- Not an orchestrator or an ingestion tool — you still need those
- Every model is a scheduled warehouse query, so cost grows quietly with the project
- Incremental correctness (late data, updates, backfills) is genuinely subtle
- Model sprawl is the common failure: hundreds of thin models with no layer discipline

## When to use

- You have a warehouse and more than a handful of SQL transformations to maintain
- Multiple people need to change transformation logic without breaking each other
- Metric definitions are duplicated across dashboards and disagree
- You need lineage to answer "what breaks if I change this column"
- The team's strength is SQL rather than distributed-systems programming

## When not to use

- Don't use dbt for transformations that are not expressible in SQL — reach for [Spark](/technology/spark) or Python
- For streaming or sub-minute latency; dbt is batch by design
- As your orchestrator, ingestion tool or reverse-ETL layer
- When there is no warehouse to run inside, or the data lives only in an OLTP database serving users
- For a single scheduled query — a cron job and a view are enough

## Real-world

dbt sits in the middle of an [Analytics Pipeline](/architecture/analytics-pipeline):
ingestion lands raw events and database snapshots in the warehouse,
[Airflow](/technology/airflow) triggers `dbt build`, and the marts it produces are what
[ClickHouse](/technology/clickhouse) or the BI layer serves to analysts. The staging layer
is where upstream schema churn is absorbed, which is why a producer renaming a column becomes
one file's problem instead of forty dashboards' — provided the
[data contract](/concept/data-quality) and the freshness tests are there to catch it. Teams
typically pair it with a nightly full refresh for correction, a per-pull-request build in a
scratch schema so review is real, and alerting on test failures routed to the team that owns
the model rather than to whoever built the pipeline.
