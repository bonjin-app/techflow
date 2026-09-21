import { describe, expect, it } from "vitest";
import { ago, b64urlDecode, b64urlEncode, decodeJwt } from "@/lib/jwt";

const token = (header: unknown, payload: unknown) => `${b64urlEncode(header)}.${b64urlEncode(payload)}.sig`;

describe("the claims the JWT playground makes", () => {
  it("decodes a token into its header and claims", () => {
    const t = token({ alg: "HS256", typ: "JWT" }, { sub: "7", iss: "auth.example", exp: 1893456000 });
    const d = decodeJwt(t)!;
    expect(d.claims).toEqual({ sub: "7", iss: "auth.example", exp: 1893456000 });
    expect(JSON.parse(d.header)).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("reads base64url, not base64 — the `-` and `_` a JWT actually uses", () => {
    // Bytes that encode to both of base64's problem characters.
    const payload = { s: "???~~~???" };
    const encoded = b64urlEncode(payload);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(JSON.parse(b64urlDecode(encoded))).toEqual(payload);
  });

  it("survives every padding length", () => {
    for (let n = 1; n <= 8; n++) {
      const payload = { p: "x".repeat(n) };
      expect(JSON.parse(b64urlDecode(b64urlEncode(payload)))).toEqual(payload);
    }
  });

  it("decodes UTF-8 rather than mangling it", () => {
    // A decoder that reads bytes as latin-1 turns these into mojibake, and the
    // reader concludes JWTs cannot hold their own name.
    const payload = { name: "Ana Muñoz", city: "서울", emoji: "🔐" };
    const d = decodeJwt(token({ alg: "none" }, payload))!;
    expect(d.claims).toEqual(payload);
  });

  it("refuses anything that is not three segments", () => {
    for (const bad of ["", "a", "a.b", "a.b.c.d", "   ", "not a token at all"]) {
      expect(decodeJwt(bad), bad).toBeNull();
    }
  });

  it("returns null rather than throwing on a segment that is not base64url", () => {
    expect(decodeJwt("!!!.###.sig")).toBeNull();
  });

  it("still decodes when the payload is not JSON, with no claims to show", () => {
    const d = decodeJwt(`${b64urlEncode({ alg: "none" })}.${btoa("plain text").replace(/=+$/, "")}.sig`);
    expect(d).not.toBeNull();
    expect(d!.claims).toEqual({});
  });

  it("ignores whitespace around a pasted token", () => {
    const t = token({ alg: "HS256" }, { sub: "1" });
    expect(decodeJwt(`\n  ${t}  \n`)?.claims).toEqual({ sub: "1" });
  });

  it("phrases a duration the way a person would say it", () => {
    expect(ago(60)).toBe("1 minute");
    expect(ago(600)).toBe("10 minutes");
    expect(ago(3600)).toBe("60 minutes"); // under 90 minutes stays in minutes
    expect(ago(7200)).toBe("2 hours");
    expect(ago(86400 * 3)).toBe("3 days");
  });
});
