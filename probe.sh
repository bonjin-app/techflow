set -e
curl_es() { curl -sk -u elastic:changeme-probe "$@"; }
# answering GET / is not being ready: the security index can still be unavailable, and every authenticated request 503s
for i in $(seq 90); do
  curl_es -f "https://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s" 2>/dev/null | jq -e '.status == "green" or .status == "yellow"' >/dev/null 2>&1 && break
  sleep 2
done
curl_es "https://localhost:9200/_cluster/health" | jq -c '{status, unassigned_shards}'
analyze() { echo "--- $1 | $2"; curl_es -H 'content-type: application/json' "https://localhost:9200/probe/_analyze" -d "{\"analyzer\":\"$1\",\"text\":\"$2\"}" | jq -c 'if .error then .error.reason else [.tokens[].token] end'; }
curl_es -X PUT -H 'content-type: application/json' https://localhost:9200/probe -d '{
 "settings":{"analysis":{
  "tokenizer":{
    "nori_rules":{"type":"nori_tokenizer","decompound_mode":"mixed","user_dictionary_rules":["비급여","세종시 세종 시"]}},
  "filter":{"pos_keep_prefix":{"type":"nori_part_of_speech","stoptags":["IC","MAG","MAJ","MM","SP","SSC","SSO","SC","SE","XSA","XSN","XSV","UNA","NA","VSV"]}},
  "analyzer":{
    "ko_rules":{"type":"custom","tokenizer":"nori_rules","filter":["nori_part_of_speech","nori_readingform","lowercase"]},
    "ko_prefix":{"type":"custom","tokenizer":"nori_tokenizer","filter":["pos_keep_prefix","nori_readingform","lowercase"]},
    "ko_phrase":{"type":"custom","tokenizer":"nori_rules","filter":["nori_part_of_speech","nori_readingform","lowercase"]}
  }}}}' | jq -c .
for t in "비급여 항목" "세종시" "비정상" "무료 배송" "개발자를 위한 검색"; do
  analyze nori "$t"; analyze ko_rules "$t"; analyze ko_prefix "$t"
done
