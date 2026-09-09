"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { RelationshipGraphProps } from "./RelationshipGraph";

const RelationshipGraph = dynamic(() => import("./RelationshipGraph").then((m) => m.RelationshipGraph), {
  ssr: false,
  loading: () => null,
});

/**
 * Mounts the (heavy) force graph only when it scrolls near the viewport.
 * Until then a lightweight placeholder keeps the layout stable.
 */
export function GraphLoader(props: RelationshipGraphProps & { eager?: boolean }) {
  const { eager = false, height = 440, ...rest } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(eager);

  useEffect(() => {
    if (ready) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);

  return (
    <div ref={ref} style={{ minHeight: height + 56 }}>
      {ready ? (
        <RelationshipGraph {...rest} height={height} />
      ) : (
        <div
          className="grid-bg flex items-center justify-center rounded-lg border border-border bg-bg-subtle text-xs text-fg-faint"
          style={{ height }}
          aria-hidden
        >
          loading graph…
        </div>
      )}
    </div>
  );
}
