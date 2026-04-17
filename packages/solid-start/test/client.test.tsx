import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "solid-js/web";

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrame } from "../src/VirtualFrameSSR";

type MockVFFn = ReturnType<typeof vi.fn>;

async function flush() {
  // Let onMount fire and the async setup() chain settle:
  //   onMount → setup() → await import("virtual-frame") → mock resolution →
  //   iframe insertion + VirtualFrameCore construction.
  // A handful of microtasks plus a macrotask covers all of the above,
  // regardless of whether the dynamic import resolves on this tick.
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("VirtualFrame (SolidStart, SSR-aware)", () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    dispose?.();
    dispose = undefined;
    // Drain any in-flight async setup() chains from the test we just
    // tore down so their VirtualFrameCore construction doesn't leak
    // into the next test's mock call count.
    await flush();
    container.innerHTML = "";
    container.remove();
    // Also clean up any leaked shared iframes parked on <body>.
    document.querySelectorAll('iframe[aria-hidden="true"]').forEach((el) => el.remove());
  });

  it("creates a hidden shared iframe when src is provided", async () => {
    dispose = render(() => <VirtualFrame src="/test-solid-a.html" />, container);
    await flush();

    const iframe =
      container.querySelector("iframe") ??
      document.querySelector('iframe[src$="/test-solid-a.html"]');
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain("/test-solid-a.html");
    expect(iframe!.getAttribute("aria-hidden")).toBe("true");
    expect(iframe!.getAttribute("tabindex")).toBe("-1");
  });

  it("instantiates VirtualFrameCore with correct options", async () => {
    dispose = render(
      () => (
        <VirtualFrame src="/test-solid-b.html" isolate="open" selector="#main" streamingFps={30} />
      ),
      container,
    );
    await flush();

    expect(MockVF).toHaveBeenCalled();
    const calls = (MockVF as unknown as MockVFFn).mock.calls;
    const [iframe, host, opts] = calls[calls.length - 1];
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(opts).toEqual({
      isolate: "open",
      selector: "#main",
      streamingFps: 30,
    });
  });

  it("cleans up the core and removes the iframe on unmount", async () => {
    dispose = render(() => <VirtualFrame src="/test-solid-c.html" />, container);
    await flush();

    const results = (MockVF as unknown as MockVFFn).mock.results;
    const instance = results[results.length - 1].value;
    const iframe = document.querySelector('iframe[src$="/test-solid-c.html"]');

    dispose();
    dispose = undefined;

    expect(instance.destroy).toHaveBeenCalled();
    expect((iframe as HTMLIFrameElement).parentNode).toBeNull();
  });

  it("does not create iframe when no src is provided", async () => {
    dispose = render(() => <VirtualFrame src={undefined as unknown as string} />, container);
    await flush();
    expect(container.querySelector("iframe")).toBeNull();
    expect(MockVF).not.toHaveBeenCalled();
  });

  it("shares a single iframe across multiple instances with the same src", async () => {
    dispose = render(
      () => (
        <>
          <VirtualFrame src="/test-solid-shared.html" />
          <VirtualFrame src="/test-solid-shared.html" />
        </>
      ),
      container,
    );
    await flush();

    const calls = (MockVF as unknown as MockVFFn).mock.calls;
    const iframeA = calls[calls.length - 2][0];
    const iframeB = calls[calls.length - 1][0];
    expect(iframeA).toBe(iframeB);

    const iframes = document.querySelectorAll('iframe[src$="/test-solid-shared.html"]');
    expect(iframes.length).toBe(1);

    dispose();
    dispose = undefined;

    // After full dispose, iframe is gone.
    expect((iframeA as HTMLIFrameElement).parentNode).toBeNull();
  });

  it("renders an empty host div when no _vfHtml is provided", async () => {
    dispose = render(() => <VirtualFrame src="/test-solid-empty.html" />, container);
    await flush();
    const host = container.querySelector("[data-vf-host]") as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.textContent).toBe("");
    expect(host.querySelector("*")).toBeNull();
  });
});
