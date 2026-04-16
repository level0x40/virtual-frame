import { describe, it, expect, vi } from "vitest";

vi.mock("virtual-frame/ssr", () => ({
  fetchVirtualFrame: vi.fn(),
  renderVirtualFrame: vi.fn(),
}));

import { prepareVirtualFrameProps } from "../src/server";
import type { VirtualFrameResult } from "virtual-frame/ssr";

/**
 * Build a minimal stub `VirtualFrameResult` — just the fields
 * `prepareVirtualFrameProps` touches. `render` simulates a second fetch
 * for the selector-projected variant.
 */
function makeFrame(
  overrides?: Partial<VirtualFrameResult>,
): VirtualFrameResult {
  const base = {
    body: "<main>body</main>",
    styles: "<style>main{color:red}</style>",
    resumeDelta: { u: "http://remote.test/page" },
    render: vi.fn(async ({ selector }: { selector: string }) => ({
      body: `<section id="${selector.replace("#", "")}">projected</section>`,
      styles: "<style>section{color:blue}</style>",
      resumeDelta: { u: "http://remote.test/page" },
    })),
  };
  return { ...base, ...overrides } as unknown as VirtualFrameResult;
}

describe("prepareVirtualFrameProps (SvelteKit server)", () => {
  it("wraps full-page SSR HTML in declarative shadow DOM by default", async () => {
    const frame = makeFrame();
    const props = await prepareVirtualFrameProps(frame);

    expect(props.isolate).toBe("open");
    expect(props.src).toBe("http://remote.test/page");
    expect(props._vfHtml).toContain('<template shadowrootmode="open">');
    expect(props._vfHtml).toContain("<main>body</main>");
    expect(props._vfHtml).toContain("<style>main{color:red}</style>");
    expect(props._vfHtml).toMatch(/<\/template>$/);
    expect(props.selector).toBeUndefined();
    expect(props.proxy).toBeUndefined();
    expect(frame.render as unknown as ReturnType<typeof vi.fn>).not
      .toHaveBeenCalled();
  });

  it("honours explicit isolate='closed'", async () => {
    const props = await prepareVirtualFrameProps(makeFrame(), {
      isolate: "closed",
    });
    expect(props.isolate).toBe("closed");
    expect(props._vfHtml).toContain('<template shadowrootmode="closed">');
  });

  it("calls frame.render with the selector and uses its output", async () => {
    const frame = makeFrame();
    const props = await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    });

    expect(frame.render).toHaveBeenCalledWith({ selector: "#counter-card" });
    expect(props.selector).toBe("#counter-card");
    expect(props._vfHtml).toContain('id="counter-card"');
    expect(props._vfHtml).toContain("projected");
    // Selector-projected styles come from render(), not the original fetch.
    expect(props._vfHtml).toContain("section{color:blue}");
    expect(props._vfHtml).not.toContain("main{color:red}");
  });

  it("passes through the proxy option", async () => {
    const props = await prepareVirtualFrameProps(makeFrame(), {
      proxy: "/__vf",
    });
    expect(props.proxy).toBe("/__vf");
  });

  it("omits optional fields when not provided", async () => {
    const props = await prepareVirtualFrameProps(makeFrame());
    expect("selector" in props).toBe(false);
    expect("proxy" in props).toBe(false);
  });

  it("uses resumeDelta.u as the src URL", async () => {
    const frame = makeFrame({
      resumeDelta: { u: "https://other.example/x" } as any,
    });
    const props = await prepareVirtualFrameProps(frame);
    expect(props.src).toBe("https://other.example/x");
  });
});
