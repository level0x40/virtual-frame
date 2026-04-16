import { describe, it, expect, vi } from "vitest";
import { prepareVirtualFrameProps } from "../src/server.ts";
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

describe("prepareVirtualFrameProps (Nuxt)", () => {
  it("returns props with SSR HTML wrapped in shadow DOM template", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame);

    expect(result.src).toBe("http://remote:3000/");
    expect(result.isolate).toBe("open");
    expect(result._vfHtml).toContain('<template shadowrootmode="open">');
    expect(result._vfHtml).toContain("<style>body{}</style>");
    expect(result._vfHtml).toContain("<div>hello</div>");
    expect(result._vfHtml).toContain("</template>");
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

  it("respects closed isolate mode", async () => {
    const frame = mockFrame();
    const result = await prepareVirtualFrameProps(frame, { isolate: "closed" });

    expect(result.isolate).toBe("closed");
    expect(result._vfHtml).toContain('<template shadowrootmode="closed">');
  });
});
