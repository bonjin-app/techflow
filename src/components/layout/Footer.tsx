import Link from "next/link";
import { site } from "@/lib/site";
import { Logo } from "./Header";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/explore", label: "Knowledge graph" },
      { href: "/technology", label: "Technologies" },
      { href: "/concept", label: "Concepts" },
      { href: "/pattern", label: "Patterns" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/architecture", label: "Architectures" },
      { href: "/system-design", label: "System design" },
      { href: "/compare", label: "Comparisons" },
      { href: "/roadmap", label: "Roadmaps" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-fg-muted">{site.tagline} {site.name} is an interactive developer knowledge graph — every page links to the technologies, concepts and architectures around it.</p>
          <p className="mt-4 text-xs text-fg-faint">
            Content reflects TechFlow&apos;s assessment on the review date shown on each page. Technology changes; check
            primary sources before making production decisions.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-fg-faint">{c.title}</div>
            <ul className="space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-fg-muted hover:text-fg">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-fg-faint sm:px-6">
          <span>© {new Date().getFullYear()} {site.name}</span>
          <span className="flex items-center gap-3">
            <a href={site.repo} className="hover:text-fg" rel="noreferrer" target="_blank">
              GitHub
            </a>
            <span className="hidden items-center gap-1 sm:inline-flex">
              <kbd>⌘</kbd>
              <kbd>K</kbd>
              <span className="ml-1">to search</span>
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
