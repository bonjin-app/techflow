import type { Metadata } from "next";
import { IndexPage } from "@/components/detail/IndexPage";
import { getTechnologies } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Technologies",
  description: "Databases, brokers, protocols and infrastructure — each explained with why it exists, its trade-offs, and how it connects to everything else.",
  path: "/technology",
});

export default function Page() {
  return (
    <IndexPage
      type="technology"
      title="Technologies"
      intro="Databases, brokers, protocols and infrastructure — each explained with why it exists, its trade-offs, and how it connects to everything else."
      nodes={getTechnologies()}
    />
  );
}
