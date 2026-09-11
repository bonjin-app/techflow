# Master node list (initial release)

Use ONLY these ids when linking (`related`, `prerequisites`, `usedFor`, `ref`, links).
Free-text learning-path labels are fine when a topic has no node here.

## technologies/ (technology)
redis ✓ · postgresql · memcached · kafka · rabbitmq · websocket · sse · mongodb · docker · kubernetes · elasticsearch

## concepts/ (concept)
cache ✓ · http · backend · database · sql · transaction · acid · distributed-system · pub-sub · session ·
distributed-lock · ttl · rate-limiting · message-queue · cache-invalidation · race-condition · idempotency ·
load-balancing · replication · sharding · cap-theorem · eventual-consistency · cdn · rest ·
programming-fundamentals · authentication · deadlock

## patterns/ (pattern)
cache-aside ✓ · write-through · write-behind · circuit-breaker · retry · outbox · dead-letter-queue · cqrs ·
event-driven-architecture · saga

## architectures/ (architecture)
chat-system ✓ · simple-web-app · e-commerce · microservices · notification-system · ai-rag

## comparisons/ (comparison)
redis-vs-memcached · websocket-vs-sse · kafka-vs-rabbitmq · postgresql-vs-mongodb

## roadmaps/ (roadmap)
backend-developer · frontend-developer

## system-designs/ (system-design)
url-shortener

## builds/ (build goal — not graph nodes)
real-time-chat · e-commerce · ai-application · saas · notification

---

# Wave 2 (done)

## technologies/
nginx · graphql · grpc · nodejs · react · typescript · mysql · dynamodb · s3 · prometheus

## concepts/
tcp · udp · dns · tls · https · rpc · serialization · concurrency · consistency · availability · api-gateway · observability

## patterns/
mvc · layered-architecture · clean-architecture · hexagonal-architecture · modular-monolith · bulkhead · timeout · database-per-service

## architectures/
authentication-system · payment-system · video-streaming · search-system · social-feed

## comparisons/
rest-vs-graphql · rest-vs-grpc · modular-monolith-vs-microservices · mysql-vs-postgresql

## roadmaps/
fullstack-developer · devops-engineer · ai-engineer

## system-designs/
rate-limiter · news-feed

## builds/
video-platform · search-engine

---

# Wave 3 (done)

## technologies/
go · python · rust · terraform · opentelemetry · cassandra · clickhouse · github-actions

## concepts/
oauth · jwt · cors · webhook · rbac · backpressure · connection-pooling · indexing · ci-cd ·
infrastructure-as-code · slo · partitioning

## patterns/
strangler-fig · sidecar · backend-for-frontend · leader-election · api-versioning ·
blue-green-deployment · canary-release · feature-flag

## architectures/
multi-tenant-saas · analytics-pipeline · iot-telemetry

## comparisons/
sql-vs-nosql · jwt-vs-session · kubernetes-vs-serverless · go-vs-python

## roadmaps/
data-engineer · security-engineer · software-architect

## system-designs/
job-scheduler · distributed-cache

## builds/
data-platform · iot-product

---

# Wave 4 (done)

Fills the plain-text steps that roadmaps could not link to yet.

## technologies/
git · linux · airflow · spark · vault · java · nextjs · sqlite

## concepts/
secrets-management · schema-migration · graceful-shutdown · load-testing · http2 ·
service-mesh · dimensional-modeling · threat-modeling · capacity-planning · chaos-engineering

## patterns/
event-sourcing · materialized-view · two-phase-commit · anti-corruption-layer · health-check

## architectures/
observability-stack · file-storage-service

## comparisons/
rest-vs-webhook · http1-vs-http2 · materialized-view-vs-cache

## roadmaps/
mobile-developer · cloud-engineer

## system-designs/
search-autocomplete · image-pipeline

---

# Wave 5 (done) — the AI cluster

The spec opens with AI → LLM → Vector DB → RAG, and `ai-rag` still has an unlinked
vector store. Vendor-neutral: models and hosted APIs churn too fast to page.

## technologies/
pgvector

## concepts/
llm · embedding · vector-database · context-window · semantic-search · llm-evaluation · fine-tuning

## patterns/
rag · ai-agent · semantic-cache

## comparisons/
rag-vs-fine-tuning · semantic-vs-keyword-search

## system-designs/
ai-chatbot

---

# Wave 6 — frontend, testing and operations gaps

Chosen from evidence: these are the roadmap steps that had no node to link to.

## concepts/
state-management · routing · rendering-strategies · web-performance · accessibility ·
bundling · testing · contract-testing · serverless · incident-response ·
prompt-engineering · model-serving

## patterns/
offline-first · optimistic-ui

## comparisons/
serverless-vs-containers

---

# Wave 7 — mobile, AI, data, cloud and security gaps

Same evidence as wave 6: the remaining roadmap steps that had no node to link
to. After this wave every step in all ten roadmaps resolves to a page.

## technologies/
swift · kotlin · react-native · flutter · dbt

## concepts/
web-fundamentals · mobile-networking · push-notification · app-store-review ·
math-for-ml · machine-learning · deep-learning · ai-safety ·
cloud-platform · cloud-networking · cost-optimization · data-quality ·
cryptography · owasp-top-10

## patterns/
domain-driven-design · architecture-decision-record

## comparisons/
react-native-vs-flutter

