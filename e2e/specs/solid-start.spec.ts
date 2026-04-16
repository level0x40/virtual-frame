import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * SolidStart example (host:3014, remote:3015).
 *
 * `examples/solid-start-host/src/routes/index.tsx` defines a `query()` with
 * a `"use server"` directive (`getFrames`) that calls
 * `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()` twice
 * (full + `#counter-card` selector). `createAsync(() => getFrames())` feeds
 * two `<VirtualFrame>` instances, each bound to the shared `store` so the
 * host's counter and the projected remote counters stay in sync.
 *
 * Both `vinxi dev` and `vinxi start` (node) run the same server query, so
 * the declarative shadow DOM arrives in the initial response in both modes.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`solid-start (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-solid-start-host", "example-solid-start-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the SolidStart SSR shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — SolidStart SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Remote SolidStart App" }),
      ).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Remote SolidStart App" }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("counter card is projected (selector frame)", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });
    });

    test("host → remote store sync increments projected counter", async ({
      page,
    }) => {
      await page.goto(url);
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: "Increment from host" }).click();
      await expect(page.getByText("Host count: 1")).toBeVisible();
    });
  });
}
