/**
 * Builds a setup guide from its own code blocks and runs it.
 *
 * A guide is only worth following if following it works, and checking that by
 * reading is how the first eleven shipped with a `quit()` node-redis 5 no longer
 * has and a column named after a ClickHouse keyword. So the guide's code fences
 * carry what to do with them, after the language:
 *
 *   ```yaml file=compose.yaml   written to that path in a scratch directory
 *   ```sh run                   executed, in order, to stand the guide up
 *   ```sh check                 executed after, and must exit 0
 *   ```sh check hidden          the same, but not shown to readers — waits and
 *                                assertions that would clutter the page
 *
 * Blocks without a marker are prose for the reader and are never executed.
 *
 *   pnpm tsx scripts/run-setup.ts <guide-id>     run one guide (needs Docker)
 *   pnpm tsx scripts/run-setup.ts --list         guides with runnable blocks, as JSON
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import matter from "gray-matter";

const DIR = path.join(process.cwd(), "content", "setups");
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

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

function guides() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ id: f.replace(/\.md$/, ""), blocks: parseBlocks(matter(fs.readFileSync(path.join(DIR, f), "utf8")).content) }));
}

function sh(script: string, cwd: string, label: string): boolean {
  console.log(`\n::group::${label}\n${script.trim()}`);
  const r = spawnSync("bash", ["-euo", "pipefail", "-c", script], { cwd, stdio: "inherit", timeout: STEP_TIMEOUT_MS });
  console.log("::endgroup::");
  if (r.status !== 0) {
    console.error(`✖ ${label} failed${r.signal ? ` (${r.signal})` : ` with exit code ${r.status}`}`);
    return false;
  }
  return true;
}

function main() {
  const arg = process.argv[2];
  if (arg === "--list") {
    console.log(JSON.stringify(guides().filter((g) => runnable(g.blocks)).map((g) => g.id)));
    return;
  }
  const guide = guides().find((g) => g.id === arg);
  if (!guide) throw new Error(`no setup guide '${arg}'`);
  if (!runnable(guide.blocks)) throw new Error(`${arg} has no run and check blocks`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `setup-${arg}-`));
  for (const b of guide.blocks.filter((x) => x.file)) {
    const target = path.join(work, b.file!);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, b.body);
    console.log(`wrote ${b.file}`);
  }

  let ok = true;
  const run = guide.blocks.filter((b) => b.run);
  const check = guide.blocks.filter((b) => b.check);
  for (const [i, b] of run.entries()) if (ok) ok = sh(b.body, work, `run ${i + 1}/${run.length}`);
  for (const [i, b] of check.entries()) if (ok) ok = sh(b.body, work, `check ${i + 1}/${check.length}${b.hidden ? " (hidden)" : ""}`);

  if (!ok && fs.existsSync(path.join(work, "compose.yaml"))) sh("docker compose logs --tail 80 || true", work, "compose logs");
  if (fs.existsSync(path.join(work, "compose.yaml"))) sh("docker compose down -v --remove-orphans || true", work, "tear down");

  if (!ok) process.exit(1);
  console.log(`\n✔ ${arg}: ${run.length} run and ${check.length} check block(s) passed`);
}

if (process.argv[1] && process.argv[1].endsWith("run-setup.ts")) main();
