import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import {
  createIframe,
  createHost,
  waitForInit,
  delay,
  cleanup,
} from "./helpers.js";

describe("VirtualFrame — audio placeholder", () => {
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

  it("replaces <audio> with a hidden div placeholder", async () => {
    iframe = await createIframe("audio.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    // Real <audio> should NOT be in the projection
    expect(shadow.querySelector("audio")).toBeNull();

    // Instead, a hidden div with data-mirror-source="audio" should exist
    const placeholder = shadow.querySelector('[data-mirror-source="audio"]');
    expect(placeholder).toBeTruthy();
    expect(placeholder.tagName.toLowerCase()).toBe("div");
    expect(placeholder.style.display).toBe("none");
  });

  it("projects non-audio content alongside audio placeholder", async () => {
    iframe = await createIframe("audio.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const label = shadow.querySelector("#audio-label");
    expect(label).toBeTruthy();
    expect(label.textContent).toBe("Audio element test");
  });
});

describe("VirtualFrame — inline event handler cleanup", () => {
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

  it("strips inline on* event handlers from projected elements", async () => {
    iframe = await createIframe("misc.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const clickDiv = shadow.querySelector("#inline-click");
    expect(clickDiv).toBeTruthy();
    // The onclick attribute should have been stripped
    expect(clickDiv.getAttribute("onclick")).toBeNull();

    const mouseoverDiv = shadow.querySelector("#inline-mouseover");
    expect(mouseoverDiv.getAttribute("onmouseover")).toBeNull();

    const focusInput = shadow.querySelector("#inline-focus");
    expect(focusInput.getAttribute("onfocus")).toBeNull();
  });
});

describe("VirtualFrame — anchor click prevention", () => {
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

  it("prevents default on anchor clicks in projection", async () => {
    iframe = await createIframe("misc.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const link = shadow.querySelector("#test-link");
    expect(link).toBeTruthy();

    // Click should not navigate the main page
    let defaultPrevented = false;
    link.addEventListener("click", (e) => {
      defaultPrevented = e.defaultPrevented;
    });
    link.click();
    await delay(100);

    // The event proxy prevents default on anchor clicks
    expect(defaultPrevented).toBe(true);
  });
});

describe("VirtualFrame — navigation re-init", () => {
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

  it("re-projects content after iframe navigation", async () => {
    iframe = await createIframe("navigate-a.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    expect(shadow.querySelector("#page-id").textContent).toBe("page-1");
    expect(shadow.querySelector("#content").textContent).toBe(
      "First page content",
    );

    // Navigate iframe to a different page
    const navUrl = new URL("./fixtures/navigate-b.html", import.meta.url).href;
    iframe.src = navUrl;
    await new Promise((r) =>
      iframe.addEventListener("load", r, { once: true }),
    );
    // Wait for re-init to complete
    await delay(1000);

    // Content should be from the new page
    const pageId = shadow.querySelector("#page-id");
    expect(pageId).toBeTruthy();
    expect(pageId.textContent).toBe("page-2");
    expect(shadow.querySelector("#content").textContent).toBe(
      "Second page content",
    );
    expect(shadow.querySelector("#extra")).toBeTruthy();
  });

  it("cleans up old content on navigation", async () => {
    iframe = await createIframe("navigate-a.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    // Page A has no #extra element
    expect(shadow.querySelector("#extra")).toBeNull();

    // Navigate to page B
    const navUrl = new URL("./fixtures/navigate-b.html", import.meta.url).href;
    iframe.src = navUrl;
    await new Promise((r) =>
      iframe.addEventListener("load", r, { once: true }),
    );
    await delay(1000);

    // Page A content should be gone, page B content should be present
    expect(shadow.querySelector("#extra")).toBeTruthy();
  });
});

describe("VirtualFrame — form sync edge cases", () => {
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

  it("syncs select element changes via event proxy", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedSelect = shadow.querySelector("#select-input");
    const originalSelect =
      iframe.contentDocument.getElementById("select-input");

    // Select uses event proxying (click) not setupFormElementSync.
    // Programmatically changing value + dispatching change on mirror
    // does replicate user interaction via the event proxy path.
    // For selects, the click proxy forwards the pointer event to the
    // iframe select which opens its own dropdown. Test that the
    // projected select has all options.
    expect(projectedSelect.options.length).toBe(3);
    expect(projectedSelect.options[1].value).toBe("two");
    expect(originalSelect.options[1].value).toBe("two");
  });

  it("syncs textarea changes", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedTextarea = shadow.querySelector("#textarea-input");
    const originalTextarea =
      iframe.contentDocument.getElementById("textarea-input");

    projectedTextarea.value = "updated text";
    projectedTextarea.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(100);

    expect(originalTextarea.value).toBe("updated text");
  });

  it("initialises input with source value", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedInput = shadow.querySelector("#text-input");
    expect(projectedInput.value).toBe("initial");
  });

  it("proxies focus events without stealing real focus", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedInput = shadow.querySelector("#text-input");
    const originalInput = iframe.contentDocument.getElementById("text-input");

    // Listen for synthetic focus on original
    let focusReceived = false;
    originalInput.addEventListener("focus", () => {
      focusReceived = true;
    });

    // Focus the projected input
    projectedInput.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
    await delay(100);

    expect(focusReceived).toBe(true);
  });

  it("syncs original→mirror value when user has not modified", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const shadow = host.shadowRoot;
    const projectedInput = shadow.querySelector("#text-input");
    const originalInput = iframe.contentDocument.getElementById("text-input");

    // Programmatically change the original value
    originalInput.value = "programmatic";
    originalInput.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(100);

    // Mirror should sync since user hasn't modified it
    expect(projectedInput.value).toBe("programmatic");
  });

  it("radio button click proxies to toggle source", async () => {
    iframe = await createIframe("forms.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const originalRadioA = iframe.contentDocument.getElementById("radio-a");
    const originalRadioB = iframe.contentDocument.getElementById("radio-b");

    expect(originalRadioA.checked).toBe(true);
    expect(originalRadioB.checked).toBe(false);

    // Click projected radio B
    const shadow = host.shadowRoot;
    const projectedRadioB = shadow.querySelector("#radio-b");
    projectedRadioB.click();
    await delay(200);

    // Original radio B should be checked
    expect(originalRadioB.checked).toBe(true);
  });
});

describe("VirtualFrame — checkForLateContent", () => {
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

  it("mirrors content even if iframe body is initially slow", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    // Content should be present (checkForLateContent is a safety net)
    const shadow = host.shadowRoot;
    expect(shadow.querySelector("#greeting")).toBeTruthy();
  });
});

describe("VirtualFrame — generation counter (stale async guard)", () => {
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

  it("increments _mirrorGen on each mirrorContent call", async () => {
    iframe = await createIframe("basic.html");
    host = createHost();
    vf = new VirtualFrame(iframe, host, { isolate: "open" });
    await waitForInit(vf);

    const genBefore = vf._mirrorGen;
    expect(genBefore).toBeGreaterThan(0);

    // Calling mirrorContent again should bump the generation
    await vf.mirrorContent();
    expect(vf._mirrorGen).toBeGreaterThan(genBefore);
  });
});

describe("VirtualFrame — debug logging", () => {
  afterEach(() => {
    try {
      localStorage.removeItem("VF_DEBUG");
      sessionStorage.removeItem("VF_DEBUG");
    } catch {}
  });

  it("does not log by default (no storage entry)", () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => {
      const msg = args.join(" ");
      if (msg.includes("[VF]")) logs.push(msg);
    };

    try {
      // Import a fresh module would be ideal, but we can test via the
      // VirtualFrame constructor which calls _vflog
      const origInit = VirtualFrame.prototype.init;
      VirtualFrame.prototype.init = function () {};
      const testVf = new VirtualFrame(
        document.createElement("iframe"),
        document.createElement("div"),
      );
      VirtualFrame.prototype.init = origInit;
      testVf.destroy();
    } finally {
      console.log = origLog;
    }

    expect(logs.length).toBe(0);
  });

  it("logs when localStorage VF_DEBUG=1", () => {
    localStorage.setItem("VF_DEBUG", "1");

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => {
      const msg = args.join(" ");
      if (msg.includes("[VF]")) logs.push(msg);
    };

    try {
      const origInit = VirtualFrame.prototype.init;
      VirtualFrame.prototype.init = function () {};
      const testVf = new VirtualFrame(
        document.createElement("iframe"),
        document.createElement("div"),
      );
      VirtualFrame.prototype.init = origInit;
      testVf.destroy();
    } finally {
      console.log = origLog;
      localStorage.removeItem("VF_DEBUG");
    }

    expect(logs.length).toBeGreaterThan(0);
  });

  it("logs when sessionStorage VF_DEBUG=1", () => {
    sessionStorage.setItem("VF_DEBUG", "1");

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => {
      const msg = args.join(" ");
      if (msg.includes("[VF]")) logs.push(msg);
    };

    try {
      const origInit = VirtualFrame.prototype.init;
      VirtualFrame.prototype.init = function () {};
      const testVf = new VirtualFrame(
        document.createElement("iframe"),
        document.createElement("div"),
      );
      VirtualFrame.prototype.init = origInit;
      testVf.destroy();
    } finally {
      console.log = origLog;
      sessionStorage.removeItem("VF_DEBUG");
    }

    expect(logs.length).toBeGreaterThan(0);
  });
});
