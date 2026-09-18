import { beforeEach, describe, expect, it, vi } from "vitest";
import { KEYS, getKnown, getStreak, pushRecent, recordVisit, setKnown, streakFromRaw, todayKey } from "@/lib/local";

/** A localStorage stand-in, plus one that throws the way private mode does. */
function fakeStorage(throws = false) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (throws) throw new Error("denied");
      return map.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("quota");
      map.set(k, v);
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage(), dispatchEvent: () => true, CustomEvent: class {} });
  vi.stubGlobal("localStorage", (globalThis as unknown as { window: Window }).window.localStorage);
});

describe("known", () => {
  it("adds and removes without duplicating", () => {
    setKnown("redis", true);
    setKnown("redis", true);
    setKnown("cache", true);
    expect(getKnown().sort()).toEqual(["cache", "redis"]);
    setKnown("redis", false);
    expect(getKnown()).toEqual(["cache"]);
  });

  it("returns an empty list when nothing is stored", () => {
    expect(getKnown()).toEqual([]);
  });
});

describe("recent", () => {
  it("moves a repeat visit to the front instead of duplicating it", () => {
    pushRecent("a");
    pushRecent("b");
    pushRecent("a");
    const raw = JSON.parse(window.localStorage.getItem(KEYS.recent)!) as { id: string }[];
    expect(raw.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("keeps the list bounded", () => {
    for (let i = 0; i < 40; i++) pushRecent(`n${i}`);
    const raw = JSON.parse(window.localStorage.getItem(KEYS.recent)!) as unknown[];
    expect(raw.length).toBeLessThanOrEqual(12);
  });
});

describe("streak", () => {
  it("is zero with no visits", () => {
    expect(getStreak().current).toBe(0);
  });

  it("counts today", () => {
    recordVisit();
    expect(getStreak().current).toBe(1);
  });

  it("counts consecutive days and stops at the first gap", () => {
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return todayKey(d);
    };
    // today, yesterday, then a gap, then two older days
    expect(streakFromRaw(JSON.stringify({ days: [day(4), day(3), day(1), day(0)] })).current).toBe(2);
  });

  it("still counts a streak that ended yesterday, so a late visit does not reset it", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(streakFromRaw(JSON.stringify({ days: [todayKey(d)] })).current).toBe(1);
  });

  it("treats malformed storage as no streak rather than throwing", () => {
    expect(streakFromRaw("not json").current).toBe(0);
    expect(streakFromRaw(null).current).toBe(0);
  });
});

describe("private mode", () => {
  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("window", { localStorage: fakeStorage(true), dispatchEvent: () => true });
    expect(() => setKnown("redis", true)).not.toThrow();
    expect(getKnown()).toEqual([]);
    expect(() => pushRecent("redis")).not.toThrow();
    expect(getStreak().current).toBe(0);
  });
});
