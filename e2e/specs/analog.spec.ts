import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Analog example (host:3010, remote:3011).
 *
 * `examples/analog-host/src/main.server.ts` pre-fetches the remote via
 * `fetchVirtualFrame(REMOTE_URL)` and injects the prepared props through
 * Angular DI (`FRAME_DATA`). `src/app/pages/index.page.ts` stores the
 * SSR-produced `_vfHtml` into `TransferState` and hands it to
 * `<app-host-frames>` on the client.
 *
 * Dev uses `vite dev` (Analog/Vite plugin); prod uses
 * `node dist/analog/server/index.mjs`. Both run the same SSR path so the
 * declarative shadow DOM arrives in the initial HTML either way.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`analog (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-analog-host", "example-analog-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Analog SSR shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — Analog SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Remote Analog App" }),
      ).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Remote Analog App" }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("counter card is projected (selector frame)", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
