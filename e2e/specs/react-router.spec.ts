import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * React Router (v7, framework mode) example (host:3006, remote:3007).
 *
 * `examples/react-router-host/app/routes/home.tsx` exports a `loader()` that
 * calls `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()` from
 * `@virtual-frame/react-router/server`. The route component renders
 * <HostFrames> with the prepared props.
 *
 * Both `react-router dev` and `react-router-serve` (start) execute the same
 * loader, so the SSR-projected content arrives in both modes. No proxy is
 * configured in the example — the remote iframe is loaded cross-origin and
 * the projection relies on the SSR-pre-rendered shadow DOM.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`react-router (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-react-router-host", "example-react-router-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the React Router shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — React Router SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: /Remote React Router App/ })).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: /Remote React Router App/ }).first(),
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
