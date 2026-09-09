import type { NodeType } from "@/lib/content/types";

/** id → link target, built server-side from the knowledge graph and passed to fences. */
export type RefMap = Record<string, { href: string; name: string; type: NodeType }>;
