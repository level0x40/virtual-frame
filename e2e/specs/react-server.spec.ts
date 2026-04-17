import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

/**
 * react-server example (host:3002, remote:3003).
 *
 * `examples/react-server-host/app/page.tsx` is an async Server Component
 * that calls `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()`
 * twice (full page + `#counter-card` selector), then renders <HostFrames>
 * (a "use client" boundary) which mounts two `<VirtualFrame>` instances.
 *
 * Both `react-server start` (prod) and `react-server` (dev) serve the host
 * and remote independently. There's no proxy in this example — the iframe
 * loads `http://localhost:3003` cross-origin. SSR pre-rendered content
 * arrives via declarative shadow DOM in the initial HTML, so the projection
 * is visible regardless of same-origin restrictions.
 *
 * This is also the example whose prod build surfaced the `cache.ts` bug
 * (raw TS leaking into the client bundle): the prod tests below double
 * as a regression check for the `index.ts` → `./cache` runtime re-export.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`react-server (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-react-server-host", "example-react-server-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the SSR shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle("Virtual Frame — react-server SSR Host");
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — react-server SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Remote react-server App" })).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Remote react-server App" }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("counter-card selector projection renders the counter", async ({ page }) => {
      await page.goto(url);
      // Both VirtualFrame instances render the projected #counter-card.
      // The selector-only one isolates just that element.
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });
    });

    test("no client-side errors during SSR resume", async ({ page }) => {
      // Specifically guards against the `cache.ts` regression: a SyntaxError
      // (or any uncaught error) inside HostFrames would tear down React via
      // ErrorBoundary instead of rendering the projection.
      const errors: Error[] = [];
      page.on("pageerror", (err) => errors.push(err));

      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Remote react-server App" }).first(),
      ).toBeVisible({ timeout: 30_000 });

      expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
    });
  });
}
