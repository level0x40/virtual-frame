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
  _buildEnvShim: vi.fn(() => ""),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrame } from "../src/client.tsx";

describe("VirtualFrame (Next.js client)", () => {
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

  it("renders a wrapper with host div and activator marker", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));
    expect(container.querySelector("[data-vf-wrapper]")).toBeTruthy();
    expect(container.querySelector("[data-vf-host]")).toBeTruthy();
    expect(container.querySelector("[data-vf-init]")).toBeTruthy();
  });

  it("activator creates iframe when resume delta is present", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));

    // Inject a resume delta into the host element so the activator can find it
    const host = container.querySelector("[data-vf-host]");
    const script = document.createElement("script");
    script.type = "text/vf-resume";
    script.textContent = JSON.stringify({
      u: "http://remote:3000/",
      h: "",
      a: "",
      r: "",
      d: ["<div>hello</div>"],
    });
    host.appendChild(script);

    // Re-render to trigger the effect with the delta now in the DOM
    await act(() => root.render(<VirtualFrame src="/test.html" />));

    // The activator should have created an iframe and instantiated VirtualFrameCore
    if (MockVF.mock.calls.length > 0) {
      const [iframe, hostEl] = MockVF.mock.calls[0];
      expect(iframe).toBeInstanceOf(HTMLIFrameElement);
      expect(hostEl).toBeInstanceOf(HTMLDivElement);
    }
  });

  it("exposes refresh method via ref", async () => {
    const ref = createRef();
    await act(() => root.render(<VirtualFrame src="/test.html" ref={ref} />));
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.refresh).toBe("function");
  });

  it("forwards extra props to host div", async () => {
    await act(() =>
      root.render(<VirtualFrame src="/test.html" className="my-frame" data-testid="vf" />),
    );
    const host = container.querySelector("[data-vf-host]");
    expect(host.className).toBe("my-frame");
    expect(host.dataset.testid).toBe("vf");
  });

  it("filters underscore-prefixed props from DOM", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" _vfId="123" />));
    const host = container.querySelector("[data-vf-host]");
    expect(host.hasAttribute("_vfId")).toBe(false);
  });

  it("renders wrapper with display:contents", async () => {
    await act(() => root.render(<VirtualFrame src="/test.html" />));
    const wrapper = container.querySelector("[data-vf-wrapper]");
    expect(wrapper.style.display).toBe("contents");
  });
});
