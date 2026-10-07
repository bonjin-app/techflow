import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const base = "https://bonjin-app.github.io/techflow";
for (const r of ["/", "/technology/redis", "/concept/cache", "/setup", "/setup/nodejs-redis-kubernetes", "/architecture/e-commerce", "/challenge", "/explore", "/compare/redis-vs-memcached"]) {
  const res = await p.goto(base + r, { waitUntil: "networkidle" });
  console.log(String(res.status()), r);
}
await p.goto(base + "/technology/redis", { waitUntil: "networkidle" });
console.log("graph:", await p.locator("svg[data-tick]").count(), "| errors:", errors.length);
await p.keyboard.press("?"); await p.keyboard.press("Escape");
console.log("help closes on Escape:", await p.getByRole("dialog", { name: "Keyboard shortcuts" }).count() === 0);
await b.close();
