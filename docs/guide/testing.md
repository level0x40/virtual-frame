# Testing

Virtual Frame hinges on real browser primitives — live iframes, MutationObserver, Shadow DOM, `postMessage`, canvas capture. jsdom and happy-dom don't provide high-fidelity versions of these, so tests that exercise projection need a **real browser**. This page covers the patterns we use in this project's own test suite, plus guidance for application code that depends on Virtual Frame.

## Pick the right environment

| Tool                                  | Good for                                                              | Why                                                                 |
| ------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Vitest browser mode** + Playwright  | Unit / integration tests of code that uses `VirtualFrame` directly    | Real iframe + MutationObserver + Shadow DOM in a scriptable browser |
| **Playwright** (end-to-end)           | Full app tests where you drive the host UI and assert on the projection | Covers routing, SSR resume, real-world timing                       |
| **jsdom / happy-dom**                 | ❌ Don't use                                                           | No iframe `contentDocument`, no reliable Shadow DOM, no canvas capture |

The core package tests use Vitest browser mode (`@vitest/browser` + `@vitest/browser-playwright`) and the repo's cross-package / cross-framework e2e tests use Playwright directly against running example apps. Either is a fine starting point for your own tests.

## Unit / integration tests with Vitest browser mode

### Setup

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
    include: ["test/**/*.test.ts"],
  },
});
```

### Test helpers

These are the helpers the core package uses — copy them into your project as a starting point.

```ts
// test/helpers.ts
export async function createIframe(fixturePath: string) {
  const url = new URL(`./fixtures/${fixturePath}`, import.meta.url).href;
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:800px;height:600px;border:none;";
  iframe.src = url;
  document.body.appendChild(iframe);
  await new Promise((r) => iframe.addEventListener("load", r));
  return iframe;
}

export function createHost() {
  const host = document.createElement("div");
  host.style.cssText = "width:800px;height:600px;overflow:auto;";
  document.body.appendChild(host);
  return host;
}

export async function waitForInit(vf: VirtualFrame, timeout = 5000) {
  const start = Date.now();
  while (!vf.isInitialized && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!vf.isInitialized) throw new Error("VirtualFrame did not initialise");
}

export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

export function cleanupDOM() {
  document.querySelectorAll("iframe").forEach((el) => el.remove());
}
```

### A representative test

```ts
import { afterEach, expect, it } from "vitest";
import { VirtualFrame } from "virtual-frame";
import { createIframe, createHost, waitForInit, cleanupDOM } from "./helpers";

afterEach(() => cleanupDOM());

it("projects the iframe body into the host shadow root", async () => {
  const iframe = await createIframe("basic.html");
  const host = createHost();

  const vf = new VirtualFrame(iframe, host, { isolate: "open" });
  await waitForInit(vf);

  const root = vf.getShadowRoot()!;
  expect(root.querySelector("h1")?.textContent).toBe("Hello");

  vf.destroy();
});
```

### Patterns worth following

- **Wait for `isInitialized`, not `load`.** The iframe's `load` event only tells you the source document parsed; projection happens after mutation observation spins up.
- **Always `vf.destroy()` in cleanup.** Otherwise leaked MutationObservers and capture streams pile up across tests and cause flakiness.
- **Assert on the shadow root, not the host's light DOM.** With `isolate` enabled (you should), content lives in the shadow root. Use `vf.getShadowRoot()` — works for both open and closed modes.
- **Use `requestAnimationFrame` ticks for animation / streaming.** A single `nextFrame()` after a source mutation is usually enough for the mirror to catch up; if not, poll `host.shadowRoot.innerHTML` with a timeout rather than adding arbitrary delays.

## End-to-end tests with Playwright

Use this layer when you want to exercise the full path — host app renders, iframe loads, bridge negotiates, user interacts, projection updates.

```ts
import { expect, test } from "@playwright/test";

