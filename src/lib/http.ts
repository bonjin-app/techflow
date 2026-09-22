/**
 * The responses the HTTP playground shows, as data rather than markup.
 *
 * They are the last of the playgrounds to move out of its component, and for
 * the same reason as the simulators: a reader takes these as fact. A 304 shown
 * with a body, or a 201 without Location, teaches something that is not true
 * about HTTP, and only a test can say so.
 */
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Scenario = "ok" | "created" | "not-modified" | "unauthorized" | "not-found" | "conflict" | "rate-limited" | "server-error";

export interface Case {
  status: number;
  statusText: string;
  /** which methods this scenario makes sense for */
  methods: Method[];
  headers: Record<string, string>;
  body?: unknown;
  meaning: string;
  clientShould: string;
  safeToRetry: boolean | "with-key";
}

export const RESOURCE = "/v1/orders/8f21";

export const CASES: Record<Scenario, Case> = {
  ok: {
    status: 200,
    statusText: "OK",
    methods: ["GET", "PUT", "PATCH"],
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, max-age=60",
      etag: '"a7c9-2"',
      "x-request-id": "req_01J8Z3",
    },
    body: { id: "8f21", status: "paid", total: 4200, currency: "EUR" },
    meaning: "The request succeeded and the body is the current representation of the resource.",
    clientShould: "Use the body. Store the ETag so the next read can be conditional.",
    safeToRetry: true,
  },
  created: {
    status: 201,
    statusText: "Created",
    methods: ["POST"],
    headers: {
      "content-type": "application/json; charset=utf-8",
      location: "/v1/orders/8f21",
      "idempotency-key": "ord_2026_09_10_a41b",
    },
    body: { id: "8f21", status: "pending" },
    meaning: "A new resource exists. Location points at it — that is what makes POST discoverable.",
    clientShould: "Follow Location rather than guessing the URL. Keep the idempotency key with the retry.",
    safeToRetry: "with-key",
  },
  "not-modified": {
    status: 304,
    statusText: "Not Modified",
    methods: ["GET"],
    headers: { etag: '"a7c9-2"', "cache-control": "private, max-age=60" },
    meaning: "Your cached copy is still current. There is no body at all — that is the saving.",
    clientShould: "Serve the cached representation. Nothing to parse, nothing to download.",
    safeToRetry: true,
  },
  unauthorized: {
    status: 401,
    statusText: "Unauthorized",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    headers: { "www-authenticate": 'Bearer realm="api", error="invalid_token"' },
    body: { error: "invalid_token", message: "The access token expired" },
    meaning: "Not authenticated. 401 means \"who are you?\" — 403 means \"I know who you are, and no\".",
    clientShould: "Refresh the token once, then replay the request. Do not loop.",
    safeToRetry: true,
  },
  "not-found": {
    status: 404,
    statusText: "Not Found",
    methods: ["GET", "PUT", "PATCH", "DELETE"],
    headers: { "content-type": "application/problem+json" },
    body: { type: "https://api.example/errors/not-found", title: "Order not found", detail: "No order with id 8f21" },
    meaning: "No resource at this URL — or you are not allowed to know that there is one.",
    clientShould: "Do not retry the same URL. Surface it as a real state, not as an error to hide.",
    safeToRetry: false,
  },
  conflict: {
    status: 409,
    statusText: "Conflict",
    methods: ["PUT", "PATCH", "POST", "DELETE"],
    headers: { "content-type": "application/problem+json", etag: '"a7c9-5"' },
    body: { type: "https://api.example/errors/conflict", title: "Version conflict", detail: "The order changed since you read it" },
    meaning: "The request clashed with the current state — the classic optimistic-concurrency answer.",
    clientShould: "Re-read, merge, resubmit with the new ETag in If-Match. Blind retries just conflict again.",
    safeToRetry: false,
  },
  "rate-limited": {
    status: 429,
    statusText: "Too Many Requests",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    headers: {
      "retry-after": "2",
      "ratelimit-limit": "100",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "2",
    },
    body: { error: "rate_limited", message: "100 requests per minute exceeded" },
    meaning: "You are over the quota. The headers tell you exactly how long to wait.",
    clientShould: "Honour Retry-After, then back off with jitter. Never hot-loop a 429.",
    safeToRetry: true,
  },
  "server-error": {
    status: 503,
    statusText: "Service Unavailable",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    headers: { "retry-after": "5", "x-request-id": "req_01J8Z4" },
    body: { error: "unavailable", message: "Upstream dependency is down" },
    meaning: "A server-side problem, explicitly temporary. 500 says \"something broke\"; 503 says \"try later\".",
    clientShould: "Retry with exponential backoff behind a circuit breaker — and only if the call is idempotent.",
    safeToRetry: "with-key",
  },
};

