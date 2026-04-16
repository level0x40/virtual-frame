import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { delay } from "./helpers.js";

// Stub VirtualFrame.prototype.init to prevent real iframe loading
const origInit = VirtualFrame.prototype.init;
VirtualFrame.prototype.init = function () {};

// Now import the element which registers the custom element
import "../src/element.js";

// Restore init after registration
VirtualFrame.prototype.init = origInit;

describe("<virtual-frame> custom element", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is registered as a custom element", () => {
    const Ctor = customElements.get("virtual-frame");
    expect(Ctor).toBeDefined();
  });

  it("creates an element via document.createElement", () => {
    const el = document.createElement("virtual-frame");
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.tagName.toLowerCase()).toBe("virtual-frame");
  });

  it("has a refresh method", () => {
    const el = document.createElement("virtual-frame");
    expect(typeof el.refresh).toBe("function");
  });

  it("observes the expected attributes", () => {
    const Ctor = customElements.get("virtual-frame");
    expect(Ctor.observedAttributes).toEqual([
      "src",
      "isolate",
      "selector",
      "streaming-fps",
      "proxy",
    ]);
  });

  it("creates a hidden iframe when src is a URL", async () => {
    const fixtureUrl = new URL("./fixtures/basic.html", import.meta.url).href;

    const el = document.createElement("virtual-frame");
    el.setAttribute("src", fixtureUrl);
    el.setAttribute("isolate", "open");
    document.body.appendChild(el);

    // Wait for microtask setup + iframe load
    await delay(2000);

    // A hidden iframe should have been created before the element
    const iframe = el.previousElementSibling;
    expect(iframe).toBeTruthy();
    expect(iframe.tagName.toLowerCase()).toBe("iframe");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
  });

  it("references an existing iframe with #id src", async () => {
    const fixtureUrl = new URL("./fixtures/basic.html", import.meta.url).href;

    // Create iframe manually
    const iframe = document.createElement("iframe");
    iframe.id = "test-ref-iframe";
    iframe.src = fixtureUrl;
    document.body.appendChild(iframe);
    await new Promise((r) => iframe.addEventListener("load", r));

    const el = document.createElement("virtual-frame");
    el.setAttribute("src", "#test-ref-iframe");
    el.setAttribute("isolate", "open");
    document.body.appendChild(el);

    await delay(2000);

    // Should have projected content
    const shadow = el.shadowRoot;
    expect(shadow).toBeTruthy();
    const greeting = shadow.querySelector("#greeting");
    expect(greeting).toBeTruthy();
    expect(greeting.textContent).toBe("Hello from iframe");
  });

  it("tears down on disconnect", async () => {
    const fixtureUrl = new URL("./fixtures/basic.html", import.meta.url).href;

    const el = document.createElement("virtual-frame");
    el.setAttribute("src", fixtureUrl);
    el.setAttribute("isolate", "open");
    document.body.appendChild(el);
    await delay(2000);

    // Remove from DOM
    el.remove();
    await delay(100);

    // Owned iframe should also have been removed
    const iframes = document.querySelectorAll("iframe");
    expect(iframes.length).toBe(0);
  });

  it("re-sets up when src attribute changes", async () => {
    const fixtureUrl1 = new URL("./fixtures/basic.html", import.meta.url).href;
    const fixtureUrl2 = new URL("./fixtures/selector.html", import.meta.url)
      .href;

    const el = document.createElement("virtual-frame");
    el.setAttribute("src", fixtureUrl1);
    el.setAttribute("isolate", "open");
    document.body.appendChild(el);
    await delay(2000);

    // Verify basic.html content
    let shadow = el.shadowRoot;
    expect(shadow.querySelector("#greeting")).toBeTruthy();

    // Change src attribute
    el.setAttribute("src", fixtureUrl2);
    await delay(2000);

    // Should now have selector.html content
    shadow = el.shadowRoot;
    expect(shadow.querySelector(".sidebar")).toBeTruthy();
  });
});
