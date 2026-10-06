/**
 * Builds a setup guide from its own code blocks and runs it.
 *
 * A guide is only worth following if following it works, and checking that by
 * reading is how the first eleven shipped with a `quit()` node-redis 5 no longer
 * has and a column named after a ClickHouse keyword. So the guide's code fences
 * carry what to do with them, after the language:
 *
 *   ```yaml file=compose.yaml   written to that path in a scratch directory
 *   ```sh run                   executed, to stand the guide up
 *
 * Files and run blocks are applied in the order the guide shows them; checks
 * run last, in order.
 *
 *   ```sh check                 executed after, and must exit 0
 *   ```sh check hidden          the same, but not shown to readers — waits and
 *                                assertions that would clutter the page
 *
 * A file under bin/ is written executable and put first on PATH, so a guide can
 * pin the version of a tool (`bin/terraform` running a specific container image)
 * and still show the reader the plain command.
 *
 * Blocks without a marker are prose for the reader and are never executed.
 *
 *   pnpm tsx scripts/run-setup.ts <guide-id>     run one guide (needs Docker)
 *   pnpm tsx scripts/run-setup.ts --list         guides with runnable blocks, as JSON
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import matter from "gray-matter";
import { parseBlocks, runnable } from "../src/lib/setup-blocks";

export { parseBlocks, runnable };

const DIR = path.join(process.cwd(), "content", "setups");
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

function guides() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ id: f.replace(/\.md$/, ""), blocks: parseBlocks(matter(fs.readFileSync(path.join(DIR, f), "utf8")).content) }));
}

function sh(script: string, cwd: string, label: string): boolean {
  console.log(`\n::group::${label}\n${script.trim()}`);
  // `set -e` ends a block silently on the first failing command, and the log then
  // shows only what ran before it. Say which line it was, and what it was.
  const traced = `trap 'echo "✖ line $LINENO exited $?: $BASH_COMMAND" >&2' ERR\nset -E\n${script}`;
  const r = spawnSync("bash", ["-euo", "pipefail", "-c", traced], {
    cwd,
    stdio: "inherit",
    timeout: STEP_TIMEOUT_MS,
    // A guide may ship its own commands in bin/: `terraform` as a pinned container, say.
    env: { ...process.env, PATH: `${path.join(cwd, "bin")}${path.delimiter}${process.env.PATH}` },
  });
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

  // Lower case throughout: `create-next-app .` names the package after the
  // directory, and npm refuses capital letters — which mkdtemp's suffix has.
  const work = path.join(os.tmpdir(), `setup-${arg}-${randomBytes(4).toString("hex")}`);
  fs.mkdirSync(work, { recursive: true });

  // In the order a reader meets them. A guide that starts from a generator
  // (`create-next-app .`) needs its own files written after the generator has
  // run, not before — and writing them all first would make it refuse a
  // directory that is not empty.
  let ok = true;
  const run = guide.blocks.filter((b) => b.run);
  const check = guide.blocks.filter((b) => b.check);
  let ran = 0;
  for (const b of guide.blocks) {
    if (!ok) break;
    if (b.file) {
      const target = path.join(work, b.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Under bin/ means a command: executable, and found before the system's own.
      fs.writeFileSync(target, b.body, { mode: b.file.startsWith("bin/") ? 0o755 : 0o644 });
      console.log(`wrote ${b.file}`);
    } else if (b.run) {
      ok = sh(b.body, work, `run ${++ran}/${run.length}`);
    }
  }
  for (const [i, b] of check.entries()) if (ok) ok = sh(b.body, work, `check ${i + 1}/${check.length}${b.hidden ? " (hidden)" : ""}`);

  if (!ok && fs.existsSync(path.join(work, "compose.yaml"))) sh("docker compose logs --tail 80 || true", work, "compose logs");
  // A guide that starts containers by hand has no compose file; show what they said.
  if (!ok && !fs.existsSync(path.join(work, "compose.yaml"))) {
    sh("for c in $(docker ps -aq); do echo \"--- $(docker inspect -f '{{.Name}} {{.Config.Image}}' $c)\"; docker logs --tail 40 $c 2>&1 || true; done", work, "container logs");
  }
  // A guide on a cluster has no compose file; what failed is in the pods.
  if (!ok && fs.existsSync(path.join(work, "api.yaml")) && !fs.existsSync(path.join(work, "compose.yaml"))) {
    sh(
      "kubectl get pods,svc,endpointslices -o wide || true; kubectl describe pods || true; " +
        "for p in $(kubectl get pods -o name); do echo \"--- $p\"; kubectl logs $p --tail=40 || true; done",
      work,
      "cluster state",
    );
  }
  if (fs.existsSync(path.join(work, "compose.yaml"))) sh("docker compose down -v --remove-orphans || true", work, "tear down");

  if (!ok) process.exit(1);
  console.log(`\n✔ ${arg}: ${run.length} run and ${check.length} check block(s) passed`);
}

if (process.argv[1] && process.argv[1].endsWith("run-setup.ts")) main();
