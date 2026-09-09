"use client";

import { useSyncExternalStore } from "react";
import { STORAGE_EVENT } from "./local";

function subscribe(cb: () => void) {
  window.addEventListener(STORAGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(STORAGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Raw localStorage value as an external store. Returns `undefined` on the
 * server and during hydration (→ "not hydrated yet"), `null` when unset.
 * Snapshots are strings so React can compare them by value.
 */
export function useLocalRaw(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => undefined,
  );
}

/** Current resolved theme from <html data-theme>, kept in sync with the toggle. */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}
