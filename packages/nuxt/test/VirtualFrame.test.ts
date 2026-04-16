import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, nextTick, type App } from "vue";

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrame } from "../src/index.ts";

describe("VirtualFrame (Nuxt)", () => {
  let container: HTMLDivElement;
  let app: App | null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (app) {
      app.unmount();
      app = null;
    }
    container.remove();
  });

  it("renders a host div", async () => {
    app = createApp(VirtualFrame, { src: "/test.html" });
    app.mount(container);
    await nextTick();
    expect(container.querySelector("[data-vf-host]")).toBeTruthy();
  });

  it("creates a hidden iframe when src is provided", async () => {
    app = createApp(VirtualFrame, { src: "/test.html" });
    app.mount(container);
    await nextTick();
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain("/test.html");
    expect(iframe!.getAttribute("aria-hidden")).toBe("true");
    expect(iframe!.getAttribute("tabindex")).toBe("-1");
  });

  it("instantiates VirtualFrameCore with correct options", async () => {
    app = createApp(VirtualFrame, {
      src: "/test.html",
      isolate: "closed",
      selector: ".content",
      streamingFps: 15,
    });
    app.mount(container);
    await nextTick();
    expect(MockVF).toHaveBeenCalledOnce();
    const [iframe, host, opts] = (MockVF as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(opts).toEqual({
      isolate: "closed",
      selector: ".content",
      streamingFps: 15,
    });
  });

  it("destroys mirror and removes iframe on unmount", async () => {
    app = createApp(VirtualFrame, { src: "/test.html" });
    app.mount(container);
    await nextTick();
    const instance = (MockVF as unknown as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    const iframe = container.querySelector("iframe");

    app.unmount();
    app = null;

    expect(instance.destroy).toHaveBeenCalled();
    expect(iframe!.parentNode).toBeNull();
  });

  it("does not create iframe when no src is provided", async () => {
    app = createApp(VirtualFrame);
    app.mount(container);
    await nextTick();
    expect(container.querySelector("iframe")).toBeNull();
    expect(MockVF).not.toHaveBeenCalled();
  });
});
