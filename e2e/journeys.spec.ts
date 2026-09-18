import { expect, test } from "@playwright/test";

/**
 * The interactive parts, exercised the way a reader uses them. Static checks
 * cannot tell whether a control does anything, and every one of these is a
 * feature that would look fine while being broken.
 */

test("the first journey is one click per hop", async ({ page }) => {
  // The walk the product spec defines itself by: Redis → Cache → Cache Aside.
  await page.goto("/technology/redis");
  await expect(page.getByRole("heading", { level: 1, name: "Redis" })).toBeVisible();

  await page.getByRole("link", { name: "Cache", exact: true }).first().click();
  await expect(page).toHaveURL(/\/concept\/cache$/);

  await page.getByRole("link", { name: "Cache Aside", exact: true }).first().click();
  await expect(page).toHaveURL(/\/pattern\/cache-aside$/);
});

test("the command palette opens with a keystroke and navigates", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("/");
  const input = page.getByRole("combobox", { name: "Search the knowledge graph" });
  await expect(input).toBeFocused();
  await input.fill("kafka");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/technology\/kafka$/);
});

test("a question gets an answer card, not just a list", async ({ page }) => {
  await page.goto("/search?q=Why+Redis%3F");
  const card = page.getByLabel("Interpretation of your question");
  await expect(card).toBeVisible();
  await expect(card).toContainText("why Redis is needed");
  // the card links to the section that answers it, not the top of the page
  await expect(card.getByRole("link", { name: /Redis/ }).first()).toHaveAttribute("href", "/technology/redis#why");
});

test("the path finder connects two pages and explains each hop", async ({ page }) => {
  await page.goto("/path?from=jwt&to=sharding");
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
  await page.goto("/path?from=redis&to=sharding");
  await page.getByRole("tab", { name: "What do I need first?" }).click();
  await expect(page.getByText(/still to read/)).toBeVisible();

  const remaining = async () => Number((await page.getByText(/still to read/).textContent())!.match(/(\d+) still/)![1]);
  const before = await remaining();
  await page.getByRole("checkbox").first().check();
  await expect.poll(remaining).toBe(before - 1);
});

test("the mind map re-centres without a page load and keeps a trail", async ({ page }) => {
  await page.goto("/map?focus=redis");
  await expect(page.getByText("Redis", { exact: true }).first()).toBeVisible();
  const leaf = page.locator("svg a, svg [role=button]").first();
  await leaf.click();
  // the URL follows the centre without navigating away from /map
  await expect(page).toHaveURL(/\/map\?focus=/);
});

test("an architecture runs its request animation", async ({ page }) => {
  await page.goto("/architecture/chat-system");
  await page.getByRole("button", { name: /Run request/ }).click();
  await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible();
  // a step caption appears as the packet moves
  await expect(page.getByText(/\d\/\d/).first()).toBeVisible({ timeout: 10_000 });
});

test("a design challenge explains every option after you answer", async ({ page }) => {
  await page.goto("/challenge");
  const first = page.locator("[id]").filter({ hasText: "DESIGN CHALLENGE" }).first();
  await first.getByRole("button").first().click();
  await expect(first.getByText(/Correct|Not quite/).first()).toBeVisible();
});

test("the cache simulator responds to a smaller capacity", async ({ page }) => {
  await page.goto("/playground/cache");
  const capacity = page.getByRole("slider").first();
  await capacity.fill("4");
  await page.getByRole("button", { name: "Step" }).click({ clickCount: 12 });
  await expect(page.getByText("4 / 40 keys")).toBeVisible();
});

test("progress stays in the browser and can be forgotten", async ({ page }) => {
  await page.goto("/you");
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
  const response = await page.goto("/technology/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/isn't in the graph/);
  await expect(page.getByRole("link", { name: /Explore the graph/ })).toBeVisible();
});
