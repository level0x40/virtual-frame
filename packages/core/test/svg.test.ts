import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, cleanup } from "./helpers.js";

describe("VirtualFrame — SVG cloning", () => {
  let iframe;
  let host;
  let vf;

  afterEach(() => {
    if (vf) {
      vf.destroy();
      vf = null;
    }
    cleanup();
  });

  it("projects the SVG element into shadow DOM", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const svg = shadow.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg.id).toBe("test-svg");
  });

  it("preserves SVG namespace on projected elements", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const svg = shadow.querySelector("svg");
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");

    const rect = shadow.querySelector("#svg-rect");
    expect(rect).toBeTruthy();
    expect(rect.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });

  it("clones rect with attributes intact", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const rect = shadow.querySelector("#svg-rect");
    expect(rect).toBeTruthy();
    expect(rect.getAttribute("fill")).toBe("blue");
    expect(rect.getAttribute("rx")).toBe("5");
    expect(rect.getAttribute("width")).toBe("80");
  });

  it("clones circle element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const circle = shadow.querySelector("#svg-circle");
    expect(circle).toBeTruthy();
    expect(circle.getAttribute("cx")).toBe("150");
    expect(circle.getAttribute("r")).toBe("40");
  });

  it("clones ellipse element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const ellipse = shadow.querySelector("#svg-ellipse");
    expect(ellipse).toBeTruthy();
    expect(ellipse.getAttribute("rx")).toBe("60");
    expect(ellipse.getAttribute("opacity")).toBe("0.7");
  });

  it("clones line element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const line = shadow.querySelector("#svg-line");
    expect(line).toBeTruthy();
    expect(line.getAttribute("stroke")).toBe("red");
  });

  it("clones path element with d attribute", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const path = shadow.querySelector("#svg-path");
    expect(path).toBeTruthy();
    expect(path.getAttribute("d")).toBeTruthy();
    expect(path.getAttribute("d")).toContain("M10");
  });

  it("clones text element with content", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const text = shadow.querySelector("#svg-text");
    expect(text).toBeTruthy();
    expect(text.textContent.trim()).toBe("SVG Text");
  });

  it("clones polyline element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const polyline = shadow.querySelector("#svg-polyline");
    expect(polyline).toBeTruthy();
    expect(polyline.getAttribute("points")).toBeTruthy();
  });

  it("clones polygon element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const polygon = shadow.querySelector("#svg-polygon");
    expect(polygon).toBeTruthy();
    expect(polygon.getAttribute("points")).toContain("100,10");
  });

  it("clones g (group) element with children", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const group = shadow.querySelector("#svg-group");
    expect(group).toBeTruthy();
    // Group should contain a child rect
    expect(group.querySelector("rect")).toBeTruthy();
  });

  it("clones defs with linearGradient and clipPath", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const defs = shadow.querySelector("defs");
    expect(defs).toBeTruthy();

    const gradient = defs.querySelector("linearGradient");
    expect(gradient).toBeTruthy();
    expect(gradient.id).toBe("grad1");

    const stops = gradient.querySelectorAll("stop");
    expect(stops.length).toBe(2);

    const clipPath = defs.querySelector("clipPath");
    expect(clipPath).toBeTruthy();
    expect(clipPath.id).toBe("clip1");
  });

  it("clones use element with href", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const useEl = shadow.querySelector("#svg-use");
    expect(useEl).toBeTruthy();
    // href or xlink:href depending on clone method
    const href =
      useEl.getAttribute("href") || useEl.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    expect(href).toBe("#svg-rect");
  });

  it("clones image element", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const img = shadow.querySelector("#svg-image");
    expect(img).toBeTruthy();
    expect(
      img.getAttribute("href") || img.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
    ).toBeTruthy();
  });

  it("projects non-SVG content alongside SVG", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    // Both SVG and regular HTML should be present
    expect(shadow.querySelector("svg")).toBeTruthy();
    expect(shadow.querySelector("#svg-status")).toBeTruthy();
    expect(shadow.querySelector("#svg-status").textContent).toBe("SVG rendered");
  });

  it("SVG viewBox attribute is preserved", async () => {
    iframe = await createIframe("svg.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const svg = shadow.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    expect(svg.getAttribute("width")).toBe("200");
    expect(svg.getAttribute("height")).toBe("200");
  });
});
