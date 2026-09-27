---
id: rabbitmq-work-queue-nodejs
name: RabbitMQ work queue with retries and dead letters
tagline: Background jobs on a quorum queue that retries with back-off and parks what keeps failing
environment: local
difficulty: 3
tags: [Messaging, Background Jobs, Reliability, Docker]
components:
  - { ref: rabbitmq, version: "4.3", role: "Replicated quorum queue with a delivery limit, delayed retry and at-least-once dead-lettering" }
  - { ref: nodejs, version: "22 LTS with amqplib 2", role: "Publishes with confirms; workers acknowledge on success and reject on failure" }
  - { ref: docker, version: "Compose v2", role: "Runs the broker with its management UI next to the producer and workers" }
related:
  - { to: message-queue, rel: RELATED_TO }
  - { to: retry, rel: RELATED_TO }
  - { to: idempotency, rel: RELATED_TO }
  - { to: delivery-semantics, rel: RELATED_TO }
  - { to: backpressure, rel: RELATED_TO }
  - { to: kafka-vs-rabbitmq, rel: RELATED_TO }
meta: { lastReviewed: 2026-09-27, confidence: medium }
---

## TL;DR

Most background work — sending emails, resizing images, calling a slow partner API — needs
the same three things: jobs must survive a crash, a failing job must be retried later rather
than immediately, and a job that never succeeds must be set aside instead of blocking or
vanishing. [RabbitMQ](/technology/rabbitmq) 4.3 does all three inside one quorum queue:
a delivery limit, **delayed retry with back-off** (new in 4.3), and at-least-once
dead-lettering to a queue you can inspect. The [Node.js](/technology/nodejs) side is a
producer that waits for confirms and workers that acknowledge only when the job is done.

## Why this pairing

**The broker keeps the state; workers stay simple.** A worker takes a job, does it, and says
done or failed. Counting attempts, waiting before the next one and moving a hopeless job
aside all happen in RabbitMQ, so there is no retry table, scheduler or cron to build.

**What fits:**

- Quorum queues are replicated and durable by design, and since 4.0 they cap deliveries at
  20 by default, so a poison message cannot loop forever.
- Delayed retry holds a failed message for a growing interval before redelivering it —
  one second, then two, then three — which is what a flaky dependency needs.
- `prefetch` bounds how many unacknowledged jobs each worker holds, which is
  [backpressure](/concept/backpressure) for free: slow workers simply take fewer.

**Where it rubs:**

- Delivery is at least once. A worker can finish a job and crash before acknowledging it, so
  it will run again: jobs must be [idempotent](/concept/idempotency).
- Queue arguments are fixed at declaration. Changing the delivery limit on an existing queue
  fails with `PRECONDITION_FAILED`; production settings belong in policies.
- The details of how a failure is counted depend on how it is reported — `reject` counts
  towards the limit, `nack` does not, as of RabbitMQ 4.3.

## Set it up

```steps
title: From a producer to a dead-letter queue
Broker | RabbitMQ 4.3 with the management UI and a real user
Topology | A dead-letter exchange and queue, then the work queue pointing at them
Producer | Persistent messages with an id, published on a confirm channel
Worker | Limited prefetch, acknowledge on success, reject to retry
```

**1. `compose.yaml`** — the `guest` account only accepts connections from localhost, so the
broker gets its own user.

```yaml
services:
  rabbitmq:
    image: rabbitmq:4.3-management
    environment:
      RABBITMQ_DEFAULT_USER: app
      RABBITMQ_DEFAULT_PASS: app
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitdata:/var/lib/rabbitmq

volumes:
  rabbitdata:
```

**2. `topology.js`** — declared by both producer and worker; declarations are idempotent as
long as the arguments match.

```js
import amqp from "amqplib";

export async function open() {
  const conn = await amqp.connect(process.env.AMQP_URL ?? "amqp://app:app@localhost:5672");
  const ch = await conn.createConfirmChannel();

  await ch.assertExchange("jobs.dlx", "fanout", { durable: true });
  await ch.assertQueue("jobs.dead", { durable: true, arguments: { "x-queue-type": "quorum" } });
  await ch.bindQueue("jobs.dead", "jobs.dlx", "");

  await ch.assertQueue("jobs", {
    durable: true,
    arguments: {
      "x-queue-type": "quorum",
      "x-delivery-limit": 5,
      "x-dead-letter-exchange": "jobs.dlx",
      "x-dead-letter-strategy": "at-least-once",
      "x-overflow": "reject-publish", // required by at-least-once dead-lettering
      "x-delayed-retry-type": "failed",
      "x-delayed-retry-min": 1000,
      "x-delayed-retry-max": 30000,
    },
  });
  return { conn, ch };
}
```

