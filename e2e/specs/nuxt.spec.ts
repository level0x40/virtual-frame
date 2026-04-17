import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

// Force dev + prod describes to share ONE worker. Nuxt/Nitro writes to
// `.nuxt` and `.output` under the workspace dir, and the hardcoded ipx
// IPC socket path is per-project — parallel workers on the same source
// dir deadlock each other. Serial mode at file level keeps them safe.
test.describe.configure({ mode: "serial" });

/**
 * Nuxt example (host:3008, remote:3009).
 *
 * `examples/nuxt-host/pages/index.vue` calls `useFetch("/api/frame")` —
 * a Nitro server route at `examples/nuxt-host/server/api/frame.ts` that
 * runs `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()`
 * twice (full page + counter selector). The result is rendered through
 * `<HostFrames>`.
 *
 * Routing: `nuxt.config.ts` defines `nitro.devProxy["/__vf"]` →
 * REMOTE_URL. **`devProxy` only applies in dev** — `nuxt start` does not
 * honour it. The host's SSR-rendered shadow DOM still arrives correctly
 * in prod (the server-side fetch happens in the API route regardless),
 * so the projected content is visible. Live cross-frame interaction in
 * prod would require Nitro `routeRules` instead.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`nuxt (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-nuxt-host", "example-nuxt-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Nuxt SSR shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — Nuxt SSR Example" }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle("Remote Nuxt App");
      await expect(page.getByRole("heading", { name: "Remote Nuxt App" })).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      // The Nitro `/api/frame` route fetched the remote during SSR; the
      // declarative shadow DOM in the host response contains the remote's
      // <h1>Remote Nuxt App</h1>.
      await expect(page.getByRole("heading", { name: "Remote Nuxt App" }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    test("counter card is projected (selector frame)", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
