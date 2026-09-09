import type { Metadata } from "next";
import { IndexPage } from "@/components/detail/IndexPage";
import { getPatterns } from "@/lib/content/graph";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Patterns",
  description: "Reusable solutions to recurring problems — problem, solution, mechanism, advantages, disadvantages, when to use and when not to.",
  path: "/pattern",
});

export default function Page() {
  return (
    <IndexPage
      type="pattern"
      title="Patterns"
      intro="Reusable solutions to recurring problems — problem, solution, mechanism, advantages, disadvantages, when to use and when not to."
      nodes={getPatterns()}
    />
  );
}
