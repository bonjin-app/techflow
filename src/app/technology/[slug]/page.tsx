import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocDetail } from "@/components/detail/DocDetail";
import { getNode, getTechnologies } from "@/lib/content/graph";
import { nodeMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getTechnologies().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/technology/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "technology") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/technology/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "technology") notFound();
  return <DocDetail node={node} />;
}
