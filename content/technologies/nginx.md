---
id: nginx
name: NGINX
tagline: Event-driven web server and reverse proxy that fronts most production HTTP traffic
category: infrastructure
tags: [Web Server, Reverse Proxy, Load Balancer, Infrastructure]
difficulty: 2
usedFor: [load-balancing, tls, https, rate-limiting, cache]
prerequisites: [http, tcp, dns, backend]
learningPath:
  - programming-fundamentals
  - http
  - tcp
  - dns
  - tls
  - backend
  - load-balancing
  - nginx
  - api-gateway
related:
  - { to: load-balancing, rel: RELATED_TO }
  - { to: api-gateway, rel: RELATED_TO }
  - { to: tls, rel: RELATED_TO }
  - { to: nodejs, rel: USED_WITH }
  - { to: docker, rel: USED_WITH }
  - { to: kubernetes, rel: USED_WITH }
  - { to: simple-web-app, rel: USED_IN }
  - { to: video-streaming, rel: USED_IN }
  - { to: microservices, rel: USED_IN }
meta: { lastReviewed: 2026-09-09, version: "NGINX 1.28 stable / 1.29 mainline", confidence: high }
---

## TL;DR

NGINX is a web server that most teams actually run as a **reverse proxy**: it sits at the
edge, terminates TLS, and forwards requests to application servers behind it. Its
event-driven, non-blocking design lets a handful of worker processes hold tens of
thousands of open connections, which is why it became the default front door for web
applications, container ingress and static file delivery. It is configuration-driven,
not programmable — that is its strength and its ceiling.

## Practical

In practice NGINX does five jobs, often all at once:

- **Reverse proxy** — accept public traffic on ports 80/443 and forward it to one or more
  app servers (Node.js, Python, Java, Go) that should never face the internet directly.
- **TLS termination** — hold the certificate, speak [TLS](/concept/tls) to the client, and
  talk plain [HTTP](/concept/http) to the backend inside the private network.
- **Load balancing** — spread requests across N backend instances with round-robin,
  least-connections or IP hash. See [Load Balancing](/concept/load-balancing).
- **Static files and caching** — serve images, JS bundles and video segments straight
  from disk, or cache upstream responses for a few seconds to absorb traffic spikes.
- **Edge policy** — rate limits, request size caps, header rewriting, gzip/brotli,
  redirects, and blocking obvious abuse before it reaches application code.

```text
# /etc/nginx/conf.d/app.conf — TLS termination + load balancing
upstream app {
    least_conn;
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    keepalive 32;
}

server {
    listen 443 ssl;
    http2 on;
    server_name example.com;
    ssl_certificate     /etc/ssl/example.com.pem;
    ssl_certificate_key /etc/ssl/example.com.key;

    location /static/ { root /var/www; expires 30d; }

    location / {
        proxy_pass http://app;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 30s;
    }
}
```

You will reload it with `nginx -s reload` (zero-downtime), read `access.log` when
debugging, and in Kubernetes you will usually meet it as the NGINX Ingress Controller or
as a sidecar in front of a single container.

## Deep Dive

**Process model.** A master process reads the configuration and spawns worker processes
(typically one per CPU core). Each worker runs an event loop over `epoll`/`kqueue` and
handles thousands of connections without a thread per connection. This is why memory
per idle connection is measured in kilobytes, and why a slow client does not tie up a
worker — the worker simply moves on until the socket is readable again.

**Blocking is the enemy.** Because a worker is single-threaded, anything that blocks —
synchronous disk I/O on a cold file, a slow DNS lookup in a `resolver` directive, a
third-party module doing blocking work — stalls every connection on that worker. NGINX
mitigates this with thread pools for file I/O and asynchronous upstream connections, but
the mental model remains: keep the hot path non-blocking.

**Upstream handling.** Connections to backends are pooled with `keepalive`, health is
inferred passively (`max_fails`, `fail_timeout`) in the open-source build, and active
health checks are a commercial feature. Buffering (`proxy_buffering`) means NGINX can
read a slow upstream response fully and then stream it to a slow client, freeing the
backend early — useful for app servers with few threads.

**Configuration is declarative and static.** Directives are evaluated once at load time;
`location` matching follows fixed precedence rules (exact, prefix, regex). This makes
behaviour predictable and fast, but complex routing logic pushes people toward Lua
(OpenResty) or toward a programmable [API Gateway](/concept/api-gateway) instead.

