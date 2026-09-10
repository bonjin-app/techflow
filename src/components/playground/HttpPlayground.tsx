"use client";

import { useMemo, useState } from "react";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Scenario = "ok" | "created" | "not-modified" | "unauthorized" | "not-found" | "conflict" | "rate-limited" | "server-error";

interface Case {
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

const RESOURCE = "/v1/orders/8f21";

const CASES: Record<Scenario, Case> = {
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

const SCENARIO_LABEL: Record<Scenario, string> = {
  ok: "200 OK",
  created: "201 Created",
  "not-modified": "304 Not Modified",
  unauthorized: "401 Unauthorized",
  "not-found": "404 Not Found",
  conflict: "409 Conflict",
  "rate-limited": "429 Too Many Requests",
  "server-error": "503 Service Unavailable",
};

function statusTone(status: number) {
  if (status < 300) return "text-ok";
  if (status < 400) return "text-comparison";
  if (status < 500) return "text-warn";
  return "text-danger";
}

/**
 * HTTP request/response anatomy. Compose a request, pick the response the server
 * gives back, and read what each line actually means for the client. Nothing is
 * sent anywhere — the exchange is constructed locally.
 */
export function HttpPlayground() {
  const [method, setMethod] = useState<Method>("GET");
  const [scenario, setScenario] = useState<Scenario>("ok");
  const [auth, setAuth] = useState(true);
  const [conditional, setConditional] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(false);

  const available = useMemo(
    () => (Object.keys(CASES) as Scenario[]).filter((s) => CASES[s].methods.includes(method)),
    [method],
  );
  const effective: Scenario = available.includes(scenario) ? scenario : available[0];
  const res = CASES[effective];

  const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
  const requestBody = hasBody ? { status: method === "POST" ? "pending" : "paid", total: 4200, currency: "EUR" } : undefined;

  const requestLines: { text: string; note?: string }[] = [
    { text: `${method} ${RESOURCE} HTTP/1.1`, note: "method + path + version — the request line" },
    { text: "host: api.example.com", note: "required in HTTP/1.1; how one IP serves many domains" },
    { text: "accept: application/json", note: "what you are willing to receive (content negotiation)" },
    ...(auth ? [{ text: "authorization: Bearer eyJhbGciOi…", note: "credentials; never in the URL, never logged" }] : []),
    ...(conditional && method === "GET" ? [{ text: 'if-none-match: "a7c9-2"', note: "makes the read conditional → the server can answer 304" }] : []),
    ...(conditional && (method === "PUT" || method === "PATCH" || method === "DELETE")
      ? [{ text: 'if-match: "a7c9-2"', note: "optimistic concurrency: write only if nothing changed" }]
      : []),
    ...(idempotencyKey && (method === "POST" || method === "PATCH")
      ? [{ text: "idempotency-key: ord_2026_09_10_a41b", note: "same key → same effect, however many times it arrives" }]
      : []),
    ...(hasBody ? [{ text: "content-type: application/json", note: "what you are sending" }] : []),
  ];

  const responseHeaderNotes: Record<string, string> = {
    "cache-control": "who may cache this and for how long",
    etag: "version of this representation — the token for conditional requests",
    location: "where the newly created resource lives",
    "retry-after": "how long to wait before trying again",
    "www-authenticate": "how to authenticate, and why the attempt failed",
    "ratelimit-remaining": "quota left in the current window",
    "ratelimit-limit": "size of the quota",
    "ratelimit-reset": "seconds until the window resets",
    "content-type": "how to parse the body",
    "x-request-id": "quote this in a support ticket; it ties to the server's logs",
    "idempotency-key": "echoed back so you can confirm the key was honoured",
  };

  const retryLabel = res.safeToRetry === true ? "Safe to retry" : res.safeToRetry === "with-key" ? "Retry only with an idempotency key" : "Do not retry blindly";
  const retryTone = res.safeToRetry === true ? "text-ok" : res.safeToRetry === "with-key" ? "text-warn" : "text-danger";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="block">
          <span className="text-xs text-fg-muted">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className="mt-1 h-9 w-28 rounded-md border border-border bg-surface px-2 font-mono">
            {(["GET", "POST", "PUT", "PATCH", "DELETE"] as Method[]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[210px] flex-1">
          <span className="text-xs text-fg-muted">Server answers with</span>
          <select value={effective} onChange={(e) => setScenario(e.target.value as Scenario)} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2">
            {available.map((s) => (
              <option key={s} value={s}>
                {SCENARIO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={auth} onChange={(e) => setAuth(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Authorization
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={conditional} onChange={(e) => setConditional(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Conditional (ETag)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.checked)}
              disabled={!(method === "POST" || method === "PATCH")}
              className="size-4 accent-[var(--accent)] disabled:opacity-40"
            />
            Idempotency-Key
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Request</span>
            <span className="font-mono text-[11px] text-fg-muted">client → server</span>
          </div>
          <ul className="divide-y divide-border/60">
            {requestLines.map((l, i) => (
              <li key={i} className="grid gap-1 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                <code className="break-all font-mono text-xs text-fg">{l.text}</code>
                {l.note && <span className="text-xs text-fg-faint">{l.note}</span>}
              </li>
            ))}
            {requestBody && (
              <li className="px-4 py-2">
                <pre className="overflow-x-auto font-mono text-xs text-fg">{JSON.stringify(requestBody, null, 2)}</pre>
                <span className="text-xs text-fg-faint">body — only methods that change state send one</span>
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Response</span>
            <span className="font-mono text-[11px] text-fg-muted">server → client</span>
          </div>
          <div className="border-b border-border px-4 py-3">
            <code className={`font-mono text-sm font-semibold ${statusTone(res.status)}`}>
              HTTP/1.1 {res.status} {res.statusText}
            </code>
            <p className="mt-1 text-xs text-fg-muted">{res.meaning}</p>
          </div>
          <ul className="divide-y divide-border/60">
            {Object.entries(res.headers).map(([k, v]) => (
              <li key={k} className="grid gap-1 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                <code className="break-all font-mono text-xs text-fg">
                  {k}: {v}
                </code>
                {responseHeaderNotes[k] && <span className="text-xs text-fg-faint">{responseHeaderNotes[k]}</span>}
              </li>
            ))}
            {res.body ? (
              <li className="px-4 py-2">
                <pre className="overflow-x-auto font-mono text-xs text-fg">{JSON.stringify(res.body, null, 2)}</pre>
              </li>
            ) : (
              <li className="px-4 py-3 text-xs text-fg-faint">No body — a 304 is the whole point: nothing is transferred.</li>
            )}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">What the client should do</div>
          <p className="mt-1 text-sm text-fg">{res.clientShould}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Retry safety</div>
          <p className={`mt-1 text-sm font-semibold ${retryTone}`}>{retryLabel}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {method === "GET" || method === "PUT" || method === "DELETE"
              ? `${method} is idempotent by definition: repeating it leaves the same state.`
              : `${method} is not idempotent on its own — a key or a de-duplication rule makes retries safe.`}
            {res.safeToRetry === false && " Here the status, not the method, is the blocker: the same request will fail the same way until you change it."}
            {res.safeToRetry === "with-key" && " Back off first, and send the same key so a retry cannot create a second resource."}
          </p>
        </div>
      </div>

      <p className="text-sm text-fg-muted">
        Two habits come out of this screen. First, the status code is an instruction, not decoration: 304 says use your cache, 409 says re-read before
        writing, 429 and 503 tell you how long to wait. Second, retry safety belongs to the method plus the key, never to optimism — which is why every
        mutating endpoint should accept an idempotency key.
      </p>
    </div>
  );
}
