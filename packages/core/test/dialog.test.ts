import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { createIframe, createHost, waitForInit, delay, cleanup } from "./helpers.js";

/**
 * Top-layer projection: <dialog>.showModal() and the Popover API.
 *
 * The interception layer patches HTMLDialogElement.prototype and
 * HTMLElement.prototype inside the iframe's realm. When the source calls
 * showModal()/showPopover(), the same call is forwarded onto the mirror
 * in the host's shadow root so the clone is actually promoted to the host
 * document's top layer (which is what makes :modal match, ::backdrop paint,
 * and the element escape ancestor stacking/overflow contexts).
 *
 * The reverse direction (close/dismiss on the mirror) is mirrored back via
 * a one-shot listener so source state stays in sync.
 */

describe("VirtualFrame — dialog & popover top-layer projection (same-origin)", () => {
  let iframe;
  let host;
  let vf;

  afterEach(() => {
    if (vf) {
      try {
        vf.destroy();
      } catch {}
      vf = null;
    }
    cleanup();
  });

  // ── Dialog ───────────────────────────────────────────────────

  describe("<dialog>", () => {
    it("promotes the mirror to top layer when source calls showModal()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");
      expect(mirrorDialog).toBeTruthy();
      expect(mirrorDialog).not.toBe(sourceDialog);

      sourceDialog.showModal();
      await delay(20);

      // Both ends should be open and in the modal/top-layer state
      expect(sourceDialog.open).toBe(true);
      expect(mirrorDialog.open).toBe(true);
      expect(mirrorDialog.matches(":modal")).toBe(true);
    });

    it("closes the mirror when the source calls close()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");

      sourceDialog.showModal();
      await delay(20);
      expect(mirrorDialog.open).toBe(true);

      sourceDialog.close("done");
      await delay(20);

      expect(sourceDialog.open).toBe(false);
      expect(mirrorDialog.open).toBe(false);
    });

    it("mirrors close from the host side back to the source", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");

      sourceDialog.showModal();
      await delay(20);
      expect(mirrorDialog.open).toBe(true);

      // User dismisses the projected dialog (e.g. ESC, backdrop click, in-content close button)
      mirrorDialog.close("from-host");
      await delay(20);

      expect(mirrorDialog.open).toBe(false);
      expect(sourceDialog.open).toBe(false);
    });

    it("does not echo or loop when the source closes its own dialog", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");

      let sourceCloseCount = 0;
      sourceDialog.addEventListener("close", () => sourceCloseCount++);

      sourceDialog.showModal();
      await delay(20);
      sourceDialog.close("ok");
      await delay(50);

      expect(sourceDialog.open).toBe(false);
      expect(mirrorDialog.open).toBe(false);
      // Exactly one close — not amplified by mirror echoing back
      expect(sourceCloseCount).toBe(1);
    });

    it("supports re-opening after close()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");

      sourceDialog.showModal();
      await delay(20);
      sourceDialog.close();
      await delay(20);

      // showModal() on an already-open dialog throws InvalidStateError,
      // so this is a real test that the sync didn't get stuck.
      sourceDialog.showModal();
      await delay(20);

      expect(sourceDialog.open).toBe(true);
      expect(mirrorDialog.open).toBe(true);
      expect(mirrorDialog.matches(":modal")).toBe(true);
    });

    it("supports non-modal show()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourceDialog = iframe.contentDocument.getElementById("dlg");
      const mirrorDialog = host.shadowRoot.querySelector("#dlg");

      sourceDialog.show();
      await delay(20);

      expect(sourceDialog.open).toBe(true);
      expect(mirrorDialog.open).toBe(true);
      // show() does NOT promote to top layer — :modal must not match
      expect(mirrorDialog.matches(":modal")).toBe(false);
    });
  });

  // ── Popover ──────────────────────────────────────────────────

  describe("[popover]", () => {
    it("opens the mirror popover when source calls showPopover()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourcePop = iframe.contentDocument.getElementById("pop");
      const mirrorPop = host.shadowRoot.querySelector("#pop");
      expect(mirrorPop).toBeTruthy();

      sourcePop.showPopover();
      await delay(20);

      expect(sourcePop.matches(":popover-open")).toBe(true);
      expect(mirrorPop.matches(":popover-open")).toBe(true);
    });

    it("hides the mirror when source calls hidePopover()", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourcePop = iframe.contentDocument.getElementById("pop");
      const mirrorPop = host.shadowRoot.querySelector("#pop");

      sourcePop.showPopover();
      await delay(20);
      expect(mirrorPop.matches(":popover-open")).toBe(true);

      sourcePop.hidePopover();
      await delay(20);

      expect(sourcePop.matches(":popover-open")).toBe(false);
      expect(mirrorPop.matches(":popover-open")).toBe(false);
    });

    it("mirrors host-side dismissal back to the source", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourcePop = iframe.contentDocument.getElementById("pop");
      const mirrorPop = host.shadowRoot.querySelector("#pop");

      sourcePop.showPopover();
      await delay(20);
      expect(mirrorPop.matches(":popover-open")).toBe(true);

      mirrorPop.hidePopover();
      await delay(20);

      expect(mirrorPop.matches(":popover-open")).toBe(false);
      expect(sourcePop.matches(":popover-open")).toBe(false);
    });

    it("togglePopover() on source toggles the mirror", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      const sourcePop = iframe.contentDocument.getElementById("pop");
      const mirrorPop = host.shadowRoot.querySelector("#pop");

      sourcePop.togglePopover();
      await delay(20);
      expect(mirrorPop.matches(":popover-open")).toBe(true);

      sourcePop.togglePopover();
      await delay(20);
      expect(mirrorPop.matches(":popover-open")).toBe(false);
    });
  });

  // ── Patch hygiene ────────────────────────────────────────────

  describe("patch hygiene", () => {
    it("marks the iframe window as patched (idempotent)", async () => {
      iframe = await createIframe("dialog.html");
      host = createHost();
      vf = new VirtualFrame(iframe, host, { isolate: "open" });
      await waitForInit(vf);

      expect(iframe.contentWindow.__vfTopLayerPatched).toBe(true);

      // Calling install again must not double-wrap
      const dlg = iframe.contentDocument.getElementById("dlg");
      const showModalBefore = iframe.contentWindow.HTMLDialogElement.prototype.showModal;
      vf._installSameOriginTopLayerInterception();
      const showModalAfter = iframe.contentWindow.HTMLDialogElement.prototype.showModal;
      expect(showModalBefore).toBe(showModalAfter);

      // And dialog still functions
      dlg.showModal();
      await delay(20);
      const mirror = host.shadowRoot.querySelector("#dlg");
      expect(mirror.open).toBe(true);
    });
  });
});
