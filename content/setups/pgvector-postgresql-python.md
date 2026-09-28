---
id: pgvector-postgresql-python
name: Semantic search with PostgreSQL + pgvector
tagline: Embed documents in Python, keep vectors beside the rows, query by meaning in SQL
environment: local
difficulty: 3
tags: [AI, Vector Search, Database, Python, Docker]
components:
  - { ref: postgresql, version: "17", role: "Holds the documents, their metadata and their embeddings in one table" }
  - { ref: pgvector, version: "0.8", role: "Adds the vector type, distance operators and an HNSW index" }
  - { ref: python, version: "3.12+", role: "Computes embeddings with sentence-transformers and queries through psycopg 3" }
related:
  - { to: vector-database, rel: RELATED_TO }
  - { to: embedding, rel: RELATED_TO }
  - { to: rag, rel: RELATED_TO }
  - { to: semantic-vs-keyword-search, rel: RELATED_TO }
  - { to: indexing, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-26, confidence: medium }
---

## TL;DR

Vector search without a new database: [pgvector](/technology/pgvector) adds a `vector` column
type and nearest-neighbour operators to [PostgreSQL](/technology/postgresql), so each
document's [embedding](/concept/embedding) sits in the same row as its text, owner and
timestamps. A [Python](/technology/python) script embeds documents with a small open model
that runs locally — no API key — and a query is ordinary SQL: filter by any column, order by
distance, limit. This is the retrieval half of a [RAG](/pattern/rag) system, set up in
Docker Compose.

## Why this pairing

**The vectors belong with the data they describe.** Permissions, deletions, tenants and
freshness already live in PostgreSQL. Keeping embeddings in the same table means a query can
say "similar to this, but only this user's documents, from this year" in one statement, and
deleting a document deletes its vector in the same transaction.

**What fits:**

- One system to back up, secure and operate; the vector index is just another index.
- SQL filters and joins combine with similarity — the thing separate vector stores make
  hardest.
- Python has the embedding libraries, and pgvector's Python package teaches psycopg the
  vector type, so NumPy arrays go in and come out directly.

**Where it rubs:**

- Approximate indexes trade recall for speed. With a restrictive `WHERE`, HNSW can return
  fewer rows than the `LIMIT` because it filters after searching — see Going to production.
- Embedding dimensions are fixed by the model. Changing the model means a new column and
  re-embedding every row, not an `ALTER` of the old one.
- At hundreds of millions of vectors, or very high query rates, a dedicated vector database
  may cost less to run — see [Vector Database](/concept/vector-database).

## Set it up

```steps
title: From an empty database to a query by meaning
Database | PostgreSQL with pgvector from the project's own image, the extension and a table
Embed and store | Encode each document with a local model and insert text and vector together
Index | An HNSW index for cosine distance
Query | Embed the question, filter with SQL, order by distance
```

**1. `compose.yaml` and `init.sql`** — the `pgvector/pgvector` image is PostgreSQL with the
extension built in. The dimension, 384, is the output size of the model used below.

```yaml file=compose.yaml
services:
  db:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: search
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d search"]
      interval: 5s
      retries: 10

volumes:
  pgdata:
```

```sql file=init.sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id         bigserial PRIMARY KEY,
  owner_id   bigint NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  embedding  vector(384) NOT NULL
);
```

**2. `ingest.py`** — `register_vector` must run after the extension exists, so that psycopg
knows the type.

```py file=ingest.py
import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")  # 384 dimensions, runs on CPU

docs = [
    (1, "Refunds are issued to the original payment method within five days."),
    (1, "Orders can be cancelled until they have been dispatched."),
    (2, "Our office is closed on public holidays."),
]

with psycopg.connect("postgresql://app:app@localhost:5432/search") as conn:
    register_vector(conn)
    vectors = model.encode([body for _, body in docs], normalize_embeddings=True)
    with conn.cursor() as cur:
        for (owner_id, body), vec in zip(docs, vectors):
            cur.execute(
                "INSERT INTO documents (owner_id, body, embedding) VALUES (%s, %s, %s)",
                (owner_id, body, vec),
            )
```

Install the Python packages in a virtual environment — current Linux distributions refuse
`pip install` into the system Python (PEP 668). Installing PyTorch from its CPU index first
avoids downloading several gigabytes of GPU libraries a CPU-only machine never uses.

