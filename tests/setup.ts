import { vi } from "vitest";

/**
 * React's `cache()` memoises only inside a server render, so under test every
 * `getGraph()` rebuilt the whole graph — parsing 255 pages and re-running every
 * content check. `getPractice` asks for it four times per page, so the two
 * tests that walk every page took 60–260 seconds and timed out whenever the
 * machine was busy. Content cannot change during a test run, so here `cache()`
 * memoises by its arguments, as it does within one render.
 */
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      return (...args: A) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key)!;
      };
    },
  };
});
