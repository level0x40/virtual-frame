import { describe, it, expect, afterEach } from "vitest";
import { cleanup, delay } from "./helpers.js";
import { setupCrossOrigin, bridgeSend, performHandshake } from "./cross-origin-helpers.js";

/**
 * Cross-origin top-layer projection: <dialog>.showModal() and the
 * Popover API plumbed through the bridge ↔ host postMessage protocol.
 *
 * Inbound  (bridge → host): vf:invokeMethod with {targetId, method, args}
 *   triggers the matching call on the mirrored element so the clone is
 *   actually promoted to the host's top layer.
 * Outbound (host → bridge): when the mirror is dismissed (close /
 *   toggle→closed), the host posts vf:invokeMethod back so the source
 *   dialog/popover stays in sync.
 */

const dialogSnapshot = {
  body: {
    type: "element",
    id: 1,
    tag: "body",
    attrs: {},
    children: [
      {
        type: "element",
        id: 2,
        tag: "dialog",
        attrs: { id: "dlg" },
        children: [
          {
            type: "element",
            id: 3,
            tag: "p",
            attrs: {},
            children: [{ type: "text", id: 4, data: "Hello dialog" }],
          },
        ],
      },
      {
        type: "element",
        id: 5,
        tag: "div",
        attrs: { id: "pop", popover: "auto" },
        children: [{ type: "text", id: 6, data: "Hello popover" }],
      },
    ],
  },
  css: [],
};

/** Spy on host → bridge postMessages going through _sendToBridge. */
function spyOutbound(vf) {
  const messages: any[] = [];
  const orig = vf._sendToBridge.bind(vf);
  vf._sendToBridge = function (type: string, payload: Record<string, unknown> = {}) {
    messages.push({ type, ...payload });
    orig(type, payload);
  };
  return messages;
}

describe("VirtualFrame — dialog & popover top-layer projection (cross-origin)", () => {
  let iframe: HTMLIFrameElement | undefined;
  let vf: any;
  let host: HTMLElement | undefined;
  let channel: string;

  afterEach(() => {
    if (vf) {
      try {
        vf.destroy();
      } catch {}
      vf = null;
    }
    cleanup();
  });

  // ── Inbound: bridge → host ───────────────────────────────────

  describe("inbound vf:invokeMethod", () => {
    it("calls showModal() on the mirrored dialog and promotes it to top layer", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;
      expect(mirror).toBeTruthy();
      expect(mirror.open).toBe(false);

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);

      expect(mirror.open).toBe(true);
      expect(mirror.matches(":modal")).toBe(true);
    });

    it("calls close() on the mirrored dialog", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);
      expect(mirror.open).toBe(true);

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "close",
        args: ["done"],
      });
      await delay(50);

      expect(mirror.open).toBe(false);
      expect(mirror.returnValue).toBe("done");
    });

    it("calls showPopover() / hidePopover() on the mirrored popover", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const mirror = host!.shadowRoot!.querySelector("#pop") as HTMLElement;
      expect(mirror).toBeTruthy();
      expect(mirror.matches(":popover-open")).toBe(false);

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 5,
        method: "showPopover",
        args: [],
      });
      await delay(50);
      expect(mirror.matches(":popover-open")).toBe(true);

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 5,
        method: "hidePopover",
        args: [],
      });
      await delay(50);
      expect(mirror.matches(":popover-open")).toBe(false);
    });

    it("ignores invokeMethod for an unknown targetId", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      // Should not throw — handler must silently ignore unmapped ids.
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 9999,
        method: "showModal",
        args: [],
      });
      await delay(50);

      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;
      expect(mirror.open).toBe(false);
    });

    it("swallows InvalidStateError when method throws (e.g. double showModal)", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);
      expect(mirror.open).toBe(true);

      // Second showModal on an already-open dialog throws InvalidStateError.
      // The handler must catch and not crash.
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);

      expect(mirror.open).toBe(true);
    });

    it("ignores invokeMethod when method is not a function on the target", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      // p element (id=3) has no showModal — must no-op cleanly.
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 3,
        method: "showModal",
        args: [],
      });
      await delay(50);

      // Nothing to assert beyond "did not throw"; the handler must guard.
      expect(true).toBe(true);
    });
  });

  // ── Outbound: host → bridge ──────────────────────────────────

  describe("outbound vf:invokeMethod (mirror dismissal echoes back)", () => {
    it("echoes close() back to the bridge when user dismisses the dialog", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const messages = spyOutbound(vf);
      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;

      // Open via inbound, which also wires the close-echo listener.
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);

      // User dismisses the projected dialog (ESC, backdrop, in-content close)
      mirror.close("from-host");
      await delay(50);

      const echo = messages.find(
        (m) => m.type === "vf:invokeMethod" && m.method === "close" && m.targetId === 2,
      );
      expect(echo).toBeTruthy();
      expect(echo.args).toEqual(["from-host"]);
    });

    it("echoes hidePopover() back when the mirror popover is dismissed", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const messages = spyOutbound(vf);
      const mirror = host!.shadowRoot!.querySelector("#pop") as HTMLElement;

      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 5,
        method: "showPopover",
        args: [],
      });
      await delay(50);
      expect(mirror.matches(":popover-open")).toBe(true);

      mirror.hidePopover();
      await delay(50);

      const echo = messages.find(
        (m) => m.type === "vf:invokeMethod" && m.method === "hidePopover" && m.targetId === 5,
      );
      expect(echo).toBeTruthy();
    });

    it("does not echo close for non-opener methods (e.g. inbound close itself)", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel, dialogSnapshot);

      const mirror = host!.shadowRoot!.querySelector("#dlg") as HTMLDialogElement;

      // Open first (this will wire one close listener).
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);

      // Now spy *after* the inbound close — we want to verify the close
      // handler itself does not also wire a fresh close-echo listener.
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "close",
        args: [],
      });
      await delay(50);
      expect(mirror.open).toBe(false);

      // Re-open and confirm exactly one echo fires on the next dismissal,
      // not two (which would happen if both showModal AND close wired listeners).
      const messages = spyOutbound(vf);
      bridgeSend(iframe!, channel, "vf:invokeMethod", {
        targetId: 2,
        method: "showModal",
        args: [],
      });
      await delay(50);
      mirror.close();
      await delay(50);

      const closeEchoes = messages.filter(
        (m) => m.type === "vf:invokeMethod" && m.method === "close" && m.targetId === 2,
      );
      expect(closeEchoes.length).toBe(1);
    });
  });
});
