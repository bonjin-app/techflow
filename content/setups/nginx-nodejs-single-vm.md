---
id: nginx-nodejs-single-vm
name: Nginx + Node.js on a single VM
tagline: One Ubuntu server — Nginx terminating TLS in front of a Node.js service run by systemd
environment: vm
difficulty: 2
verification: static
validates: Nginx proxy configuration
tags: [Deployment, Reverse Proxy, TLS, Linux]
components:
  - { ref: nginx, version: "1.24+ (Ubuntu package)", role: "Terminates TLS, serves static files, proxies to the app — WebSockets included" }
  - { ref: nodejs, version: "22 LTS", role: "The application, listening on localhost only" }
  - { ref: linux, version: "Ubuntu 24.04 LTS", role: "systemd keeps the app running; the firewall exposes only SSH, HTTP and HTTPS" }
related:
  - { to: tls, rel: RELATED_TO }
  - { to: https, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: graceful-shutdown, rel: RELATED_TO }
  - { to: websocket, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-24, confidence: medium }
---

## TL;DR

The smallest production deployment that is still a real one: a single virtual machine
where [Nginx](/technology/nginx) owns ports 80 and 443, holds the TLS certificate and passes
requests to a [Node.js](/technology/nodejs) process listening on `127.0.0.1:3000`. systemd
restarts the process if it dies and starts it at boot, Certbot renews the certificate, and
the firewall allows nothing else in. It carries a surprising amount of traffic, costs one
server, and every piece of it is standard.

## Why this pairing

**Each does what the other is bad at.** Node.js runs application code on one thread and is
not where you want slow clients, TLS handshakes, request buffering or static files. Nginx is
built for exactly those: thousands of idle connections cost it little, it speaks TLS
efficiently, and it serves files from disk without touching the application.

**What fits:**

- Nginx buffers the request and the response, so a client on a slow phone network ties up
  an Nginx connection rather than the event loop.
- The app never needs root: it binds a high port on localhost, and only Nginx listens on the
  privileged ports.
- Upgrading Node.js, or running two versions side by side on different ports, is a change
  to the proxy target, not to the public endpoint.

**Where it rubs:**

- WebSockets and Server-Sent Events need explicit configuration: the upgrade headers for
  one, buffering off for the other. The default proxy settings break both, quietly.
- The app sees Nginx as the client. Real client addresses and the original scheme arrive in
  `X-Forwarded-For` and `X-Forwarded-Proto`, and the app must be told to trust them.
- One machine is one failure: a reboot or a bad deploy is downtime. That is the trade this
  setup makes for its simplicity.

## Set it up

```steps
title: From a fresh Ubuntu server to HTTPS
Node.js and the app | Install Node.js 22, put the app in /srv/app, run it as an unprivileged user
systemd unit | Start at boot, restart on failure, stop with SIGTERM
Nginx site | Proxy to 127.0.0.1:3000 with the forwarding and upgrade headers
Certificate | Certbot obtains a certificate and edits the site for HTTPS
Firewall | Allow SSH, HTTP and HTTPS; nothing else
```

**1. Node.js 22 and a user to run the app.** The Ubuntu archive ships an older Node.js;
NodeSource publishes current releases as a Debian repository.

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs nginx
sudo useradd --system --home /srv/app --shell /usr/sbin/nologin app
sudo mkdir -p /srv/app && sudo chown app:app /srv/app
```

The app must listen on localhost only, and exit cleanly on SIGTERM so a restart does not cut
requests off mid-flight — see [Graceful Shutdown](/concept/graceful-shutdown):

```js
const server = app.listen(3000, "127.0.0.1");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
```

**2. `/etc/systemd/system/app.service`**

```ini
[Unit]
Description=Node.js app
After=network.target

[Service]
User=app
WorkingDirectory=/srv/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=2
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now app
```

**3. `/etc/nginx/sites-available/app`** — the `map` turns the WebSocket upgrade on only
when the client asks for it, as the Nginx documentation recommends.

```nginx file=conf.d/app.conf
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;   # the default only from Nginx 1.29.7
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 60s;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

**4. HTTPS with Certbot.** Point the domain's DNS at the server first; Certbot proves
control over HTTP, then adds the `listen 443 ssl` block and a redirect to the site.

```sh
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d example.com
sudo certbot renew --dry-run
```

**5. Firewall**

```sh
sudo ufw allow OpenSSH
sudo ufw allow "Nginx Full"
sudo ufw enable
```

```js file=backend.js hidden
// A stand-in for the app: says what Nginx sent it, and accepts a WebSocket upgrade.
import http from "node:http";
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ headers: req.headers }));
});
server.on("upgrade", (req, socket) => {
  socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
});
server.listen(3000, "127.0.0.1");
```

