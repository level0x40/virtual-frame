import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, delay, cleanup } from "./helpers.js";

describe("VirtualFrame — scroll sync", () => {
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

  it("projects scrollable content preserving overflow", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const scrollBox = shadow.querySelector("#scroll-box");
    expect(scrollBox).toBeTruthy();

    // The tall content should exist in the projection
    const tall = shadow.querySelector("#tall");
    expect(tall).toBeTruthy();
  });

  it("syncs scroll from projected element to iframe source (mirror → original)", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedBox = shadow.querySelector("#scroll-box");
    const originalBox = iframe.contentDocument.getElementById("scroll-box");

    // Verify original is at top
    expect(originalBox.scrollTop).toBe(0);

    // Scroll the projected element
    projectedBox.scrollTop = 100;
    projectedBox.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(200);

    // Original should have scrolled proportionally
    expect(originalBox.scrollTop).toBeGreaterThan(0);
  });

  it("syncs scroll from iframe source to projected element (original → mirror)", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedBox = shadow.querySelector("#scroll-box");
    const originalBox = iframe.contentDocument.getElementById("scroll-box");

    // Scroll the original element
    originalBox.scrollTop = 150;
    originalBox.dispatchEvent(new Event("scroll"));
    await delay(200);

    // Projected should have scrolled proportionally
    expect(projectedBox.scrollTop).toBeGreaterThan(0);
  });

  it("preserves scroll percentage accurately", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedBox = shadow.querySelector("#scroll-box");
    const originalBox = iframe.contentDocument.getElementById("scroll-box");

    // Scroll projected to ~50% vertically
    const projectedMaxScroll = projectedBox.scrollHeight - projectedBox.clientHeight;
    const targetPct = 0.5;
    projectedBox.scrollTop = Math.round(targetPct * projectedMaxScroll);
    projectedBox.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(200);

    // Original should be ~50% too
    const originalMaxScroll = originalBox.scrollHeight - originalBox.clientHeight;
    if (originalMaxScroll > 0) {
      const originalPct = originalBox.scrollTop / originalMaxScroll;
      expect(originalPct).toBeCloseTo(targetPct, 1);
    }
  });

  it("prevents infinite scroll loops with guard flags", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedBox = shadow.querySelector("#scroll-box");
    const originalBox = iframe.contentDocument.getElementById("scroll-box");

    // Rapid back-and-forth scrolling should not cause infinite loop
    projectedBox.scrollTop = 50;
    projectedBox.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(50);
    originalBox.scrollTop = 100;
    originalBox.dispatchEvent(new Event("scroll"));
    await delay(50);
    projectedBox.scrollTop = 75;
    projectedBox.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(200);

    // Both should have settled — no crash / infinite loop
    expect(projectedBox.scrollTop).toBeGreaterThanOrEqual(0);
    expect(originalBox.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it("handles horizontal scroll sync", async () => {
    iframe = await createIframe("scroll.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedBox = shadow.querySelector("#scroll-box");
    const originalBox = iframe.contentDocument.getElementById("scroll-box");

    // Scroll horizontally
    projectedBox.scrollLeft = 50;
    projectedBox.dispatchEvent(new Event("scroll", { bubbles: true }));
    await delay(200);

    // Original should have scrolled horizontally too
    expect(originalBox.scrollLeft).toBeGreaterThan(0);
  });
});
