import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * SvelteKit example (host:3012, remote:3013).
 *
 * `examples/sveltekit-host/src/routes/+page.server.ts` defines a `load()`
 * that calls `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()`
 * twice (full + `#counter-card` selector). `+page.svelte` renders a shared
 * host counter wired to the same store that both `<VirtualFrame>` instances
 * subscribe to.
 *
 * Dev uses `vite dev`; prod uses `vite preview`. In dev mode, a `/__vf`
 * proxy routes the VF iframe through the host (same-origin). In prod mode,
 * `vite preview` has no proxy — the VF component uses the actual remote
 * URL (cross-origin). The remote includes `virtual-frame/bridge`, enabling
 * DOM mirroring and store sync via postMessage in both modes.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`sveltekit (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-sveltekit-host", "example-sveltekit-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the SvelteKit SSR shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — SvelteKit SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Remote SvelteKit App" }),
      ).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Remote SvelteKit App" }).first(),
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

      // Wait for the initial "Host count: 0" to render — this is the
      // hydration barrier. Playwright's .click() only waits for DOM
      // actionability, not for Svelte to have attached the on:click
      // handler. Asserting the client-rendered "0" is visible first
      // guarantees hydration has completed.
      await expect(
        page.getByText(/Host count:\s*0\b/),
      ).toBeVisible({ timeout: 15_000 });

      const incrementBtn = page.getByRole("button", {
        name: "Increment from host",
      });
      const counterText = page.getByText(/Host count:\s*\d+\b/);

      // Click + assert in a poll loop so a click that lands during a
      // hydration gap doesn't flake the test — subsequent clicks will
      // register once the handler is attached.
      await expect
        .poll(
          async () => {
            await incrementBtn.click();
            return (await counterText.textContent())?.match(
              /Host count:\s*(\d+)/,
            )?.[1];
          },
          { timeout: 15_000, intervals: [250, 500, 1000] },
        )
        .toBe("1");
    });
  });
}
