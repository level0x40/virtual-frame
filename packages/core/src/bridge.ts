/**
 * VirtualFrame Bridge Script
 *
 * Include this script in any page that will be loaded inside a cross-origin
 * <virtual-frame>. It serializes the DOM, observes mutations, collects CSS,
 * and proxies events back — all via postMessage.
 *
 * Usage (in the remote page):
 *   <script src="https://your-host/bridge.js"><\/script>
 *
 * Protocol messages  (bridge → host):
 *   vf:ready        – bridge is loaded
 *   vf:snapshot     – full DOM + CSS snapshot
 *   vf:mutations    – incremental mutation batch
 *   vf:css          – CSS text entries (for font isolation)
 *
 * Protocol messages  (host → bridge):
 *   vf:event        – replay a user event on the original element
 *   vf:navigate     – navigate this frame
 *   vf:input        – sync form input value
 *   vf:scroll       – sync scroll position
 */

/**
 * Create a bridge instance with isolated state.
 *
 * @param {Object} [config]
 * @param {string} [config.channel] - Fixed channel id (random if omitted).
 * @param {(msg: object) => void} [config.postMessage] - Override for outbound
 *   message delivery.  Receives the full message object.  When omitted the
 *   bridge calls `window.parent.postMessage(msg, "*")`.
 */

interface BridgeConfig {
  channel?: string;
  postMessage?: (msg: object) => void;
}

interface SerializedNode {
  type: string;
  id: number;
  data?: string | null;
  tag?: string;
  attrs?: Record<string, string>;
  children?: (SerializedNode | null)[];
  checked?: boolean;
  value?: string;
  nextSiblingId?: number | null;
}

