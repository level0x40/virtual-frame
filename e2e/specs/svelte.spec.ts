import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Svelte example (single Vite SPA, port 5177).
 *
 * `examples/svelte/src/App.svelte` mounts a `<VirtualFrame src>` from
 * `@virtual-frame/svelte`. The tab nav (`pages` array in the component)
 * starts on Hello → `/hello.html`, which contains
 * `<h1 id="title">Interactive Iframe Content</h1>`.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`svelte (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-svelte"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Svelte example shell", async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle("Virtual Frame — Svelte Example");
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — Svelte Example" }),
      ).toBeVisible();
    });

    test("default Hello page is projected", async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Interactive Iframe Content" })).toBeVisible({
        timeout: 30_000,
      });
    });

    test("clicking the SVG tab swaps the projected page", async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Interactive Iframe Content" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "SVG" }).click();

      // svg.html → <h1>SVG Elements</h1>
      await expect(page.getByRole("heading", { name: "SVG Elements" })).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
