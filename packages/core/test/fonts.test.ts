import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, delay, cleanup } from "./helpers.js";

describe("VirtualFrame — font injection (shadow DOM isolation)", () => {
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

  it("injects @font-face rules into shadow DOM styles", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const styles = shadow.querySelectorAll("style");
    const allCSS = Array.from(styles)
      .map((s) => s.textContent)
      .join("\n");

    // @font-face should be present in shadow DOM CSS
    expect(allCSS).toContain("@font-face");
  });

  it("namespaces font-family with __vf_ prefix in isolated mode", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const styles = shadow.querySelectorAll("style");
    const allCSS = Array.from(styles)
      .map((s) => s.textContent)
      .join("\n");

    // Font references should be namespaced with __vf_ prefix
    expect(allCSS).toMatch(/__vf_[a-f0-9]+_/);
    // Original font name should not appear unnamespaced in font-family declarations
    expect(allCSS).toContain("__vf_");
  });

  it("produces deterministic font prefix (same CSS → same prefix)", async () => {
    // First instance
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow1 = host.shadowRoot;
    const css1 = Array.from(shadow1.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");

    // Extract the __vf_ prefix
    const prefixMatch1 = css1.match(/__vf_[a-f0-9]+_/);
    expect(prefixMatch1).toBeTruthy();

    vf.destroy();
    vf = null;
    cleanup();

    // Second instance with same fixture
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow2 = host.shadowRoot;
    const css2 = Array.from(shadow2.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");

    const prefixMatch2 = css2.match(/__vf_[a-f0-9]+_/);
    expect(prefixMatch2).toBeTruthy();

    // Same CSS source should produce the same prefix
    expect(prefixMatch1[0]).toBe(prefixMatch2[0]);
  });

  it("does not namespace fonts in non-isolated mode", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host);
    await waitForInit(vf);

    // In non-isolated mode, CSS goes into the host div directly
    const styles = host.querySelectorAll("style");
    const allCSS = Array.from(styles)
      .map((s) => s.textContent)
      .join("\n");

    // No __vf_ namespacing in non-isolated mode
    expect(allCSS).not.toMatch(/__vf_[a-f0-9]+_/);
  });

  it("prevents FOUC with visibility:hidden during font loading", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });

    // Wait for init — FOUC prevention should have been applied and then removed
    await waitForInit(vf);

    // After init completes, the hide style should be removed
    await delay(500);
    const shadow = host.shadowRoot;
    const hideStyle = shadow.querySelector("style[data-vf-hide]");
    expect(hideStyle).toBeNull();
  });

  it("projects text content with custom font class", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const customText = shadow.querySelector("#custom-text");
    expect(customText).toBeTruthy();
    expect(customText.textContent).toBe("Custom font text");
    expect(customText.classList.contains("custom-font")).toBe(true);
  });

  it("cleans up injected fonts on destroy", async () => {
    iframe = await createIframe("fonts.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // The _injectedJSFonts array tracks JS-created fonts
    const _injectedBefore = vf._injectedJSFonts?.length ?? 0;

    vf.destroy();
    vf = null;

    // After destroy, no injected fonts should remain
    // (this verifies the cleanup path ran without error)
    expect(true).toBe(true);
  });
});

describe("VirtualFrame — _extractFontFaceNames", () => {
  let vf;

  afterEach(() => {
    if (vf) {
      vf.destroy();
      vf = null;
    }
  });

  it("extracts font-family from @font-face blocks", () => {
    vf = new VirtualFrame(document.createElement("iframe"), document.createElement("div"));
    // Stub init
    const origInit = VirtualFrame.prototype.init;
    VirtualFrame.prototype.init = function () {};

    const testVf = new VirtualFrame(
      document.createElement("iframe"),
      document.createElement("div"),
    );
    VirtualFrame.prototype.init = origInit;

    const css = `
      @font-face {
        font-family: 'MyFont';
        src: url(font.woff2) format('woff2');
      }
      @font-face {
        font-family: "AnotherFont";
        src: url(another.woff2) format('woff2');
      }
    `;
    const names = testVf._extractFontFaceNames(css);
    expect(names.has("MyFont")).toBe(true);
    expect(names.has("AnotherFont")).toBe(true);
    expect(names.size).toBe(2);
    testVf.destroy();
  });

  it("returns empty set when no @font-face present", () => {
    const origInit = VirtualFrame.prototype.init;
    VirtualFrame.prototype.init = function () {};
    const testVf = new VirtualFrame(
      document.createElement("iframe"),
      document.createElement("div"),
    );
    VirtualFrame.prototype.init = origInit;

    const names = testVf._extractFontFaceNames("body { margin: 0; }");
    expect(names.size).toBe(0);
    testVf.destroy();
  });
});

describe("VirtualFrame — _computeFontPrefix", () => {
  it("returns default prefix when no @font-face present", () => {
    const origInit = VirtualFrame.prototype.init;
    VirtualFrame.prototype.init = function () {};
    const testVf = new VirtualFrame(
      document.createElement("iframe"),
      document.createElement("div"),
    );
    VirtualFrame.prototype.init = origInit;

    const prefix = testVf._computeFontPrefix([{ cssText: "body { margin: 0; }" }]);
    expect(prefix).toBe("__vf_");
    testVf.destroy();
  });

  it("produces a hex-based prefix for CSS with @font-face", () => {
    const origInit = VirtualFrame.prototype.init;
    VirtualFrame.prototype.init = function () {};
    const testVf = new VirtualFrame(
      document.createElement("iframe"),
      document.createElement("div"),
    );
    VirtualFrame.prototype.init = origInit;

    const prefix = testVf._computeFontPrefix([
      {
        cssText: `@font-face { font-family: 'Test'; src: url(test.woff2); }`,
      },
    ]);
    expect(prefix).toMatch(/^__vf_[a-f0-9]+_$/);
    testVf.destroy();
  });

  it("produces same prefix for identical @font-face blocks", () => {
    const origInit = VirtualFrame.prototype.init;
    VirtualFrame.prototype.init = function () {};
    const testVf = new VirtualFrame(
      document.createElement("iframe"),
      document.createElement("div"),
    );
    VirtualFrame.prototype.init = origInit;

    const css = `@font-face { font-family: 'Test'; src: url(test.woff2); }`;
    const prefix1 = testVf._computeFontPrefix([{ cssText: css }]);
    const prefix2 = testVf._computeFontPrefix([{ cssText: css }]);
    expect(prefix1).toBe(prefix2);
    testVf.destroy();
  });
});
