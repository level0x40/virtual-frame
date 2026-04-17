import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  VirtualFrame,
  _rewriteBodySelectors,
  _rewriteViewportUnits,
  _rewriteCSS,
} from "../src/core.js";

// Helper: stub init to prevent real iframe loading
let origInit;
function stubInit() {
  origInit = VirtualFrame.prototype.init;
  VirtualFrame.prototype.init = function () {};
}
function restoreInit() {
  VirtualFrame.prototype.init = origInit;
}

// ── VirtualFrame class ──────────────────────────────────────────────────

describe("VirtualFrame", () => {
  beforeEach(stubInit);
  afterEach(restoreInit);

  it("exports VirtualFrame class", () => {
    expect(VirtualFrame).toBeDefined();
    expect(typeof VirtualFrame).toBe("function");
  });

  it("constructor accepts iframe, host and options", () => {
    const iframe = document.createElement("iframe");
    const host = document.createElement("div");

    const vf = new VirtualFrame(iframe, host, {
      isolate: "open",
      selector: ".content",
      streamingFps: 10,
    });

    expect(vf.iframe).toBe(iframe);
    expect(vf.host).toBe(host);
    expect(vf.isolate).toBe("open");
    expect(vf.selector).toBe(".content");
    expect(vf.streamingFps).toBe(10);
  });

  it("defaults streamingFps to undefined (smooth)", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(vf.streamingFps).toBeUndefined();
  });

  it("accepts streamingFps as selector map", () => {
    const fpsMap = { canvas: 30, video: 10 };
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"), {
      streamingFps: fpsMap,
    });
    expect(vf.streamingFps).toEqual(fpsMap);
  });

  it("has destroy method", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(typeof vf.destroy).toBe("function");
  });

  it("has refresh method", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(typeof vf.refresh).toBe("function");
  });

  it("selector defaults to null", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(vf.selector).toBeNull();
  });

  it("initialises cross-origin state", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(vf._crossOrigin).toBe(false);
    expect(vf._remoteIdToNode).toBeInstanceOf(Map);
  });

  it("destroy does not throw when called before init", () => {
    const vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    expect(() => vf.destroy()).not.toThrow();
  });
});

// ── CSS rewriting ───────────────────────────────────────────────────────

describe("_rewriteBodySelectors", () => {
  it("rewrites body to [data-vf-body]", () => {
    const css = "body { margin: 0; }";
    expect(_rewriteBodySelectors(css)).toBe("[data-vf-body] { margin: 0; }");
  });

  it("rewrites body with class selector", () => {
    const css = "body.dark { color: #fff; }";
    expect(_rewriteBodySelectors(css)).toBe("[data-vf-body].dark { color: #fff; }");
  });

  it("rewrites html to :host", () => {
    const css = "html { font-size: 16px; }";
    expect(_rewriteBodySelectors(css)).toBe(":host { font-size: 16px; }");
  });

  it("rewrites compound html body selector", () => {
    const css = "html body { margin: 0; }";
    const result = _rewriteBodySelectors(css);
    expect(result).toContain(":host");
    expect(result).toContain("[data-vf-body]");
  });

  it("does not rewrite body inside property values", () => {
    const css = "div { font-family: body-font; }";
    expect(_rewriteBodySelectors(css)).toBe("div { font-family: body-font; }");
  });

  it("handles multiple rules", () => {
    const css = "body { a: 1; } p { b: 2; } body.x { c: 3; }";
    const result = _rewriteBodySelectors(css);
    expect(result).toContain("[data-vf-body]");
    expect(result).toContain("p");
    expect(result).toContain("[data-vf-body].x");
  });
});

describe("_rewriteViewportUnits", () => {
  it("rewrites vw to cqw", () => {
    expect(_rewriteViewportUnits("50vw")).toBe("50cqw");
  });

  it("rewrites dvw / svw / lvw to cqw", () => {
    expect(_rewriteViewportUnits("100dvw")).toBe("100cqw");
    expect(_rewriteViewportUnits("100svw")).toBe("100cqw");
    expect(_rewriteViewportUnits("100lvw")).toBe("100cqw");
  });

  it("leaves vh untouched (inline-size containment only)", () => {
    expect(_rewriteViewportUnits("100vh")).toBe("100vh");
  });

  it("leaves vmin / vmax untouched", () => {
    expect(_rewriteViewportUnits("10vmin")).toBe("10vmin");
    expect(_rewriteViewportUnits("10vmax")).toBe("10vmax");
  });

  it("rewrites decimal values", () => {
    expect(_rewriteViewportUnits("33.33vw")).toBe("33.33cqw");
    expect(_rewriteViewportUnits(".5vw")).toBe(".5cqw");
  });

  it("handles mixed units in one string", () => {
    const css = "width: 50vw; height: 100vh;";
    const result = _rewriteViewportUnits(css);
    expect(result).toBe("width: 50cqw; height: 100vh;");
  });
});

describe("_rewriteCSS", () => {
  it("applies both body selector and viewport unit rewrites", () => {
    const css = "body { width: 100vw; }";
    const result = _rewriteCSS(css);
    expect(result).toContain("[data-vf-body]");
    expect(result).toContain("100cqw");
  });

  it("leaves unaffected CSS unchanged", () => {
    const css = "div { color: red; }";
    expect(_rewriteCSS(css)).toBe(css);
  });
});
