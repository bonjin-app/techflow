"use client";

import { useState } from "react";

type State = "idle" | "copied" | "failed";

/**
 * Copy to clipboard with something to say when it does not work. The clipboard
 * API is refused in more situations than people expect — an insecure origin, a
 * permissions policy, a browser setting — and a button that silently does
 * nothing is worse than one that admits it.
 */
export function CopyButton({
  text,
  label,
  title,
  className = "",
}: {
  text: string | (() => string);
  label: string;
  title?: string;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");

  const copy = async () => {
    const value = typeof text === "function" ? text() : text;
    const settle = (next: State) => {
      setState(next);
      window.setTimeout(() => setState("idle"), 1800);
    };
    try {
      await navigator.clipboard.writeText(value);
      settle("copied");
      return;
    } catch {
      /* fall through to the older path */
    }
    try {
      // execCommand is deprecated and still the only fallback that works when
      // the async clipboard is refused.
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      settle(ok ? "copied" : "failed");
    } catch {
      settle("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      aria-live="polite"
      className={`h-8 rounded-md border border-border px-2.5 text-[12px] transition-colors ${
        state === "failed" ? "border-danger/50 text-danger" : "text-fg-muted hover:text-fg"
      } ${className}`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy blocked — select it instead" : label}
    </button>
  );
}
