import { test, expect } from "@playwright/test";

test("playwright can launch a browser at all", async ({ page }) => {
  await page.goto("data:text/html,<h1>hello</h1>");
  await expect(page.locator("h1")).toHaveText("hello");
});
