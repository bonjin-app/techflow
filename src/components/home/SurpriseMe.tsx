"use client";

import { useRouter } from "next/navigation";

/** 🎲 — jumps to a random technology / concept / pattern. */
export function SurpriseMe({ ids }: { ids: { href: string }[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const pick = ids[Math.floor(Math.random() * ids.length)];
        if (pick) router.push(pick.href);
      }}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
    >
      <span aria-hidden>🎲</span> Surprise me
    </button>
  );
}
