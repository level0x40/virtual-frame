/**
 * Accessibility attribute mirroring contract.
 *
 * These tests verify the *mirroring* half of accessibility — that ARIA
 * attributes, roles, and IDREF targets round-trip through the shadow
 * projection correctly. They do not (and cannot) verify what Chrome's
 * accessibility tree computes or what a screen reader will actually
 * announce; those belong to higher test tiers (Playwright's
 * `page.accessibility.snapshot()` for the a11y tree, Guidepup or a
 * manual AT pass for real announcements).
 *
 * What this suite guards against is a subtle class of regression: the
 * mirror's final DOM can look correct while the path to get there
 * broke an announcement. An aria-live update that causes the element
 * to be replaced rather than mutated in place, for example, would
 * leave the final tree indistinguishable but would silently prevent
 * any screen reader from announcing the change. The assertions below
 * are written to catch that kind of silent failure.
 */
import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, delay, cleanup } from "./helpers.js";

describe("VirtualFrame — accessibility attribute mirroring", () => {
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

  describe("aria-live regions", () => {
    it("mirrors role, aria-live, and aria-atomic verbatim on initial projection", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const status = host.shadowRoot.querySelector("#status");
      expect(status).toBeTruthy();
      expect(status.getAttribute("role")).toBe("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.textContent).toBe("Initial");
    });

    it("mirrors role='alert' verbatim (implicit assertive live region)", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const alert = host.shadowRoot.querySelector("#alert");
      expect(alert).toBeTruthy();
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).toBe("Ready");
    });

    it("propagates live-region text updates without dropping aria-live", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      iframe.contentWindow.setStatus("Saved");
      await delay(300);

      const status = host.shadowRoot.querySelector("#status");
      expect(status.textContent).toBe("Saved");
      // Critical invariant: if the mirror replaced the element rather
      // than mutating in place, aria-live / role would be gone after
      // the update and an AT would never see this as a live-region
      // announcement.
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.getAttribute("role")).toBe("status");
    });

    it("propagates role='alert' text updates without dropping the role", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      iframe.contentWindow.setAlertText("Connection lost");
      await delay(300);

      const alert = host.shadowRoot.querySelector("#alert");
      expect(alert.textContent).toBe("Connection lost");
      expect(alert.getAttribute("role")).toBe("alert");
    });

    it("propagates aria-live attribute value changes (polite → assertive)", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      iframe.contentWindow.setStatusLevel("assertive");
      await delay(300);

      const status = host.shadowRoot.querySelector("#status");
      expect(status.getAttribute("aria-live")).toBe("assertive");
      // Element identity and other attributes preserved through the
      // attribute change.
      expect(status.getAttribute("role")).toBe("status");
      expect(status.textContent).toBe("Initial");
    });
  });

  describe("IDREF resolution within the shadow scope", () => {
    it("mirrors aria-labelledby verbatim (no URL-style rewriting applied)", async () => {
      // Virtual Frame rewrites URL-valued attributes (src, href, action,
      // …) when mirroring. ARIA IDREF attributes must never be touched
      // — they name elements by id, not by URL, and any rewrite would
      // break resolution inside the shadow scope.
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const section = host.shadowRoot.querySelector("section[aria-labelledby]");
      expect(section).toBeTruthy();
      expect(section.getAttribute("aria-labelledby")).toBe("widget-heading");
    });

    it("resolves aria-labelledby to its target inside the same shadow root", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const shadow = host.shadowRoot;
      const section = shadow.querySelector("section[aria-labelledby]");
      const ref = section.getAttribute("aria-labelledby");

      const target = shadow.getElementById(ref);
      expect(target).toBeTruthy();
      expect(target.tagName.toLowerCase()).toBe("h2");
      expect(target.textContent).toBe("Widget");
    });

    it("keeps <label for> → <input id> association inside the shadow", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const shadow = host.shadowRoot;
      const label = shadow.querySelector("label[for='email']");
      const input = shadow.querySelector("input#email");

      expect(label).toBeTruthy();
      expect(input).toBeTruthy();
      expect(label.getAttribute("for")).toBe(input.id);
    });

    it("propagates updates to a labelledby target without breaking the reference", async () => {
      iframe = await createIframe("accessibility.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      iframe.contentWindow.setLabelText("Renamed widget");
      await delay(300);

      const shadow = host.shadowRoot;
      const target = shadow.getElementById("widget-heading");
      expect(target).toBeTruthy();
      expect(target.textContent).toBe("Renamed widget");

      // The referring section must still point at the same id, and
      // the id must still resolve within the shadow.
      const section = shadow.querySelector("section[aria-labelledby]");
      expect(section.getAttribute("aria-labelledby")).toBe("widget-heading");
      expect(shadow.getElementById("widget-heading")).toBe(target);
    });
  });
});
