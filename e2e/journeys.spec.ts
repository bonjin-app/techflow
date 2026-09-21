import { expect, test } from "@playwright/test";
import { at } from "./pages";

/**
 * The interactive parts, exercised the way a reader uses them. Static checks
 * cannot tell whether a control does anything, and every one of these is a
 * feature that would look fine while being broken.
 */

test("the first journey is one click per hop", async ({ page }) => {
  // The walk the product spec defines itself by: Redis → Cache → Cache Aside.
  await page.goto(at("/technology/redis"));
  await expect(page.getByRole("heading", { level: 1, name: "Redis" })).toBeVisible();

  await page.getByRole("link", { name: "Cache", exact: true }).first().click();
  await expect(page).toHaveURL(/\/concept\/cache$/);

  await page.getByRole("link", { name: "Cache Aside", exact: true }).first().click();
  await expect(page).toHaveURL(/\/pattern\/cache-aside$/);
});

test("the command palette opens with a keystroke and navigates", async ({ page }) => {
  await page.goto(at("/"));
  const input = page.getByRole("combobox", { name: "Search the knowledge graph" });
  // A global shortcut only works once the client has hydrated and attached its
  // listener. Pressing once immediately after load is a race the test lost
  // exactly often enough to look like a real failure.
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(input).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await input.fill("kafka");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/technology\/kafka$/);
});

test("a question gets an answer card, not just a list", async ({ page }) => {
  await page.goto(at("/search?q=Why+Redis%3F"));
  const card = page.getByLabel("Interpretation of your question");
  await expect(card).toBeVisible();
  await expect(card).toContainText("why Redis is needed");
  // the card links to the section that answers it, not the top of the page
  const answer = card.getByRole("link", { name: /Redis/ }).first();
  await expect(answer).toHaveAttribute("href", at("/technology/redis#why"));

  // …and that section is really there. This anchor is built at runtime from the
  // question, so no check over the built files can see it: rename the heading
  // and the link would keep pointing at nothing, silently.
  await answer.click();
  await expect(page).toHaveURL(/\/technology\/redis#why$/);
  await expect(page.locator("#why")).toBeVisible();
});

test("the path finder connects two pages and explains each hop", async ({ page }) => {
  await page.goto(at("/path?from=jwt&to=sharding"));
  await expect(page.getByText(/hops\./)).toBeVisible();
  const chain = page.getByRole("list", { name: "Route between the two pages" }).getByRole("link");
  await expect(chain.first()).toContainText("JWT");
  await expect(chain.last()).toContainText("Sharding");
  // turning hub avoidance off must change the route
  const before = await chain.allTextContents();
  await page.getByLabel("Avoid routing through hubs").uncheck();
  await expect.poll(async () => (await chain.allTextContents()).join("|")).not.toBe(before.join("|"));
});

test("the learning route orders prerequisites and responds to what you know", async ({ page }) => {
  await page.goto(at("/path?from=redis&to=sharding"));
  await page.getByRole("tab", { name: "What do I need first?" }).click();
  await expect(page.getByText(/still to read/)).toBeVisible();

  const remaining = async () => Number((await page.getByText(/still to read/).textContent())!.match(/(\d+) still/)![1]);
  const before = await remaining();
  await page.getByRole("checkbox").first().check();
  await expect.poll(remaining).toBe(before - 1);
});

test("the mind map re-centres without a page load and keeps a trail", async ({ page }) => {
  await page.goto(at("/map?focus=redis"));
  await expect(page.getByText("Redis", { exact: true }).first()).toBeVisible();
  const leaf = page.locator("svg a, svg [role=button]").first();
  await leaf.click();
  // the URL follows the centre without navigating away from /map
  await expect(page).toHaveURL(/\/map\?focus=/);
});

test("an architecture runs its request animation", async ({ page }) => {
  await page.goto(at("/architecture/chat-system"));
  await page.getByRole("button", { name: /Run request/ }).click();
  await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible();
  // a step caption appears as the packet moves
  await expect(page.getByText(/\d\/\d/).first()).toBeVisible({ timeout: 10_000 });
});

test("a design challenge explains every option after you answer", async ({ page }) => {
  await page.goto(at("/challenge"));
  const first = page.locator("[id]").filter({ hasText: "DESIGN CHALLENGE" }).first();
  await first.getByRole("button").first().click();
  await expect(first.getByText(/Correct|Not quite/).first()).toBeVisible();
});

test("the cache simulator responds to a smaller capacity", async ({ page }) => {
  await page.goto(at("/playground/cache"));
  const capacity = page.getByRole("slider").first();
  await capacity.fill("4");
  await page.getByRole("button", { name: "Step" }).click({ clickCount: 12 });
  await expect(page.getByText("4 / 40 keys")).toBeVisible();
});

test("progress stays in the browser and can be forgotten", async ({ page }) => {
  await page.goto(at("/you"));
  await expect(page.getByText(/Nothing recorded in this browser yet/)).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("tf:known", JSON.stringify(["programming-fundamentals", "http", "backend", "database"]));
    window.dispatchEvent(new CustomEvent("tf:storage", { detail: { key: "tf:known" } }));
  });
  await expect(page.getByText("Ready to read")).toBeVisible();

  // Clearing drops the page back to its empty state, which is the confirmation.
  await page.getByRole("button", { name: /Forget everything/ }).click();
  await expect(page.getByText(/Nothing recorded in this browser yet/)).toBeVisible();
});

test("an unknown URL lands on the site's own 404, with a way back", async ({ page }) => {
  const response = await page.goto(at("/technology/does-not-exist"));
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/isn't in the graph/);
  await expect(page.getByRole("link", { name: /Explore the graph/ })).toBeVisible();
});

test("common ground answers with something specific, not a roadmap", async ({ page }) => {
  await page.goto(at("/path?from=redis&to=kafka"));
  await page.getByRole("tab", { name: "What do they share?" }).click();
  const list = page.getByRole("list", { name: /What .* share/ });
  await expect(list).toBeVisible();
  const first = list.getByRole("link").first();
  await expect(first).not.toHaveAttribute("href", /\/roadmap\//);
  await expect(first).toHaveAttribute("data-type", /architecture|system-design|concept|pattern|technology/);
});

test("an answer can be copied out as Markdown", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(at("/path?from=redis&to=sharding"));
  await page.getByRole("tab", { name: "What do I need first?" }).click();
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("## What to read before Sharding");
  expect(copied).toMatch(/- \[[ x]\] \[.+\]\(http/); // a checklist with absolute links
});

test("search finds pages by what they say, not only what they are called", async ({ page }) => {
  // Nothing is called "coordinated omission"; two pages explain it.
  await page.goto(at("/search?q=coordinated+omission"));
  const section = page.getByRole("heading", { name: "Mentioned on these pages" });
  await expect(section).toBeVisible();
  const list = section.locator("xpath=following-sibling::ul[1]");
  await expect(list.getByRole("link").first()).toContainText(/Load Testing|Tail Latency/);
});
