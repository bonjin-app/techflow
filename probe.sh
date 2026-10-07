set -e
curl_es() { curl -sk -u elastic:changeme-probe "$@"; }
for i in $(seq 90); do curl_es https://localhost:9200 >/dev/null 2>&1 && break; sleep 2; done
curl_es https://localhost:9200 | jq -c '{version: .version.number, lucene: .version.lucene_version}'
analyze() { echo "--- $1 | $2"; curl_es -H 'content-type: application/json' https://localhost:9200/probe/_analyze -d "{\"analyzer\":\"$1\",\"text\":\"$2\"}" | jq -c '[.tokens[].token]'; }
curl_es -X PUT -H 'content-type: application/json' https://localhost:9200/probe -d '{"settings":{"analysis":{"tokenizer":{"nori_mixed":{"type":"nori_tokenizer","decompound_mode":"mixed"}},"analyzer":{"ko_mixed":{"type":"custom","tokenizer":"nori_mixed","filter":["nori_part_of_speech","nori_readingform","lowercase"]},"ko_none":{"type":"custom","tokenizer":"nori_tokenizer","filter":["nori_part_of_speech"]}}}}}' | jq -c .
for t in "삼성전자 신제품" "비급여 항목" "검색엔진을 만들었다" "먹었다" "먹다" "한국어 형태소 분석기" "가곡역"; do
  analyze standard "$t"; analyze nori "$t"; analyze ko_mixed "$t"; analyze ko_none "$t"
done
