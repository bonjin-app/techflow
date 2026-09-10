/**
 * TechFlow Knowledge Graph — core content types.
 *
 * Every piece of content is a *node* in one graph. Markdown files describe
 * technologies / concepts / patterns; JSON files describe architectures,
 * roadmaps, system designs and "I want to build" goals. Edges are declared
 * explicitly in frontmatter (`related`) and derived automatically from
 * usage (architecture nodes, prerequisites, roadmap steps ...).
 */

export type NodeType =
  | "technology"
  | "concept"
  | "pattern"
  | "architecture"
  | "comparison"
  | "roadmap"
  | "system-design";

export type Relation =
  | "RELATED_TO"
  | "USED_IN"
  | "USED_WITH"
  | "ALTERNATIVE_TO"
  | "REQUIRES"
  | "IMPLEMENTS"
  | "SOLVES"
  | "PART_OF";

export const RELATION_LABEL: Record<Relation, string> = {
  RELATED_TO: "related to",
  USED_IN: "used in",
  USED_WITH: "used with",
  ALTERNATIVE_TO: "alternative to",
  REQUIRES: "requires",
  IMPLEMENTS: "implements",
  SOLVES: "solves",
  PART_OF: "part of",
};

export interface Edge {
  from: string;
  to: string;
  rel: Relation;
  /** true when the edge was derived (not declared in frontmatter). */
  derived?: boolean;
}

export interface ContentMeta {
  lastReviewed?: string;
  version?: string;
  confidence?: "high" | "medium" | "low";
}

/** Fields shared by every node regardless of type. */
export interface BaseNode {
  id: string;
  type: NodeType;
  name: string;
  /** One line, shown under the title and in tooltips. */
  tagline: string;
  /** Coarse grouping used for colours / filters (e.g. database, messaging, networking). */
  category: string;
  tags: string[];
  /** 1 (beginner) – 5 (expert) */
  difficulty: number;
  meta?: ContentMeta;
}

/** Markdown-backed node: technology | concept | pattern. */
export interface DocNode extends BaseNode {
  type: "technology" | "concept" | "pattern";
  /** Concept ids describing what the technology is used for (technology only). */
  usedFor: string[];
  /** Ordered chain of node ids that should be understood first. */
  prerequisites: string[];
  /** Ordered learning path: node ids or free text labels. */
  learningPath: string[];
  /** Declared edges from this node. */
  related: { to: string; rel: Relation }[];
  /** Body split by H2 headings → markdown source per section. */
  sections: Record<string, string>;
  /** Ordered list of section headings as authored. */
  sectionOrder: string[];
}

export type ArchNodeKind =
  | "client"
  | "edge"
  | "lb"
  | "service"
  | "cache"
  | "db"
  | "queue"
  | "storage"
  | "external"
  | "worker";

export interface ArchNode {
  id: string;
  label: string;
  kind: ArchNodeKind;
  /** grid column (0..n) */
  x: number;
  /** grid row (0..n) */
  y: number;
  /** Optional link to a knowledge-graph node (technology/concept). */
  ref?: string;
  role?: string;
  why?: string;
  alternatives?: string[];
  related?: string[];
}

export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
  /** dashed = async / event */
  style?: "solid" | "dashed";
}

export interface ArchFlow {
  id: string;
  name: string;
  /** Ordered node ids the packet travels through. */
  path: string[];
  /** One explanation per hop (path.length - 1) or per node. */
  steps: string[];
}

export interface ArchDecision {
  decision: string;
  why: string;
  alternatives: string[];
  tradeoff: string;
}

export interface ArchVersion {
  version: string;
  title: string;
  summary: string;
  /** Node ids from `nodes` that exist at this version. */
  nodes: string[];
}

export interface ArchitectureNode extends BaseNode {
  type: "architecture";
  summary: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  flows: ArchFlow[];
  decisions: ArchDecision[];
  versions?: ArchVersion[];
  /** Screen-reader / no-JS description of the diagram. */
  textAlternative: string;
  related: { to: string; rel: Relation }[];
}

