import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocDetail } from "@/components/detail/DocDetail";
import { getNode, getConcepts } from "@/lib/content/graph";
import { nodeMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getConcepts().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/concept/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "concept") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/concept/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "concept") notFound();
  return <DocDetail node={node} />;
}
