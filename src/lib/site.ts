export const site = {
  name: "TechFlow",
  tagline: "Understand technology. See how it connects.",
  description:
    "TechFlow is an interactive developer knowledge graph that explains how technologies, concepts, patterns, architectures and system designs connect — with live diagrams, trade-offs and learning paths.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://techflow.dev",
  repo: "https://github.com/bonjin-app/techflow",
  twitter: "@techflow",
} as const;

/**
 * The guided journey from the product spec: the walk that is supposed to make
 * "this is how technologies connect" land. The homepage renders it and
 * `pnpm validate` asserts every hop is one click, so it cannot rot quietly.
 */
export const FIRST_JOURNEY = [
  "redis",
  "cache",
  "cache-aside",
  "e-commerce",
  "postgresql",
  "transaction",
  "distributed-system",
  "kafka",
  "event-driven-architecture",
  "microservices",
  "rate-limiter",
] as const;

export const nav = [
  { href: "/technology", label: "Technologies", key: "t" },
  { href: "/concept", label: "Concepts", key: "c" },
  { href: "/pattern", label: "Patterns", key: "p" },
  { href: "/architecture", label: "Architecture", key: "a" },
  { href: "/system-design", label: "Design", key: "s" },
  { href: "/compare", label: "Compare", key: "v" },
  { href: "/roadmap", label: "Roadmaps", key: "r" },
  { href: "/map", label: "Mind Map", key: "m" },
  { href: "/stack", label: "Stacks", key: "k" },
  { href: "/radar", label: "Radar", key: "d" },
  { href: "/playground", label: "Playground", key: "y" },
] as const;
