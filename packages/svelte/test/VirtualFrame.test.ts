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
import VirtualFrame from "../src/VirtualFrame.svelte";

describe("VirtualFrame (Svelte)", () => {
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

  it("renders a host element", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/test.html" },
    });
    await tick();
    expect(container.querySelector("div")).toBeTruthy();
    unmount(comp);
  });

  it("creates a hidden iframe when src is provided", async () => {
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
    const lastCall = (MockVF as unknown as ReturnType<typeof vi.fn>).mock.calls[
      (MockVF as unknown as ReturnType<typeof vi.fn>).mock.calls.length - 1
    ];
    const [iframe, host, opts] = lastCall;
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(opts).toEqual({
      isolate: "open",
      selector: "#main",
      streamingFps: 30,
    });
    unmount(comp);
  });

  it("cleans up on unmount", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/test.html" },
    });
    await tick();
    const lastIdx =
      (MockVF as unknown as ReturnType<typeof vi.fn>).mock.results.length - 1;
    const instance = (MockVF as unknown as ReturnType<typeof vi.fn>).mock
      .results[lastIdx].value;
    const iframe = container.querySelector("iframe");

    unmount(comp);

    expect(instance.destroy).toHaveBeenCalled();
    expect(iframe!.parentNode).toBeNull();
  });

  it("exposes refresh method", async () => {
    const comp = mount(VirtualFrame, {
      target: container,
      props: { src: "/test.html" },
    }) as { refresh: () => void };
    await tick();
    const lastIdx =
      (MockVF as unknown as ReturnType<typeof vi.fn>).mock.results.length - 1;
    const instance = (MockVF as unknown as ReturnType<typeof vi.fn>).mock
      .results[lastIdx].value;

    expect(typeof comp.refresh).toBe("function");
    comp.refresh();
    expect(instance.refresh).toHaveBeenCalled();
    unmount(comp);
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
});
