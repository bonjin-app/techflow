"use client";

export const OPEN_PALETTE_EVENT = "tf:palette";

export function openPalette(initialQuery = "") {
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: initialQuery } }));
}

export function PaletteButton() {
  return (
    <button
      type="button"
      onClick={() => openPalette()}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[13px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      aria-label="Search (⌘K)"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="hidden sm:inline">Search</span>
      <span className="hidden items-center gap-0.5 sm:inline-flex">
        <kbd>⌘</kbd>
        <kbd>K</kbd>
      </span>
    </button>
  );
}
