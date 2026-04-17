import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * TanStack Start example (host:3004, remote:3005).
 *
 * `examples/tanstack-start-host/src/routes/index.tsx` defines a
 * `createServerFn().handler` (`loadFrames`) that runs
 * `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()` server-side.
 * The route loader returns the frame props which `<HostFrames>` consumes.
 *
 * Both modes execute the same server function:
 *   - dev:  `vite dev` → tanstack/react-start dev server
 *   - prod: `vite build` → `node .output/server/index.mjs`
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`tanstack-start (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-tanstack-start-host", "example-tanstack-start-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the TanStack Start shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — TanStack Start SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: /Remote TanStack Start App/ })).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: /Remote TanStack Start App/ }).first(),
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
