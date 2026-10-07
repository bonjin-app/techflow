---
id: websocket-redis-pubsub-nginx
name: WebSocket chat across servers with Redis pub/sub
tagline: Two Node.js servers behind Nginx; a message sent to one reaches users on the other
environment: local
difficulty: 3
tags: [Real-time, WebSocket, Scaling, Docker]
components:
  - { ref: websocket, version: "ws 8", role: "Holds each user's connection open on whichever server the load balancer sent them to" }
  - { ref: redis, version: "8", role: "Pub/Sub channel every server publishes to and subscribes to, so a message crosses servers" }
  - { ref: nginx, version: "1.28", role: "Spreads connections across the servers and passes the WebSocket upgrade through" }
  - { ref: nodejs, version: "22 LTS", role: "Runs as two identical instances; neither knows the other exists" }
related:
  - { to: pub-sub, rel: RELATED_TO }
  - { to: load-balancing, rel: RELATED_TO }
  - { to: session, rel: RELATED_TO }
  - { to: chat-system, rel: RELATED_TO }
  - { to: nginx-nodejs-single-vm, rel: RELATED_TO }
  - { to: websocket-vs-sse, rel: RELATED_TO }
meta: { lastReviewed: 2026-10-07, confidence: high }
---

## TL;DR

A [WebSocket](/technology/websocket) is a connection to **one** server, so the moment a chat
runs on two, Alice on server A and Bob on server B cannot hear each other: A holds Alice's
socket, B holds Bob's, and a message sent to A has nobody on A to go to. The fix is not to
route friends to the same server but to give the servers a shared channel. Each server
publishes every incoming message to [Redis](/technology/redis) and subscribes to the same
channel, then delivers whatever arrives to the sockets it holds. [Nginx](/technology/nginx)
spreads the connections. This guide runs two servers and shows a message crossing between them.

## Why this pairing

**Redis is the room all the servers share.** Pub/sub fans a message out to every subscriber at
once, in memory, in well under a millisecond. The servers stay identical and stateless apart
from their open sockets, so adding a third is starting another copy.

**What fits:**

- No routing logic: any connection may land on any server, and the message still arrives.
- A server that restarts loses only its own sockets; clients reconnect to any server.
- The same Redis can later hold presence, rate limits or recent history.

**Where it rubs:**

- Redis pub/sub is **fire and forget**. A server that is down or reconnecting when a message is
  published never receives it, and nothing is stored to replay. For a chat that must not lose
  messages, persist them first and publish a notification — or use a stream.
- A subscribing connection cannot run other commands (RESP2), so it needs a connection of its
  own, separate from the one used to publish.
- Every message goes to every server, including servers with nobody it concerns. That is cheap
  at tens of servers and wasteful at thousands, where channels per room, or sharded pub/sub,
  take over.

## Set it up

```steps
title: From one server to two that behave as one
Server | A ws server that publishes what it receives and delivers what Redis sends it
Image | One image, run twice with a name each so a message shows which server held its sender
Nginx | Round-robin across both, with the WebSocket upgrade passed through
Compose | Redis, two servers and Nginx, started in order
```

**1. `server.js`** — a message from a client goes to Redis, never straight to other clients;
the only path to a socket is the subscription. That is what makes both servers behave alike.

```js file=server.js
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const NAME = process.env.SERVER_NAME ?? "server";
const CHANNEL = "chat";

const publisher = await createClient({ url: process.env.REDIS_URL })
  .on("error", (err) => console.error("redis", err))
  .connect();
// A subscribing connection takes over the socket, so it gets its own.
const subscriber = publisher.duplicate();
subscriber.on("error", (err) => console.error("redis subscriber", err));
await subscriber.connect();

const wss = new WebSocketServer({ port: 3000 });

// Everything that arrives from Redis is delivered to every socket this server holds.
await subscriber.subscribe(CHANNEL, (message) => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
});

wss.on("connection", (socket) => {
  socket.on("message", async (data) => {
    const text = data.toString().slice(0, 1000);
    await publisher.publish(CHANNEL, JSON.stringify({ text, via: NAME }));
  });
});

process.on("SIGTERM", () => {
  wss.close(() => process.exit(0));
});
```

