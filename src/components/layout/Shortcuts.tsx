"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openPalette } from "@/components/search/PaletteButton";
import { nav } from "@/lib/site";
import { DevMode } from "./DevMode";

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/**
 * Global keyboard layer:
 *   /  or ⌘K   → command palette
 *   G then X   → go to section (T technologies, A architecture, R roadmap …)
 *   ⌘⇧D        → developer mode overlay
 *   Konami     → 🎉
 */
export function Shortcuts() {
  const router = useRouter();
  const [dev, setDev] = useState(false);
  const [party, setParty] = useState(false);

  useEffect(() => {
    let pendingG = 0;
    const konami: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setDev((d) => !d);
        return;
      }
      if (isTyping(e) || meta || e.altKey) return;

      konami.push(e.key);
      if (konami.length > KONAMI.length) konami.shift();
      if (konami.join(",") === KONAMI.join(",")) {
        setParty(true);
        setTimeout(() => setParty(false), 4000);
      }

      if (e.key === "/") {
        e.preventDefault();
        openPalette();
        return;
      }
      const now = Date.now();
      if (e.key.toLowerCase() === "g" && !e.shiftKey) {
        pendingG = now;
        return;
      }
      if (pendingG && now - pendingG < 900) {
        const target = nav.find((n) => n.key === e.key.toLowerCase());
        if (e.key.toLowerCase() === "h") router.push("/");
        else if (e.key.toLowerCase() === "e") router.push("/explore");
        else if (target) router.push(target.href);
        pendingG = 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      {dev && <DevMode onClose={() => setDev(false)} />}
      {party && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center"
        >
          <div className="animate-fade-up rounded-full border border-border bg-surface px-4 py-2 font-mono text-sm shadow-md">
            sudo techflow — achievement unlocked: you know the code.
          </div>
        </div>
      )}
    </>
  );
}
