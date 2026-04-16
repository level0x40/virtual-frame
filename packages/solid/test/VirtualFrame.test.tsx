import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "solid-js/web";

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function () {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrame } from "../src/index.tsx";

describe("VirtualFrame (Solid)", () => {
  let container, dispose;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (dispose) {
      dispose();
      dispose = null;
    }
    container.remove();
  });

  it("renders a host div", () => {
    dispose = render(() => <VirtualFrame src="/test.html" />, container);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("creates a hidden iframe when src is provided", () => {
    dispose = render(() => <VirtualFrame src="/test.html" />, container);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe.src).toContain("/test.html");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    expect(iframe.getAttribute("tabindex")).toBe("-1");
  });

  it("instantiates VirtualFrameCore with correct options", () => {
    dispose = render(
      () => (
        <VirtualFrame
          src="/test.html"
          isolate="closed"
          selector=".content"
          streamingFps={15}
        />
      ),
      container,
    );
    expect(MockVF).toHaveBeenCalled();
    const lastCall = MockVF.mock.calls[MockVF.mock.calls.length - 1];
    const [iframe, host, opts] = lastCall;
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBeInstanceOf(HTMLDivElement);
    expect(opts).toEqual({
      isolate: "closed",
      selector: ".content",
      streamingFps: 15,
    });
  });

  it("cleans up on dispose", () => {
    dispose = render(() => <VirtualFrame src="/test.html" />, container);
    const lastIdx = MockVF.mock.results.length - 1;
    const instance = MockVF.mock.results[lastIdx].value;
    const iframe = container.querySelector("iframe");

    dispose();
    dispose = null;

    expect(instance.destroy).toHaveBeenCalled();
    expect(iframe.parentNode).toBeNull();
  });

  it("exposes refresh via ref callback", () => {
    let refValue;
    dispose = render(
      () => <VirtualFrame src="/test.html" ref={(r) => (refValue = r)} />,
      container,
    );
    expect(refValue).toBeTruthy();
    expect(typeof refValue.refresh).toBe("function");

    const lastIdx = MockVF.mock.results.length - 1;
    const instance = MockVF.mock.results[lastIdx].value;
    refValue.refresh();
    expect(instance.refresh).toHaveBeenCalled();
  });

  it("does not create iframe when no src is provided", () => {
    dispose = render(() => <VirtualFrame />, container);
    expect(container.querySelector("iframe")).toBeNull();
    expect(MockVF).not.toHaveBeenCalled();
  });
});
