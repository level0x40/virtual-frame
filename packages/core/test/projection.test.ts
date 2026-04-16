import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import {
  createIframe,
  createHost,
  waitForInit,
  delay,
  cleanup,
} from "./helpers.js";

describe("VirtualFrame — projection integration", () => {
  /** @type {HTMLIFrameElement} */
  let iframe;
  /** @type {HTMLElement} */
  let host;
  /** @type {VirtualFrame | null} */
  let vf;

  afterEach(() => {
    if (vf) {
      vf.destroy();
      vf = null;
    }
    cleanup();
  });

  // ── Basic projection ─────────────────────────────────────────────────

  it("projects iframe body content into the host", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    expect(shadow).toBeTruthy();

    // The projected greeting should exist
    const greeting = shadow.querySelector("#greeting");
    expect(greeting).toBeTruthy();
    expect(greeting.textContent).toBe("Hello from iframe");
  });

  it("projects multiple child elements", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    // All three items should be projected
    const items = shadow.querySelectorAll(".item");
    expect(items.length).toBe(3);
    expect(items[0].textContent).toBe("Item 1");
    expect(items[1].textContent).toBe("Item 2");
    expect(items[2].textContent).toBe("Item 3");
  });

  it("replaces <body> with <div data-vf-body>", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const bodyDiv = shadow.querySelector("[data-vf-body]");
    expect(bodyDiv).toBeTruthy();
    expect(bodyDiv.tagName.toLowerCase()).toBe("div");
    // No real <body> should exist in the shadow
    expect(shadow.querySelector("body")).toBeNull();
  });

  it("skips script elements in projection", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    expect(shadow.querySelector("script")).toBeNull();
  });

  // ── Shadow DOM isolation ──────────────────────────────────────────────

  it("creates an open shadow root when isolate='open'", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);
    expect(host.shadowRoot).toBeTruthy();
  });

  it("creates a closed shadow root when isolate='closed'", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "closed" });
    await waitForInit(vf);
    // Closed shadow root isn't exposed via host.shadowRoot
    expect(host.shadowRoot).toBeNull();
    // But VirtualFrame stores a reference
    expect(vf.getShadowRoot()).toBeTruthy();
  });

  it("projects without shadow DOM when isolate is not set", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host);
    await waitForInit(vf);
    expect(host.shadowRoot).toBeNull();
    // Content placed directly in host
    const greeting = host.querySelector("#greeting");
    expect(greeting).toBeTruthy();
  });

  // ── Selector projection ───────────────────────────────────────────────

  it("projects only the matched subtree when selector is set", async () => {
    iframe = await createIframe("selector.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, {
      isolate: "open",
      selector: "#main-content",
    });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    // Main content should be present
    expect(shadow.querySelector(".tag")).toBeTruthy();
    expect(shadow.querySelector("p").textContent).toBe("Main content here");
    // Sidebar should NOT be present
    expect(shadow.querySelector(".sidebar")).toBeNull();
  });

  // ── CSS injection ─────────────────────────────────────────────────────

  it("injects iframe CSS into the shadow root", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const styles = shadow.querySelectorAll("style");
    expect(styles.length).toBeGreaterThan(0);

    // The combined CSS text should include rules from the fixture
    const allCSS = Array.from(styles)
      .map((s) => s.textContent)
      .join("\n");
    // body rule should be rewritten to [data-vf-body]
    expect(allCSS).toContain("[data-vf-body]");
  });

  it("rewrites viewport width units to container query units", async () => {
    iframe = await createIframe("css-rewrite.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const allCSS = Array.from(shadow.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");
    // vw → cqw, dvw → cqw  (vh/vmin/vmax left alone — inline-size containment)
    expect(allCSS).toContain("cqw");
    expect(allCSS).not.toMatch(/\b\d+vw\b/);
  });

  it("rewrites html selector to :host", async () => {
    iframe = await createIframe("css-rewrite.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const allCSS = Array.from(shadow.querySelectorAll("style"))
      .map((s) => s.textContent)
      .join("\n");
    expect(allCSS).toContain(":host");
  });

  // ── Container type ────────────────────────────────────────────────────

  it("sets container-type on host for full-body projection", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);
    expect(host.style.containerType).toBe("inline-size");
  });

  it("skips container-type when using a selector", async () => {
    iframe = await createIframe("selector.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, {
      isolate: "open",
      selector: "#main-content",
    });
    await waitForInit(vf);
    expect(host.style.containerType).toBeFalsy();
  });

  // ── Destroy ───────────────────────────────────────────────────────────

  it("destroy clears the render root", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);
    expect(host.shadowRoot.children.length).toBeGreaterThan(0);
    vf.destroy();
    expect(host.shadowRoot.innerHTML).toBe("");
    vf = null;
  });

  it("destroy disconnects the mutation observer", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);
    expect(vf.observer).toBeTruthy();
    vf.destroy();
    // After destroy, adding DOM content in the iframe should not throw
    iframe.contentDocument.body.appendChild(
      iframe.contentDocument.createElement("div"),
    );
    await delay(100);
    vf = null;
  });

  // ── Refresh ───────────────────────────────────────────────────────────

  it("refresh re-projects the content", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Modify iframe content directly
    iframe.contentDocument.getElementById("greeting").textContent = "Updated";

    // refresh tears down and re-inits — need to wait for the async init
    vf.isInitialized = false;
    vf.refresh();
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const greeting = shadow.querySelector("#greeting");
    expect(greeting).toBeTruthy();
    expect(greeting.textContent).toBe("Updated");
  });
});
