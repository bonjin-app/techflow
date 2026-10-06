/**
 * The markers a setup guide's code fences carry after the language, which CI
 * builds and runs the guide from (scripts/run-setup.ts):
 *
 *   file=compose.yaml   written to that path
 *   run                 executed, in order, to stand the guide up
 *   check               executed afterwards; must exit 0
 *   hidden              not shown to readers — CI's own waits and assertions
 */
export interface Block {
  lang: string;
  file?: string;
  run: boolean;
  check: boolean;
  hidden: boolean;
  body: string;
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const m of markdown.matchAll(/^```([\w-]+)([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm)) {
    const meta = m[2].trim().split(/\s+/).filter(Boolean);
    blocks.push({
      lang: m[1],
      file: meta.find((t) => t.startsWith("file="))?.slice(5),
      run: meta.includes("run"),
      check: meta.includes("check"),
      hidden: meta.includes("hidden"),
      body: m[3],
    });
  }
  return blocks;
}

export function runnable(blocks: Block[]) {
  return blocks.some((b) => b.run) && blocks.some((b) => b.check);
}
