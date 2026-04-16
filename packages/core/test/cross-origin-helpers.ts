/**
 * Shared bridge-protocol harness for cross-origin VirtualFrame tests.
 *
 * These helpers simulate the bridge script's postMessage protocol without
 * actually running a bridge in a cross-origin iframe — the iframe is
 * same-origin for test purposes, and `_isCrossOrigin` is temporarily
 * overridden to force VirtualFrame into its cross-origin code path. All
 * bridge → host messages are dispatched synthetically with `source` spoofed
 * to `iframe.contentWindow` so they route through the real message
 * handler.
 *
 * Used by:
 *   - cross-origin.test.ts
 *   - cross-origin-accessibility.test.ts
 */
import { VirtualFrame } from "../src/core.js";
import { createHost, delay } from "./helpers.js";

/**
 * Create a same-origin iframe pointing at the cross-origin stub fixture,
 * then force VirtualFrame into its cross-origin code path. Returns the
 * iframe, the VirtualFrame instance, the host div, and a freshly-generated
 * bridge channel id. The channel is not yet announced — call
 * `performHandshake` or `bridgeSend(..., "vf:ready")` to complete setup.
 */
export async function setupCrossOrigin(opts = {}) {
  const url = new URL("./fixtures/cross-origin-stub.html", import.meta.url).href;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;height:600px;border:none;";
  iframe.src = url;
  document.body.appendChild(iframe);
  await new Promise((resolve) => iframe.addEventListener("load", resolve));

  const host = createHost();

  // Force cross-origin detection
  const origIsCrossOrigin = VirtualFrame.prototype._isCrossOrigin;
  VirtualFrame.prototype._isCrossOrigin = function () {
    return true;
  };

  // Create the VirtualFrame — it will call _initCrossOrigin and start
  // listening for vf:ready.
  const vf = new VirtualFrame(iframe, host, {
    isolate: "open",
    streamingFps: 30,
    ...opts,
  });

  // Restore original _isCrossOrigin
  VirtualFrame.prototype._isCrossOrigin = origIsCrossOrigin;

  // Simulate bridge:  vf:ready → host sends vf:ack → bridge sends snapshot
  const channel = "__vf_test_" + Math.random().toString(36).slice(2, 8);

  // Wait for init() to set up the message listener
  await delay(50);

  return { iframe, vf, host, channel };
}

/**
 * Send a fake bridge message to the parent window (simulating postMessage
 * from the iframe's bridge script).  Because the iframe is same-origin, we
 * dispatch the event on window with `source` spoofed to
 * `iframe.contentWindow`.
 */
export function bridgeSend(iframe, channel, type, payload = {}) {
  const data = { __virtualFrame: true, channel, type, ...payload };
  const event = new MessageEvent("message", {
    data,
    source: iframe.contentWindow,
    origin: iframe.contentWindow.location.origin,
  });
  window.dispatchEvent(event);
}

/**
 * Perform the full vf:ready → vf:ack → vf:snapshot handshake.  Returns
 * after VirtualFrame is initialized.  If no snapshot is passed, a minimal
 * default is used (a `<div id="content" class="main">Hello Cross-Origin</div>`
 * body plus one stylesheet entry).
 */
export async function performHandshake(iframe, vf, channel, snapshot) {
  const defaultSnapshot = snapshot || {
    body: {
      type: "element",
      id: 1,
      tag: "body",
      attrs: {},
      children: [
        {
          type: "element",
          id: 2,
          tag: "div",
          attrs: { id: "content", class: "main" },
          children: [{ type: "text", id: 3, data: "Hello Cross-Origin" }],
        },
      ],
    },
    css: [
      {
        cssText: "body { margin: 0; color: red; }",
        attr: "data-iframe-stylesheet",
        index: 0,
      },
    ],
  };

  // Bridge announces itself
  bridgeSend(iframe, channel, "vf:ready", { channel });
  await delay(50);

  // Bridge sends snapshot
  bridgeSend(iframe, channel, "vf:snapshot", defaultSnapshot);

  // Wait for initialization
  const start = Date.now();
  while (!vf.isInitialized && Date.now() - start < 5000) {
    await delay(50);
  }

  // _handleSnapshot is async but not awaited in _initCrossOrigin,
  // so isInitialized may be true before the DOM is fully built.
  // Allow the async snapshot handler to finish.
  await delay(200);
}