**HTTP/2 and HTTP/3.** HTTP/2 is mature and enabled per server block; HTTP/3 over QUIC
is supported in current releases but still requires deliberate configuration and a
QUIC-capable TLS library. Most deployments terminate HTTP/2 at NGINX and speak HTTP/1.1
to backends.

## Why

Application servers are good at running your code and bad at everything else: they hold
a thread or event loop per request, do not want to handle TLS handshakes, and cannot
survive being the only process exposed to the internet. Pointing a domain directly at
one application process gives you a single point of failure with no way to add capacity
or roll out a new version without downtime.

```sequence
title: Without a reverse proxy — one app process does everything
participants: Browser, App [nodejs], DB [postgresql]
Browser -> App: TLS handshake + GET /product/42
App -> App: decrypt, parse, serve static assets too
App -> DB: SELECT …
DB --> App: row
App --> Browser: 200 OK (slow client holds the connection)
Browser -> App: GET /static/app.js (app process serves a file)
App --> Browser: 200 OK
```

Putting NGINX in front separates the concerns. It owns the public port and the
certificate, answers static files itself, and fans dynamic requests out across as many
application instances as you run. Instances can be added, drained and replaced behind it
without clients noticing.

```sequence
title: With NGINX — edge concerns handled once, apps scaled behind it
participants: Browser, NGINX [nginx], App-1 [nodejs], App-2 [nodejs], DB [postgresql]
Browser -> NGINX: TLS handshake + GET /product/42
NGINX -> App-1: HTTP GET /product/42 (keep-alive pool)
App-1 -> DB: SELECT …
DB --> App-1: row
App-1 --> NGINX: 200 OK (buffered, backend freed)
NGINX --> Browser: 200 OK (streamed to slow client)
Browser -> NGINX: GET /static/app.js
NGINX --> Browser: 200 OK (served from disk, cached 30d)
Browser -> NGINX: GET /product/43
NGINX -> App-2: HTTP GET /product/43 (least_conn)
App-2 --> NGINX: 200 OK
NGINX --> Browser: 200 OK
```

The same position at the edge is why rate limiting, request filtering and caching
naturally land in NGINX: it sees every request before anyone else does.

## Advantages

- Very high connection concurrency with low, predictable memory per connection
- Mature TLS termination, HTTP/2, and increasingly HTTP/3 support in one binary
- Zero-downtime configuration reloads and graceful worker replacement
- Serves static content and caches upstream responses without any application code
- Ubiquitous: official container images, Kubernetes ingress controllers, every cloud
- Small, well-understood configuration language with decades of documented patterns

## Trade-offs

- Configuration is static and declarative; dynamic routing or auth logic needs Lua or a different tool
- Open-source build lacks active health checks, dynamic upstream reconfiguration and a live metrics API (commercial tier or third-party exporters fill the gap)
- Regex-heavy `location` blocks are easy to get wrong and hard to test
- A blocking module or slow disk stalls a whole worker's connections
- It is another moving part to patch, monitor and keep certificates fresh on
- Newer proxies (Envoy, Caddy, Traefik) offer automatic TLS or service-mesh integration that NGINX requires extra tooling for

## When to use

- Any public web application that needs TLS termination and should not expose app processes directly
- Load balancing across several instances of a stateless backend
- Serving large volumes of static assets or media segments from disk
- Absorbing bursts with short-TTL response caching in front of expensive endpoints
- Enforcing coarse edge policy: rate limits, body size limits, IP allow/deny, redirects

## When not to use

- Don't use NGINX as an application framework — routing logic that depends on request bodies or user identity belongs in an [API Gateway](/concept/api-gateway) or your service
- When you need TCP/UDP load balancing with rich health checking across a service mesh, a dedicated L4 balancer or Envoy is a better fit
- On serverless platforms where the provider already terminates TLS and routes for you
- For a single local development server — the framework's built-in server is enough
- When you need first-class automatic certificate management with zero config; Caddy or a cloud load balancer removes that operational chore

## Real-world

In a conventional deployment NGINX is the first thing a request touches after
[DNS](/concept/dns): it terminates TLS, serves the SPA bundle, and proxies `/api/*` to a
pool of [Node.js](/technology/nodejs) or other application servers, exactly as in the
[Simple Web App](/architecture/simple-web-app) architecture. In
[Microservices](/architecture/microservices) it appears twice — as the cluster ingress
and sometimes as a sidecar. In [Video Streaming](/architecture/video-streaming) its
static-file path delivers HLS/DASH segments to a [CDN](/concept/cdn) that caches them
closer to viewers.
