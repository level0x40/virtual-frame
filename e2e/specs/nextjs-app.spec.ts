import { test, expect } from "@playwright/test";
import { spawnExample, type ServerHandle } from "../helpers/server.ts";

// Force the dev-mode and prod-mode describes in this file to run in the
// SAME worker, sequentially. Next.js 16 writes a PID lockfile under
// `.next/dev/` and refuses to start a second dev server in the same
// example directory — which is exactly what happens when Playwright puts
// the two top-level describes on two parallel workers sharing one example
// dir on disk. Serial mode at file level keeps them in one worker.
test.describe.configure({ mode: "serial" });

/**
 * Next.js App Router example (host:3000, remote:3001).
 *
 * `examples/nextjs-app-host/app/page.tsx` is a Server Component that calls
 * `fetchVirtualFrame(REMOTE_URL)` and `prepareVirtualFrameProps()` from
 * `@virtual-frame/next`, then renders <HostFrames> (a "use client" boundary)
 * with two `<VirtualFrame>` instances:
 *   - the full remote page
 *   - just `#counter-card` via `selector` prop
 *
 * Routing: `next.config.mjs` has a permanent rewrite `/__vf/:path* →
 * REMOTE_URL/:path*`. Next.js rewrites work in both `next dev` and `next
 * start`, so both modes get the same proxy behaviour — no fixme needed.
 *
 * Shared store: a host counter ("− Decrement" / "+ Increment" / live count
 * span) writes `store.count`, which the projected remote `Counter` component
 * mirrors via MessagePort bridge.
 */
for (const mode of ["dev", "prod"] as const) {
  test.describe.serial(`nextjs-app (${mode})`, () => {
    let server: ServerHandle;
    let url: string;
    let remoteUrl: string;

    test.beforeAll(async () => {
      server = await spawnExample({
        filters: ["example-nextjs-app-host", "example-nextjs-app-remote"],
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
      await expect(page).toHaveTitle("Virtual Frame — Next.js SSR Host");
      await expect(
        page.getByRole("heading", { name: "Virtual Frame — Next.js SSR Example" }),
      ).toBeVisible();
    });

    test("remote app is reachable directly", async ({ page }) => {
      const res = await page.goto(remoteUrl);
      expect(res?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Remote Next.js App" }),
      ).toBeVisible();
    });

    test("remote content is projected into the host (SSR resume)", async ({
      page,
    }) => {
      const res = await page.goto(url);
      expect(res?.status()).toBe(200);
      // The remote's <h1>Remote Next.js App</h1> is rendered into both
      // VirtualFrame instances during SSR via declarative shadow DOM.
      // Playwright's role/text locators pierce open shadow roots.
      await expect(
        page.getByRole("heading", { name: "Remote Next.js App" }).first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("host counter increment propagates to projected counter card", async ({
      page,
    }) => {
      await page.goto(url);
      // Wait for the projection to be live before interacting.
      await expect(
        page.getByRole("heading", { name: "Remote Next.js App" }).first(),
      ).toBeVisible({ timeout: 30_000 });

      // The host's "+ Increment" button lives in the "Shared Store" panel.
      // It's the FIRST + Increment on the page (the projected remote also
      // has its own copy inside #counter-card).
      const incrementBtn = page
        .getByRole("button", { name: /\+ Increment/ })
        .first();
      const counter = page
        .getByRole("heading", { name: "Shared Store" })
        .locator("..")
        .locator("span")
        .filter({ hasText: /^\s*\d+\s*$/ })
        .first();

      // Wait for the client store to have rendered the initial "0" —
      // Playwright's .click() only waits for actionability, not framework
      // hydration, so clicking immediately after SSR can fire before the
      // React handler is attached. Waiting for the counter span to contain
      // "0" is a cheap, reliable hydration barrier.
      await expect(counter).toHaveText(/^\s*0\s*$/, { timeout: 15_000 });

      // Click + assert in a poll loop — if the first click lands during a
      // hydration gap, subsequent clicks will take and the assertion will
      // converge without a flake.
      await expect
        .poll(
          async () => {
            await incrementBtn.click();
            return (await counter.textContent())?.trim();
          },
          { timeout: 15_000, intervals: [250, 500, 1000] },
        )
        .toBe("1");
    });
  });
}
