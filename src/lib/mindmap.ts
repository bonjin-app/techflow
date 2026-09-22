import type { Relation } from "@/lib/content/types";

export interface Branch {
  key: string;
  label: string;
  match: (rel: Relation, dir: "out" | "in") => boolean;
}

/**
 * Which branch of the mind map a neighbour belongs on.
 *
 * Here rather than in the component because a relation these do not match is a
 * neighbour that silently disappears from the diagram — the reader sees fewer
 * connections than the page has, with nothing to indicate it. Adding a relation
 * to the vocabulary without adding it here is exactly how that would happen,
 * and a test can say so where a component cannot.
 */
/** Relation + direction → the branch it belongs on. Order sets the drawing order. */
export const BRANCHES: Branch[] = [
  { key: "requires", label: "Build on", match: (r, d) => r === "REQUIRES" && d === "out" },
  { key: "alternatives", label: "Instead of", match: (r) => r === "ALTERNATIVE_TO" },
  { key: "with", label: "Works with", match: (r) => r === "USED_WITH" },
  { key: "implements", label: "Implements", match: (r, d) => (r === "IMPLEMENTS" || r === "SOLVES") && d === "out" },
  { key: "usedin", label: "Appears in", match: (r, d) => (r === "USED_IN" || r === "PART_OF") && d === "out" },
  { key: "uses", label: "Used here", match: (r, d) => (r === "USED_IN" || r === "PART_OF" || r === "IMPLEMENTS" || r === "SOLVES") && d === "in" },
  { key: "requiredby", label: "Leads to", match: (r, d) => r === "REQUIRES" && d === "in" },
  { key: "related", label: "Related", match: (r) => r === "RELATED_TO" },
];

