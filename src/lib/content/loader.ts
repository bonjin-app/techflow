import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type {
  AnyNode,
  ArchitectureNode,
  BuildGoal,
  Challenge,
  ComparisonNode,
  ContentMeta,
  DocNode,
  RadarData,
  Relation,
  RoadmapNode,
  SystemDesignNode,
} from "./types";

export const CONTENT_ROOT = path.join(process.cwd(), "content");

const DOC_DIRS: Record<string, DocNode["type"]> = {
  technologies: "technology",
  concepts: "concept",
  patterns: "pattern",
};

const VALID_RELATIONS = new Set<Relation>([
  "RELATED_TO",
  "USED_IN",
  "USED_WITH",
  "ALTERNATIVE_TO",
  "REQUIRES",
  "IMPLEMENTS",
  "SOLVES",
  "PART_OF",
]);

function listFiles(dir: string, ext: string): string[] {
  const full = path.join(CONTENT_ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => path.join(full, f));
}

/** Split a markdown body into `{ [h2 heading]: markdown }`, preserving order. */
export function splitSections(body: string): {
  sections: Record<string, string>;
  order: string[];
} {
  const lines = body.split(/\r?\n/);
  const sections: Record<string, string> = {};
  const order: string[] = [];
  let current = "_intro";
  let buf: string[] = [];
  let inFence = false;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length > 0) {
      sections[current] = text;
      if (!order.includes(current)) order.push(current);
    }
    buf = [];
  };
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const m = !inFence && /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return { sections, order };
}

/** YAML parses bare dates into Date objects — keep meta as plain strings. */
function asMeta(v: unknown): ContentMeta | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Record<string, unknown>;
  const lr = m.lastReviewed;
  return {
    lastReviewed: lr instanceof Date ? lr.toISOString().slice(0, 10) : lr ? String(lr) : undefined,
    version: m.version ? String(m.version) : undefined,
    confidence: m.confidence as ContentMeta["confidence"],
  };
}

function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return [String(v)];
}

function asRelated(v: unknown, file: string): { to: string; rel: Relation }[] {
  if (!v) return [];
  if (!Array.isArray(v)) throw new Error(`${file}: 'related' must be a list`);
  return v.map((item, i) => {
    if (typeof item === "string") return { to: item, rel: "RELATED_TO" as Relation };
    const to = String(item.to ?? "");
    const rel = String(item.rel ?? "RELATED_TO") as Relation;
    if (!to) throw new Error(`${file}: related[${i}] missing 'to'`);
    if (!VALID_RELATIONS.has(rel))
      throw new Error(`${file}: related[${i}] invalid rel '${rel}'`);
    return { to, rel };
  });
}

function requireFields(data: Record<string, unknown>, fields: string[], file: string) {
  for (const f of fields) {
    if (data[f] === undefined || data[f] === null || data[f] === "")
      throw new Error(`${file}: missing required field '${f}'`);
  }
}

function loadDocs(): DocNode[] {
  const out: DocNode[] = [];
  for (const [dir, type] of Object.entries(DOC_DIRS)) {
    for (const file of listFiles(dir, ".md")) {
      const raw = fs.readFileSync(file, "utf8");
      const { data, content } = matter(raw);
      const rel = path.relative(CONTENT_ROOT, file);
      requireFields(data, ["id", "name", "tagline", "category", "difficulty"], rel);
      const id = String(data.id);
      if (path.basename(file, ".md") !== id)
        throw new Error(`${rel}: filename must match id '${id}'`);
      const { sections, order } = splitSections(content);
      out.push({
        id,
        type,
        name: String(data.name),
        tagline: String(data.tagline),
        category: String(data.category),
        tags: asStringArray(data.tags),
        difficulty: Number(data.difficulty),
        meta: asMeta(data.meta),
        usedFor: asStringArray(data.usedFor),
        prerequisites: asStringArray(data.prerequisites),
        learningPath: asStringArray(data.learningPath),
        related: asRelated(data.related, rel),
        sections,
        sectionOrder: order,
      });
    }
  }
  return out;
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (e) {
    throw new Error(`${path.relative(CONTENT_ROOT, file)}: invalid JSON (${(e as Error).message})`);
  }
}

function loadArchitectures(): ArchitectureNode[] {
  return listFiles("architectures", ".json").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const d = readJson<Record<string, unknown>>(file);
    requireFields(d, ["id", "name", "tagline", "summary", "nodes", "edges", "textAlternative"], rel);
    if (path.basename(file, ".json") !== d.id)
      throw new Error(`${rel}: filename must match id '${d.id}'`);
    return {
      id: String(d.id),
      type: "architecture",
      name: String(d.name),
      tagline: String(d.tagline),
      category: String(d.category ?? "system"),
      tags: asStringArray(d.tags),
      difficulty: Number(d.difficulty ?? 3),
      meta: asMeta(d.meta),
      summary: String(d.summary),
      nodes: d.nodes as ArchitectureNode["nodes"],
      edges: d.edges as ArchitectureNode["edges"],
      flows: (d.flows ?? []) as ArchitectureNode["flows"],
      decisions: (d.decisions ?? []) as ArchitectureNode["decisions"],
      versions: d.versions as ArchitectureNode["versions"],
      textAlternative: String(d.textAlternative),
      related: asRelated(d.related, rel),
    };
  });
}

