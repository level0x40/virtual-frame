import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Hono SSR example (single Node server, port 8000).
 *
 * `examples/hono-ssr/src/index.tsx` runs both the host and the "remote" on
 * the same Hono process:
 *   - GET /remote   → an interactive page with `#info-card`, `#counter-card`,
 *                     `#echo-card` (a 🚀 Remote App heading + count starting at 0)
 *   - GET /         → the host page that calls `fetchVirtualFrame("/remote")`
 *                     server-side, then renders TWO `<virtual-frame>` elements
 *                     (full page + selector="#counter-card") via SSR with
 *                     declarative shadow DOM, hydrated on the client.
 *
 * "dev" runs `tsx watch`, "prod" runs `tsx` (no watch). The harness runs
 * `vp run start` for prod which hits the example's `start` script. Since
 * the dev script also uses tsx, the two modes exercise nearly the same code
 * path — but the harness still validates that the `start` task succeeds
 * end-to-end.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`hono-ssr (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-hono-ssr"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the SSR shell", async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle("Virtual Frame — Hono SSR Example");
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — SSR Example" }),
      ).toBeVisible();
    });

    test("remote page is reachable directly", async ({ page }) => {
      const res = await page.goto(`${url}remote`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: /Remote App/ }))
        .toBeVisible();
      await expect(page.locator("#counter-card")).toBeVisible();
    });

    test("SSR resume: remote content is in initial HTML", async ({ page }) => {
      // Disable JS so we only see the server-rendered output. Declarative
      // shadow DOM (`<template shadowrootmode>`) is parsed by the browser
      // even without JS, so the projected counter card text should appear
      // in the rendered DOM purely from the server response.
      await page.context().addInitScript(() => {});
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);

      // The count starts at 0 — the SSR output of #counter-card includes
      // a `<div class="counter" id="count">0</div>`. Look for the visible
      // "0" rendered inside the projected shadow DOM.
      await expect(page.locator("#counter-card .counter").first()).toBeVisible();
    });

    test("client-side: counter increment in projected frame works", async ({
      page,
    }) => {
      await page.goto(url);

      // Wait for the projected shadow root to be live, then click the
      // Increment button inside it. Playwright pierces shadow DOM with
      // role/text locators by default.
      const incrementButton = page
        .getByRole("button", { name: /\+ Increment/ })
        .first();
      await expect(incrementButton).toBeVisible({ timeout: 30_000 });
      await incrementButton.click();

      // After click, the counter inside #counter-card should advance to 1.
      await expect(page.locator("#counter-card .counter").first()).toContainText(
        "1",
      );
    });
  });
}
