import type { Metadata } from "next";
import { IndexPage } from "@/components/detail/IndexPage";
import { getConcepts } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Concepts",
  description: "The ideas underneath the tools: caching, transactions, consistency, concurrency, networking. Each one is visualised, not just defined.",
  path: "/concept",
});

export default function Page() {
  return (
    <IndexPage
      type="concept"
      title="Concepts"
      intro="The ideas underneath the tools: caching, transactions, consistency, concurrency, networking. Each one is visualised, not just defined."
      nodes={getConcepts()}
    />
  );
}