export function createBridge(config: BridgeConfig = {}) {
  // ------------------------------------------------------------------
  // Unique channel id — the host will echo this back so we only listen
  // to our own parent.
  // ------------------------------------------------------------------
  const CHANNEL = config.channel || "__vf_" + Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------------------
  // Node ID book-keeping
  // ------------------------------------------------------------------
  let _nextId = 1;
  const nodeToId = new WeakMap();
  const idToNode = new Map();

  function assignId(node: Node): number {
    if (nodeToId.has(node)) return nodeToId.get(node);
    const id = _nextId++;
    nodeToId.set(node, id);
    idToNode.set(id, node);
    return id;
  }

  function getId(node: Node): number | null {
    return nodeToId.get(node) ?? null;
  }

  // ------------------------------------------------------------------
  // DOM Serialization
  // ------------------------------------------------------------------

  function serializeNode(node: Node): SerializedNode | null {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return serializeElement(node as Element);
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return { type: "text", id: assignId(node), data: node.textContent };
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      return { type: "comment", id: assignId(node), data: node.textContent };
    }
    return null;
  }

  function serializeElement(el: Element): SerializedNode | null {
    const tag = el.tagName.toLowerCase();
    // Skip script/noscript — must not execute in the host page mirror
    if (tag === "script" || tag === "noscript") return null;
    const id = assignId(el);
    const attrs: Record<string, string> = {};
    for (const a of el.attributes) {
      if (a.name.startsWith("on")) continue; // skip inline event handlers
      attrs[a.name] = a.value;
    }
    const children: SerializedNode[] = [];
    for (const child of el.childNodes) {
      const s = serializeNode(child);
      if (s) children.push(s);
    }
    const result: SerializedNode = {
      type: "element",
      id,
      tag,
      attrs,
      children,
    };

    // Include form element values
    if (isFormElement(el)) {
      const formEl = el as HTMLInputElement;
      if (formEl.type === "checkbox" || formEl.type === "radio") {
        result.checked = formEl.checked;
      }
      result.value = formEl.value;
    }

    return result;
  }

  function isFormElement(el: any) {
    const t = el.tagName?.toLowerCase();
    return t === "input" || t === "textarea" || t === "select";
  }

  // ------------------------------------------------------------------
  // CSS Collection
  // ------------------------------------------------------------------

  function collectCSS() {
    const entries: Array<{
      cssText?: string | null;
      href?: string;
      attr: string;
      index: string | number;
    }> = [];

    // Stylesheet rules (same-origin only — CORS sheets will fail)
    Array.from(document.styleSheets).forEach((sheet, i) => {
      try {
        let text = "";
        for (const rule of sheet.cssRules || sheet.rules) {
          text += rule.cssText + "\n";
        }
        entries.push({
          cssText: text,
          attr: "data-iframe-stylesheet",
          index: i,
        });
      } catch {
        // CORS-blocked — send the href so the host can fetch it
        if (sheet.href) {
          entries.push({
            href: sheet.href,
            attr: "data-iframe-stylesheet",
            index: "ext-" + i,
          });
        }
      }
    });

    // Inline <style> elements
    document.querySelectorAll("style").forEach((styleEl, i) => {
      entries.push({
        cssText: styleEl.textContent,
        attr: "data-iframe-inline-style",
        index: i,
      });
    });

    return entries;
  }

  // ------------------------------------------------------------------
  // Font information
  // ------------------------------------------------------------------

  function collectFonts() {
    const fonts = [];

    // Collect font-family names declared in CSS @font-face rules
    const cssFontNames = new Set();
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules || sheet.rules) {
            if (rule instanceof CSSFontFaceRule) {
              const family = rule.style
                .getPropertyValue("font-family")
                .replace(/^['"]|['"]$/g, "")
                .trim();
              if (family) cssFontNames.add(family);
            }
          }
        } catch {}
      }
    } catch {}

    try {
      for (const font of document.fonts) {
        if (font.status === "loaded") {
          const family = font.family.replace(/^['"]|['"]$/g, "");
          // Only report fonts NOT covered by CSS @font-face — those are
          // JS-created and won't be captured by collectCSS().
          if (!cssFontNames.has(family)) {
            fonts.push({
              family,
              weight: font.weight,
              style: font.style,
              stretch: font.stretch,
              // Binary source can't be serialized cross-origin
              jsOnly: true,
            });
          }
        }
      }
    } catch {}
    return fonts;
  }

  // ------------------------------------------------------------------
  // Send helpers
  // ------------------------------------------------------------------

  function send(type: string, payload: Record<string, unknown> = {}) {
    const msg = { __virtualFrame: true, channel: CHANNEL, type, ...payload };
    if (config.postMessage) {
      config.postMessage(msg);
      return;
    }
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(msg, "*");
  }

  // ------------------------------------------------------------------
  // Snapshot
  // ------------------------------------------------------------------

  function sendSnapshot() {
    const body = serializeNode(document.body);
    const css = collectCSS();
    const fonts = collectFonts();
    send("vf:snapshot", { body, css, fonts });

    // Start streaming for canvas and video elements
    startMediaStreaming();
  }

  // ------------------------------------------------------------------
  // Canvas / Video frame streaming
  // ------------------------------------------------------------------

  let _mediaIntervals: ReturnType<typeof setInterval>[] = []; // array of setInterval ids
  // Default: all canvas/video at ~5 fps.  Host can override via vf:ack.
  // Map of CSS selector → interval in ms.  "*" matches everything.
  let _streamingIntervalMap = { "*": 200 };

  function startMediaStreaming() {
    stopMediaStreaming();

    // Collect all <canvas> and <video> with their ids
    const allMedia: Array<{ id: number; el: any; tag: string }> = []; // { id, el }
    document.querySelectorAll("canvas").forEach((c) => {
      const id = getId(c);
      if (id != null) allMedia.push({ id, el: c, tag: "canvas" });
    });
    document.querySelectorAll("video").forEach((v) => {
      const id = getId(v);
      if (id != null) allMedia.push({ id, el: v, tag: "video" });
    });

    if (allMedia.length === 0) return;

    // Group elements by their interval tier.
    // Each element matches the FIRST selector it matches (most-specific-first
    // ordering is the caller's responsibility).  "*" is the fallback.
    const tiers = new Map(); // intervalMs → [{ id, el, tag }]
    for (const item of allMedia) {
      let matched = false;
      for (const [sel, ms] of Object.entries(_streamingIntervalMap)) {
        if (sel === "*") continue;
        try {
          if (item.el.matches(sel)) {
            if (!tiers.has(ms)) tiers.set(ms, []);
            tiers.get(ms).push(item);
            matched = true;
            break;
          }
        } catch {
          // invalid selector — skip
        }
      }
      if (!matched) {
        const fallback = _streamingIntervalMap["*"] ?? 200;
        if (!tiers.has(fallback)) tiers.set(fallback, []);
        tiers.get(fallback).push(item);
      }
    }

    // Helper canvas for video frame capture
    let helperCanvas: HTMLCanvasElement | null = null;
    let helperCtx: CanvasRenderingContext2D | null = null;

    // Start one interval per tier
    for (const [ms, items] of tiers) {
      const intervalId = setInterval(() => {
        for (const { id, el, tag } of items) {
          if (tag === "canvas") {
            try {
              const dataURL = el.toDataURL("image/png");
              send("vf:canvasFrame", { targetId: id, dataURL });
            } catch {
              // tainted canvas
            }
          } else {
            // video
            if (el.readyState < 2 || el.paused) continue;
            try {
              const w = el.videoWidth || el.width || 300;
              const h = el.videoHeight || el.height || 150;
              if (!helperCanvas) {
                helperCanvas = document.createElement("canvas");
                helperCtx = helperCanvas.getContext("2d");
              }
              helperCanvas.width = w;
              helperCanvas.height = h;
              helperCtx!.drawImage(el, 0, 0, w, h);
              const dataURL = helperCanvas.toDataURL("image/jpeg", 0.6);
              send("vf:canvasFrame", { targetId: id, dataURL });
            } catch {
              // CORS-blocked video
            }
          }
        }
      }, ms);
      _mediaIntervals.push(intervalId);
    }
  }

  function stopMediaStreaming() {
    for (const id of _mediaIntervals) clearInterval(id);
    _mediaIntervals = [];
  }

  // ------------------------------------------------------------------
  // MutationObserver
  // ------------------------------------------------------------------

  let observer: MutationObserver | null = null;

  function setupObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      const batch = [];
      let cssChanged = false;
      let mediaChanged = false;

      for (const m of mutations) {
        if (m.type === "childList") {
          // Check for CSS changes
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) {
              if ((n as Element).tagName === "STYLE" || (n as Element).tagName === "LINK") {
                cssChanged = true;
              }
              // Track newly added canvas/video elements — restart streaming
              if ((n as Element).tagName === "CANVAS" || (n as Element).tagName === "VIDEO") {
                if (getId(n) == null) assignId(n);
                mediaChanged = true;
              }
              // Also check children
              (n as Element).querySelectorAll("canvas, video").forEach((el: Element) => {
                if (getId(el) == null) assignId(el);
                mediaChanged = true;
              });
            }
          }
          for (const n of m.removedNodes) {
            if (n.nodeType === 1) {
              if ((n as Element).tagName === "STYLE" || (n as Element).tagName === "LINK") {
                cssChanged = true;
              }
              // Removed canvas/video — restart streaming
              if (
                (n as Element).tagName === "CANVAS" ||
                (n as Element).tagName === "VIDEO" ||
                (n as Element).querySelector("canvas, video")
              ) {
                mediaChanged = true;
              }
            }
          }

          const parentId = getId(m.target);
          if (parentId == null) continue;

          const added = [];
          for (const n of m.addedNodes) {
            const s = serializeNode(n);
            if (s) {
              s.nextSiblingId = n.nextSibling ? getId(n.nextSibling) : null;
              added.push(s);
            }
          }

          const removed = [];
          for (const n of m.removedNodes) {
            const id = getId(n);
            if (id != null) {
              removed.push(id);
              idToNode.delete(id);
              nodeToId.delete(n);
            }
          }

          if (added.length || removed.length) {
            batch.push({ type: "childList", parentId, added, removed });
          }
        } else if (m.type === "attributes") {
          const id = getId(m.target);
          if (id == null || m.attributeName!.startsWith("on")) continue;
          const value = (m.target as Element).getAttribute(m.attributeName!);
          batch.push({
            type: "attributes",
            id,
            name: m.attributeName,
            value,
          });
        } else if (m.type === "characterData") {
          if (m.target.parentElement?.tagName === "STYLE") {
            cssChanged = true;
          }
          const id = getId(m.target);
          if (id == null) continue;
          batch.push({ type: "characterData", id, data: m.target.textContent });
        }
      }

      if (batch.length) {
        send("vf:mutations", { mutations: batch });
      }
      if (cssChanged) {
        send("vf:css", { css: collectCSS() });
      }
      if (mediaChanged) {
        startMediaStreaming();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: false,
    });
  }

  // ------------------------------------------------------------------
  // Incoming messages from host
  // ------------------------------------------------------------------

  function handleMessage(e: MessageEvent) {
    const d = e.data;
    if (!d || !d.__virtualFrame || d.channel !== CHANNEL) return;

    switch (d.type) {
      case "vf:event":
        replayEvent(d);
        break;
      case "vf:input":
        syncInput(d);
        break;
      case "vf:scroll":
        syncScroll(d);
        break;
      case "vf:navigate":
        window.location.href = d.url;
        break;
      case "vf:requestSnapshot":
        waitForReady().then(sendSnapshot);
        break;
      case "vf:ack":
        // Host acknowledged — stop retrying vf:ready
        if (_readyInterval) {
          clearInterval(_readyInterval);
          _readyInterval = null;
        }
        // Store host-provided configuration
        if (d.streamingIntervals != null) {
          _streamingIntervalMap = d.streamingIntervals;
        }
        break;
    }
  }

  function replayEvent(d: any) {
    const el = idToNode.get(d.targetId);
    if (!el) return;

    let event;
    const opts = {
      bubbles: d.bubbles ?? true,
      cancelable: d.cancelable ?? true,
    };

    // For click on checkboxes / radio buttons, use el.click() instead
    // of dispatchEvent — synthetic (untrusted) MouseEvents don't toggle
    // the checked state.  el.click() is spec-defined to activate the
    // element, which includes toggling checkboxes.
    if (
      d.eventType === "click" &&
      el.tagName === "INPUT" &&
      ((el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio")
    ) {
      (el as HTMLElement).click();
      send("vf:eventResult", {
        eventType: d.eventType,
        targetId: d.targetId,
        defaultPrevented: false,
      });
      return;
    }

    if (d.eventType.startsWith("pointer")) {
      const rect = el.getBoundingClientRect();
      event = new PointerEvent(d.eventType, {
        ...opts,
        view: window,
        clientX: rect.left + (d.relX ?? 0),
        clientY: rect.top + (d.relY ?? 0),
        screenX: d.screenX ?? 0,
        screenY: d.screenY ?? 0,
        ctrlKey: d.ctrlKey,
        altKey: d.altKey,
        shiftKey: d.shiftKey,
        metaKey: d.metaKey,
        button: d.button ?? 0,
        buttons: d.buttons ?? 0,
        pointerId: d.pointerId ?? 1,
        width: d.width ?? 1,
        height: d.height ?? 1,
        pressure: d.pressure ?? 0,
        pointerType: d.pointerType ?? "mouse",
        isPrimary: d.isPrimary ?? true,
      });
    } else if (
      d.eventType.startsWith("mouse") ||
      d.eventType === "click" ||
      d.eventType === "dblclick" ||
      d.eventType === "contextmenu"
    ) {
      // Translate coordinates: host sent relative offsets
      const rect = el.getBoundingClientRect();
      event = new MouseEvent(d.eventType, {
        ...opts,
        view: window,
        clientX: rect.left + (d.relX ?? 0),
        clientY: rect.top + (d.relY ?? 0),
        screenX: d.screenX ?? 0,
        screenY: d.screenY ?? 0,
        ctrlKey: d.ctrlKey,
        altKey: d.altKey,
        shiftKey: d.shiftKey,
        metaKey: d.metaKey,
        button: d.button ?? 0,
        buttons: d.buttons ?? 0,
      });
    } else if (d.eventType.startsWith("key")) {
      event = new KeyboardEvent(d.eventType, {
        ...opts,
        view: window,
        key: d.key,
        code: d.code,
        location: d.location,
        ctrlKey: d.ctrlKey,
        altKey: d.altKey,
        shiftKey: d.shiftKey,
        metaKey: d.metaKey,
        repeat: d.repeat,
      });
    } else if (d.eventType.startsWith("touch")) {
      // Touch events can't be perfectly replayed cross-origin
      event = new Event(d.eventType, opts);
    } else if (d.eventType.startsWith("drag") || d.eventType === "drop") {
      const rect = el.getBoundingClientRect();
      event = new DragEvent(d.eventType, {
        ...opts,
        view: window,
        clientX: rect.left + (d.relX ?? 0),
        clientY: rect.top + (d.relY ?? 0),
      });
    } else if (d.eventType === "submit") {
      // Dispatch submit event; if not prevented, actually submit
      event = new Event("submit", { ...opts });
      const notPrevented = el.dispatchEvent(event);
      if (notPrevented && el.tagName?.toLowerCase() === "form") {
        if (typeof el.requestSubmit === "function") {
          el.requestSubmit();
        } else {
          el.submit();
        }
      }
      // Send the result back so the host knows
      send("vf:eventResult", {
        eventType: d.eventType,
        targetId: d.targetId,
        defaultPrevented: !notPrevented,
      });
      return;
    } else {
      event = new Event(d.eventType, opts);
    }

    const notPrevented = el.dispatchEvent(event);

    // For click on anchors — navigate if not prevented
    if (d.eventType === "click" && notPrevented && el.matches?.("a[href]") && el.href) {
      window.location.href = el.href;
    }

    send("vf:eventResult", {
      eventType: d.eventType,
      targetId: d.targetId,
      defaultPrevented: !notPrevented,
    });
  }

  function syncInput(d: any) {
    const el = idToNode.get(d.targetId);
    if (!el) return;

    if (d.checked !== undefined) {
      el.checked = d.checked;
    }
    if (d.value !== undefined) {
      // Use the native value setter so that React's synthetic event
      // system detects the change (React overrides the value property
      // descriptor and won't fire onChange for plain el.value = ...).
      const proto = Object.getPrototypeOf(el);
      const descriptor =
        Object.getOwnPropertyDescriptor(proto, "value") ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, d.value);
      } else {
        el.value = d.value;
      }
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (d.triggerChange) {
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function syncScroll(d: any) {
    const el = idToNode.get(d.targetId);
    if (!el) return;
    el._vfScrollFromHost = true;
    const maxY = el.scrollHeight - el.clientHeight;
    const maxX = el.scrollWidth - el.clientWidth;
    el.scrollTop = (d.pctY ?? 0) * maxY;
    el.scrollLeft = (d.pctX ?? 0) * maxX;
  }

  // ------------------------------------------------------------------
  // Scroll sync (bridge → host)
  // Listen for scroll events on all elements and report back to host.
  // ------------------------------------------------------------------

  let _scrollHandler: ((e: any) => void) | null = null;

  function setupScrollListeners() {
    _scrollHandler = (e: any) => {
      const el =
        e.target === document ? document.scrollingElement || document.documentElement : e.target;
      if (!el) return;
      // Guard against loops (host sent vf:scroll → we scrolled → this fires)
      if (el._vfScrollFromHost) {
        el._vfScrollFromHost = false;
        return;
      }
      const id = getId(el);
      if (id == null) return;
      const maxY = el.scrollHeight - el.clientHeight;
      const maxX = el.scrollWidth - el.clientWidth;
      send("vf:scrollUpdate", {
        targetId: id,
        pctY: maxY > 0 ? el.scrollTop / maxY : 0,
        pctX: maxX > 0 ? el.scrollLeft / maxX : 0,
      });
    };
    document.addEventListener("scroll", _scrollHandler, true);
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  let _booted = false;
  let _readyInterval: ReturnType<typeof setInterval> | null = null;

  // Returns a promise that resolves when the DOM + fonts are ready
  function waitForReady() {
    if (_booted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      function check() {
        if (document.readyState !== "loading" && document.body) {
          document.fonts.ready.then(() => {
            _booted = true;
            resolve();
          });
        } else {
          document.addEventListener(
            "DOMContentLoaded",
            () => {
              document.fonts.ready.then(() => {
                _booted = true;
                resolve();
              });
            },
            { once: true },
          );
        }
      }
      check();
    });
  }

  // ------------------------------------------------------------------
  // Form value sync (bridge → host)
  // Property changes like input.value don't trigger MutationObserver,
  // so we listen for input/change events and send them explicitly.
  // ------------------------------------------------------------------

  let _formInputHandler: ((e: any) => void) | null = null;
  let _formChangeHandler: ((e: any) => void) | null = null;

  function setupFormListeners() {
    _formInputHandler = (e: any) => {
      if (!isFormElement(e.target)) return;
      const id = getId(e.target);
      if (id == null) return;
      const payload: { targetId: any; value: any; checked?: boolean } = {
        targetId: id,
        value: e.target.value,
      };
      if (e.target.type === "checkbox" || e.target.type === "radio") {
        payload.checked = e.target.checked;
      }
      send("vf:formUpdate", payload);
    };
    _formChangeHandler = (e: any) => {
      if (!isFormElement(e.target)) return;
      const id = getId(e.target);
      if (id == null) return;
      const payload: { targetId: any; value: any; checked?: boolean } = {
        targetId: id,
        value: e.target.value,
      };
      if (e.target.type === "checkbox" || e.target.type === "radio") {
        payload.checked = e.target.checked;
      }
      send("vf:formUpdate", payload);
    };
    document.addEventListener("input", _formInputHandler, true);
    document.addEventListener("change", _formChangeHandler, true);
  }

  function boot() {
    waitForReady().then(() => {
      sendSnapshot();
      setupObserver();
      setupFormListeners();
      setupScrollListeners();
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Start the bridge: announce vf:ready, listen for host messages, and
   * boot the observer / form / scroll listeners when the DOM is ready.
   */
  function start() {
    window.addEventListener("message", handleMessage);

    // Announce ourselves — retry until the host acknowledges with vf:ack.
    send("vf:ready", { channel: CHANNEL });
    _readyInterval = setInterval(() => {
      send("vf:ready", { channel: CHANNEL });
    }, 100);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  /**
   * Tear down all listeners, timers and observers created by this instance.
   */
  function destroy() {
    if (_readyInterval) {
      clearInterval(_readyInterval);
      _readyInterval = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    stopMediaStreaming();
    window.removeEventListener("message", handleMessage);
    if (_formInputHandler) {
      document.removeEventListener("input", _formInputHandler, true);
      _formInputHandler = null;
    }
    if (_formChangeHandler) {
      document.removeEventListener("change", _formChangeHandler, true);
      _formChangeHandler = null;
    }
    if (_scrollHandler) {
      document.removeEventListener("scroll", _scrollHandler, true);
      _scrollHandler = null;
    }
  }

  return {
    CHANNEL,
    assignId,
    getId,
    nodeToId,
    idToNode,
    serializeNode,
    serializeElement,
    isFormElement,
    collectCSS,
    collectFonts,
    send,
    sendSnapshot,
    startMediaStreaming,
    stopMediaStreaming,
    setupObserver,
    handleMessage,
    replayEvent,
    syncInput,
    syncScroll,
    setupScrollListeners,
    setupFormListeners,
    waitForReady,
    boot,
    start,
    destroy,
  };
}

// ------------------------------------------------------------------
// Auto-init: when loaded inside an iframe, create and start a bridge
// automatically.  When imported by tests (window.parent === window)
// nothing happens — call createBridge() explicitly.
// ------------------------------------------------------------------
if (typeof window !== "undefined" && window.parent && window.parent !== window) {
  createBridge().start();
}
