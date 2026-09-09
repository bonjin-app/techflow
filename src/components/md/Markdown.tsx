import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { isVisualFence, parseCompare, parseDecision, parseSequence, parseSteps, parseTimeline } from "@/lib/fences";
import type { RefMap } from "./refs";
import { Steps } from "./fences/Steps";
import { Compare } from "./fences/Compare";
import { Timeline } from "./fences/Timeline";
import { Sequence } from "./fences/Sequence";
import { Decision } from "./fences/Decision";

function childText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return childText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return "";
}

export function Markdown({
  source,
  refs,
  className = "",
  variant,
}: {
  source: string;
  refs: RefMap;
  className?: string;
  /** "plus" / "minus" style bullet markers for advantage / trade-off lists */
  variant?: "plus" | "minus";
}) {
  const components: Components = {
    a({ href, children }) {
      if (href?.startsWith("/")) {
        return <Link href={href}>{children}</Link>;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
    pre({ children }) {
      // Visual fences are rendered by `code`; avoid wrapping them in <pre>.
      const child = Array.isArray(children) ? children[0] : children;
      const cls = (child as { props?: { className?: string } })?.props?.className ?? "";
      const lang = /language-(\w+)/.exec(cls)?.[1];
      if (isVisualFence(lang)) return <>{children}</>;
      return <pre>{children}</pre>;
    },
    code({ className: cls, children }) {
      const lang = /language-(\w+)/.exec(cls ?? "")?.[1];
      if (isVisualFence(lang)) {
        const src = childText(children).replace(/\n$/, "");
        switch (lang) {
          case "steps":
            return <Steps data={parseSteps(src)} refs={refs} />;
          case "sequence":
            return <Sequence data={parseSequence(src)} refs={refs} />;
          case "compare":
            return <Compare data={parseCompare(src)} refs={refs} />;
          case "decision":
            return <Decision data={parseDecision(src)} refs={refs} />;
          case "timeline":
            return <Timeline data={parseTimeline(src)} />;
        }
      }
      if (lang) {
        return (
          <code className={cls} data-lang={lang}>
            {children}
          </code>
        );
      }
      return <code>{children}</code>;
    },
    ul({ children }) {
      return <ul className={variant === "plus" ? "list-plus" : variant === "minus" ? "list-minus" : undefined}>{children}</ul>;
    },
  };

  return (
    <div className={`prose ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
