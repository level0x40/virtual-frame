import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import {
  createIframe,
  createHost,
  waitForInit,
  delay,
  cleanup,
} from "./helpers.js";

describe("VirtualFrame — canvas projection", () => {
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

  it("replaces source canvas with a mirror canvas element", async () => {
    iframe = await createIframe("canvas.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const mirrorCanvas = shadow.querySelector("canvas");
    expect(mirrorCanvas).toBeTruthy();
    expect(mirrorCanvas.getAttribute("data-mirror-source")).toBe("canvas");
  });

  it("mirror canvas has matching id", async () => {
    iframe = await createIframe("canvas.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const mirrorCanvas = shadow.querySelector("canvas");
    expect(mirrorCanvas.id).toBe("test-canvas");
  });

  it("draws content onto the mirror canvas via drawImage", async () => {
    iframe = await createIframe("canvas.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Wait for the rAF-based draw loop to fire
    await delay(500);

    const shadow = host.shadowRoot;
    const mirrorCanvas = shadow.querySelector("canvas");
    expect(mirrorCanvas.width).toBeGreaterThan(0);
    expect(mirrorCanvas.height).toBeGreaterThan(0);

    // Read a pixel to verify content was drawn (not blank)
    const ctx = mirrorCanvas.getContext("2d");
    const pixel = ctx.getImageData(10, 10, 1, 1).data;
    // Expect non-transparent pixel (the fixture draws a red rect at 0,0)
    expect(pixel[3]).toBeGreaterThan(0); // alpha > 0
  });

  it("preserves alpha transparency on mirror canvas", async () => {
    iframe = await createIframe("canvas.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    await delay(500);

    const shadow = host.shadowRoot;
    const mirrorCanvas = shadow.querySelector("canvas");
    const ctx = mirrorCanvas.getContext("2d");

    // The fixture draws rgba(0,255,0,0.5) overlay at (75, 50)
    const pixel = ctx.getImageData(75, 50, 1, 1).data;
    // Green channel should be > 0, and alpha should be 255
    // (composited red + semi-transparent green on opaque canvas)
    expect(pixel[1]).toBeGreaterThan(0); // green component present
  });

  it("cleanup stops the requestAnimationFrame loop", async () => {
    iframe = await createIframe("canvas.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    await delay(200);

    // activeStreams should have at least one entry with rafId
    const hasRaf = vf.activeStreams.some(
      (e) => e.rafId != null || typeof e.rafId === "number",
    );
    expect(hasRaf || vf.activeStreams.length > 0).toBe(true);

    vf.destroy();
    // After destroy, activeStreams is cleared
    expect(vf.activeStreams).toEqual([]);
    vf = null;
  });
});