```sh run hidden
# nginx 1.24 is the oldest version the guide claims. The official image reads conf.d/*.conf inside http{},
# the same context Debian's sites-enabled is included from, so the guide's file drops in unchanged.
docker run -d --name proxy -p 8080:80 -v "$PWD/conf.d/app.conf":/etc/nginx/conf.d/app.conf:ro nginx:1.24
# Node on 127.0.0.1:3000 inside Nginx's own network namespace, which is what the guide's proxy_pass reaches
docker run -d --name backend --network container:proxy -v "$PWD/backend.js":/backend.js:ro node:22-alpine node /backend.js
# wait for the app's answer, not just for Nginx's: before Node is listening, Nginx answers 502 — still a response
for i in $(seq 60); do
  curl -sf -H "Host: example.com" localhost:8080/ 2>/dev/null | jq -e '.headers' > /dev/null 2>&1 && break
  sleep 1
done
curl -sf -H "Host: example.com" localhost:8080/ | jq -e '.headers' > /dev/null
```

## Verify

```sh
systemctl status app --no-pager                 # active (running)
curl -sI http://example.com | head -3           # 301 to https://
curl -sI https://example.com | head -3          # 200, served through Nginx
curl -s --max-time 2 http://SERVER_IP:3000      # times out: the app is not reachable directly
sudo systemctl restart app && journalctl -u app -n 5 --no-pager   # stopped cleanly, started again
```

If the app logs client addresses, they should be the real ones, not `127.0.0.1` — which is
the check that `X-Forwarded-For` is being read. In Express that is `app.set("trust proxy",
"loopback")`.

```sh check hidden
nginx_version=$(docker exec proxy nginx -v 2>&1)
echo "$nginx_version"
grep -q "nginx/1\.24\." <<<"$nginx_version"
docker exec proxy nginx -t

# an ordinary request: the app sees the original host and the client address, and is told it came over http
plain=$(curl -s -H "Host: example.com" localhost:8080/)
echo "$plain" | jq -c '.headers | {host, "x-real-ip": .["x-real-ip"], "x-forwarded-for": .["x-forwarded-for"], "x-forwarded-proto": .["x-forwarded-proto"], connection}'
[ "$(echo "$plain" | jq -r '.headers.host')" = "example.com" ]
[ -n "$(echo "$plain" | jq -r '.headers["x-real-ip"] // empty')" ]
[ -n "$(echo "$plain" | jq -r '.headers["x-forwarded-for"] // empty')" ]
[ "$(echo "$plain" | jq -r '.headers["x-forwarded-proto"]')" = "http" ]
# without an upgrade request the connection is not left upgradable: the map sends "close"
[ "$(echo "$plain" | jq -r '.headers.connection')" = "close" ]

# a WebSocket handshake gets through: the upgrade is passed on, and the app answers 101
ws=$(curl -s -i --max-time 5 -H "Host: example.com" -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" localhost:8080/ || true)
head -3 <<<"$ws"
grep -q "^HTTP/1.1 101" <<<"$ws"
```

## Going to production

- **Deploy without dropping requests.** A `systemctl restart` stops the old process before
  the new one is ready. Either accept a second of errors, or run two instances on two ports
  behind an Nginx `upstream` and restart them one at a time.
- **Log and rotate.** systemd's journal holds the app's output; set a size limit in
  `journald.conf`. Nginx's access and error logs are rotated by the package's `logrotate`
  entry.
- **Server-Sent Events need buffering off** for their location — `proxy_buffering off;` — or
  events arrive in batches.
- **Limit what a client can send**: `client_max_body_size` for uploads, and Nginx's
  `limit_req` for a first line of rate limiting before requests reach Node.js.
- **Know when you have outgrown it.** A second machine means a load balancer, shared session
  storage and a database that is no longer on the same host — the move from here to a
  managed platform or a container orchestrator.

## When not to

- **Downtime is not acceptable.** One VM cannot survive its own failure; start with two
  behind a load balancer, or a managed platform that does it for you.
- **Many services, or frequent deploys by several teams.** Hand-managed systemd units and
  Nginx sites stop scaling past a handful; that is what containers and an orchestrator are
  for.
- **Traffic is spiky and mostly idle.** A server billed around the clock for a few requests
  an hour is where a serverless platform costs less and needs no patching.

## References

- [Nginx: `ngx_http_proxy_module` — `proxy_pass`, `proxy_set_header`, `proxy_http_version`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Nginx: WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
- [NodeSource: Node.js binary distributions](https://github.com/nodesource/distributions)
- [Node.js 22: `process` — signal events](https://nodejs.org/docs/latest-v22.x/api/process.html)
- [systemd.service — unit configuration](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [Certbot instructions for Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap)
- [Ubuntu: UFW firewall](https://help.ubuntu.com/community/UFW)