test("cross-origin dashboard projects and accepts clicks", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // Wait for the virtual-frame element to finish projecting
  const vf = page.locator("virtual-frame");
  await expect(vf).toBeVisible();

  // The projected button lives inside the shadow root — use locator.locator()
  // with a CSS selector; Playwright pierces shadow DOM for open mode by default.
  const button = vf.locator("button.buy");
  await expect(button).toHaveText("Buy");

  await button.click();
  await expect(vf.locator(".cart-badge")).toHaveText("1");
});
```

Key points for Playwright:

- **Open mode + pierce-by-default works out of the box.** `vf.locator("button")` reaches into `host.shadowRoot` automatically. For closed mode you need to evaluate against `vf.getShadowRoot()` from the page context.
- **Run each project on a real dev server.** The test harness in this repo starts host and remote in parallel via `vite` / `next dev` / etc. and then runs specs against the running servers. Copy that pattern — don't try to inline the remote.
- **Separate dev and prod specs** if your SSR / proxy wiring differs between them. The repo's e2e suite does this with `--grep "(dev)"` / `--grep "(prod)"` annotations.

## Testing cross-origin projection

The bridge must run inside the **remote origin**, and `postMessage` requires a real cross-origin relationship. Two practical options:

1. **Serve remote and host from different ports.** `http://localhost:3000` and `http://localhost:4000` are cross-origin as far as the browser is concerned. Start both servers from Playwright's `webServer` config.
2. **Use Playwright's `routeFromHAR` or `route()`** to intercept outbound requests and return fixture HTML — useful when you want deterministic remote responses without running a second dev server.

::: warning Do not mock the bridge
The bridge protocol is small but subtle — it negotiates channel IDs, assigns node IDs lazily, and streams mutation batches. A mock that matches today's protocol will drift. Test against the real bridge running in a real remote document.
:::

## Testing SSR

For [`fetchVirtualFrame`](/guide/ssr#fetchvirtualframe-url-options) and [`renderVirtualFrame`](/guide/ssr#rendervirtualframe-rawhtml-options), you can test the **server-side transform** in plain Vitest (node environment) because those helpers only touch strings and `fetch`:

```ts
import { expect, it, vi } from "vitest";
import { renderVirtualFrame } from "virtual-frame/ssr";

it("inlines styles into the declarative shadow template", async () => {
  const html = `<html><head><style>h1{color:red}</style></head><body><h1>Hi</h1></body></html>`;
  const frame = await renderVirtualFrame(html, { url: "https://r.example.com/" });

  expect(frame.html).toContain("<template shadowrootmode=\"open\">");
  expect(frame.styles).toContain("color:red");
});
```

For the **client-side resume path** (where the `<virtual-frame>` element picks up the declarative Shadow DOM and creates the srcdoc iframe), use Playwright — that code path depends on real DOM parsing and `about:srcdoc` behavior.

## Testing framework components

The framework packages wrap `VirtualFrame` with idiomatic bindings, so you can usually use your framework's normal testing setup — `@testing-library/react`, Vue Test Utils, Svelte testing-library, etc. — **as long as you run them in a real browser**. In Vitest that means browser mode, same config as above. In Playwright Component Testing, the default browser backend is fine.

Two gotchas:

- **Don't assert synchronously after mount.** Most frameworks mount the `<virtual-frame>` element and then projection happens across a few microtasks. Use `findBy…` / `waitFor` / `vi.waitFor(() => …)` rather than `getBy…`.
- **The `store` prop connects a MessageChannel.** If you want to assert on shared state mid-test, write to the store, `await nextFrame()`, then read. The store batches writes to the end of the microtask queue.

## Reference

- This project's own test suites, for working examples:
  - `packages/core/test/` — unit + integration with Vitest browser mode
  - `e2e/specs/` — framework-level Playwright specs, one per framework integration
- [Vitest browser mode](https://vitest.dev/guide/browser/) docs
- [Playwright](https://playwright.dev/) docs
