import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, delay, cleanup } from "./helpers.js";

describe("VirtualFrame — form element sync & event proxying", () => {
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

  it("projects form elements with initial values", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const textInput = shadow.querySelector("#text-input");
    expect(textInput).toBeTruthy();
    expect(textInput.tagName.toLowerCase()).toBe("input");
  });

  it("projects checkbox elements", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const checkbox = shadow.querySelector("#checkbox-input");
    expect(checkbox).toBeTruthy();
    expect(checkbox.type).toBe("checkbox");
  });

  it("projects select elements with options", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const select = shadow.querySelector("#select-input");
    expect(select).toBeTruthy();
    expect(select.options.length).toBe(3);
  });

  it("projects textarea elements", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const textarea = shadow.querySelector("#textarea-input");
    expect(textarea).toBeTruthy();
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("proxies click events to the original element", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Set up a click listener on the original button
    let clicked = false;
    iframe.contentDocument.getElementById("action-btn").addEventListener("click", () => {
      clicked = true;
    });

    // Click the projected button
    const shadow = host.shadowRoot;
    const projectedBtn = shadow.querySelector("#action-btn");
    projectedBtn.click();
    await delay(100);

    expect(clicked).toBe(true);
  });

  it("syncs text input changes from projection to source", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedInput = shadow.querySelector("#text-input");

    // Simulate typing in the projected input
    projectedInput.value = "new value";
    projectedInput.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(100);

    // The original iframe input should be synced
    const originalInput = iframe.contentDocument.getElementById("text-input");
    expect(originalInput.value).toBe("new value");
  });

  it("syncs select value changes from projection to source", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedSelect = shadow.querySelector("#select-input");
    const originalSelect = iframe.contentDocument.getElementById("select-input");

    // Initial value should match
    expect(projectedSelect.value).toBe("one");
    expect(originalSelect.value).toBe("one");

    // Simulate selecting a new value in the mirror
    projectedSelect.value = "two";
    projectedSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(100);

    // The original iframe select should be synced
    expect(originalSelect.value).toBe("two");
  });

  it("syncs select value changes from source to projection", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedSelect = shadow.querySelector("#select-input");
    const originalSelect = iframe.contentDocument.getElementById("select-input");

    // Change the original select and dispatch change event
    originalSelect.value = "three";
    originalSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(100);

    // The mirrored select should be synced
    expect(projectedSelect.value).toBe("three");
  });

  it("proxies click on checkbox to toggle source checked state", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const originalCheckbox = iframe.contentDocument.getElementById("checkbox-input");
    expect(originalCheckbox.checked).toBe(false);

    // Click the projected checkbox — the event proxy should forward the click
    const shadow = host.shadowRoot;
    const projectedCheckbox = shadow.querySelector("#checkbox-input");
    projectedCheckbox.click();
    await delay(200);

    expect(originalCheckbox.checked).toBe(true);
  });
});
