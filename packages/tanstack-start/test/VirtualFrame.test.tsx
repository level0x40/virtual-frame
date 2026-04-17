import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function () {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrame } from "../src/index.ts";

describe("VirtualFrame (TanStack Start)", () => {
  let container, root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  it("renders a host div", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));
    expect(container.querySelector("[data-vf-host]")).toBeTruthy();
  });

  it("creates a hidden iframe when src is provided", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain("/test.html");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    expect(iframe.getAttribute("tabindex")).toBe("-1");
    expect(iframe.style.opacity).toBe("0");
  });

  it("instantiates VirtualFrameCore with correct options", async () => {
    await act(() =>
      root.render(
        <VirtualFrame src="/test.html" isolate="open" selector="#main" streamingFps={30} />,
      ),
    );
    expect(MockVF).toHaveBeenCalledOnce();
    const [iframe, host, opts] = MockVF.mock.calls[0];
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(opts).toEqual({
      isolate: "open",
      selector: "#main",
      streamingFps: 30,
    });
  });

  it("destroys mirror and removes iframe on unmount", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));
    const instance = MockVF.mock.results[0].value;
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();

    await act(() => root.unmount());
    root = createRoot(container);

    expect(instance.destroy).toHaveBeenCalled();
    expect(iframe.parentNode).toBeNull();
  });

  it("exposes refresh method via ref", async () => {
    const ref = createRef();
    await act(() => root.render(<VirtualFrame src="/test.html" ref={ref} />));
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.refresh).toBe("function");

    const instance = MockVF.mock.results[0].value;
    ref.current.refresh();
    expect(instance.refresh).toHaveBeenCalledOnce();
  });

  it("forwards extra props to host div", async () => {
    await act(() =>
      root.render(<VirtualFrame src="/test.html" className="my-frame" data-testid="vf" />),
    );
    const host = container.querySelector("[data-vf-host]");
    expect(host.className).toBe("my-frame");
    expect(host.dataset.testid).toBe("vf");
  });

  it("shares iframe across multiple instances with same src", async () => {
    await act(() =>
      root.render(
        <>
          <VirtualFrame src="/test.html" />
          <VirtualFrame src="/test.html" />
        </>,
      ),
    );
    // Both should share a single iframe
    const iframes = container.querySelectorAll("iframe");
    expect(iframes.length).toBe(1);
    expect(MockVF).toHaveBeenCalledTimes(2);
  });

  it("filters underscore-prefixed props from DOM", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" _vfHtml="<div>test</div>" />));
    const host = container.querySelector("[data-vf-host]");
    expect(host.hasAttribute("_vfHtml")).toBe(false);
  });
});
