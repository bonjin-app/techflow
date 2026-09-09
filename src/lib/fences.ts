/**
 * Parsers for TechFlow's visual code fences (see content/README.md).
 * Pure functions — usable on server and client.
 */

export interface RefLabel {
  label: string;
  ref?: string;
  note?: string;
}

/** "Redis [redis] | note" → { label: "Redis", ref: "redis", note } */
export function parseRefLabel(raw: string): RefLabel {
  let text = raw.trim();
  let note: string | undefined;
  const pipe = text.indexOf("|");
  if (pipe >= 0) {
    note = text.slice(pipe + 1).trim();
    text = text.slice(0, pipe).trim();
  }
  const m = /^(.*?)\s*\[([a-z0-9-]+)\]\s*$/.exec(text);
  if (m) return { label: m[1].trim(), ref: m[2], note };
  return { label: text, note };
}

function splitHeader(src: string): { title?: string; meta: Record<string, string>; lines: string[] } {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/\s+#.*$/, "")).filter((l) => l.trim().length > 0);
  const meta: Record<string, string> = {};
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^([a-zA-Z]+):\s*(.*)$/.exec(l);
    if (m && ["title", "participants"].includes(m[1].toLowerCase()) && rest.length === 0) {
      meta[m[1].toLowerCase()] = m[2].trim();
    } else rest.push(l);
  }
  return { title: meta.title, meta, lines: rest };
}

/* ── steps ─────────────────────────────────────────────── */
export interface StepsData {
  title?: string;
  steps: RefLabel[];
}
export function parseSteps(src: string): StepsData {
  const { title, lines } = splitHeader(src);
  return { title, steps: lines.map(parseRefLabel) };
}

/* ── sequence ──────────────────────────────────────────── */
export interface SequenceMessage {
  from: number;
  to: number;
  text: string;
  reply: boolean;
}
export interface SequenceData {
  title?: string;
  participants: RefLabel[];
  messages: SequenceMessage[];
}
export function parseSequence(src: string): SequenceData {
  const { title, meta, lines } = splitHeader(src);
  const participants = (meta.participants ?? "")
    .split(",")
    .map((p) => parseRefLabel(p))
    .filter((p) => p.label);
  const index = new Map(participants.map((p, i) => [p.label.toLowerCase(), i]));
  const messages: SequenceMessage[] = [];
  for (const l of lines) {
    const m = /^(.+?)\s*(-->|->)\s*(.+?)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const ensure = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!index.has(key)) {
        participants.push(parseRefLabel(name));
        index.set(key, participants.length - 1);
      }
      return index.get(key)!;
    };
    messages.push({ from: ensure(m[1]), to: ensure(m[3]), text: m[4].trim(), reply: m[2] === "-->" });
  }
  return { title, participants, messages };
}

/* ── compare ───────────────────────────────────────────── */
export interface CompareData {
  title?: string;
  header: string[];
  rows: string[][];
}
export function parseCompare(src: string): CompareData {
  const { title, lines } = splitHeader(src);
  const rows = lines
    .filter((l) => !/^[-\s|]+$/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()));
  const [header = [], ...body] = rows;
  return { title, header, rows: body };
}

/* ── decision ──────────────────────────────────────────── */
export interface DecisionNode {
  kind: "question" | "leaf";
  text: string;
  ref?: string;
  answers?: { label: string; next: DecisionNode }[];
}
export function parseDecision(src: string): { title?: string; root: DecisionNode | null } {
  const { title, lines } = splitHeader(src);
  const items = lines.map((l) => ({ indent: l.match(/^\s*/)![0].length, text: l.trim() }));
  const cur = { i: 0 };

  const leaf = (text: string): DecisionNode => {
    const rl = parseRefLabel(text);
    return { kind: "leaf", text: rl.label, ref: rl.ref };
  };

  /** Parse answers indented deeper than `indent` into `q`. */
  const parseAnswers = (q: DecisionNode, indent: number) => {
    while (cur.i < items.length && items[cur.i].indent > indent) {
      const line = items[cur.i];
      const m = /^(.+?)\s*->\s*(.*)$/.exec(line.text);
      cur.i++;
      if (!m) continue;
      const label = m[1].trim();
      const target = m[2].trim();
      let next: DecisionNode;
      if (target.startsWith("?")) {
        next = { kind: "question", text: target.slice(1).trim(), answers: [] };
        parseAnswers(next, line.indent);
      } else {
        next = leaf(target);
      }
      q.answers!.push({ label, next });
    }
  };

  const parseNode = (): DecisionNode | null => {
    if (cur.i >= items.length) return null;
    const line = items[cur.i];
    cur.i++;
    if (line.text.startsWith("?")) {
      const node: DecisionNode = { kind: "question", text: line.text.slice(1).trim(), answers: [] };
      parseAnswers(node, line.indent);
      return node;
    }
    return leaf(line.text);
  };

  return { title, root: parseNode() };
}

/* ── timeline ──────────────────────────────────────────── */
export interface TimelineData {
  title?: string;
  columns: string[];
  rows: string[][];
}
export function parseTimeline(src: string): TimelineData {
  const { title, lines } = splitHeader(src);
  const rows = lines.filter((l) => !/^[-\s|]+$/.test(l)).map((l) => l.split("|").map((c) => c.trim()));
  const [columns = [], ...body] = rows;
  return { title, columns, rows: body };
}

export const VISUAL_FENCES = ["steps", "sequence", "compare", "decision", "timeline"] as const;
export type VisualFence = (typeof VISUAL_FENCES)[number];
export function isVisualFence(lang: string | undefined): lang is VisualFence {
  return !!lang && (VISUAL_FENCES as readonly string[]).includes(lang);
}
