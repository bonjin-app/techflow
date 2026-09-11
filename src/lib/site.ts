export const site = {
  name: "TechFlow",
  tagline: "Understand technology. See how it connects.",
  description:
    "TechFlow is an interactive developer knowledge graph that explains how technologies, concepts, patterns, architectures and system designs connect — with live diagrams, trade-offs and learning paths.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://techflow.dev",
  repo: "https://github.com/bonjin-app/techflow",
  twitter: "@techflow",
} as const;

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