**2. The image** — the same one for both servers.

```json file=package.json
{ "type": "module", "dependencies": { "ws": "^8", "redis": "^5" } }
```

```dockerfile file=Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY server.js .
USER node
CMD ["node", "server.js"]
```

**3. `nginx.conf`** — the `map` makes the upgrade happen only when the client asks for it.
`proxy_read_timeout` is raised because an idle WebSocket looks like a stalled request to Nginx's
default of 60 seconds.

```nginx file=nginx.conf
events {}
http {
  map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
  }

  upstream chat {
    server chat-a:3000;
    server chat-b:3000;
  }

  server {
    listen 80;
    location / {
      proxy_pass http://chat;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_read_timeout 1h;
    }
  }
}
```

**4. `compose.yaml`**

```yaml file=compose.yaml
services:
  redis:
    image: redis:8
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      retries: 20

  chat-a: &chat
    build: .
    environment:
      REDIS_URL: redis://redis:6379
      SERVER_NAME: chat-a
    depends_on:
      redis: { condition: service_healthy }

  chat-b:
    <<: *chat
    environment:
      REDIS_URL: redis://redis:6379
      SERVER_NAME: chat-b

  nginx:
    image: nginx:1.28
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - chat-a
      - chat-b
```

```sh run
docker compose up -d --build --wait redis chat-a chat-b
docker compose up -d --wait nginx
```

## Verify

Open one client on each server directly, send a message from the first, and check that the
second receives it. The clients run from a throwaway container on the Compose network, so they
are on different servers by construction rather than by luck:

```sh
docker compose run --rm --no-deps chat-a node -e '
  const { WebSocket } = require("ws");
  const alice = new WebSocket("ws://chat-a:3000");
  const bob = new WebSocket("ws://chat-b:3000");
  bob.on("message", (m) => { console.log("bob, on chat-b, received:", m.toString()); process.exit(0); });
  alice.on("open", () => bob.on("open", () => alice.send("hello from alice")));
  setTimeout(() => { console.error("bob received nothing within 5s"); process.exit(1); }, 5000);
'
# bob, on chat-b, received: {"text":"hello from alice","via":"chat-a"}
```

The `via` field says which server received the message: it entered on `chat-a` and left on
`chat-b`, and the only thing between them is Redis. To see that Redis is what carries it, stop
it and send again — nothing arrives, because the servers have no other path to each other:

```sh
docker compose stop redis
```

```js file=cross-server.mjs hidden
// Two clients on different servers; a message from one reaches the other, and the sender too.
import WebSocket from "ws";
import assert from "node:assert/strict";

const open = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  const inbox = [];
  ws.on("message", (m) => inbox.push(JSON.parse(m.toString())));
  ws.on("open", () => resolve({ ws, inbox }));
  ws.on("error", reject);
});
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(`timed out waiting for ${what}`);
};

const alice = await open("ws://localhost:8081"); // chat-a, directly
const bob = await open("ws://localhost:8082");   // chat-b, directly
alice.ws.send("hello from alice");
await until(() => bob.inbox.length === 1, "bob to receive alice's message");
await until(() => alice.inbox.length === 1, "alice to receive her own message");
assert.equal(bob.inbox[0].text, "hello from alice");
assert.equal(bob.inbox[0].via, "chat-a", "the message entered on server A and left on server B");

// And the other way round
bob.ws.send("hi alice");
await until(() => alice.inbox.length === 2, "alice to receive bob's reply");
assert.equal(alice.inbox[1].via, "chat-b");

// Through Nginx: eight clients land across both servers, and one message still reaches every one of them
const viaNginx = await Promise.all(Array.from({ length: 8 }, () => open("ws://localhost:8080")));
viaNginx[0].ws.send("through the proxy");
await until(() => viaNginx.every((c) => c.inbox.some((m) => m.text === "through the proxy")), "all eight proxied clients to receive the message");

for (const c of [alice, bob, ...viaNginx]) c.ws.close();
console.log("messages crossed servers in both directions, and reached every proxied client");
```

```text file=compose.test.yaml hidden
# Publishes each server's port too, so a test on the host can pick a server instead of leaving it to Nginx.
services:
  chat-a:
    ports: ["8081:3000"]
  chat-b:
    ports: ["8082:3000"]
```

