"use client";

import { useMemo, useState } from "react";

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQyIiwibmFtZSI6IkRldmVsb3BlciIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc4ODk1MjAwMCwiZXhwIjoxNzg4OTU1NjAwfQ.c2lnbmF0dXJlLWlzLW5vdC12ZXJpZmllZC1oZXJl";

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function pretty(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function ago(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}

/** base64url without padding, which is what a JWT uses. */
function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bin = String.fromCharCode(...new TextEncoder().encode(json));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes a JWT into header / payload / signature. Decoding is not verification — the page says so. */
export function JwtDecoder() {
  const [token, setToken] = useState(SAMPLE);
  const parts = token.trim().split(".");
  const decoded = useMemo(() => {
    if (parts.length !== 3) return null;
    try {
      const header = pretty(b64urlDecode(parts[0]));
      const payloadRaw = b64urlDecode(parts[1]);
      const payload = pretty(payloadRaw);
      let claims: Record<string, unknown> = {};
      try {
        claims = JSON.parse(payloadRaw);
      } catch {
        /* not JSON */
      }
      return { header, payload, claims };
    } catch {
      return null;
    }
  }, [parts]);

  // Captured once on mount; expiry text is informational.
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const exp = decoded?.claims.exp as number | undefined;
  const iat = decoded?.claims.iat as number | undefined;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="flex items-center justify-between gap-3">
          <span className="text-xs text-fg-muted">Paste a JWT (nothing leaves your browser)</span>
          <button
            type="button"
            onClick={() => {
              // The built-in sample was minted when this page was written, so it
              // reads as expired forever. One click mints a fresh one.
              const iat = Math.floor(Date.now() / 1000);
              const header = b64url({ alg: "HS256", typ: "JWT" });
              const payload = b64url({ sub: "user_42", name: "Developer", role: "admin", iat, exp: iat + 3600 });
              setToken(`${header}.${payload}.c2lnbmF0dXJlLWlzLW5vdC12ZXJpZmllZC1oZXJl`);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            Mint a fresh sample
          </button>
        </span>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed outline-none focus:border-accent"
        />
      </label>

      {parts.length === 3 ? (
        <div className="break-all rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
          <span className="text-technology">{parts[0]}</span>
          <span className="text-fg-faint">.</span>
          <span className="text-concept">{parts[1]}</span>
          <span className="text-fg-faint">.</span>
          <span className="text-pattern">{parts[2]}</span>
        </div>
      ) : (
        <p className="text-sm text-danger">A JWT has exactly three base64url parts separated by dots.</p>
      )}

      {decoded && (
        <div className="grid gap-4 md:grid-cols-3">
          <Part title="Header" color="technology" body={decoded.header} note="Algorithm and token type. Never trust `alg` blindly — the server must pin the algorithms it accepts." />
          <Part title="Payload" color="concept" body={decoded.payload} note="Claims. Readable by anyone holding the token — never put secrets here." />
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="font-mono text-[11px] uppercase tracking-wider text-pattern">Signature</div>
            <p className="mt-2 break-all font-mono text-xs text-fg-muted">{parts[2]}</p>
            <p className="mt-3 text-xs text-fg-muted">
              HMAC or public-key signature over <code>base64url(header).base64url(payload)</code>. Decoding a token proves nothing; only verifying this
              signature with the server&apos;s key does. This playground does not verify.
            </p>
          </div>
        </div>
      )}

      {decoded && (exp || iat) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {iat && (
            <span className="rounded border border-border px-2 py-1 text-fg-muted">
              iat · issued {new Date(iat * 1000).toISOString()}
            </span>
          )}
          {exp && (
            <span className={`rounded border px-2 py-1 ${exp > now ? "border-ok/40 text-ok" : "border-danger/40 text-danger"}`}>
              exp · {exp > now ? `valid for another ${ago(exp - now)}` : `expired ${ago(now - exp)} ago`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Written out, not interpolated: Tailwind cannot see a class built at runtime. */
const PART_COLOR = { technology: "text-technology", concept: "text-concept", pattern: "text-pattern" } as const;

function Part({ title, color, body, note }: { title: string; color: keyof typeof PART_COLOR; body: string; note: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className={`font-mono text-[11px] uppercase tracking-wider ${PART_COLOR[color]}`}>{title}</div>
      <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-fg">{body}</pre>
      <p className="mt-3 text-xs text-fg-muted">{note}</p>
    </div>
  );
}