```sh run
docker compose up -d --wait
python3 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install "psycopg[binary]" pgvector sentence-transformers
python ingest.py
```

**3. The index** — build it after the initial load; building during inserts is slower.

```sh run
docker compose exec db psql -U app -d search -c \
  "CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops)"
```

**4. `search.py`** — `<=>` is cosine distance, so smaller is closer and `1 - distance` is the
similarity. The owner filter is plain SQL.

```py file=search.py
import sys
import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
query = model.encode(sys.argv[1], normalize_embeddings=True)

with psycopg.connect("postgresql://app:app@localhost:5432/search") as conn:
    register_vector(conn)
    rows = conn.execute(
        """
        SELECT body, 1 - (embedding <=> %s) AS similarity
        FROM documents
        WHERE owner_id = %s
        ORDER BY embedding <=> %s
        LIMIT 3
        """,
        (query, 1, query),
    ).fetchall()
    for body, similarity in rows:
        print(f"{similarity:.2f}  {body}")
```

## Verify

A question that shares no keywords with the answer should still find it:

```sh
python search.py "how do I get my money back"
```

```sh check hidden
out=$(.venv/bin/python search.py "how do I get my money back")
echo "$out"
echo "$out" | head -1 | grep -q "Refunds are issued"
echo "$out" | sed -n 2p | grep -q "Orders can be cancelled"
! echo "$out" | grep -q "public holidays"
```

The refund policy should rank first, with the clearly higher similarity, and the
cancellation policy below it. The exact scores depend on the model version; the order is the
check.

The holiday document never appears for owner 1, and the index is used once the table is
large enough for the planner to prefer it:

```sh
docker compose exec db psql -U app -d search -c "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
docker compose exec db psql -U app -d search -c "EXPLAIN SELECT id FROM documents ORDER BY embedding <=> (SELECT embedding FROM documents LIMIT 1) LIMIT 3"
```

```sh check hidden
v=$(docker compose exec -T db psql -U app -d search -tAc "SELECT extversion FROM pg_extension WHERE extname = 'vector'")
echo "pgvector $v"; case "$v" in 0.8.*) ;; *) exit 1 ;; esac
docker compose exec -T db psql -U app -d search -tAc "SELECT indexdef FROM pg_indexes WHERE tablename = 'documents'" | grep -q "USING hnsw (embedding vector_cosine_ops)"
```

With three rows the plan is a sequential scan, which is correct; insert a few thousand and
it switches to the HNSW index.

## Going to production

- **Handle filtered searches deliberately.** HNSW finds candidates, then applies the
  `WHERE`; a filter that removes most rows can leave fewer results than asked for. Raise
  `hnsw.ef_search`, enable pgvector's iterative index scans, or partition by the filter
  column for very selective filters.
- **Store the model name with the vectors.** A column or table per model makes a migration to
  a new model a background re-embed and a switch, instead of a mixed table.
- **Combine with keyword search.** Exact terms — product codes, names — are where embeddings
  are weakest; a hybrid of full-text rank and vector distance usually beats either — see
  [Semantic vs Keyword Search](/compare/semantic-vs-keyword-search).
- **Budget memory for the index.** HNSW performs best when it fits in memory; watch index
  size as the table grows, and use a managed PostgreSQL with pgvector support in production.
- **Embed outside the request path** for documents: a queue and a worker, so ingestion
  spikes do not slow searches.

## When not to

- **Exact matching is what users need.** Codes, identifiers and quoted phrases are served
  better by PostgreSQL's full-text search or a B-tree index than by similarity.
- **Hundreds of millions of vectors with tight latency targets.** A purpose-built vector
  database, or a dedicated search cluster, scales that tier with less tuning.
- **There is no PostgreSQL to begin with**, and the only need is vector search over data that
  already lives elsewhere; adding a database just for this is the heavier choice.

## References

- [pgvector — vector type, operators, HNSW and IVFFlat indexes, filtering](https://github.com/pgvector/pgvector)
- [pgvector-python — psycopg 3 integration](https://github.com/pgvector/pgvector-python)
- [pgvector Docker image](https://hub.docker.com/r/pgvector/pgvector)
- [PostgreSQL 17 documentation](https://www.postgresql.org/docs/17/index.html)
- [psycopg 3 documentation](https://www.psycopg.org/psycopg3/docs/)
- [Sentence Transformers documentation](https://sbert.net/)
- [all-MiniLM-L6-v2 model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
