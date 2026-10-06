import fs from "node:fs";
import { describe, expect, it } from "vitest";
import matter from "gray-matter";
import { parseBlocks, runnable } from "../scripts/run-setup";

describe("parseBlocks", () => {
  it("reads the markers after the language", () => {
    const md = ["```yaml file=compose.yaml", "services: {}", "```", "", "```sh run", "docker compose up -d", "```", "", "```sh check hidden", "true", "```", "", "```sh", "echo prose", "```"].join("\n");
    const blocks = parseBlocks(md);
    expect(blocks.map((b) => [b.lang, b.file, b.run, b.check, b.hidden])).toEqual([
      ["yaml", "compose.yaml", false, false, false],
      ["sh", undefined, true, false, false],
      ["sh", undefined, false, true, true],
      ["sh", undefined, false, false, false],
    ]);
    expect(blocks[0].body).toBe("services: {}\n");
    expect(runnable(blocks)).toBe(true);
  });

  it("finds a complete, runnable guide in the Redis + PostgreSQL setup", () => {
    const { content } = matter(fs.readFileSync("content/setups/redis-postgresql-docker-compose.md", "utf8"));
    const blocks = parseBlocks(content);
    expect(blocks.filter((b) => b.file).map((b) => b.file)).toEqual(["compose.yaml", "init.sql", "server.js", "package.json", "Dockerfile"]);
    expect(runnable(blocks)).toBe(true);
  });
});
