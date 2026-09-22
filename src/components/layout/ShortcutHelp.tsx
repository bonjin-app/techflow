"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nav } from "@/lib/site";

export const HELP_EVENT = "tf:shortcuts";

/** Open the shortcut help from anywhere — the footer link uses this too. */
export function openShortcutHelp() {
  window.dispatchEvent(new CustomEvent(HELP_EVENT));
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">{children}</kbd>
);

/**
 * What the keyboard can do, on `?`.
 *
 * The shortcuts existed and only one of them was discoverable: the search
 * button shows ⌘K, and nothing anywhere mentioned that G then a letter jumps to
 * a section. A feature nobody can find is a feature nobody uses.
 *
 * The section list is read from the same `nav` the header and the shortcut
 * handler use, so a new section cannot appear in one and not the other.
 */
export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    returnTo.current?.focus();
  }, []);

  useEffect(() => {
    const onOpen = () => {
      returnTo.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(HELP_EVENT, onOpen);
    return () => window.removeEventListener(HELP_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panel.current?.focus());
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      role="presentation"
      onClick={close}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl border border-border bg-bg shadow-md outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Nothing else in here takes focus, so Tab has nowhere to go and the
          // visible `esc` is the way out.
          if (e.key === "Tab") e.preventDefault();
          if (e.key === "Escape") close();
        }}
      >
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
          <button onClick={close} className="font-mono text-[11px] text-fg-muted hover:text-fg">
            esc
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 text-sm">
          <dl className="mb-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Search everything</dt>
              <dd className="shrink-0 space-x-1">
                <Key>/</Key> <span className="text-fg-faint">or</span> <Key>⌘</Key> <Key>K</Key>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">This list</dt>
              <dd className="shrink-0">
                <Key>?</Key>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Close anything</dt>
              <dd className="shrink-0">
                <Key>esc</Key>
              </dd>
            </div>
          </dl>

          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-faint">
            Go to — press <Key>G</Key> then
          </div>
          {/* A `dl` may hold `div`s that wrap a dt/dd pair and nothing else, so
              the heading above sits outside it rather than in it. */}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Home</dt>
              <dd className="shrink-0">
                <Key>H</Key>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-fg-muted">Explore</dt>
              <dd className="shrink-0">
                <Key>E</Key>
              </dd>
            </div>
            {nav.map((n) => (
              <div key={n.href} className="flex items-baseline justify-between gap-4">
                <dt className="text-fg-muted">{n.label}</dt>
                <dd className="shrink-0">
                  <Key>{n.key.toUpperCase()}</Key>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
