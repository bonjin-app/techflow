---
id: elasticsearch-korean-nori
name: Korean full-text search with Elasticsearch and nori
tagline: One Elasticsearch node with the nori analyzer, tuned so Korean queries find what they should
environment: local
difficulty: 3
tags: [Search, Korean, Elasticsearch, Docker]
components:
  - { ref: elasticsearch, version: "9.5", role: "Stores the documents and answers the queries; security stays on, with a password and a TLS certificate" }
  - { ref: docker, version: "Compose v2", role: "Builds an image with the nori plugin added to the official one and runs it as one node" }
related:
  - { to: indexing, rel: RELATED_TO }
  - { to: semantic-vs-keyword-search, rel: RELATED_TO }
  - { to: change-data-capture, rel: RELATED_TO }
  - { to: vector-database, rel: RELATED_TO }
  - { to: search-autocomplete, rel: RELATED_TO }
  - { to: postgresql, rel: RELATED_TO }
meta: { lastReviewed: 2026-10-07, confidence: medium }
---

## TL;DR

Elasticsearch searches by **tokens**, not by strings, and what a token is depends on the
analyzer. For English the built-in one is good enough. For Korean it is not: it cuts on
whitespace, so `먹었다` and `먹다` are different words, and `삼성전자` can never match a search
for `삼성`. The `analysis-nori` plugin adds a Korean morphological analyzer, but its defaults
carry traps of their own — it throws away the compound you typed, turns `비급여` ("not
covered") into `급여` ("covered"), and cuts `세종시` to `종시`. This guide runs a single node with
nori installed, configures it deliberately, and checks every claim by searching.

## Why this pairing

**Elasticsearch is the engine; nori is what makes it read Korean.** Korean words change shape
with their endings and particles, and compounds run together without spaces. Nori, built on the
mecab-ko-dic dictionary, splits a sentence into its stems and nouns so that different forms of
one word become one token.

**What fits:**

- Search that tolerates inflection: `먹었다`, `먹다` and `먹는` all index to `먹`, so any one finds
  the others.
- Compounds searchable by their parts: with `decompound_mode: mixed`, `삼성전자` is indexed as
  `삼성전자`, `삼성` and `전자`, so all three queries find it.
- A user dictionary for what the general dictionary gets wrong — product names, places, domain
  terms — without retraining anything.

**Where it rubs:**

- **The defaults discard.** `nori_tokenizer` defaults to `decompound_mode: discard`: the original
  compound is removed and only its parts remain. A search for the whole word then matches nothing
  unless the query is analysed the same way.
- **Meaning can invert.** The default part-of-speech filter drops prefixes, so `비급여` becomes
  `급여`. The two words mean opposite things and now index identically.
- **More tokens, more noise.** `mixed` keeps parts alongside the whole, including single
  syllables: `한국어 형태소 분석기` indexes as nine tokens, among them `어`, `소` and `기`.
- **The plugin is not in the image.** It must be installed on every node, followed by a restart,
  so this needs your own image, rebuilt whenever the Elasticsearch version moves.

## Set it up

```steps
title: From the official image to Korean search that behaves
Image | The official Elasticsearch image plus the analysis-nori plugin
Node | One node, security on, a password you set, memory capped
Wait | Until the cluster is healthy — answering is not the same as being ready
Index | A custom analyzer: nori with mixed decomposition and a small user dictionary
Search | Index a few documents and search them, with a Korean query and an inflected one
```

**1. The image.** Elasticsearch's own image does not include nori; the plugin tool installs the
build matching the running version. `--batch` accepts the plugin's permissions prompt, which has no
one to answer it during a build.

```dockerfile file=Dockerfile
FROM docker.elastic.co/elasticsearch/elasticsearch:9.5.5
RUN elasticsearch-plugin install --batch analysis-nori
```

**2. One node, with security left on.** A first start with `discovery.type=single-node`
generates a certificate and enables authentication; the `elastic` user's password is the one you
set. Local convenience is a reason to use a throwaway password, not to turn security off — the file
below gets copied into real deployments.

```yaml file=compose.yaml
services:
  es:
    build: .
    environment:
      discovery.type: single-node
      ELASTIC_PASSWORD: ${ELASTIC_PASSWORD:?set ELASTIC_PASSWORD}
      ES_JAVA_OPTS: -Xms512m -Xmx512m
    ports:
      - "127.0.0.1:9200:9200"
    volumes:
      - esdata:/usr/share/elasticsearch/data
    ulimits:
      memlock: { soft: -1, hard: -1 }

volumes:
  esdata:
```

```sh run
export ELASTIC_PASSWORD=$(openssl rand -hex 12)
echo "ELASTIC_PASSWORD=$ELASTIC_PASSWORD" > .env
docker compose up -d --build
```

**3. Wait for the cluster, not for an answer.** Elasticsearch answers `GET /` before its security
index is available, and until then every authenticated request fails with `503`. Ask for a healthy
cluster instead. The certificate does not exist either until the first start has generated it, so
the copy out of the container is part of the wait.

```sh run
set -a; . ./.env; set +a
for i in $(seq 90); do
  docker compose cp es:/usr/share/elasticsearch/config/certs/http_ca.crt . 2>/dev/null &&
  curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" \
    "https://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s" > /dev/null && break
  sleep 2
done
curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" https://localhost:9200/_cluster/health > /dev/null
```

**4. The index.** Two choices carry the whole result, and both are visible in the settings:

- `decompound_mode: mixed` keeps `삼성전자` as well as `삼성` and `전자`.
- `user_dictionary_rules` teaches the tokenizer words it would otherwise split wrongly: `비급여`
  stays whole, and `세종시` is declared as `세종` + `시` so it is found by all three.

The same analyzer is used when indexing and when searching, so a query is cut the way the
documents were.

```json file=index.json
{
  "settings": {
    "analysis": {
      "tokenizer": {
        "ko_tokenizer": {
          "type": "nori_tokenizer",
          "decompound_mode": "mixed",
          "user_dictionary_rules": ["비급여", "세종시 세종 시"]
        }
      },
      "analyzer": {
        "ko": {
          "type": "custom",
          "tokenizer": "ko_tokenizer",
          "filter": ["nori_part_of_speech", "nori_readingform", "lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": { "type": "text", "analyzer": "ko" },
      "body": { "type": "text", "analyzer": "ko" }
    }
  }
}
```

```jsonl file=docs.ndjson
{"index":{"_id":"1"}}
{"title":"삼성전자 신제품 발표","body":"삼성전자가 새로운 스마트폰을 공개했다."}
{"index":{"_id":"2"}}
{"title":"비급여 진료비 안내","body":"비급여 항목은 건강보험이 적용되지 않습니다."}
{"index":{"_id":"3"}}
{"title":"급여 항목 확대","body":"건강보험 급여 항목이 확대되었습니다."}
{"index":{"_id":"4"}}
{"title":"세종시 이전 계획","body":"정부 부처가 세종시로 이전한다."}
{"index":{"_id":"5"}}
{"title":"맛집 후기","body":"어제 저녁에 정말 맛있게 먹었다."}
{"index":{"_id":"6"}}
{"title":"검색엔진 개발기","body":"우리는 한국어 검색엔진을 만들었다."}
```

```sh run
set -a; . ./.env; set +a
es() { curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
es -X PUT https://localhost:9200/articles -d @index.json
es -X POST "https://localhost:9200/articles/_bulk?refresh=wait_for" --data-binary @docs.ndjson > /dev/null
```

## Verify

See what the analyzer made of a few words. Each is one of the traps above:

```sh
set -a; . ./.env; set +a
for text in "삼성전자" "비급여" "세종시" "먹었다"; do
  curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' \
    https://localhost:9200/articles/_analyze -d "{\"analyzer\":\"ko\",\"text\":\"$text\"}" \
    | jq -c "[.tokens[].token] | {\"$text\": .}"
done
# {"삼성전자":["삼성전자","삼성","전자"]}
# {"비급여":["비급여"]}
# {"세종시":["세종시","세종","시"]}
# {"먹었다":["먹"]}
```

Then search the way a user would. A compound is found by its whole and by its part, an inflected
form finds the document written in another form, and — the check that matters — `급여` does not
return the document about `비급여`:

```sh
search() {
  curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' \
    https://localhost:9200/articles/_search \
    -d "{\"query\":{\"multi_match\":{\"query\":\"$1\",\"fields\":[\"title\",\"body\"]}},\"_source\":[\"title\"]}" \
    | jq -r '[.hits.hits[]._source.title] | join(" | ")'
}
search 삼성전자     # 삼성전자 신제품 발표
search 전자         # 삼성전자 신제품 발표
search 먹다         # 맛집 후기
search 급여         # 급여 항목 확대
search 비급여       # 비급여 진료비 안내
```

```sh check hidden
set -a; . ./.env; set +a
es() { curl -sf --cacert http_ca.crt -u "elastic:$ELASTIC_PASSWORD" -H 'content-type: application/json' "$@"; }
tokens() { es https://localhost:9200/articles/_analyze -d "{\"analyzer\":\"ko\",\"text\":\"$1\"}" | jq -c '[.tokens[].token]'; }
found() {
  es https://localhost:9200/articles/_search -d "{\"query\":{\"multi_match\":{\"query\":\"$1\",\"fields\":[\"title\",\"body\"]}},\"_source\":[\"title\"]}" \
    | jq -r '[.hits.hits[]._source.title] | sort | join(" | ")'
}

# what the guide says each word becomes
[ "$(tokens 삼성전자)" = '["삼성전자","삼성","전자"]' ]
[ "$(tokens 비급여)" = '["비급여"]' ]
[ "$(tokens 세종시)" = '["세종시","세종","시"]' ]
[ "$(tokens 먹었다)" = '["먹"]' ]

# and what a search then returns
[ "$(found 삼성전자)" = "삼성전자 신제품 발표" ]
[ "$(found 전자)" = "삼성전자 신제품 발표" ]
[ "$(found 삼성)" = "삼성전자 신제품 발표" ]
[ "$(found 먹다)" = "맛집 후기" ]
[ "$(found 먹었다)" = "맛집 후기" ]
# the document about 비급여 is not an answer to 급여, and the reverse: the whole point of the dictionary
[ "$(found 비급여)" = "비급여 진료비 안내" ]
[ "$(found 급여)" = "급여 항목 확대" ]
[ "$(found 세종시)" = "세종시 이전 계획" ]
[ "$(found 세종)" = "세종시 이전 계획" ]
```

## Going to production

- **Run three nodes, and a real certificate setup.** A single node has no replica and a failed disk
  loses the index. The official multi-node Compose setup in Elastic's documentation creates a
  certificate authority for the cluster; do not copy this guide's single-node file there.
- **Rebuild the image with every Elasticsearch upgrade.** The plugin must match the node version
  exactly, so pinning `9.5.5` in the Dockerfile and bumping it on purpose is the point — an unpinned
  image breaks the next restart when the plugin and the node disagree.
- **Change the dictionary without downtime.** `user_dictionary_rules` is part of the index's settings,
  so changing it means a new index. Create the new one, reindex into it, and move an alias; keep the
  dictionary in version control and run `_analyze` assertions in CI so a regression is caught before
  users notice.
- **Tune the noise `mixed` creates.** Single syllables (`어`, `소`, `기`) match too much. A
  `length` token filter that drops one-character tokens, or ranking whole-word matches above parts,
  is usual; measure on your own queries before choosing.
- **Decide how you handle prefixes.** The default drops them, so `비정상` ("abnormal") indexes as
  `정상` ("normal"). Adding words to the dictionary fixes the ones you know; leaving prefixes in
  (by removing `XPN` from `stoptags`) keeps all of them but splits `비급여` into `비` and `급여`,
  and adds noise everywhere. Neither is free.
- **Back it up.** Register a snapshot repository and take scheduled snapshots; an index is
  rebuildable from the source system only if you kept the source and the time to reindex it.
- **Size the heap deliberately.** `ES_JAVA_OPTS` here is 512 MB so the example starts anywhere. A
  real node uses about half the machine's memory, up to roughly 31 GB.

## When not to

- **The search is mostly exact matching.** Codes, identifiers and filters are served by a database
  index. PostgreSQL's full-text search covers a lot of Korean search needs if you accept lower
  relevance tuning, and is one less system.
- **Meaning matters more than words.** Searching by what a question means, not what it says, is
  what [semantic search](/compare/semantic-vs-keyword-search) does; nori only improves word
  matching.
- **You cannot keep the plugin in step with the cluster.** Managed Elasticsearch services install
  a fixed set of plugins; check that `analysis-nori` is among them before designing around it.

## References

- [Elasticsearch: install with Docker — single-node, passwords and the CA certificate](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-basic)
- [Elasticsearch: the Korean (nori) analysis plugin](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori)
- [Elasticsearch: `nori_tokenizer` — `decompound_mode` and user dictionaries](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori-tokenizer)
- [Elasticsearch: `nori_part_of_speech` token filter and the prefix caveat](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori-speech)
- [Elasticsearch: the `nori` analyzer](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-nori-analyzer)
- [Elasticsearch: anatomy of an analyzer](https://www.elastic.co/docs/manage-data/data-store/text-analysis/anatomy-of-an-analyzer)
- [Elasticsearch Docker images](https://www.docker.elastic.co/)
