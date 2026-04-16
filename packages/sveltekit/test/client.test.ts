import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount, tick } from "svelte";

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import VirtualFrame from "../src/VirtualFrameSSR.svelte";

type MockVFFn = ReturnType<typeof vi.fn>;

describe("VirtualFrame (SvelteKit, SSR-aware)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.innerHTML = "";
    container.remove();
  });

  it("creates a hidden shared iframe when src is provided", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/test.html" },
    });
    await tick();

    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain("/test.html");
    expect(iframe!.getAttribute("aria-hidden")).toBe("true");
    expect(iframe!.getAttribute("tabindex")).toBe("-1");
    expect(iframe!.style.opacity).toBe("0");

    unmount(comp);
  });

  it("instantiates VirtualFrameCore with correct options", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: {
        src: "/test.html",
        isolate: "open",
        selector: "#main",
        streamingFps: 30,
      },
    });
    await tick();

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

    unmount(comp);
  });

  it("cleans up the core and removes the iframe on unmount", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/unique-a.html" },
    });
    await tick();

    const results = (MockVF as unknown as MockVFFn).mock.results;
    const instance = results[results.length - 1].value;
    const iframe = container.querySelector("iframe");

    unmount(comp);

    expect(instance.destroy).toHaveBeenCalled();
    expect(iframe!.parentNode).toBeNull();
  });

  it("does not create iframe when no src is provided", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: {} as { src?: string },
    });
    await tick();
    expect(container.querySelector("iframe")).toBeNull();
    expect(MockVF).not.toHaveBeenCalled();
    unmount(comp);
  });

  it("shares a single iframe across multiple instances with the same src", async () => {
    const wrapperA = document.createElement("div");
    const wrapperB = document.createElement("div");
    container.append(wrapperA, wrapperB);

    const a = mount(VirtualFrame, {
      target: wrapperA,
      props: { src: "/shared.html" },
    });
    const b = mount(VirtualFrame, {
      target: wrapperB,
      props: { src: "/shared.html" },
    });
    await tick();

    const calls = (MockVF as unknown as MockVFFn).mock.calls;
    const iframeA = calls[calls.length - 2][0];
    const iframeB = calls[calls.length - 1][0];
    expect(iframeA).toBe(iframeB);

    const iframes = container.querySelectorAll("iframe");
    expect(iframes.length).toBe(1);

    // First teardown keeps the shared iframe alive.
    unmount(a);
    expect((iframeA as HTMLIFrameElement).parentNode).not.toBeNull();

    // Last teardown removes it.
    unmount(b);
    expect((iframeA as HTMLIFrameElement).parentNode).toBeNull();
  });

  it("renders SSR HTML via {@html} before mount (no _vfHtml → empty host)", async () => {
    // Without _vfHtml, the host is rendered empty; iframe is still created.
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/no-ssr.html" },
    });
    await tick();
    const host = container.querySelector("[data-vf-host]") as HTMLElement;
    expect(host).toBeTruthy();
    // Svelte leaves an anchor comment; there should be no real content.
    expect(host.textContent).toBe("");
    expect(host.querySelector("*")).toBeNull();
    unmount(comp);
  });
});
