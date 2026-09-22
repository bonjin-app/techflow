import type { Metadata } from "next";
import { site } from "./site";
import { TYPE_LABEL, TYPE_ROUTE, hrefFor, type AnyNode } from "./content/types";

export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  keywords?: string[];
}): Metadata {
  const url = `${site.url}${opts.path}`;
  // Setting an openGraph object here overrides the root opengraph-image.tsx
  // rather than merging with it, so every page has to name the card explicitly —
  // otherwise summary_large_image renders blank everywhere but the homepage.
  const image = `${site.url}/opengraph-image`;
  // The root layout applies the "%s | TechFlow" template; keep titles bare here.
  const title = opts.title;
  return {
    title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${site.name}`,
      description: opts.description,
      url,
      siteName: site.name,
      type: opts.type ?? "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${site.name} — ${site.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${site.name}`,
      description: opts.description,
      site: site.twitter,
      images: [image],
    },
  };
}

/** "Redis Explained: Cache, Pub/Sub, Distributed Lock" */
/**
 * What is left for the title once the layout has appended " | TechFlow", within
 * the ~60 characters a search result shows before it cuts. Three tags were
 * appended regardless of length, so 113 of 248 pages were truncated mid-phrase
 * — and the tags are the least valuable part, so they are what gives way.
 */
const TITLE_BUDGET = 60 - " | TechFlow".length;

/** The full form where it fits, the short one where it does not. */
export const fit = (full: string, short: string) => (full.length <= TITLE_BUDGET ? full : short);

/** Roughly what a search result shows of a description before it cuts. */
export const DESCRIPTION_BUDGET = 160;

/**
 * A sentence of generated context, dropped when it would push an authored
 * tagline past what a search result shows. The tagline is the part worth
 * keeping; the boilerplate is the part that was making it disappear.
 */
export function describe(tagline: string, context: string): string {
  const base = tagline.endsWith(".") ? tagline : `${tagline}.`;
  const full = `${base} ${context}`;
  return full.length <= DESCRIPTION_BUDGET ? full : base;
}

export function nodeTitle(n: AnyNode): string {
  if (n.type === "technology" || n.type === "concept" || n.type === "pattern") {
    const verb = n.type === "technology" ? "Explained" : n.type === "pattern" ? "Pattern" : "";
    const head = `${n.name} ${verb}`.trim();
    let title = head;
    for (const tag of n.tags) {
      const next = title === head ? `${head}: ${tag}` : `${title}, ${tag}`;
      if (next.length > TITLE_BUDGET) break;
      title = next;
    }
    return title;
  }
  if (n.type === "architecture") return fit(`${n.name} Architecture: how it works`, `${n.name} Architecture`);
  if (n.type === "comparison") return fit(`${n.name}: which one should you use?`, n.name);
  if (n.type === "roadmap") return `${n.name} Roadmap`;
  return fit(`Design a ${n.name}: step-by-step system design`, `Design a ${n.name}`);
}

export function nodeMetadata(n: AnyNode): Metadata {
  return pageMetadata({
    title: nodeTitle(n),
    description: n.tagline.endsWith(".") ? n.tagline : `${n.tagline}.`,
    path: hrefFor(n.type, n.id),
    type: "article",
    keywords: [n.name, ...n.tags, TYPE_LABEL[n.type]],
  });
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      // The current page needs no URL, and several callers pass "#" for it —
      // which would otherwise be published as a link to the site root.
      ...(it.path === "#" ? {} : { item: `${site.url}${it.path}` }),
    })),
  };
}

export function techArticleJsonLd(n: AnyNode) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: nodeTitle(n),
    description: n.tagline,
    url: `${site.url}${hrefFor(n.type, n.id)}`,
    keywords: n.tags.join(", "),
    dateModified: n.meta?.lastReviewed,
    proficiencyLevel: n.difficulty <= 2 ? "Beginner" : n.difficulty >= 4 ? "Expert" : "Intermediate",
    author: { "@type": "Organization", name: site.name, url: site.url },
    publisher: { "@type": "Organization", name: site.name, url: site.url },
    isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
  };
}

export function breadcrumbsFor(n: AnyNode) {
  return [
    { name: "Home", path: "/" },
    { name: TYPE_LABEL[n.type], path: TYPE_ROUTE[n.type] },
    { name: n.name, path: hrefFor(n.type, n.id) },
  ];
}
