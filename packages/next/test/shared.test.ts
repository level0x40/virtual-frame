import { describe, it, expect, beforeEach } from "vitest";
import { _ssrHtmlCache, _nextSsrId } from "../src/shared.ts";

describe("shared SSR utilities (Next.js)", () => {
  beforeEach(() => {
    _ssrHtmlCache.clear();
    // Reset the global counter for deterministic tests
    (globalThis as any).__vfSsrIdCounter__ = 0;
  });

  it("_nextSsrId returns incrementing string ids", () => {
    const id1 = _nextSsrId();
    const id2 = _nextSsrId();
    const id3 = _nextSsrId();

    expect(id1).toBe("1");
    expect(id2).toBe("2");
    expect(id3).toBe("3");
  });

  it("_ssrHtmlCache is a Map that can store and retrieve HTML", () => {
    _ssrHtmlCache.set("1", "<div>hello</div>");
    expect(_ssrHtmlCache.get("1")).toBe("<div>hello</div>");
    expect(_ssrHtmlCache.size).toBe(1);

    _ssrHtmlCache.delete("1");
    expect(_ssrHtmlCache.has("1")).toBe(false);
  });

  it("_ssrHtmlCache is shared via globalThis", () => {
    _ssrHtmlCache.set("test", "value");
    expect((globalThis as any).__vfSsrHtmlCache__.get("test")).toBe("value");
  });
});
