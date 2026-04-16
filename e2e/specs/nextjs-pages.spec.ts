import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

// Force dev-mode and prod-mode describes to share one worker. Next.js 16
// uses a `.next/dev/` PID lockfile that prevents two `next dev` processes
// from booting in the same example directory — which would otherwise
// happen when Playwright parallelizes top-level describes across workers.
test.describe.configure({ mode: "serial" });

/**
 * Next.js Pages Router example (host:3002, remote:3003).
 *
 * `examples/nextjs-pages-host/pages/index.tsx` uses
 * `getServerSideProps` to call `fetchVirtualFrame(REMOTE_URL)` and
 * `prepareVirtualFrameProps()` (twice — full page + `#counter-card`
 * selector). Two `<VirtualFrame>` components consume the props on the
 * client.
 *
 * NOTE: unlike the App Router example, `next.config.mjs` here does NOT
 * configure any rewrite — the `prepareVirtualFrameProps` calls don't pass
 * a `proxy`, and the iframe loads `http://localhost:3003` directly. The
 * SSR-pre-rendered content arrives via declarative shadow DOM in the
 * server response, so the projected content is visible regardless of
 * same-origin. Cross-frame live updates would require a same-origin
 * proxy, which this example doesn't demonstrate.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`nextjs-pages (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-nextjs-pages-host", "example-nextjs-pages-remote"],
        mode,
      });
      url = server.urls[0] + "/";
      remoteUrl = server.urls[1] + "/";
    });

    test.afterAll(async () => {
      await server?.dispose();
    });

    test("host page renders the Pages Router shell", async ({ page }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveTitle(
        "Virtual Frame — Next.js Pages Router SSR Host",
      );
      await expect(
        page.getByRole("heading", {
          name: "Virtual Frame — Next.js Pages Router SSR Example",
        }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: /Remote Next.js App.*Pages Router/ }),
      ).toBeVisible();
    });

    test("remote content is projected via SSR resume", async ({ page }) => {
      await page.goto(url);
      // The remote's <h1>🚀 Remote Next.js App (Pages Router)</h1> is rendered
      // into the host via declarative shadow DOM during SSR; once the page
      // arrives the heading is visible inside the projected shadow root.
      await expect(
        page
          .getByRole("heading", { name: /Remote Next.js App.*Pages Router/ })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("counter-card selector projection renders the counter", async ({
      page,
    }) => {
      await page.goto(url);
      // The "Counter Card Only" panel should contain a #counter-card from
      // the remote, which renders a number (initial count "0").
      await expect(page.locator("#counter-card").first()).toBeVisible({
        timeout: 30_000,
      });
    });
  });
}