export interface ComparisonNode extends BaseNode {
  type: "comparison";
  /** Node ids being compared (2+). */
  subjects: string[];
  sections: Record<string, string>;
  sectionOrder: string[];
  related: { to: string; rel: Relation }[];
}

export interface RoadmapStep {
  /** Knowledge-graph node id, or free text when the topic has no page yet. */
  ref?: string;
  label: string;
  note?: string;
  /** Optional grouping shown as a stage label. */
  stage?: string;
}

export interface RoadmapNode extends BaseNode {
  type: "roadmap";
  summary: string;
  steps: RoadmapStep[];
}

export interface SystemDesignStep {
  title: string;
  /** e.g. "1,000 users" — shown on the scale journey rail */
  scale?: string;
  problem: string;
  why: string;
  alternatives?: string[];
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface SystemDesignNode extends BaseNode {
  type: "system-design";
  summary: string;
  requirements: string[];
  steps: SystemDesignStep[];
  related: { to: string; rel: Relation }[];
}

export interface BuildGoal {
  id: string;
  name: string;
  tagline: string;
  architecture: string;
  systemDesign?: string;
  technologies: string[];
  concepts: string[];
  patterns: string[];
  learningPath: string[];
}

/* ── Technology Radar ─────────────────────────────────────── */
export type RadarRing = "adopt" | "trial" | "assess" | "caution";
export type RadarQuadrant = "languages-interfaces" | "platforms-delivery" | "data-messaging" | "architecture-operations";
export interface RadarEntry {
  /** knowledge-graph node id */
  ref: string;
  ring: RadarRing;
  quadrant: RadarQuadrant;
  /** one sentence: why this ring, as of the assessment date */
  note: string;
  /** movement since the previous assessment */
  moved?: "in" | "out" | "new";
}
export interface RadarData {
  assessedOn: string;
  method: string;
  entries: RadarEntry[];
}

/* ── Real-world stacks ────────────────────────────────────── */
export interface StackItem {
  /** knowledge-graph node id, when TechFlow has a page for it */
  ref?: string;
  /** free-text label for tools without a page yet */
  label?: string;
  /** why this piece is in the stack */
  note?: string;
}
export interface StackLayer {
  label: string;
  items: StackItem[];
}
export interface Stack {
  id: string;
  name: string;
  tagline: string;
  summary: string;
  /** Provenance: what this stack is and is not. Always shown to the reader. */
  basis: string;
  updated: string;
  confidence: "high" | "medium" | "low";
  layers: StackLayer[];
  whenToUse: string[];
  tradeoffs: string[];
  /** architecture / system-design ids to explore next */
  related: string[];
}

/* ── Daily challenge ──────────────────────────────────────── */
export interface ChallengeOption {
  label: string;
  correct: boolean;
  why: string;
  ref?: string;
}
export interface Challenge {
  id: string;
  question: string;
  context: string;
  options: ChallengeOption[];
  related: string[];
  difficulty: number;
}

export type AnyNode =
  | DocNode
  | ArchitectureNode
  | ComparisonNode
  | RoadmapNode
  | SystemDesignNode;

/** Lightweight projection used by search, graphs and tooltips. */
export interface NodeSummary {
  id: string;
  type: NodeType;
  name: string;
  tagline: string;
  category: string;
  tags: string[];
  difficulty: number;
  href: string;
  degree: number;
}

export const TYPE_ROUTE: Record<NodeType, string> = {
  technology: "/technology",
  concept: "/concept",
  pattern: "/pattern",
  architecture: "/architecture",
  comparison: "/compare",
  roadmap: "/roadmap",
  "system-design": "/system-design",
};

export const TYPE_LABEL: Record<NodeType, string> = {
  technology: "Technology",
  concept: "Concept",
  pattern: "Pattern",
  architecture: "Architecture",
  comparison: "Comparison",
  roadmap: "Roadmap",
  "system-design": "System Design",
};

export function hrefFor(type: NodeType, id: string): string {
  return `${TYPE_ROUTE[type]}/${id}`;
}
