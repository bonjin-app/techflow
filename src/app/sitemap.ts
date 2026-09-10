import type { MetadataRoute } from "next";

export const dynamic = "force-static";
import { getBuilds, getGraph, getStacks } from "@/lib/content/graph";
import { hrefFor } from "@/lib/content/types";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const g = getGraph();
  const statics = ["", "/explore", "/map", "/technology", "/concept", "/pattern", "/architecture", "/compare", "/roadmap", "/system-design", "/search", "/radar", "/stack", "/challenge", "/api-docs", "/playground", "/playground/http", "/playground/cache", "/playground/load-balancer", "/playground/rate-limiter", "/playground/transport", "/playground/jwt"];
  const entries: MetadataRoute.Sitemap = statics.map((p) => ({
    url: `${site.url}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.7,
  }));
  for (const n of g.nodes.values()) {
    entries.push({
      url: `${site.url}${hrefFor(n.type, n.id)}`,
      lastModified: n.meta?.lastReviewed ? new Date(n.meta.lastReviewed) : undefined,
      changeFrequency: "monthly",
      priority: n.type === "technology" || n.type === "architecture" ? 0.9 : 0.8,
    });
  }
  for (const b of getBuilds()) entries.push({ url: `${site.url}/build/${b.id}`, changeFrequency: "monthly", priority: 0.8 });
  for (const s of getStacks())
    entries.push({ url: `${site.url}/stack/${s.id}`, lastModified: new Date(s.updated), changeFrequency: "monthly", priority: 0.8 });
  return entries;
}
