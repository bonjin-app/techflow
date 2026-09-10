/**
 * Turns plain-text roadmap steps and stack items into graph links when a node of
 * that name exists. Run it after adding technologies or concepts that earlier
 * content could only mention as text.
 *
 *   pnpm link:labels          # report what would change
 *   pnpm link:labels --write  # apply
 */
import fs from "node:fs";
import path from "node:path";
import { buildGraph } from "../src/lib/content/graph";
import type { RoadmapStep, Stack } from "../src/lib/content/types";

const WRITE = process.argv.includes("--write");
const ROOT = path.join(process.cwd(), "content");

/** Labels that must never be auto-linked, because the node means something narrower. */
const SKIP = new Set(["cloud", "testing", "security"]);

function main() {
  const g = buildGraph();
  const byName = new Map<string, string>();
  for (const n of g.nodes.values()) byName.set(n.name.toLowerCase(), n.id);

  let changed = 0;

  for (const file of fs.readdirSync(path.join(ROOT, "roadmaps")).filter((f) => f.endsWith(".json"))) {
    const full = path.join(ROOT, "roadmaps", file);
    const data = JSON.parse(fs.readFileSync(full, "utf8")) as { id: string; steps: RoadmapStep[] };
    let touched = false;
    for (const step of data.steps) {
      if (step.ref || SKIP.has(step.label.toLowerCase())) continue;
      const hit = byName.get(step.label.toLowerCase());
      if (!hit) continue;
      console.log(`  ${data.id}: '${step.label}' → ref ${hit}`);
      step.ref = hit;
      touched = true;
      changed++;
    }
    if (touched && WRITE) fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  }

  const stacksDir = path.join(ROOT, "stacks");
  if (fs.existsSync(stacksDir)) {
    for (const file of fs.readdirSync(stacksDir).filter((f) => f.endsWith(".json"))) {
      const full = path.join(stacksDir, file);
      const data = JSON.parse(fs.readFileSync(full, "utf8")) as Stack;
      let touched = false;
      for (const layer of data.layers) {
        for (const item of layer.items) {
          if (item.ref || !item.label || SKIP.has(item.label.toLowerCase())) continue;
          const hit = byName.get(item.label.toLowerCase());
          if (!hit) continue;
          console.log(`  stack ${data.id}: '${item.label}' → ref ${hit}`);
          item.ref = hit;
          delete item.label;
          touched = true;
          changed++;
        }
      }
      if (touched && WRITE) fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
    }
  }

  if (changed === 0) console.log("✔ nothing to link — every label that has a node already points at it");
  else console.log(`\n${changed} label(s) ${WRITE ? "linked" : "would be linked (run with --write)"}`);
}

main();
