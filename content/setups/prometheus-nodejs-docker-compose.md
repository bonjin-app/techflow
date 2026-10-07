---
id: prometheus-nodejs-docker-compose
name: Prometheus monitoring a Node.js service
tagline: Request metrics from a Node.js service, scraped by Prometheus, with an error-rate alert
environment: local
difficulty: 2
tags: [Observability, Metrics, Alerting, Docker]
components:
  - { ref: prometheus, version: "3.15", role: "Scrapes /metrics every 15 seconds, stores the series, evaluates the alert rules" }
  - { ref: nodejs, version: "22 LTS", role: "Exposes default runtime metrics and a request-duration histogram with @prometheus-io/client" }
  - { ref: docker, version: "Compose v2", role: "Runs the service and Prometheus side by side with the configuration mounted" }
related:
  - { to: observability, rel: RELATED_TO }
  - { to: slo, rel: RELATED_TO }
  - { to: opentelemetry, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-28, confidence: high }
---

## TL;DR

The smallest monitoring setup that answers the questions that matter: how many requests,
how many failed, and how slow they were. The [Node.js](/technology/nodejs) service
publishes counters and a latency histogram on `/metrics` using `@prometheus-io/client`
(published as `prom-client` until August 2026, when it became a Prometheus subproject — the
calls used here are unchanged, but read its changelog before upgrading an existing project); [Prometheus](/technology/prometheus) scrapes it
every 15 seconds, and a rule fires when more than 5% of requests fail for five minutes.
Everything runs in Docker Compose, and every number on a dashboard later comes from the three
queries in this guide.

## Why this pairing

**Prometheus pulls; the service only has to answer.** The application keeps counters in
memory and serves them as text when asked. It never needs to know where metrics go, never
buffers or retries a send, and a Prometheus outage cannot slow it down.

**What fits:**

- The client library ships Node.js runtime metrics — event-loop lag, heap, garbage
  collection — with one call, so the process is observable before any custom metric exists.
- A histogram of request durations answers both "how many" and "how slow": its `_count` is
  the request rate, and `histogram_quantile` over its buckets gives percentiles.
- Rules are evaluated inside Prometheus, next to the data, so an alert needs no extra service
  to decide it should fire.

**Where it rubs:**

- Label values multiply series. A `route` label must be the route pattern (`/orders/:id`),
  never the raw path, or every order id becomes its own time series.
- Each Node.js process keeps its own counters. With several processes per host (cluster mode
  or multiple containers), each must be scraped, or the cluster aggregator used.
- Prometheus detects that an alert should fire; delivering it to people is Alertmanager's
  job, which is a separate component to run.

## Set it up

```steps
title: From an uninstrumented service to a firing alert
Instrument | Default runtime metrics plus a request histogram labelled by method, route and status
Scrape config | One job pointing at the service, every 15 seconds
Alert rule | Error ratio above 5% for five minutes
Run | Compose starts both; Prometheus's own UI shows targets, queries and alerts
```

**1. `server.js`** — label by route pattern and status class, not raw values.

```js file=server.js
import http from "node:http";
import client from "@prometheus-io/client";

client.collectDefaultMetrics();

const duration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

function route(url) {
  if (url.startsWith("/orders/")) return "/orders/:id";
  return url === "/" ? "/" : "other";
}

http
  .createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.writeHead(200, { "content-type": client.register.contentType });
      return res.end(await client.register.metrics());
    }
    const end = duration.startTimer({ method: req.method, route: route(req.url) });
    const failed = Math.random() < 0.02; // stand-in for real work
    res.writeHead(failed ? 500 : 200);
    res.end(failed ? "error" : "ok");
    end({ status: `${String(res.statusCode)[0]}xx` });
  })
  .listen(3000);
```

**2. `prometheus.yml`**

```yaml file=prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - /etc/prometheus/rules.yml

scrape_configs:
  - job_name: app
    static_configs:
      - targets: ["app:3000"]
```

**3. `rules.yml`** — the ratio of failed to all requests over five minutes, and a `for`
clause so a single bad scrape does not page anyone.

```yaml file=rules.yml
groups:
  - name: app
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_request_duration_seconds_count{status="5xx"}[5m]))
            / sum(rate(http_request_duration_seconds_count[5m])) > 0.05
        for: 5m
        labels:
          severity: page
        annotations:
          summary: "More than 5% of requests are failing"
```

**4. `compose.yaml`**

```yaml file=compose.yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"

  prometheus:
    image: prom/prometheus:v3.15.0
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./rules.yml:/etc/prometheus/rules.yml:ro
      - promdata:/prometheus
    depends_on:
      - app

volumes:
  promdata:
```

**5. `package.json` and `Dockerfile`** for the service:

```json file=package.json
{ "type": "module", "dependencies": { "@prometheus-io/client": "^0.16" } }
```

```dockerfile file=Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
CMD ["node", "server.js"]
```

```sh run
docker compose up -d --build
```

