import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let injectResult: unknown;
vi.mock("@angular/core", () => ({
  Directive: () => (target: any) => target,
  ElementRef: class {},
  Input: () => () => {},
  inject: () => injectResult,
}));

vi.mock("virtual-frame", () => ({
  VirtualFrame: vi.fn(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.refresh = vi.fn();
    this.isInitialized = true;
  }),
}));

import { VirtualFrame as MockVF } from "virtual-frame";
import { VirtualFrameDirective } from "../src/directive";

function createDirective(host: HTMLElement) {
  injectResult = { nativeElement: host };
  return new VirtualFrameDirective();
}

describe("VirtualFrameDirective (Angular)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("exports VirtualFrameDirective class", () => {
    expect(VirtualFrameDirective).toBeDefined();
    expect(typeof VirtualFrameDirective).toBe("function");
  });

  it("creates a hidden iframe on ngOnInit when src is set", () => {
    const directive = createDirective(container);
    directive.src = "/test.html";
    directive.ngOnInit();

    const iframe = container.previousElementSibling as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.tagName).toBe("IFRAME");
    expect(iframe.src).toContain("/test.html");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    expect(iframe.getAttribute("tabindex")).toBe("-1");
    expect(iframe.style.opacity).toBe("0");

    directive.ngOnDestroy();
  });

  it("instantiates VirtualFrameCore with correct options", () => {
    const directive = createDirective(container);
    directive.src = "/test.html";
    directive.isolate = "open";
    directive.selector = "#main";
    directive.streamingFps = 30;
    directive.ngOnInit();

    expect(MockVF).toHaveBeenCalledOnce();
    const [iframe, host, opts] = (MockVF as any).mock.calls[0];
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(host).toBe(container);
    expect(opts).toEqual({
      isolate: "open",
      selector: "#main",
      streamingFps: 30,
    });

    directive.ngOnDestroy();
  });

  it("destroys mirror and removes iframe on ngOnDestroy", () => {
    const directive = createDirective(container);
    directive.src = "/test.html";
    directive.ngOnInit();

    const instance = (MockVF as any).mock.results[0].value;
    const iframe = container.previousElementSibling;

    directive.ngOnDestroy();

    expect(instance.destroy).toHaveBeenCalledOnce();
    expect(iframe!.parentNode).toBeNull();
  });

  it("re-creates mirror on ngOnChanges", () => {
    const directive = createDirective(container);
    directive.src = "/test.html";
    directive.ngOnInit();

    const firstInstance = (MockVF as any).mock.results[0].value;

    directive.src = "/other.html";
    directive.ngOnChanges();

    expect(firstInstance.destroy).toHaveBeenCalledOnce();
    expect(MockVF).toHaveBeenCalledTimes(2);

    directive.ngOnDestroy();
  });

  it("exposes refresh method", () => {
    const directive = createDirective(container);
    directive.src = "/test.html";
    directive.ngOnInit();

    const instance = (MockVF as any).mock.results[0].value;
    directive.refresh();
    expect(instance.refresh).toHaveBeenCalledOnce();

    directive.ngOnDestroy();
  });

  it("accepts an existing iframe via iframeRef", () => {
    const existingIframe = document.createElement("iframe");
    const directive = createDirective(container);
    directive.frame = { _iframe: existingIframe, _refCount: 0 };
    directive.ngOnInit();

    expect(MockVF).toHaveBeenCalledOnce();
    const [iframe] = (MockVF as any).mock.calls[0];
    expect(iframe).toBe(existingIframe);

    directive.ngOnDestroy();
  });

  it("does not create anything when no src or iframeRef is set", () => {
    const directive = createDirective(container);
    directive.ngOnInit();

    expect(MockVF).not.toHaveBeenCalled();
    expect(container.previousElementSibling).toBeNull();
  });
});
