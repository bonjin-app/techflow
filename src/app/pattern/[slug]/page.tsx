import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocDetail } from "@/components/detail/DocDetail";
import { getNode, getPatterns } from "@/lib/content/graph";
import { nodeMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getPatterns().map((n) => ({ slug: n.id }));
}

export async function generateMetadata({ params }: PageProps<"/pattern/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "pattern") return {};
  return nodeMetadata(node);
}

export default async function Page({ params }: PageProps<"/pattern/[slug]">) {
  const { slug } = await params;
  const node = getNode(slug);
  if (!node || node.type !== "pattern") notFound();
  return <DocDetail node={node} />;
}
