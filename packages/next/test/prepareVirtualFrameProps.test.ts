import { describe, it, expect, vi, beforeEach } from "vitest";
import { prepareVirtualFrameProps, _ssrHtmlCache, _nextSsrId } from "../src/index.ts";
import type { VirtualFrameResult } from "virtual-frame/ssr";

function mockFrame(overrides?: Partial<VirtualFrameResult>): VirtualFrameResult {
  return {
    styles: "<style>body{}</style>",
    body: "<div>hello</div>",
    resumeDelta: {
      u: "http://remote:3000/",
      h: "",
      a: "",
      r: "",
      d: ["<div>hello</div>"],
    },
    render: vi.fn(async () => mockFrame()),
    ...overrides,
  } as VirtualFrameResult;
}

describe("prepareVirtualFrameProps (Next.js)", () => {
  beforeEach(() => {
    _ssrHtmlCache.clear();
    (globalThis as any).__vfSsrIdCounter__ = 0;
  });

  it("returns props with _vfId and src", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame);

    expect(result._vfId).toBe("1");
    expect(result.src).toBe("http://remote:3000/");
    expect(result.isolate).toBe("open");
  });

  it("stores SSR HTML in cache keyed by _vfId", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame);

    expect(_ssrHtmlCache.has(result._vfId)).toBe(true);
    const cached = _ssrHtmlCache.get(result._vfId)!;
    expect(cached).toContain('<template shadowrootmode="open">');
    expect(cached).toContain('<script type="text/vf-resume">');
  });

  it("calls frame.render when selector is provided", async () => {
    const frame = mockFrame();
    await prepareVirtualFrameProps(frame, { selector: "#main" });

    expect(frame.render).toHaveBeenCalledWith({ selector: "#main" });
  });

  it("does not call frame.render when no selector", async () => {
    const frame = mockFrame();
    await prepareVirtualFrameProps(frame);

    expect(frame.render).not.toHaveBeenCalled();
  });

  it("passes through selector and proxy in output", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame, {
      selector: "#main",
      proxy: "/proxy",
    });

    expect(result.selector).toBe("#main");
    expect(result.proxy).toBe("/proxy");
  });

  it("omits selector and proxy when not provided", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame);

    expect("selector" in result).toBe(false);
    expect("proxy" in result).toBe(false);
  });

  it("increments _vfId across multiple calls", async () => {
    const frame = mockFrame();
    const r1 = await prepareVirtualFrameProps(frame);
    const r2 = await prepareVirtualFrameProps(frame);

    expect(r1._vfId).toBe("1");
    expect(r2._vfId).toBe("2");
  });

  it("respects closed isolate mode", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame, { isolate: "closed" });

    expect(result.isolate).toBe("closed");
    const cached = _ssrHtmlCache.get(result._vfId)!;
    expect(cached).toContain('<template shadowrootmode="closed">');
  });
});
