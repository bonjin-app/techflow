"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 639px)";

/**
 * Below Tailwind's sm breakpoint — the line CSS draws its phone layouts at.
 * False on the server and before hydration, so the first paint is the desktop
 * drawing; components that change size on a phone should set that size in CSS.
 */
export function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(PHONE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}
