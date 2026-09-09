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
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${site.name}`,
      description: opts.description,
      site: site.twitter,
    },
  };
}

/** "Redis Explained: Cache, Pub/Sub, Distributed Lock" */
export function nodeTitle(n: AnyNode): string {
  if (n.type === "technology" || n.type === "concept" || n.type === "pattern") {
    const facets = n.tags.slice(0, 3).join(", ");
    const verb = n.type === "technology" ? "Explained" : n.type === "pattern" ? "Pattern" : "";
    return facets ? `${n.name} ${verb}: ${facets}`.replace(/\s+:/, ":") : `${n.name} ${verb}`.trim();
  }
  if (n.type === "architecture") return `${n.name} Architecture: how it works`;
  if (n.type === "comparison") return `${n.name}: which one should you use?`;
  if (n.type === "roadmap") return `${n.name} Roadmap`;
  return `Design a ${n.name}: step-by-step system design`;
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
      item: `${site.url}${it.path}`,
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
