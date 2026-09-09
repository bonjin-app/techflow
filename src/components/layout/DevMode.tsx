"use client";

import { useEffect, useState } from "react";

interface Stats {
  fps: number;
  nodes: number;
  edges: number;
  dom: number;
  memory?: string;
  transfer?: string;
  gpu: string;
  theme: string;
  viewport: string;
}

/** ⌘⇧D — a small diagnostics HUD. Reads counts from data attributes rendered by graph components. */
export function DevMode({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let fps = 0;
    let raf = 0;
    const tick = (t: number) => {
      frames++;
      if (t - last >= 1000) {
        fps = Math.round((frames * 1000) / (t - last));
        frames = 0;
        last = t;
        const nodes = document.querySelectorAll("[data-graph-node]").length;
        const edges = document.querySelectorAll("[data-graph-edge]").length;
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const transfer = resources.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize ?? 0);
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        const canvas = document.createElement("canvas");
        const gpu = canvas.getContext("webgl2") ? "WebGL2" : canvas.getContext("webgl") ? "WebGL" : "none";
        setStats({
          fps,
          nodes,
          edges,
          dom: document.getElementsByTagName("*").length,
          memory: mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB` : undefined,
          transfer: `${(transfer / 1024).toFixed(0)} KB`,
          gpu: "gpu" in navigator ? `WebGPU · ${gpu}` : gpu,
          theme: document.documentElement.dataset.theme ?? "?",
          viewport: `${window.innerWidth}×${window.innerHeight}`,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rows: [string, string | number | undefined][] = stats
    ? [
        ["FPS", stats.fps],
        ["Graph nodes", stats.nodes],
        ["Graph edges", stats.edges],
        ["DOM nodes", stats.dom],
        ["JS heap", stats.memory ?? "n/a"],
        ["Transferred", stats.transfer],
        ["GPU", stats.gpu],
        ["Theme", stats.theme],
        ["Viewport", stats.viewport],
      ]
    : [];

  return (
    <aside
      className="fixed bottom-4 right-4 z-50 w-60 rounded-lg border border-border bg-surface/95 p-3 font-mono text-[11px] shadow-md backdrop-blur"
      aria-label="Developer mode"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="uppercase tracking-wider text-fg-faint">developer mode</span>
        <button onClick={onClose} className="text-fg-faint hover:text-fg" aria-label="Close developer mode">
          ✕
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-faint">{k}</dt>
            <dd className="text-right text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 text-fg-faint">⌘⇧D to toggle</div>
    </aside>
  );
}
