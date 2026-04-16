import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Vue example (single Vite SPA — port allocated dynamically).
 *
 * `examples/vue/src/App.vue` renders a `<VirtualFrame :src>` from
 * `@virtual-frame/vue` with a tab nav over four shared HTML pages
 * (Hello / Forms / SVG / Media). Default selection is Hello, which loads
 * `examples/shared/hello.html` containing `<h1 id="title">Interactive Iframe
 * Content</h1>`.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`vue (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-vue"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Vue example shell", async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle("Virtual Frame — Vue Example");
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — Vue Example" }),
      ).toBeVisible();
    });

    test("default Hello page is projected", async ({ page }) => {
      await page.goto(url);
      // hello.html → <h1 id="title">Interactive Iframe Content</h1>
      await expect(
        page.getByRole("heading", { name: "Interactive Iframe Content" }),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("clicking the Forms tab swaps the projected page", async ({
      page,
    }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Interactive Iframe Content" }),
      ).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: "Forms" }).click();

      // forms.html → <h1>Form Elements</h1>
      await expect(
        page.getByRole("heading", { name: "Form Elements" }),
      ).toBeVisible({ timeout: 30_000 });
    });
  });
}
