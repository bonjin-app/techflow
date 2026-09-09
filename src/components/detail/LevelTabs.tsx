"use client";

import { KEYS, setLevel } from "@/lib/local";
import { useLocalRaw } from "@/lib/useLocal";

interface Level {
  key: string;
  label: string;
  content: React.ReactNode;
}

/** TL;DR / Practical / Deep dive — user-selected depth, remembered across pages. */
export function LevelTabs({ levels }: { levels: Level[] }) {
  const savedRaw = useLocalRaw(KEYS.level);
  let saved: string | null = null;
  try {
    saved = savedRaw ? (JSON.parse(savedRaw) as string) : null;
  } catch {
    saved = null;
  }
  const idx = levels.findIndex((l) => l.key === saved);
  const active = idx >= 0 ? idx : 0;

  if (levels.length === 0) return null;

  return (
    <div>
      <div role="tablist" aria-label="Depth" className="mb-4 inline-flex rounded-lg border border-border bg-surface p-0.5">
        {levels.map((l, i) => (
          <button
            key={l.key}
            role="tab"
            id={`level-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`level-panel-${i}`}
            onClick={() => setLevel(l.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              i === active ? "bg-surface-2 text-fg shadow-sm" : "text-fg-muted hover:text-fg"
            }`}
          >
            <span className="mr-1.5 font-mono text-[10px] text-fg-faint">L{i + 1}</span>
            {l.label}
          </button>
        ))}
      </div>
      {levels.map((l, i) => (
        <div key={l.key} role="tabpanel" id={`level-panel-${i}`} aria-labelledby={`level-tab-${i}`} hidden={i !== active} className="animate-fade-up">
          {l.content}
        </div>
      ))}
    </div>
  );
}
