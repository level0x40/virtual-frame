import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockState = vi.hoisted(() => ({
  PLATFORM_ID: Symbol("PLATFORM_ID"),
  elementRef: null as unknown,
  platformId: "browser" as unknown,
}));

vi.mock("@angular/core", () => ({
  Component: () => (target: any) => target,
  ElementRef: class {},
  Input: () => () => {},
  PLATFORM_ID: mockState.PLATFORM_ID,
  inject: (token: unknown) => {
    if (token === mockState.PLATFORM_ID) return mockState.platformId;
    return mockState.elementRef;
  },
}));

vi.mock("@angular/common", () => ({
  isPlatformBrowser: (id: string) => id === "browser",
}));

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrameComponent } from "../src/client";

/**
 * Instantiate the component directly — bypasses Angular DI so the tests
 * run in a plain vitest browser environment without TestBed. Mirrors the
 * approach used by `@virtual-frame/angular`'s directive tests.
 *
 * `platformId` is the value Angular normally injects via `PLATFORM_ID`.
 * Use "browser" for the client path and "server" to exercise the SSR
 * innerHTML handoff branch.
 */
function createComponent(host: HTMLElement, platformId: "browser" | "server" = "browser") {
  mockState.elementRef = { nativeElement: host };
  mockState.platformId = platformId;
  return new VirtualFrameComponent();
}

describe("VirtualFrameComponent (Analog)", () => {
  let container: HTMLDivElement;
  let parent: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    // The component inserts the iframe as a previous sibling of the host,
    // so the host MUST have a parent node.
    parent = document.createElement("div");
    container = document.createElement("div");
    parent.appendChild(container);
    document.body.appendChild(parent);
  });

  afterEach(() => {
    parent.remove();
  });

  it("exports VirtualFrameComponent class", () => {
    expect(VirtualFrameComponent).toBeDefined();
    expect(typeof VirtualFrameComponent).toBe("function");
  });

  it("creates a hidden iframe on ngOnInit when src is set (browser)", () => {
    const comp = createComponent(container);
    comp.src = "/test.html";
    comp.ngOnInit();

    const iframe = container.previousElementSibling as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.src).toContain("/test.html");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    expect(iframe.getAttribute("tabindex")).toBe("-1");
    expect(iframe.style.opacity).toBe("0");

    comp.ngOnDestroy();
  });

  it("instantiates VirtualFrameCore with correct options", () => {
    const comp = createComponent(container);
    comp.src = "/test.html";
    comp.isolate = "open";
    comp.selector = "#main";
    comp.streamingFps = 30;
    comp.ngOnInit();

    expect(MockVF).toHaveBeenCalledOnce();
    const [iframe, host, opts] = (MockVF as any).mock.calls[0];
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBe(container);
    expect(opts).toEqual({
      isolate: "open",
      selector: "#main",
      streamingFps: 30,
    });

    comp.ngOnDestroy();
  });

  it("destroys mirror and releases iframe on ngOnDestroy", () => {
    const comp = createComponent(container);
    comp.src = "/test.html";
    comp.ngOnInit();

    const instance = (MockVF as any).mock.results[0].value;
    const iframe = container.previousElementSibling;

    comp.ngOnDestroy();

    expect(instance.destroy).toHaveBeenCalledOnce();
    // Last consumer — iframe should be removed from the DOM.
    expect(iframe!.parentNode).toBeNull();
  });

  it("re-creates mirror on ngOnChanges (browser)", () => {
    const comp = createComponent(container);
    comp.src = "/test.html";
    comp.ngOnInit();

    const firstInstance = (MockVF as any).mock.results[0].value;

    comp.src = "/other.html";
    comp.ngOnChanges();

    expect(firstInstance.destroy).toHaveBeenCalledOnce();
    expect(MockVF).toHaveBeenCalledTimes(2);

    comp.ngOnDestroy();
  });

  it("exposes refresh method", () => {
    const comp = createComponent(container);
    comp.src = "/test.html";
    comp.ngOnInit();

    const instance = (MockVF as any).mock.results[0].value;
    comp.refresh();
    expect(instance.refresh).toHaveBeenCalledOnce();

    comp.ngOnDestroy();
  });

  it("does not create a VirtualFrame when no src is set", () => {
    const comp = createComponent(container);
    comp.ngOnInit();

    expect(MockVF).not.toHaveBeenCalled();
    expect(container.previousElementSibling).toBeNull();
  });

  it("shares a single iframe across multiple instances pointing at the same src", () => {
    const host2 = document.createElement("div");
    parent.appendChild(host2);

    const a = createComponent(container);
    a.src = "/shared.html";
    a.ngOnInit();

    const b = createComponent(host2);
    b.src = "/shared.html";
    b.ngOnInit();

    // Both instances should reuse the same iframe element.
    const [iframeA] = (MockVF as any).mock.calls[0];
    const [iframeB] = (MockVF as any).mock.calls[1];
    expect(iframeA).toBe(iframeB);

    // Only one iframe in the DOM for this src.
    const iframes = Array.from(parent.querySelectorAll("iframe")) as HTMLIFrameElement[];
    expect(iframes.length).toBe(1);

    // First teardown keeps the shared iframe alive.
    a.ngOnDestroy();
    expect(iframeA.parentNode).not.toBeNull();

    // Last teardown removes it.
    b.ngOnDestroy();
    expect(iframeA.parentNode).toBeNull();
  });

  describe("SSR (server platform)", () => {
    it("renders vfHtml as innerHTML and skips VirtualFrame instantiation", () => {
      const comp = createComponent(container, "server");
      comp.src = "/test.html";
      comp.vfHtml = '<template shadowrootmode="open"><span>ssr</span></template>';
      comp.ngOnInit();

      expect(MockVF).not.toHaveBeenCalled();
      expect(container.innerHTML).toContain("shadowrootmode");
      expect(container.innerHTML).toContain("ssr");
      // No iframe inserted on the server path.
      expect(container.previousElementSibling).toBeNull();
    });

    it("does nothing on server when no vfHtml is provided", () => {
      const comp = createComponent(container, "server");
      comp.src = "/test.html";
      comp.ngOnInit();

      expect(MockVF).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe("");
      expect(container.previousElementSibling).toBeNull();
    });
  });
});
