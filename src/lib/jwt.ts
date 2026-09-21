/**
 * The JWT decoding the playground does, as pure functions.
 *
 * Decoding is not verification — the page says so, and these functions do not
 * pretend otherwise: nothing here checks a signature. What they do have to get
 * right is base64url (padding stripped, `-_` for `+/`) and UTF-8, because a
 * decoder that mangles a name with an accent in it teaches the reader that JWTs
 * mangle names with accents in them.
 */
export interface DecodedJwt {
  header: string;
  payload: string;
  claims: Record<string, unknown>;
}

export function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** base64url without padding, which is what a JWT uses. */
export function b64urlEncode(obj: unknown): string {
  const bin = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

/** `null` when the token is not three base64url segments. */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadRaw = b64urlDecode(parts[1]);
    let claims: Record<string, unknown> = {};
    try {
      claims = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      /* a payload that is not JSON still decodes; it just has no claims */
    }
    return { header: pretty(b64urlDecode(parts[0])), payload: pretty(payloadRaw), claims };
  } catch {
    return null;
  }
}

/** A rounded, human phrase for a duration in seconds. */
export function ago(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}
