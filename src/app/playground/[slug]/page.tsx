import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { Breadcrumbs } from "@/components/detail/PageHeader";
import { CacheSimulator } from "@/components/playground/CacheSimulator";
import { LoadBalancerSimulator } from "@/components/playground/LoadBalancerSimulator";
import { JwtDecoder } from "@/components/playground/JwtDecoder";
import { HttpPlayground } from "@/components/playground/HttpPlayground";
import { RateLimiterSimulator } from "@/components/playground/RateLimiterSimulator";
import { TransportSimulator } from "@/components/playground/TransportSimulator";
import { PLAYGROUNDS } from "../registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return PLAYGROUNDS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/playground/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = PLAYGROUNDS.find((x) => x.slug === slug);
  if (!p) return {};
  return pageMetadata({ title: `${p.title} — Playground`, description: p.blurb, path: `/playground/${p.slug}` });
}

export default async function Page({ params }: PageProps<"/playground/[slug]">) {
  const { slug } = await params;
  const p = PLAYGROUNDS.find((x) => x.slug === slug);
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Breadcrumbs items={[{ name: "Home", path: "/" }, { name: "Playground", path: "/playground" }, { name: p.title, path: "#" }]} />
      <header className="mb-8">
        <div className="font-mono text-[11px] uppercase tracking-wider text-fg-faint">Developer playground</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ letterSpacing: "-0.03em" }}>
          {p.title}
        </h1>
        <p className="mt-3 max-w-3xl text-fg-muted">{p.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="text-fg-faint">Concepts:</span>
          {p.concepts.map((c) => (
            <Link key={c.href} href={c.href} className="rounded border border-border px-2 py-0.5 text-fg-muted hover:text-fg">
              {c.label}
            </Link>
          ))}
        </div>
      </header>
      {slug === "cache" && <CacheSimulator />}
      {slug === "load-balancer" && <LoadBalancerSimulator />}
      {slug === "http" && <HttpPlayground />}
      {slug === "rate-limiter" && <RateLimiterSimulator />}
      {slug === "transport" && <TransportSimulator />}
      {slug === "jwt" && <JwtDecoder />}
      <div className="mt-10 flex flex-wrap gap-2 text-sm">
        <span className="text-fg-faint">More:</span>
        {PLAYGROUNDS.filter((x) => x.slug !== slug).map((x) => (
          <Link key={x.slug} href={`/playground/${x.slug}`} className="text-accent hover:underline">
            {x.title} →
          </Link>
        ))}
      </div>
    </div>
  );
}
