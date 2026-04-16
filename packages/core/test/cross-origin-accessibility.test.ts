/**
 * Cross-origin accessibility attribute mirroring contract.
 *
 * Parallel suite to `accessibility.test.ts`, exercising the same invariants
 * through the bridge protocol path (serialized snapshot + incremental
 * mutation batches over postMessage) instead of the same-origin
 * MutationObserver path.
 *
 * The failure mode this guards against is a protocol-layer regression that
 * silently drops ARIA attributes during serialization, rewrites them when
 * they shouldn't be rewritten, or delivers a "replace + re-add" sequence
 * that leaves the final DOM identical but loses announcement state in
 * transit. These bugs don't surface in the same-origin suite because the
 * same-origin path never serializes — it walks source nodes directly.
 *
 * Bridge harness helpers are shared with `cross-origin.test.ts` via
 * `./cross-origin-helpers.js`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, delay } from "./helpers.js";
import { setupCrossOrigin, bridgeSend, performHandshake } from "./cross-origin-helpers.js";

// ---------------------------------------------------------------------------
// Accessibility fixture — a serialized analogue of accessibility.html
// expressed in the bridge's snapshot schema.
// ---------------------------------------------------------------------------

/**
 * Node IDs are stable across tests so mutation batches can target them by
 * id. If you add new nodes to the fixture, assign IDs above 20 to leave
 * headroom for added/updated nodes in individual tests.
 */
const IDS = {
  body: 1,
  status: 2,
  statusText: 3,
  alert: 4,
  alertText: 5,
  section: 6,
  heading: 7,
  headingText: 8,
  form: 9,
  label: 10,
  labelText: 11,
  input: 12,
};

