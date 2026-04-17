import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Angular example (single Vite SPA via @analogjs/vite-plugin-angular,
 * port 5179).
 *
 * `examples/angular/src/app/app.component.ts` declares an `<app-root>` with
 * a `[virtualFrame]` directive from `@virtual-frame/angular`. The `pages`
 * array starts with Hello → `/hello.html`
 * (`<h1 id="title">Interactive Iframe Content</h1>`).
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`angular (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-angular"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    // Surface browser console errors, page errors, AND failed/4xx/5xx
    // network responses in the test output. When an Angular bootstrap
    // error happens the page just goes blank with no hint in the
    // Playwright report — capturing all three categories means we can
    // tell the difference between (a) JS runtime error, (b) silent
    // missing script, and (c) script served but never executed.
    // Only active when VF_E2E_VERBOSE=1, otherwise the noise (HMR WS
    // retries, dev-server 404s during cold compile) drowns the reporter.
    if (process.env.VF_E2E_VERBOSE) {
      test.beforeEach(async ({ page }) => {
        page.on("console", (msg) => {
          if (msg.type() === "error") {
            // eslint-disable-next-line no-console
            console.error(`[angular browser console] ${msg.text()}`);
          }
        });
        page.on("pageerror", (err) => {
          // eslint-disable-next-line no-console
          console.error(`[angular pageerror] ${err.message}`);
        });
        page.on("requestfailed", (req) => {
          // eslint-disable-next-line no-console
          console.error(
            `[angular requestfailed] ${req.method()} ${req.url()} — ${
              req.failure()?.errorText ?? "unknown"
            }`,
          );
        });
        page.on("response", (res) => {
          if (res.status() >= 400) {
            // eslint-disable-next-line no-console
            console.error(`[angular http ${res.status()}] ${res.url()}`);
          }
        });
      });
    }

    test("host page renders the Angular example shell", async ({ page }) => {
      // Use `networkidle` so we wait for Vite to finish its lazy
      // first-time transform of `/src/main.ts` and the angular bundle.
      // Plain `load` resolves on the static index.html and doesn't wait
      // for the deferred JS pipeline that analog/vite-plugin-angular
      // builds on demand.
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
      await expect(page).toHaveTitle("Virtual Frame — Angular Example");
      const heading = page.getByRole("heading", {
        name: "Virtual Frame — Angular Example",
      });
      try {
        await expect(heading).toBeVisible({ timeout: 20_000 });
      } catch {
        // First attempt missed: reload once. The Vite-Angular pipeline
        // is now warm and the second navigation gets a transformed
        // bundle immediately.
        await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
        await expect(heading).toBeVisible({ timeout: 30_000 });
      }
    });

    test("default Hello page is projected", async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Interactive Iframe Content" })).toBeVisible({
        timeout: 30_000,
      });
    });

    test("clicking the Forms tab swaps the projected page", async ({ page }) => {
      await page.goto(url);
      await expect(page.getByRole("heading", { name: "Interactive Iframe Content" })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Forms" }).click();

      await expect(page.getByRole("heading", { name: "Form Elements" })).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
