import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * Rspack Module Federation example (host:3010, remote:3011).
 *
 * `examples/rspack-mf-host/src/App.tsx` demonstrates Virtual Frame and
 * Module Federation side-by-side using the same remote app:
 *   - **Host Counter** — rendered natively, reads/writes the shared store.
 *   - **MF Counter**   — `import("mf_remote/Counter")` lazy-loaded via
 *                        Module Federation. Host reference:
 *                        `mf_remote@http://localhost:3011/mf-manifest.json`.
 *   - **VF Counter**   — projected from a hidden iframe at `/remote/` via
 *                        `useVirtualFrame()` + `<VirtualFrame selector=...>`.
 *
 * Routing differs by mode:
 *   - dev:  rspack devServer proxies `/remote` → http://localhost:3011 so the
 *           VF iframe is same-origin. MF reaches the remote directly.
 *   - prod: each side is served by `npx serve dist`. The host uses the actual
 *           remote URL (cross-origin) for the VF iframe — the bridge script
 *           in the remote handles DOM mirroring via postMessage. MF loads
 *           from the remote directly as in dev.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`rspack-mf (${mode})`, () => {
    let server: ServerHandle;
    let url: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-rspack-mf-host", "example-rspack-mf-remote"],
        mode,
      });
      url = server.urls[0] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    // Surface browser errors in the test log — only when VF_E2E_VERBOSE=1,
    // otherwise they drown the reporter with noise (e.g. HMR WebSocket
    // retries that are expected when the dev server restarts between tests).
    if (process.env.VF_E2E_VERBOSE) {
      test.beforeEach(async ({ page }) => {
        page.on("pageerror", (err) => {
          // eslint-disable-next-line no-console
          console.error(`[rspack-mf pageerror] ${err.message}`);
        });
        page.on("console", (msg) => {
          if (msg.type() === "error") {
            // eslint-disable-next-line no-console
            console.error(`[rspack-mf browser console] ${msg.text()}`);
          }
        });
      });
    }

    test("host page renders the MF + VF demo shell", async ({ page }) => {
      await page.goto(url, { waitUntil: "load" });
      await expect(page).toHaveTitle(/MF Host/);
      await expect(
        page.getByRole("heading", {
          name: "Module Federation + Virtual Frame",
        }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Host Counter" })).toBeVisible({
        timeout: 20_000,
      });
    });

    test("MF Counter (Module Federation) loads from the remote", async ({ page }) => {
      await page.goto(url, { waitUntil: "load" });
      // The lazy-loaded MFCounter is wrapped in <Suspense fallback="Loading
      // MF Counter…">. Once it resolves, its label "MF Counter" appears.
      await expect(page.getByRole("heading", { name: "MF Counter" })).toBeVisible({
        timeout: 30_000,
      });
    });

    test("host counter increment updates MF counter (shared store)", async ({ page }) => {
      await page.goto(url, { waitUntil: "load" });
      await expect(page.getByRole("heading", { name: "MF Counter" })).toBeVisible({
        timeout: 30_000,
      });

      // Click the FIRST "+ Increment" button — that's the host's. Both the
      // host counter and the MF counter should advance to 1 because they
      // share `@virtual-frame/store`.
      await page
        .getByRole("button", { name: /\+ Increment/ })
        .first()
        .click();

      // Two visible "1"s expected (host + MF). We assert at least 2.
      await expect
        .poll(async () => await page.getByText("1", { exact: true }).count())
        .toBeGreaterThanOrEqual(2);
    });

    test("VF Counter (Virtual Frame iframe) is also projected", async ({ page }) => {
      await page.goto(url, { waitUntil: "load" });
      // The projected #counter-card from the remote uses label "Remote
      // Counter" by default (Counter component default). Three counters
      // total: Host / MF / Remote.
      // Two "Remote Counter" headings are expected: one from the
      // #counter-card selector projection, one from the full-page
      // VirtualFrame below it. Asserting `.first()` is enough.
      // In dev mode the iframe is same-origin (via proxy); in prod mode
      // it's cross-origin — the bridge script in the remote handles
      // DOM mirroring via postMessage.
      await expect(page.getByRole("heading", { name: "Remote Counter" }).first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