```sh run hidden
for i in $(seq 60); do curl -sf localhost:3000/metrics > /dev/null && curl -sf localhost:9090/-/ready > /dev/null && break; sleep 2; done
curl -sf localhost:3000/metrics > /dev/null
curl -sf localhost:9090/-/ready
```

## Verify

The endpoint serves text Prometheus can parse, including the runtime metrics:

```sh
curl -s localhost:3000/ > /dev/null
curl -s localhost:3000/metrics | grep -E "^http_request_duration_seconds_count|^nodejs_eventloop_lag_seconds "
```

```sh check hidden
curl -s localhost:3000/ > /dev/null
out=$(curl -s localhost:3000/metrics)
echo "$out" | grep -E "^http_request_duration_seconds_count|^nodejs_eventloop_lag_seconds "
grep -q '^http_request_duration_seconds_count{' <<<"$out"
grep -q '^nodejs_eventloop_lag_seconds ' <<<"$out"
```

Prometheus should show the target as up, and the configuration should validate:

```sh
curl -s localhost:9090/api/v1/targets | grep -o '"health":"[a-z]*"'      # "health":"up"
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

```sh check hidden
for i in $(seq 30); do
  h=$(curl -s localhost:9090/api/v1/targets | jq -r '.data.activeTargets[] | select(.labels.job == "app") | .health')
  [ "$h" = "up" ] && break
  sleep 2
done
echo "app target: $h"; [ "$h" = "up" ]
docker compose exec -T prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose exec -T prometheus promtool check rules /etc/prometheus/rules.yml
[ "$(curl -s localhost:9090/api/v1/rules | jq -r '.data.groups[].rules[].name')" = "HighErrorRate" ]
```

Generate some traffic, then ask the three questions in the Prometheus UI at
`localhost:9090`. Spread the traffic over half a minute: a series that first appears in one
burst has a single value per scrape and no earlier sample to rise from, so `rate()` reports
zero until it has been scraped rising at least twice.

```sh
for i in $(seq 150); do curl -s localhost:3000/orders/$i > /dev/null; sleep 0.2; done
# request rate:  sum(rate(http_request_duration_seconds_count[1m]))
# error ratio:   sum(rate(http_request_duration_seconds_count{status="5xx"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))
# p95 latency:   histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

```sh check hidden
for i in $(seq 150); do curl -s localhost:3000/orders/$i > /dev/null; sleep 0.2; done
q() { curl -s --data-urlencode "query=$1" localhost:9090/api/v1/query | jq -r '.data.result[0].value[1] // "none"'; }
# rate() needs two scrapes after the traffic: 15s apart
for i in $(seq 30); do
  rate=$(q 'sum(rate(http_request_duration_seconds_count[1m]))')
  [ "$rate" != "none" ] && [ "$rate" != "0" ] && break
  sleep 3
done
echo "request rate: $rate"
awk -v r="$rate" 'BEGIN { exit !(r > 0) }'
p95=$(q 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))')
echo "p95: $p95"; [ "$p95" != "none" ]
# a series per route pattern, not per order id
[ "$(q 'count(count by (route) (http_request_duration_seconds_count))')" -le 3 ]
```

Raise the simulated failure rate above 5% and the alert moves from inactive to pending, then
firing after five minutes, on the Alerts page.

## Going to production

- **Send alerts somewhere.** Add Alertmanager to route, group and silence notifications;
  Prometheus on its own only marks alerts as firing.
- **Alert on the error budget, not a fixed threshold.** Multi-window burn-rate rules built
  from the same ratio page only when the SLO is actually at risk — see [SLO](/concept/slo).
- **Discover targets rather than list them.** On Kubernetes or a cloud provider, use the
  matching service discovery so new instances are scraped without editing the file.
- **Plan retention and storage.** Local storage suits weeks of data on one server; long-term
  or global views need remote write to a store built for it.
- **Protect `/metrics`.** Serve it on an internal port or network; it describes your traffic
  in detail.
- **Pick buckets from your latency targets.** Percentiles are only as precise as the buckets
  around the threshold you care about.

## When not to

- **You need to follow one request across services.** Metrics say that p95 latency rose, not
  which call made it slow; that is tracing — see [OpenTelemetry](/technology/opentelemetry).
- **The team will not own a monitoring stack.** A hosted metrics service costs money but no
  on-call for the monitoring itself.
- **The workload is short-lived jobs.** A batch job that exits before the next scrape is
  never seen; it needs to push its result, or to be measured by what it produces.

## References

- [Prometheus: installation and the Docker image](https://prometheus.io/docs/prometheus/latest/installation/)
- [Prometheus: configuration — `scrape_configs` and `rule_files`](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus: alerting rules — `for` and annotations](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Prometheus: histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Prometheus: metric and label naming](https://prometheus.io/docs/practices/naming/)
- [@prometheus-io/client (formerly prom-client) for Node.js](https://github.com/siimon/prom-client)