function accessibilitySnapshot() {
  return {
    body: {
      type: "element",
      id: IDS.body,
      tag: "body",
      attrs: {},
      children: [
        {
          type: "element",
          id: IDS.status,
          tag: "div",
          attrs: {
            id: "status",
            role: "status",
            "aria-live": "polite",
            "aria-atomic": "true",
          },
          children: [{ type: "text", id: IDS.statusText, data: "Initial" }],
        },
        {
          type: "element",
          id: IDS.alert,
          tag: "div",
          attrs: { id: "alert", role: "alert" },
          children: [{ type: "text", id: IDS.alertText, data: "Ready" }],
        },
        {
          type: "element",
          id: IDS.section,
          tag: "section",
          attrs: { "aria-labelledby": "widget-heading" },
          children: [
            {
              type: "element",
              id: IDS.heading,
              tag: "h2",
              attrs: { id: "widget-heading" },
              children: [{ type: "text", id: IDS.headingText, data: "Widget" }],
            },
          ],
        },
        {
          type: "element",
          id: IDS.form,
          tag: "form",
          attrs: { id: "signup" },
          children: [
            {
              type: "element",
              id: IDS.label,
              tag: "label",
              attrs: { for: "email" },
              children: [{ type: "text", id: IDS.labelText, data: "Email address" }],
            },
            {
              type: "element",
              id: IDS.input,
              tag: "input",
              attrs: { id: "email", name: "email", type: "email" },
              children: [],
              value: "",
            },
          ],
        },
      ],
    },
    css: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VirtualFrame — cross-origin accessibility attribute mirroring", () => {
  let iframe, vf, host, channel;

  afterEach(() => {
    if (vf) {
      try {
        vf.destroy();
      } catch {}
      vf = null;
    }
    cleanup();
  });

  describe("aria-live regions through the bridge", () => {
    it("mirrors role, aria-live, and aria-atomic verbatim from the snapshot", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      const status = host.shadowRoot.querySelector("#status");
      expect(status).toBeTruthy();
      expect(status.getAttribute("role")).toBe("status");
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.textContent).toBe("Initial");
    });

    it("mirrors role='alert' verbatim from the snapshot", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      const alert = host.shadowRoot.querySelector("#alert");
      expect(alert).toBeTruthy();
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).toBe("Ready");
    });

    it("propagates characterData updates without dropping aria-live", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "characterData",
            id: IDS.statusText,
            data: "Saved",
          },
        ],
      });
      await delay(100);

      const status = host.shadowRoot.querySelector("#status");
      expect(status.textContent).toBe("Saved");
      // Critical: if the bridge path replaced the status element or
      // re-serialized without preserving attrs, an AT would silently
      // miss the live-region announcement.
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.getAttribute("role")).toBe("status");
    });

    it("propagates characterData updates without dropping role='alert'", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "characterData",
            id: IDS.alertText,
            data: "Connection lost",
          },
        ],
      });
      await delay(100);

      const alert = host.shadowRoot.querySelector("#alert");
      expect(alert.textContent).toBe("Connection lost");
      expect(alert.getAttribute("role")).toBe("alert");
    });

    it("propagates aria-live attribute changes (polite → assertive)", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "attributes",
            id: IDS.status,
            name: "aria-live",
            value: "assertive",
          },
        ],
      });
      await delay(100);

      const status = host.shadowRoot.querySelector("#status");
      expect(status.getAttribute("aria-live")).toBe("assertive");
      // Sibling attributes must survive the attribute change.
      expect(status.getAttribute("role")).toBe("status");
      expect(status.getAttribute("aria-atomic")).toBe("true");
    });

    it("preserves aria-live through a combined attribute + text update batch", async () => {
      // Simulates the realistic case: a framework re-renders a status
      // region, producing both a text change and an attribute change in
      // the same mutation batch.  All three must survive together.
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "attributes",
            id: IDS.status,
            name: "aria-live",
            value: "assertive",
          },
          {
            type: "characterData",
            id: IDS.statusText,
            data: "Failure",
          },
        ],
      });
      await delay(100);

      const status = host.shadowRoot.querySelector("#status");
      expect(status.getAttribute("aria-live")).toBe("assertive");
      expect(status.getAttribute("role")).toBe("status");
      expect(status.textContent).toBe("Failure");
    });
  });

  describe("IDREF resolution via the bridge", () => {
    it("mirrors aria-labelledby verbatim through snapshot serialization", async () => {
      // The bridge rewrites URL-valued attributes (src, href, …) when
      // resolving them against the remote's base URL.  IDREF attributes
      // must never be treated as URLs or the reference would be mangled.
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      const section = host.shadowRoot.querySelector("section[aria-labelledby]");
      expect(section).toBeTruthy();
      expect(section.getAttribute("aria-labelledby")).toBe("widget-heading");
    });

    it("resolves aria-labelledby to its target inside the same shadow root", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      const shadow = host.shadowRoot;
      const section = shadow.querySelector("section[aria-labelledby]");
      const ref = section.getAttribute("aria-labelledby");

      const target = shadow.getElementById(ref);
      expect(target).toBeTruthy();
      expect(target.tagName.toLowerCase()).toBe("h2");
      expect(target.textContent).toBe("Widget");
    });

    it("keeps <label for> → <input id> association through the bridge", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      const shadow = host.shadowRoot;
      const label = shadow.querySelector("label[for='email']");
      const input = shadow.querySelector("input#email");

      expect(label).toBeTruthy();
      expect(input).toBeTruthy();
      expect(label.getAttribute("for")).toBe(input.id);
    });

    it("propagates updates to a labelledby target without breaking the reference", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, accessibilitySnapshot());

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "characterData",
            id: IDS.headingText,
            data: "Renamed widget",
          },
        ],
      });
      await delay(100);

      const shadow = host.shadowRoot;
      const target = shadow.getElementById("widget-heading");
      expect(target).toBeTruthy();
      expect(target.textContent).toBe("Renamed widget");

      const section = shadow.querySelector("section[aria-labelledby]");
      expect(section.getAttribute("aria-labelledby")).toBe("widget-heading");
      expect(shadow.getElementById("widget-heading")).toBe(target);
    });
  });
});
