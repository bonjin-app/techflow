import { describe, expect, it } from "vitest";
import { CASES, RESOURCE, type Case, type Scenario } from "@/lib/http";

const entries = Object.entries(CASES) as [Scenario, Case][];

/** The reason phrases RFC 9110 registers for the codes this page shows. */
const REASON: Record<number, string> = {
  200: "OK",
  201: "Created",
  304: "Not Modified",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  429: "Too Many Requests",
  503: "Service Unavailable",
};

const header = (c: Case, name: string) => c.headers[name.toLowerCase()];

describe("the responses the HTTP playground shows as fact", () => {
  it("uses the registered reason phrase for every status", () => {
    for (const [name, c] of entries) {
      expect(REASON[c.status], `${name}: ${c.status} is not one this page should be teaching`).toBeDefined();
      expect(c.statusText, name).toBe(REASON[c.status]);
    }
  });

  it("sends no body where a body is forbidden", () => {
    // RFC 9110: a 304 is a cache validation, and 204 has nothing to say.
    for (const [name, c] of entries) {
      if (c.status === 304 || c.status === 204) expect(c.body, name).toBeUndefined();
    }
  });

  it("points at what it created", () => {
    for (const [name, c] of entries) {
      if (c.status !== 201) continue;
      expect(header(c, "Location"), `${name}: a 201 without Location leaves the client guessing the URL`).toBeTruthy();
      expect(c.methods, name).toEqual(["POST"]);
    }
  });

  it("says how to authenticate when it refuses for want of it", () => {
    for (const [name, c] of entries) {
      if (c.status === 401) expect(header(c, "WWW-Authenticate"), name).toBeTruthy();
    }
  });

  it("says when to come back where the client is expected to wait", () => {
    for (const [name, c] of entries) {
      if (c.status === 429 || c.status === 503) expect(header(c, "Retry-After"), name).toBeTruthy();
    }
  });

  it("only revalidates on a method that can be cached", () => {
    for (const [name, c] of entries) {
      if (c.status === 304) expect(c.methods.every((m) => m === "GET" || m === "HEAD"), name).toBe(true);
    }
  });

  it("carries a validator wherever it offers one to use", () => {
    // A 409 that says "the order changed since you read it" is only actionable
    // if it hands back the version the client is now behind.
    const conflict = CASES.conflict;
    expect(header(conflict, "ETag")).toBeTruthy();
    expect(header(CASES.ok, "ETag")).toBeTruthy();
  });

  it("describes errors in a media type that matches the body", () => {
    for (const [name, c] of entries) {
      const type = header(c, "Content-Type");
      if (!type) continue;
      if (type.startsWith("application/problem+json")) {
        // RFC 9457 requires `type` and `title`; this page teaches both.
        expect(c.body, name).toMatchObject({ type: expect.any(String), title: expect.any(String) });
      }
      if (c.body === undefined) expect(type, `${name}: a content type with nothing to type`).toBeUndefined();
    }
  });

  it("never claims a destructive retry is free", () => {
    for (const [name, c] of entries) {
      if (c.status >= 500 || c.status === 429) {
        expect(c.safeToRetry, `${name}: the client is meant to retry this one`).not.toBe(false);
      }
      // A conflict means the client's assumption was wrong; repeating it
      // unchanged is not a fix.
      if (c.status === 409) expect(c.safeToRetry, name).toBe(false);
    }
  });

  it("explains itself and what the client should do, on every scenario", () => {
    for (const [name, c] of entries) {
      expect(c.meaning.length, name).toBeGreaterThan(30);
      expect(c.clientShould.length, name).toBeGreaterThan(20);
      expect(c.methods.length, name).toBeGreaterThan(0);
    }
  });

  it("uses one resource throughout, so the scenarios compare", () => {
    expect(RESOURCE).toMatch(/^\/[\w/-]+$/);
    const location = header(CASES.created, "Location");
    expect(location).toBe(RESOURCE);
  });
});
