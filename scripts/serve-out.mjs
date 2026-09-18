/**
 * Serves `out/` the way GitHub Pages resolves it: the exact file, then `.html`,
 * then `/index.html`, then `404.html`. The end-to-end tests run against this
 * rather than `next dev`, so what they exercise is the artefact that ships —
 * including the extensionless URLs the host invents.
 *
 *   node scripts/serve-out.mjs [port]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "out");
const PORT = Number(process.argv[2] ?? 4321);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const safe = path.normalize(url).replace(/^(\.\.[/\\])+/, "");
    const candidates = [path.join(ROOT, safe), path.join(ROOT, `${safe}.html`), path.join(ROOT, safe, "index.html")];
    const file = candidates.find((f) => f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(fs.readFileSync(path.join(ROOT, "404.html")));
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file));
  })
  .listen(PORT, () => console.log(`serving out/ on http://localhost:${PORT}`));
