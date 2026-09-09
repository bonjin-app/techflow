import Link from "next/link";
import { PaletteButton } from "@/components/search/PaletteButton";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="font-mono text-xs uppercase tracking-wider text-fg-faint">404 · node not found</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">This node isn&apos;t in the graph yet.</h1>
      <p className="mt-3 text-fg-muted">
        The page may have moved, or the topic hasn&apos;t been written. Search the knowledge graph or start from a hub.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <PaletteButton />
        <Link href="/explore" className="text-sm text-accent hover:underline">
          Explore the graph →
        </Link>
        <Link href="/technology/redis" className="text-sm text-accent hover:underline">
          Start with Redis →
        </Link>
      </div>
    </div>
  );
}