function loadComparisons(): ComparisonNode[] {
  return listFiles("comparisons", ".md").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    requireFields(data, ["id", "name", "tagline", "subjects"], rel);
    if (path.basename(file, ".md") !== data.id)
      throw new Error(`${rel}: filename must match id '${data.id}'`);
    const { sections, order } = splitSections(content);
    return {
      id: String(data.id),
      type: "comparison",
      name: String(data.name),
      tagline: String(data.tagline),
      category: String(data.category ?? "decision"),
      tags: asStringArray(data.tags),
      difficulty: Number(data.difficulty ?? 3),
      meta: asMeta(data.meta),
      subjects: asStringArray(data.subjects),
      sections,
      sectionOrder: order,
      related: asRelated(data.related, rel),
    };
  });
}

function loadRoadmaps(): RoadmapNode[] {
  return listFiles("roadmaps", ".json").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const d = readJson<Record<string, unknown>>(file);
    requireFields(d, ["id", "name", "tagline", "summary", "steps"], rel);
    return {
      id: String(d.id),
      type: "roadmap",
      name: String(d.name),
      tagline: String(d.tagline),
      category: String(d.category ?? "career"),
      tags: asStringArray(d.tags),
      difficulty: Number(d.difficulty ?? 3),
      meta: asMeta(d.meta),
      summary: String(d.summary),
      steps: d.steps as RoadmapNode["steps"],
    };
  });
}

function loadSystemDesigns(): SystemDesignNode[] {
  return listFiles("system-designs", ".json").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const d = readJson<Record<string, unknown>>(file);
    requireFields(d, ["id", "name", "tagline", "summary", "steps"], rel);
    return {
      id: String(d.id),
      type: "system-design",
      name: String(d.name),
      tagline: String(d.tagline),
      category: String(d.category ?? "design"),
      tags: asStringArray(d.tags),
      difficulty: Number(d.difficulty ?? 4),
      meta: asMeta(d.meta),
      summary: String(d.summary),
      requirements: asStringArray(d.requirements),
      steps: d.steps as SystemDesignNode["steps"],
      related: asRelated(d.related, rel),
    };
  });
}

function loadBuilds(): BuildGoal[] {
  return listFiles("builds", ".json").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const d = readJson<Record<string, unknown>>(file);
    requireFields(d, ["id", "name", "tagline", "architecture"], rel);
    return {
      id: String(d.id),
      name: String(d.name),
      tagline: String(d.tagline),
      architecture: String(d.architecture),
      systemDesign: d.systemDesign ? String(d.systemDesign) : undefined,
      technologies: asStringArray(d.technologies),
      concepts: asStringArray(d.concepts),
      patterns: asStringArray(d.patterns),
      learningPath: asStringArray(d.learningPath),
    };
  });
}

function loadRadar(): RadarData {
  const file = path.join(CONTENT_ROOT, "radar.json");
  if (!fs.existsSync(file)) return { assessedOn: "", method: "", entries: [] };
  const d = readJson<Record<string, unknown>>(file);
  requireFields(d, ["assessedOn", "method", "entries"], "radar.json");
  return { assessedOn: String(d.assessedOn), method: String(d.method), entries: d.entries as RadarData["entries"] };
}

function loadChallenges(): Challenge[] {
  return listFiles("challenges", ".json").map((file) => {
    const rel = path.relative(CONTENT_ROOT, file);
    const d = readJson<Record<string, unknown>>(file);
    requireFields(d, ["id", "question", "context", "options"], rel);
    if (path.basename(file, ".json") !== d.id) throw new Error(`${rel}: filename must match id '${d.id}'`);
    const options = d.options as Challenge["options"];
    if (!Array.isArray(options) || options.length < 2) throw new Error(`${rel}: need ≥ 2 options`);
    if (!options.some((o) => o.correct)) throw new Error(`${rel}: no option marked correct`);
    return {
      id: String(d.id),
      question: String(d.question),
      context: String(d.context),
      options,
      related: asStringArray(d.related),
      difficulty: Number(d.difficulty ?? 3),
    };
  });
}

export interface RawContent {
  nodes: AnyNode[];
  builds: BuildGoal[];
  radar: RadarData;
  challenges: Challenge[];
}

/** Read every content file from disk. No validation beyond shape. */
export function loadAllContent(): RawContent {
  const nodes: AnyNode[] = [
    ...loadDocs(),
    ...loadArchitectures(),
    ...loadComparisons(),
    ...loadRoadmaps(),
    ...loadSystemDesigns(),
  ];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) throw new Error(`duplicate node id '${n.id}'`);
    seen.add(n.id);
  }
  return { nodes, builds: loadBuilds(), radar: loadRadar(), challenges: loadChallenges() };
}
