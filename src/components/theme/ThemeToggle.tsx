"use client";

import { setTheme } from "@/lib/local";
import { useResolvedTheme } from "@/lib/useLocal";

export function ThemeToggle() {
  const theme = useResolvedTheme();

  const onClick = (e: React.MouseEvent) => {
    if (e.altKey) {
      // alt+click → follow the OS preference again
      setTheme(null);
      return;
    }
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-fg-muted transition-colors hover:text-fg"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Theme: ${theme} — alt+click to follow system`}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
