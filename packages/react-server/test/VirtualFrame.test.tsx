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

import { VirtualFrameActivator } from "../src/client.tsx";
import { VirtualFrameStoreProvider } from "../src/client.tsx";

describe("VirtualFrameActivator (react-server)", () => {
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

  it("renders a marker span with data-vf-init", async () => {
    await act(() => root.render(<VirtualFrameActivator src="/test.html" />));
    expect(container.querySelector("[data-vf-init]")).toBeTruthy();
  });

  it("marker span is hidden", async () => {
    await act(() => root.render(<VirtualFrameActivator src="/test.html" />));
    const marker = container.querySelector("[data-vf-init]");
    expect(marker.style.display).toBe("none");
  });

  it("exposes refresh method via ref", async () => {
    const ref = createRef();
    await act(() => root.render(<VirtualFrameActivator src="/test.html" ref={ref} />));
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.refresh).toBe("function");
  });
});

describe("VirtualFrameStoreProvider (react-server)", () => {
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

  it("renders children", async () => {
    const mockStore = {} as any;
    await act(() =>
      root.render(
        <VirtualFrameStoreProvider store={mockStore}>
          <div data-testid="child">hello</div>
        </VirtualFrameStoreProvider>,
      ),
    );
    expect(container.querySelector("[data-testid='child']")).toBeTruthy();
  });
});