**3. `produce.js`** — `persistent` writes the message to disk; waiting for confirms means
the broker has it before the producer moves on.

```js
import crypto from "node:crypto";
import { open } from "./topology.js";

const { conn, ch } = await open();
for (let i = 0; i < 10; i++) {
  const job = { id: crypto.randomUUID(), email: `user${i}@example.com` };
  ch.sendToQueue("jobs", Buffer.from(JSON.stringify(job)), {
    persistent: true,
    messageId: job.id,
    contentType: "application/json",
  });
}
await ch.waitForConfirms();
await conn.close();
```

**4. `worker.js`** — `reject(msg, true)` returns the job for a delayed retry and counts
towards the limit; after five failed deliveries it moves to `jobs.dead`.

```js
import { open } from "./topology.js";

const { ch } = await open();
await ch.prefetch(10);

await ch.consume("jobs", async (msg) => {
  const job = JSON.parse(msg.content.toString());
  const attempt = (msg.properties.headers?.["x-delivery-count"] ?? 0) + 1;
  try {
    await sendEmail(job); // must be safe to run twice
    ch.ack(msg);
  } catch (err) {
    console.error(`job ${job.id} failed on attempt ${attempt}:`, err.message);
    ch.reject(msg, true);
  }
});

async function sendEmail(job) {
  if (job.email.startsWith("user3")) throw new Error("mailbox unavailable"); // a job that never succeeds
}
```

```sh
docker compose up -d
npm install amqplib
node worker.js &
node produce.js
```

## Verify

Nine jobs are acknowledged at once; job 3 fails, is retried with growing delays, and ends up
in the dead-letter queue after five attempts:

```sh
docker compose exec rabbitmq rabbitmqctl list_queues name type messages
# jobs       quorum  0
# jobs.dead  quorum  1
```

The worker's log shows the attempts spreading out — about one, two, three and four seconds
apart — rather than five failures in a millisecond. The management UI at
`localhost:15672` (user `app`) shows the parked message in `jobs.dead`, with headers
recording why and from where it was dead-lettered.

Stop the worker, publish again, and restart it: the jobs are still there, because the queue
and its messages are durable.

## Going to production

- **Declare settings in policies, not in code.** A policy can change the delivery limit or
  retry delays on existing queues; queue arguments cannot be changed without deleting the
  queue.
- **Run three nodes.** A quorum queue needs a majority of its replicas; on one node it is
  durable but not highly available.
- **Deduplicate on the message id.** Record processed ids — with a unique constraint in the
  database the job writes to — so a redelivery does nothing twice.
- **Watch the dead-letter queue.** Alert when it grows, and have a way to inspect, fix and
  republish its messages; a queue nobody reads is where jobs go to be forgotten.
- **Size prefetch to the work.** A high prefetch with slow jobs gives one worker a long
  private backlog; a low one with fast jobs spends time on round trips.
- **Reconnect on failure.** Pass a `recovery` option to `amqp.connect` — back-off, jitter and a
  `setup(model)` hook that amqplib calls after every reconnect, which is where the topology
  and consumers must be declared again.

## When not to

- **Many consumers need the same events, or history must be replayable.** A log such as
  Kafka fits that; a work queue removes each message once it is handled — see
  [Kafka vs RabbitMQ](/compare/kafka-vs-rabbitmq).
- **Jobs must run at a specific time** days from now. Delayed retry is for back-off, not
  scheduling; use a scheduler or a database table of due jobs.
- **A few jobs a minute, one process.** A table of pending jobs in the database you already
  run may be all you need, with one less system to operate.

## References

- [RabbitMQ: quorum queues — delivery limit, delayed retry, dead-lettering](https://www.rabbitmq.com/docs/quorum-queues)
- [RabbitMQ: dead letter exchanges](https://www.rabbitmq.com/docs/dlx)
- [RabbitMQ: consumer acknowledgements and publisher confirms](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ: consumer prefetch](https://www.rabbitmq.com/docs/consumer-prefetch)
- [RabbitMQ official Docker image](https://hub.docker.com/_/rabbitmq)
- [amqplib channel API](https://amqp-node.github.io/amqplib/channel_api.html)
