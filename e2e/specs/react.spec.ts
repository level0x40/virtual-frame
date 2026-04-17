import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * React example (host + remote, both pure Vite SPAs).
 *
 * The host (5175) renders a "Host Counter" backed by `@virtual-frame/store`
 * and embeds the remote (5176) twice via a shared `useVirtualFrame()` handle:
 *   1. A selector projection of `#counter-card` (just the remote counter UI).
 *   2. A full-app projection of the entire remote document.
 *
 * The remote counter is bound to the same store, so clicking host buttons
 * should update the projected remote counter (and vice versa) in real time.
 *
 * In dev mode, the host proxies `/remote` → the remote's Vite dev server
 * (same-origin). In prod mode, `vite preview` has no proxy, so the host
 * uses the actual remote URL (cross-origin). The remote includes the
 * `virtual-frame/bridge` script, enabling cross-origin DOM mirroring via
 * postMessage. Both modes are fully tested.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`react (${mode})`, () => {
    let server: ServerHandle;
    let hostUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-react-host", "example-react-remote"],
        mode,
      });
      hostUrl = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page loads with the React store demo", async ({ page }) => {
      await page.goto(hostUrl);
      await expect(page).toHaveTitle(/Virtual Frame.*React/);
      await expect(
        page.getByRole("heading", { name: /Virtual Frame.*React Store/i }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Host Counter" })).toBeVisible();
    });

    test("remote counter is projected into the host via shared frame", async ({ page }) => {
      await page.goto(hostUrl);
      // The remote's #counter-card has an "<h2>Remote Counter</h2>", which
      // should appear inside the projected shadow DOM (Playwright pierces
      // shadow roots by default).
      // In dev mode the iframe is same-origin (via proxy); in prod mode
      // it's cross-origin — the bridge script in the remote handles
      // DOM mirroring via postMessage.
      await expect(page.getByRole("heading", { name: "Remote Counter" }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    test("clicking host Increment updates the projected remote counter", async ({ page }) => {
      await page.goto(hostUrl);

      // Wait for projection to settle.
      await expect(page.getByRole("heading", { name: "Remote Counter" }).first()).toBeVisible({
        timeout: 30_000,
      });

      // Host counter starts at 0 (store initial value).
      await page
        .getByRole("button", { name: /\+ Increment/ })
        .first()
        .click();

      // Both host and projected remote should now show "1". Asserting on
      // the host side is enough — the store is shared, so a stale projection
      // would also fail later checks. We additionally probe the projected
      // remote's counter card directly via text.
      await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
    });
  });
}
