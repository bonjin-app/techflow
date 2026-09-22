"use client";

import { useMemo, useState } from "react";
import { CASES, RESOURCE, type Method, type Scenario } from "@/lib/http";

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