```sh check hidden
# The reader's own command, as written: it must work as shown
out=$(docker compose run --rm --no-deps chat-a node -e '
  const { WebSocket } = require("ws");
  const alice = new WebSocket("ws://chat-a:3000");
  const bob = new WebSocket("ws://chat-b:3000");
  bob.on("message", (m) => { console.log("bob, on chat-b, received:", m.toString()); process.exit(0); });
  alice.on("open", () => bob.on("open", () => alice.send("hello from alice")));
  setTimeout(() => { console.error("bob received nothing within 5s"); process.exit(1); }, 5000);
')
echo "$out"
grep -q '"via":"chat-a"' <<<"$out"
grep -q "bob, on chat-b, received" <<<"$out"
```

```sh check hidden
# Both directions, and through the proxy, from the host
docker compose -f compose.yaml -f compose.test.yaml up -d --wait redis chat-a chat-b nginx
npm install --no-save --no-audit --no-fund ws@8
node cross-server.mjs
```

```sh check hidden
# Redis really is the only path: with it stopped, a message sent to one server never reaches the other
docker compose stop redis
cat > no-redis.mjs <<'JS'
import WebSocket from "ws";
const open = (url) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.on("open", () => res(ws)); ws.on("error", rej); });
const bob = await open("ws://localhost:8082");
let received = false;
bob.on("message", () => (received = true));
const alice = await open("ws://localhost:8081");
alice.send("is anyone there?");
await new Promise((r) => setTimeout(r, 2000));
if (received) { console.error("a message crossed servers without Redis"); process.exit(1); }
console.log("without Redis nothing crossed — the shared channel is what joins the servers");
process.exit(0);
JS
node no-redis.mjs
```

## Going to production

- **Do not lose messages you promised.** Pub/sub drops a message for any server not subscribed at
  that instant. Write the message to a database or a Redis Stream first, deliver from there, and
  use pub/sub only to say "something new arrived" so a reconnecting server can catch up.
- **Authenticate the upgrade.** Check the session or token in the HTTP request that becomes the
  WebSocket, before accepting it; a socket is open for hours and cannot be revoked by expiring a
  cookie on the next request.
- **Limit what one client can do.** Cap message size (`maxPayload` on the server), the rate per
  connection, and connections per user, or one client can flood every server through Redis.
- **Heartbeat the connections.** Proxies and mobile networks drop idle sockets silently. Send
  periodic pings and close connections that do not answer, so `wss.clients` does not fill with
  dead sockets.
- **Reconnect with back-off and jitter on the client,** and resend nothing automatically: after
  a reconnect the client asks for what it missed.
- **Shard when one channel is too hot.** One channel means every server handles every message.
  Per-room channels, or Redis sharded pub/sub (`sSubscribe`), keep a server's work proportional
  to the rooms it hosts.
- **Drain on deploy.** Stop accepting connections, tell clients to reconnect, then exit — see
  [Graceful Shutdown](/concept/graceful-shutdown). Otherwise every deploy drops every user at once.

## When not to

- **The server only pushes to the browser.** For notifications and live feeds,
  [Server-Sent Events](/compare/websocket-vs-sse) are simpler, work through every proxy, and
  reconnect on their own.
- **Delivery must be reliable and ordered across restarts.** A chat that is a system of record
  wants a durable log or a managed real-time service; pub/sub is the delivery path, not the store.
- **A single server is enough.** One Node.js process holds tens of thousands of idle WebSockets;
  adding Redis and a second server before you need them is the complexity this guide exists to
  avoid until it is necessary.

## References

- [ws: a WebSocket library for Node.js](https://github.com/websockets/ws)
- [node-redis: Pub/Sub — subscribing, publishing and dedicated connections](https://github.com/redis/node-redis/blob/master/docs/pub-sub.md)
- [Redis: Pub/Sub — delivery semantics and sharded pub/sub](https://redis.io/docs/latest/develop/interact/pubsub/)
- [Nginx: WebSocket proxying](https://nginx.org/en/docs/http/websocket.html)
- [Nginx: `ngx_http_upstream_module`](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
