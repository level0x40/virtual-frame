import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Vanilla example (single Vite SPA).
 *
 * The host page hosts a `<virtual-frame src="#src">` custom element that
 * projects content from a hidden `<iframe id="src">` pointing at one of
 * several pages from `examples/shared/` (showcase / forms / media / svg).
 *
 * Default page is `showcase.html` which renders an "<h1>Dashboard</h1>".
 * The "Forms" tab swaps the iframe to `forms.html` ("<h1>Form Elements</h1>").
 *
 * The element uses `isolate="open"` so the projection lives inside an open
 * shadow root — Playwright's text/role locators pierce shadow DOM by default,
 * so we don't need any special selector tricks.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`vanilla (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-vanilla"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page loads with the demo title", async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle("Virtual Frame Demo");
      // Scope to the host's h1 — `getByRole("heading", { level: 1 })`
      // pierces the projected shadow DOM and would also match the
      // iframe's <h1>Dashboard</h1>, tripping strict mode.
      await expect(page.getByRole("heading", { level: 1, name: /Demo/ })).toBeVisible();
    });

    test("virtual-frame element exists with an open shadow root", async ({ page }) => {
      await page.goto(url);
      const vf = page.locator("virtual-frame");
      await expect(vf).toHaveCount(1);

      // Wait for the custom element to upgrade and project.
      await expect
        .poll(async () => vf.evaluate((el) => Boolean((el as HTMLElement).shadowRoot)))
        .toBe(true);
    });

    test("default showcase page is projected into the host", async ({ page }) => {
      await page.goto(url);
      // The showcase iframe contains an <h1>Dashboard</h1>; once the
      // virtual-frame element projects it, that heading should be visible
      // inside the host shadow root.
      await expect(
        page.locator("virtual-frame").getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
    });

    test("switching to the Forms tab updates the projected content", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.locator("virtual-frame").getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Forms" }).click();

      await expect(
        page.locator("virtual-frame").getByRole("heading", { name: "Form Elements" }),
      ).toBeVisible();
    });
  });
}
