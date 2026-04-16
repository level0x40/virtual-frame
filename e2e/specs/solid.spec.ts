import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Solid example (single Vite SPA, port 5178).
 *
 * `examples/solid/src/App.jsx` mounts a `<VirtualFrame src>` from
 * `@virtual-frame/solid`. The `pages` array starts with Hello → `/hello.html`,
 * which contains `<h1 id="title">Interactive Iframe Content</h1>`.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`solid (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-solid"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Solid example shell", async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle("Virtual Frame — Solid Example");
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — Solid Example" }),
      ).toBeVisible();
    });

    test("default Hello page is projected", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Interactive Iframe Content" }),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("clicking the Media tab swaps the projected page", async ({
      page,
    }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Interactive Iframe Content" }),
      ).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: "Media" }).click();

      // media.html → <h1>Media Elements</h1>
      await expect(
        page.getByRole("heading", { name: "Media Elements" }),
      ).toBeVisible({ timeout: 30_000 });
    });
  });
}
