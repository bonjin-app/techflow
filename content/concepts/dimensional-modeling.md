---
id: dimensional-modeling
name: Dimensional Modeling
tagline: Organise analytics data as measurable facts surrounded by descriptive dimensions
category: data
tags: [Data, Analytics, Modeling, Warehouse]
difficulty: 3
prerequisites: [database, sql, indexing]
learningPath:
  - database
  - sql
  - dimensional-modeling
  - partitioning
  - clickhouse
related:
  - { to: clickhouse, rel: USED_WITH }
  - { to: sql, rel: REQUIRES }
  - { to: analytics-pipeline, rel: USED_IN }
  - { to: partitioning, rel: RELATED_TO }
  - { to: materialized-view, rel: RELATED_TO }
  - { to: cqrs, rel: RELATED_TO }
  - { to: cassandra, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-10, confidence: high }
---

## TL;DR

Dimensional modeling shapes analytical data into **fact** tables — one row per business
event, holding numeric measures and foreign keys — surrounded by **dimension** tables that
describe the event's context (who, what, where, when, which channel). The resulting star
schema is deliberately denormalised: it answers "revenue by region by month" with one join
per filter and no recursive traversal. It is the standard model for warehouses and BI tools
precisely because it is easy for humans to query and easy for engines to scan.

## Why it matters

A normalised OLTP schema is optimised for correct, small writes; an analytics question
touches millions of rows and a dozen tables, and expressing it takes six joins that only
the original author understands. Dimensional models invert the priorities: writes are
batch appends, storage is cheap, and the design objective is that an analyst can find the
right table on the first try and get a consistent answer. When two dashboards disagree
about "active customers", the cause is almost always the absence of a shared dimension
rather than a bug in either query.

## Visual

```steps
title: Facts, dimensions, and the query they enable
1. Pick the business process | "an order line was placed" — one process per fact table
2. Declare the grain | one row per order line item, written down before any column is chosen
3. Identify the dimensions | date, customer, product, store, promotion, payment method
4. Identify the measures | quantity, unit price, discount, extended amount, cost
5. Build fact_order_line | surrogate keys plus additive numeric measures, narrow rows, no text
6. Build dim_product | product_key, sku, name, category, brand, current and historical attributes
7. Build dim_date | one row per day with weekday, fiscal period, holiday flags, never computed inline
8. Handle changes | Type 1 overwrite for corrections, Type 2 new row plus valid_from/valid_to for history
9. Partition and sort the fact | partition by month, order by the columns you filter on most
10. Query it | SELECT d.category, SUM(f.extended_amount) FROM fact_order_line f JOIN dim_product d USING (product_key) JOIN dim_date t USING (date_key) WHERE t.year = 2026 GROUP BY 1
```

```sql
-- The same query, with a second dimension and a conformed date filter
SELECT  t.fiscal_quarter,
        s.region,
        SUM(f.extended_amount)              AS revenue,
        SUM(f.extended_amount - f.cost)     AS margin,
        COUNT(DISTINCT f.order_id)          AS orders
FROM        fact_order_line f
JOIN dim_date    t USING (date_key)
JOIN dim_store   s USING (store_key)
WHERE  t.fiscal_year = 2026
  AND  s.country = 'DE'
GROUP BY 1, 2
ORDER BY 1, 2;
```

## How it works

**Grain first.** The grain is the meaning of one fact row, stated in a sentence. Choose the
most atomic grain the source provides — order line, page view, sensor reading — because
aggregates can always be derived from atoms but not the reverse. Mixed grains in one table
is the defect that produces double-counted revenue.

**Three kinds of fact table.** *Transaction* facts (one row per event, append-only),
*periodic snapshot* facts (one row per entity per period — balances, inventory), and
*accumulating snapshot* facts (one row per process instance, updated as it advances through
milestones such as ordered → shipped → delivered).

**Additivity of measures.** Fully additive measures (amount, quantity) can be summed across
any dimension. Semi-additive ones (an account balance) sum across everything except time.
Non-additive ones (ratios, percentages) must be stored as their numerator and denominator
and divided after aggregation, or every average-of-averages will be wrong.

**Surrogate keys.** Dimensions use a meaningless integer key rather than the source
system's natural key. That decouples the warehouse from source-system reuse of ids, lets
the same dimension hold multiple historical versions of one entity, and keeps fact rows
narrow.

**Slowly changing dimensions.** When a customer moves city, Type 1 overwrites the old value
(cheap, loses history, silently rewrites past reports), Type 2 inserts a new dimension row
with validity dates and a current flag (preserves history, doubles the join complexity),
and Type 3 adds a "previous value" column (rarely worth it). Type 2 is the default for
anything a report is compared against year over year.

**Conformed dimensions.** One `dim_customer` and one `dim_date` shared by every fact table
is what makes cross-process analysis possible — order facts and support-ticket facts become
comparable because they use the same customer key and the same calendar.

## Deep Dive

**Star versus snowflake.** Snowflaking normalises a dimension into a hierarchy of tables
(product → subcategory → category). It saves negligible space, since dimensions are tiny
compared to facts, and costs extra joins and comprehension. Keep dimensions flat and wide;
snowflake only where a hierarchy genuinely has its own life cycle.

**Columnar engines change the calculus.** On [ClickHouse](/technology/clickhouse) and
similar engines, scan cost is dominated by the columns touched and the sort order, not by
row count, and large joins are comparatively expensive. That pushes designs toward wider
denormalised tables — dimension attributes copied into the fact — and toward
[Materialized Views](/pattern/materialized-view) for pre-aggregation. The dimensional
*vocabulary* still applies; the physical layout does not have to be a textbook star.
[Partitioning](/concept/partitioning) by event time is what makes retention and backfills
manageable.

**Late and out-of-order data.** Events arrive after their partition was built, so facts
need a processing timestamp alongside the event timestamp, and partitions need to be
rebuildable. Idempotent, deterministic rebuilds — reprocess the day, replace the partition
— are far more robust than incremental patching, and they make backfills a routine
operation in an [Analytics Pipeline](/architecture/analytics-pipeline).

**Failure modes.** A fact table with no documented grain, which nobody can safely extend.
Fan-out from joining two facts of different grain directly, inflating sums — join through
a shared dimension instead. Type 1 updates applied to dimensions that reports depend on,
so last quarter's numbers change overnight. Nulls in dimension keys, which silently drop
rows in inner joins — use an "unknown" dimension member with key 0. Text and free-form
JSON in fact rows, which balloons scan cost.

**Trade-offs against alternatives.** Data Vault handles many volatile sources and auditing
better, at the cost of a much steeper query path — it is usually a staging layer with a
dimensional layer on top for consumption. One Big Table (fully denormalised, per use case)
is fastest to query and cheapest to explain, but duplicates business logic per table and
drifts. Dimensional modeling sits between them, and its real product is not the schema but
the shared definitions: one place where "order", "customer" and "revenue" mean one thing.
