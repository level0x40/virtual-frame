import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import {
  createIframe,
  createHost,
  waitForInit,
  delay,
  cleanup,
} from "./helpers.js";

describe("VirtualFrame — mutation observation", () => {
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

  it("projects dynamically added elements", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Trigger a DOM addition inside the iframe
    iframe.contentWindow.addElement("div", "New item", "new-item");
    // Wait for mutation to propagate
    await delay(300);

    const shadow = host.shadowRoot;
    const added = shadow.querySelector("#new-item");
    expect(added).toBeTruthy();
    expect(added.textContent).toBe("New item");
  });

  it("removes projected elements when source elements are removed", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    expect(shadow.querySelector("#initial")).toBeTruthy();

    // Remove the element in the iframe
    iframe.contentWindow.removeElement("initial");
    await delay(300);

    expect(shadow.querySelector("#initial")).toBeNull();
  });

  it("updates projected text when source text changes", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    iframe.contentWindow.updateText("initial", "Changed text");
    await delay(300);

    const shadow = host.shadowRoot;
    const initial = shadow.querySelector("#initial");
    expect(initial).toBeTruthy();
    expect(initial.textContent).toBe("Changed text");
  });

  it("reflects attribute changes on projected elements", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Set an attribute in the iframe
    iframe.contentDocument
      .getElementById("initial")
      .setAttribute("data-custom", "hello");
    await delay(300);

    const shadow = host.shadowRoot;
    const initial = shadow.querySelector("#initial");
    expect(initial.getAttribute("data-custom")).toBe("hello");
  });

  it("handles multiple rapid mutations", async () => {
    iframe = await createIframe("mutations.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Fire several mutations quickly
    for (let i = 0; i < 5; i++) {
      iframe.contentWindow.addElement("span", `Rapid ${i}`, `rapid-${i}`);
    }
    await delay(500);

    const shadow = host.shadowRoot;
    for (let i = 0; i < 5; i++) {
      const el = shadow.querySelector(`#rapid-${i}`);
      expect(el).toBeTruthy();
      expect(el.textContent).toBe(`Rapid ${i}`);
    }
  });
});
