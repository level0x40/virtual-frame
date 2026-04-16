import { describe, it, expect } from "vitest";
import { buildSsrHtml } from "../src/cache.ts";
import type { VirtualFrameResult } from "virtual-frame/ssr";

function mockResult(overrides?: Partial<VirtualFrameResult>): VirtualFrameResult {
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
    render: async () => mockResult(),
    ...overrides,
  } as VirtualFrameResult;
}

describe("buildSsrHtml (react-server)", () => {
  it("wraps in shadow DOM template when isolate is provided", () => {
    const result = mockResult();
    const html = buildSsrHtml(result, "open");

    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("</template>");
    expect(html).toContain("<style>body{}</style>");
    expect(html).toContain("<div>hello</div>");
    expect(html).toContain('<script type="text/vf-resume">');
  });

  it("returns flat HTML when isolate is undefined", () => {
    const result = mockResult();
    const html = buildSsrHtml(result);

    expect(html).not.toContain("<template");
    expect(html).toContain("<style>body{}</style>");
    expect(html).toContain("<div>hello</div>");
    expect(html).toContain('<script type="text/vf-resume">');
  });

  it("escapes </ in resume delta JSON", () => {
    const result = mockResult({
      resumeDelta: {
        u: "http://remote:3000/",
        h: "",
        a: "",
        r: "",
        d: ["</script>"],
      },
    });
    const html = buildSsrHtml(result, "open");

    // Should escape </ to <\/ to avoid breaking the script tag
    expect(html).toContain("<\\/script>");
    expect(html).not.toContain("</script></script>");
  });

  it("embeds resume delta as JSON in script tag", () => {
    const result = mockResult();
    const html = buildSsrHtml(result, "open");

    // Extract the script content
    const match = html.match(/<script type="text\/vf-resume">(.*?)<\\?\/script>/);
    expect(match).toBeTruthy();

    const delta = JSON.parse(match![1]);
    expect(delta.u).toBe("http://remote:3000/");
    expect(delta.d).toEqual(["<div>hello</div>"]);
  });
});
