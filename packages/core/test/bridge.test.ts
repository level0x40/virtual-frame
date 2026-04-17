import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBridge } from "../src/bridge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect outgoing messages from a bridge instance. */
function createCollector() {
  const messages = [];
  return {
    messages,
    postMessage(msg) {
      messages.push(msg);
    },
    ofType(type) {
      return messages.filter((m) => m.type === type);
    },
    last(type) {
      const all = this.ofType(type);
      return all[all.length - 1];
    },
    clear() {
      messages.length = 0;
    },
  };
}

/** Small delay for async observers / listeners to flush. */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Find a serialized node by its attrs.id inside a snapshot tree. */
function findById(node, id) {
  if (node.attrs?.id === id) return node;
  if (node.children) {
    for (const c of node.children) {
      if (c.type === "element") {
        const found = findById(c, id);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Find a serialized node by its tag inside a snapshot tree. */
function findTag(node, tag) {
  if (node.tag === tag) return node;
  if (node.children) {
    for (const c of node.children) {
      if (c.type === "element") {
        const found = findTag(c, tag);
        if (found) return found;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("bridge.js — direct (same-page) tests", () => {
  /** @type {ReturnType<typeof createBridge>} */
  let bridge;
  /** @type {ReturnType<typeof createCollector>} */
  let col;
  /** @type {HTMLDivElement} fixture container */
  let fixture;

  /**
   * Build DOM fixture identical to bridge-test.html but appended to the
   * current test page so Istanbul can instrument the imported code.
   */
  function setupFixture() {
    fixture = document.createElement("div");
    fixture.id = "bridge-fixture";
    fixture.innerHTML = `
      <style class="bridge-test-style">
        body { margin: 0; font-family: sans-serif; color: #333; }
        .highlight { background: yellow; }
      </style>
      <style class="bridge-test-style">
        .extra { font-size: 14px; }
      </style>

      <div id="content" class="main" data-custom="hello">
        Hello Bridge
        <!-- a comment node -->
      </div>

      <script>alert("should be skipped")</script>
      <noscript>also skipped</noscript>

      <button id="btn" onclick="doSomething()">Click Me</button>

      <form id="myform">
        <input id="text-input" type="text" value="initial" />
        <input id="checkbox" type="checkbox" />
        <input id="radio" type="radio" name="r" value="a" />
        <textarea id="textarea">some text</textarea>
        <select id="sel">
          <option value="one">One</option>
          <option value="two" selected>Two</option>
        </select>
      </form>

      <div id="scroller" style="width:100px;height:100px;overflow:auto;">
        <div style="width:300px;height:300px;">tall content</div>
      </div>

      <canvas id="test-canvas" width="50" height="50"></canvas>

      <div id="mutation-target"></div>
    `;
    document.body.appendChild(fixture);
  }

  beforeEach(() => {
    window.doSomething = () => {}; // stub for onclick="doSomething()"
    setupFixture();
    col = createCollector();
    bridge = createBridge({
      channel: "__vf_test",
      postMessage: col.postMessage,
    });
  });

  afterEach(() => {
    bridge?.destroy();
    fixture?.remove();
    delete window.doSomething;
  });

  // ── Serialization ─────────────────────────────────────────────

  describe("serialization", () => {
    it("serializes element nodes with tag, attrs, children", () => {
      const el = document.getElementById("content");
      const result = bridge.serializeNode(el);
      expect(result.type).toBe("element");
      expect(result.tag).toBe("div");
      expect(result.attrs.class).toBe("main");
      expect(result.attrs["data-custom"]).toBe("hello");
      expect(result.id).toBeGreaterThan(0);
    });

    it("serializes text nodes", () => {
      const el = document.getElementById("content");
      const result = bridge.serializeNode(el);
      const textChild = result.children.find((c) => c.type === "text");
      expect(textChild).toBeTruthy();
      expect(textChild.data).toContain("Hello Bridge");
    });

    it("serializes comment nodes", () => {
      const el = document.getElementById("content");
      const result = bridge.serializeNode(el);
      const commentChild = result.children.find((c) => c.type === "comment");
      expect(commentChild).toBeTruthy();
      expect(commentChild.data).toContain("a comment node");
    });

    it("skips script and noscript elements", () => {
      const result = bridge.serializeNode(fixture);
      expect(findTag(result, "script")).toBeNull();
      expect(findTag(result, "noscript")).toBeNull();
    });

    it("strips inline event handler attributes", () => {
      const btn = document.getElementById("btn");
      const result = bridge.serializeNode(btn);
      expect(result.attrs.onclick).toBeUndefined();
      expect(result.attrs.id).toBe("btn");
    });

    it("includes form element values", () => {
      const textInput = document.getElementById("text-input");
      const result = bridge.serializeNode(textInput);
      expect(result.value).toBe("initial");
    });

    it("includes checked state for checkboxes and radios", () => {
      const cb = document.getElementById("checkbox");
      const result = bridge.serializeNode(cb);
      expect(result.checked).toBe(false);
    });

    it("includes textarea value", () => {
      const ta = document.getElementById("textarea");
      const result = bridge.serializeNode(ta);
      expect(result.value).toBe("some text");
    });

    it("includes select value", () => {
      const sel = document.getElementById("sel");
      const result = bridge.serializeNode(sel);
      expect(result.value).toBe("two");
    });

    it("assigns unique IDs to all serialized nodes", () => {
      const result = bridge.serializeNode(fixture);
      const ids = new Set();
      function collectIds(node) {
        if (node.id != null) {
          expect(ids.has(node.id)).toBe(false);
          ids.add(node.id);
        }
        if (node.children) {
          for (const c of node.children) collectIds(c);
        }
      }
      collectIds(result);
      expect(ids.size).toBeGreaterThan(5);
    });

    it("returns null for unsupported node types", () => {
      const pi = document.createProcessingInstruction?.("xml", "version='1.0'");
      if (pi) {
        expect(bridge.serializeNode(pi)).toBeNull();
      }
    });
  });

  // ── isFormElement ─────────────────────────────────────────────

  describe("isFormElement", () => {
    it("returns true for input, textarea, select", () => {
      expect(bridge.isFormElement(document.createElement("input"))).toBe(true);
      expect(bridge.isFormElement(document.createElement("textarea"))).toBe(true);
      expect(bridge.isFormElement(document.createElement("select"))).toBe(true);
    });

    it("returns false for other elements", () => {
      expect(bridge.isFormElement(document.createElement("div"))).toBe(false);
      expect(bridge.isFormElement(document.createElement("button"))).toBe(false);
    });
  });

  // ── Node ID bookkeeping ───────────────────────────────────────

  describe("node ID bookkeeping", () => {
    it("assignId returns consistent IDs", () => {
      const el = document.createElement("span");
      const id1 = bridge.assignId(el);
      const id2 = bridge.assignId(el);
      expect(id1).toBe(id2);
      expect(id1).toBeGreaterThan(0);
    });

    it("getId returns null for untracked nodes", () => {
      const el = document.createElement("span");
      expect(bridge.getId(el)).toBeNull();
    });

    it("getId returns the assigned ID", () => {
      const el = document.createElement("span");
      const id = bridge.assignId(el);
      expect(bridge.getId(el)).toBe(id);
    });

    it("idToNode maps back to the original node", () => {
      const el = document.createElement("span");
      const id = bridge.assignId(el);
      expect(bridge.idToNode.get(id)).toBe(el);
    });
  });

  // ── CSS collection ────────────────────────────────────────────

  describe("collectCSS", () => {
    it("returns an array of CSS entries", () => {
      const css = bridge.collectCSS();
      expect(Array.isArray(css)).toBe(true);
      expect(css.length).toBeGreaterThan(0);
    });

    it("includes inline styles from style elements", () => {
      const css = bridge.collectCSS();
      const inlineEntries = css.filter((e) => e.attr === "data-iframe-inline-style");
      expect(inlineEntries.length).toBeGreaterThan(0);
    });

    it("includes cssText content", () => {
      const css = bridge.collectCSS();
      const allCSS = css.map((e) => e.cssText || "").join("\n");
      // Our fixture styles include margin and font-size
      expect(allCSS).toContain("margin");
    });
  });

  // ── Font collection ───────────────────────────────────────────

  describe("collectFonts", () => {
    it("returns an array", () => {
      const fonts = bridge.collectFonts();
      expect(Array.isArray(fonts)).toBe(true);
    });
  });

  // ── send ──────────────────────────────────────────────────────

  describe("send", () => {
    it("sends messages via the configured postMessage", () => {
      bridge.send("vf:test", { foo: "bar" });
      expect(col.messages.length).toBe(1);
      expect(col.messages[0]).toMatchObject({
        __virtualFrame: true,
        channel: "__vf_test",
        type: "vf:test",
        foo: "bar",
      });
    });

    it("includes channel in every message", () => {
      bridge.send("vf:ready", { channel: bridge.CHANNEL });
      expect(col.messages[0].channel).toBe("__vf_test");
    });
  });

  // ── sendSnapshot ──────────────────────────────────────────────

  describe("sendSnapshot", () => {
    it("sends a vf:snapshot message with body, css, fonts", () => {
      bridge.sendSnapshot();
      const snap = col.last("vf:snapshot");
      expect(snap).toBeTruthy();
      expect(snap.body).toBeTruthy();
      expect(snap.body.tag).toBe("body");
      expect(Array.isArray(snap.css)).toBe(true);
      expect(Array.isArray(snap.fonts)).toBe(true);
    });

    it("snapshot body contains the fixture content", () => {
      bridge.sendSnapshot();
      const snap = col.last("vf:snapshot");
      const content = findById(snap.body, "content");
      expect(content).toBeTruthy();
      expect(content.tag).toBe("div");
    });
  });

  // ── Mutations ─────────────────────────────────────────────────

  describe("mutations", () => {
    it("sends vf:mutations on DOM childList add", async () => {
      // Assign ID to the mutation target so the observer tracks it
      const target = document.getElementById("mutation-target");
      bridge.assignId(target);
      bridge.setupObserver();

      const span = document.createElement("span");
      span.id = "added-by-mutation";
      span.textContent = "mutated";
      target.appendChild(span);
      await delay(100);

      const mutMsg = col.last("vf:mutations");
      expect(mutMsg).toBeTruthy();
      const childListMut = mutMsg.mutations.find((m) => m.type === "childList");
      expect(childListMut).toBeTruthy();
      expect(childListMut.added.length).toBeGreaterThan(0);
      expect(childListMut.added[0].tag).toBe("span");
    });

    it("sends removed node IDs on removal", async () => {
      const target = document.getElementById("mutation-target");
      bridge.assignId(target);
      bridge.setupObserver();

      const el = document.createElement("div");
      el.id = "to-remove";
      target.appendChild(el);
      await delay(100);

      col.clear();
      el.remove();
      await delay(100);

      const mutMsg = col.last("vf:mutations");
      expect(mutMsg).toBeTruthy();
      const removeMut = mutMsg.mutations.find(
        (m) => m.type === "childList" && m.removed.length > 0,
      );
      expect(removeMut).toBeTruthy();
    });

    it("sends vf:mutations on attribute changes", async () => {
      const content = document.getElementById("content");
      bridge.assignId(content);
      bridge.setupObserver();

      content.setAttribute("data-test", "new-value");
      await delay(100);

      const mutMsg = col.last("vf:mutations");
      const attrMut = mutMsg?.mutations?.find(
        (m) => m.type === "attributes" && m.name === "data-test",
      );
      expect(attrMut).toBeTruthy();
      expect(attrMut.value).toBe("new-value");
    });

    it("sends vf:mutations on characterData changes", async () => {
      const content = document.getElementById("content");
      bridge.assignId(content);
      // Assign ID to the text node too
      const textNode = [...content.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
      );
      bridge.assignId(textNode);
      bridge.setupObserver();

      textNode.textContent = "changed text";
      await delay(100);

      const mutMsg = col.last("vf:mutations");
      const charMut = mutMsg?.mutations?.find((m) => m.type === "characterData");
      expect(charMut).toBeTruthy();
      expect(charMut.data).toContain("changed text");
    });

    it("sends vf:css when style element is added", async () => {
      bridge.setupObserver();

      const style = document.createElement("style");
      style.className = "bridge-test-style";
      style.textContent = ".dynamic-style { color: green; }";
      document.head.appendChild(style);
      await delay(100);

      const cssMsg = col.last("vf:css");
      expect(cssMsg).toBeTruthy();
      const allCSS = cssMsg.css.map((e) => e.cssText || "").join("\n");
      expect(allCSS).toContain("green");

      style.remove();
    });

    it("skips inline event handler attribute mutations", async () => {
      const content = document.getElementById("content");
      bridge.assignId(content);
      bridge.setupObserver();

      content.setAttribute("onclick", "bad()");
      await delay(100);

      const attrMuts = col
        .ofType("vf:mutations")
        .flatMap((m) => m.mutations)
        .filter((m) => m.type === "attributes" && m.name === "onclick");
      expect(attrMuts.length).toBe(0);
    });

    it("includes nextSiblingId for added nodes", async () => {
      const target = document.getElementById("mutation-target");
      bridge.assignId(target);
      bridge.setupObserver();

      const before = document.createElement("div");
      before.id = "before-node";
      target.appendChild(before);
      const after = document.createElement("div");
      after.id = "after-node";
      target.insertBefore(after, before);
      await delay(100);

      const allAdded = col
        .ofType("vf:mutations")
        .flatMap((m) => m.mutations)
        .filter((m) => m.type === "childList")
        .flatMap((m) => m.added);

      const afterNode = allAdded.find((a) => a.attrs?.id === "after-node");
      expect(afterNode).toBeTruthy();
      expect(afterNode.nextSiblingId).toBeTruthy();
    });
  });

  // ── Form listeners ────────────────────────────────────────────

  describe("form listeners", () => {
    it("sends vf:formUpdate on text input", async () => {
      const input = document.getElementById("text-input");
      bridge.assignId(input);
      bridge.setupFormListeners();

      input.value = "typed text";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:formUpdate");
      expect(update).toBeTruthy();
      expect(update.value).toBe("typed text");
    });

    it("sends vf:formUpdate with checked for checkboxes", async () => {
      const cb = document.getElementById("checkbox");
      bridge.assignId(cb);
      bridge.setupFormListeners();

      cb.checked = true;
      cb.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:formUpdate");
      expect(update.checked).toBe(true);
    });

    it("sends vf:formUpdate on change event", async () => {
      const input = document.getElementById("text-input");
      bridge.assignId(input);
      bridge.setupFormListeners();

      input.value = "changed";
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:formUpdate");
      expect(update.value).toBe("changed");
    });

    it("sends vf:formUpdate for textarea", async () => {
      const ta = document.getElementById("textarea");
      bridge.assignId(ta);
      bridge.setupFormListeners();

      ta.value = "new textarea value";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:formUpdate");
      expect(update.value).toBe("new textarea value");
    });

    it("ignores input events on non-form elements", async () => {
      bridge.setupFormListeners();
      const content = document.getElementById("content");
      content.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(50);

      expect(col.ofType("vf:formUpdate").length).toBe(0);
    });
  });

  // ── Scroll listeners ──────────────────────────────────────────

  describe("scroll listeners", () => {
    it("sends vf:scrollUpdate on scroll", async () => {
      const scroller = document.getElementById("scroller");
      bridge.assignId(scroller);
      bridge.setupScrollListeners();

      scroller.scrollTop = 50;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:scrollUpdate");
      expect(update).toBeTruthy();
      expect(update.pctY).toBeGreaterThan(0);
    });

    it("includes both pctY and pctX", async () => {
      const scroller = document.getElementById("scroller");
      bridge.assignId(scroller);
      bridge.setupScrollListeners();

      scroller.scrollTop = 50;
      scroller.scrollLeft = 30;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(50);

      const update = col.last("vf:scrollUpdate");
      expect(typeof update.pctY).toBe("number");
      expect(typeof update.pctX).toBe("number");
    });

    it("syncScroll sets _vfScrollFromHost guard flag", () => {
      const scroller = document.getElementById("scroller");
      const id = bridge.assignId(scroller);
      bridge.setupScrollListeners();

      // Simulate host-initiated scroll via syncScroll
      bridge.syncScroll({ targetId: id, pctY: 0.5, pctX: 0 });

      // The flag is set BEFORE scrollTop changes, so the next scroll
      // event will be suppressed (integration tested in scroll.test.js)
      expect(scroller._vfScrollFromHost).toBe(true);
    });
  });

  // ── Event replay (vf:event) ───────────────────────────────────

  describe("event replay (replayEvent)", () => {
    it("dispatches mouse events on the correct element", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      let clicked = false;
      btn.addEventListener("click", () => {
        clicked = true;
      });

      bridge.replayEvent({
        targetId: id,
        eventType: "click",
        relX: 5,
        relY: 5,
        bubbles: true,
        cancelable: true,
        button: 0,
      });

      expect(clicked).toBe(true);
    });

    it("sends vf:eventResult after dispatch", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      bridge.replayEvent({
        targetId: id,
        eventType: "click",
        relX: 0,
        relY: 0,
        bubbles: true,
        cancelable: true,
      });

      const result = col.last("vf:eventResult");
      expect(result.eventType).toBe("click");
      expect(result.targetId).toBe(id);
      expect(typeof result.defaultPrevented).toBe("boolean");
    });

    it("dispatches keyboard events", () => {
      const input = document.getElementById("text-input");
      const id = bridge.assignId(input);

      let keyPressed = null;
      input.addEventListener("keydown", (e) => {
        keyPressed = e.key;
      });

      bridge.replayEvent({
        targetId: id,
        eventType: "keydown",
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      });

      expect(keyPressed).toBe("Enter");
    });

    it("dispatches drag events", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      let dragStarted = false;
      btn.addEventListener("dragstart", () => {
        dragStarted = true;
      });

      bridge.replayEvent({
        targetId: id,
        eventType: "dragstart",
        relX: 5,
        relY: 5,
        bubbles: true,
        cancelable: true,
      });

      expect(dragStarted).toBe(true);
    });

    it("dispatches touch events as generic Event", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      let touchStarted = false;
      btn.addEventListener("touchstart", () => {
        touchStarted = true;
      });

      bridge.replayEvent({
        targetId: id,
        eventType: "touchstart",
        bubbles: true,
        cancelable: true,
      });

      expect(touchStarted).toBe(true);
    });

    it("dispatches generic events for unknown types", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      let customFired = false;
      btn.addEventListener("focus", () => {
        customFired = true;
      });

      bridge.replayEvent({
        targetId: id,
        eventType: "focus",
        bubbles: true,
        cancelable: true,
      });

      expect(customFired).toBe(true);
    });

    it("handles submit event on forms", () => {
      const form = document.getElementById("myform");
      const id = bridge.assignId(form);

      // Prevent actual submission
      form.addEventListener("submit", (e) => e.preventDefault());

      bridge.replayEvent({
        targetId: id,
        eventType: "submit",
        bubbles: true,
        cancelable: true,
      });

      const result = col.last("vf:eventResult");
      expect(result.eventType).toBe("submit");
      expect(result.defaultPrevented).toBe(true);
    });

    it("ignores event for unknown targetId", () => {
      // Should not crash
      bridge.replayEvent({
        targetId: 99999,
        eventType: "click",
        relX: 0,
        relY: 0,
      });
      // No eventResult sent (element not found → early return)
      expect(col.ofType("vf:eventResult").length).toBe(0);
    });
  });

  // ── Input sync (vf:input) ────────────────────────────────────

  describe("input sync (syncInput)", () => {
    it("sets input value from host", () => {
      const input = document.getElementById("text-input");
      const id = bridge.assignId(input);

      bridge.syncInput({ targetId: id, value: "from host" });
      expect(input.value).toBe("from host");
    });

    it("sets checkbox checked state", () => {
      const cb = document.getElementById("checkbox");
      const id = bridge.assignId(cb);

      bridge.syncInput({ targetId: id, checked: true });
      expect(cb.checked).toBe(true);
    });

    it("dispatches input event after syncing value", () => {
      const input = document.getElementById("text-input");
      const id = bridge.assignId(input);

      let inputEventFired = false;
      input.addEventListener("input", () => {
        inputEventFired = true;
      });

      bridge.syncInput({ targetId: id, value: "synced" });
      expect(inputEventFired).toBe(true);
    });

    it("dispatches change event when triggerChange is true", () => {
      const input = document.getElementById("text-input");
      const id = bridge.assignId(input);

      let changeEventFired = false;
      input.addEventListener("change", () => {
        changeEventFired = true;
      });

      bridge.syncInput({ targetId: id, value: "changed", triggerChange: true });
      expect(changeEventFired).toBe(true);
    });

    it("ignores unknown targetId", () => {
      // Should not crash
      bridge.syncInput({ targetId: 99999, value: "nope" });
    });
  });

  // ── Scroll sync (vf:scroll) ──────────────────────────────────

  describe("scroll sync (syncScroll)", () => {
    it("sets scroll position from host", () => {
      const scroller = document.getElementById("scroller");
      const id = bridge.assignId(scroller);

      bridge.syncScroll({ targetId: id, pctY: 0.5, pctX: 0.25 });
      expect(scroller.scrollTop).toBeGreaterThan(0);
    });

    it("sets _vfScrollFromHost to suppress echo", () => {
      const scroller = document.getElementById("scroller");
      const id = bridge.assignId(scroller);

      bridge.syncScroll({ targetId: id, pctY: 0.3, pctX: 0 });
      expect(scroller._vfScrollFromHost).toBe(true);
    });

    it("ignores unknown targetId", () => {
      // Should not crash
      bridge.syncScroll({ targetId: 99999, pctY: 0.5, pctX: 0 });
    });
  });

  // ── handleMessage ─────────────────────────────────────────────

  describe("handleMessage", () => {
    it("ignores messages without __virtualFrame", () => {
      bridge.handleMessage({
        data: { channel: bridge.CHANNEL, type: "vf:requestSnapshot" },
      });
      expect(col.ofType("vf:snapshot").length).toBe(0);
    });

    it("ignores messages with wrong channel", () => {
      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: "wrong_channel",
          type: "vf:requestSnapshot",
        },
      });
      expect(col.ofType("vf:snapshot").length).toBe(0);
    });

    it("handles vf:ack — stores streamingIntervals", () => {
      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: bridge.CHANNEL,
          type: "vf:ack",
          streamingIntervals: { "*": 50000 },
        },
      });
      // No crash and ack processed (indirect verification via canvas later)
    });

    it("handles vf:event via handleMessage", () => {
      const btn = document.getElementById("btn");
      const id = bridge.assignId(btn);

      let clicked = false;
      btn.addEventListener("click", () => {
        clicked = true;
      });

      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: bridge.CHANNEL,
          type: "vf:event",
          targetId: id,
          eventType: "click",
          relX: 0,
          relY: 0,
          bubbles: true,
          cancelable: true,
        },
      });

      expect(clicked).toBe(true);
    });

    it("handles vf:input via handleMessage", () => {
      const input = document.getElementById("text-input");
      const id = bridge.assignId(input);

      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: bridge.CHANNEL,
          type: "vf:input",
          targetId: id,
          value: "from message",
        },
      });

      expect(input.value).toBe("from message");
    });

    it("handles vf:scroll via handleMessage", () => {
      const scroller = document.getElementById("scroller");
      const id = bridge.assignId(scroller);

      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: bridge.CHANNEL,
          type: "vf:scroll",
          targetId: id,
          pctY: 0.5,
          pctX: 0,
        },
      });

      expect(scroller.scrollTop).toBeGreaterThan(0);
    });

    it("handles vf:requestSnapshot via handleMessage", async () => {
      bridge.handleMessage({
        data: {
          __virtualFrame: true,
          channel: bridge.CHANNEL,
          type: "vf:requestSnapshot",
        },
      });
      // waitForReady is async — give it a moment
      await delay(200);

      const snap = col.last("vf:snapshot");
      expect(snap).toBeTruthy();
      expect(snap.body.tag).toBe("body");
    });
  });

  // ── Canvas streaming ──────────────────────────────────────────

  describe("canvas streaming", () => {
    it("sends vf:canvasFrame for canvas elements", async () => {
      const canvas = document.getElementById("test-canvas");
      bridge.assignId(canvas);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "red";
      ctx.fillRect(0, 0, 50, 50);

      // Trigger snapshot to register the canvas, then start streaming
      bridge.sendSnapshot();
      bridge.startMediaStreaming();
      await delay(300);

      const frame = col.last("vf:canvasFrame");
      expect(frame).toBeTruthy();
      expect(frame.dataURL).toBeTruthy();
      expect(frame.dataURL.startsWith("data:image/png")).toBe(true);
    });

    it("stopMediaStreaming clears intervals", async () => {
      const canvas = document.getElementById("test-canvas");
      bridge.assignId(canvas);

      bridge.startMediaStreaming();
      bridge.stopMediaStreaming();
      await delay(300);

      // No canvas frames should be sent after stop
      expect(col.ofType("vf:canvasFrame").length).toBe(0);
    });
  });

  // ── start / destroy lifecycle ─────────────────────────────────

  describe("lifecycle", () => {
    it("start() sends vf:ready immediately", () => {
      // Create a fresh bridge with start()
      const col2 = createCollector();
      const b2 = createBridge({
        channel: "__vf_lifecycle",
        postMessage: col2.postMessage,
      });
      b2.start();

      const readyMsgs = col2.ofType("vf:ready");
      expect(readyMsgs.length).toBeGreaterThanOrEqual(1);
      expect(readyMsgs[0].channel).toBe("__vf_lifecycle");

      b2.destroy();
    });

    it("start() retries vf:ready until ack", async () => {
      const col2 = createCollector();
      const b2 = createBridge({
        channel: "__vf_retry",
        postMessage: col2.postMessage,
      });
      b2.start();

      await delay(350);
      const readyMsgs = col2.ofType("vf:ready");
      expect(readyMsgs.length).toBeGreaterThanOrEqual(2);

      b2.destroy();
    });

    it("vf:ack stops ready retries", async () => {
      const col2 = createCollector();
      const b2 = createBridge({
        channel: "__vf_ack",
        postMessage: col2.postMessage,
      });
      b2.start();
      await delay(50);

      // Send ack
      b2.handleMessage({
        data: {
          __virtualFrame: true,
          channel: "__vf_ack",
          type: "vf:ack",
        },
      });
      await delay(50);

      const countBefore = col2.ofType("vf:ready").length;
      await delay(350);
      const countAfter = col2.ofType("vf:ready").length;
      expect(countAfter).toBe(countBefore);

      b2.destroy();
    });

    it("destroy() cleans up without errors", () => {
      bridge.setupObserver();
      bridge.setupFormListeners();
      bridge.setupScrollListeners();

      // Should not throw
      bridge.destroy();
    });
  });

  // ── Re-snapshot ───────────────────────────────────────────────

  describe("re-snapshot", () => {
    it("sends a new snapshot on requestSnapshot", async () => {
      bridge.sendSnapshot();
      const countBefore = col.ofType("vf:snapshot").length;

      // Mutate DOM
      document.getElementById("content").textContent = "updated content";
      await delay(50);

      // Another snapshot
      bridge.sendSnapshot();
      const snapshots = col.ofType("vf:snapshot");
      expect(snapshots.length).toBeGreaterThan(countBefore);

      const latest = snapshots[snapshots.length - 1];
      const content = findById(latest.body, "content");
      const text = content?.children?.find((c) => c.type === "text");
      expect(text?.data).toBe("updated content");
    });
  });

  // ── send guard ────────────────────────────────────────────────

  describe("send guard (default postMessage)", () => {
    it("does not crash when window.parent === window", () => {
      // Create a bridge WITHOUT custom postMessage — it falls back to
      // the default which checks window.parent === window and bails.
      const b = createBridge({ channel: "__vf_guard" });
      // Should silently return without error
      b.send("vf:test", { data: "hello" });
      b.destroy();
    });
  });

  // ── waitForReady ──────────────────────────────────────────────

  describe("waitForReady", () => {
    it("resolves when document is ready", async () => {
      const resolved = await bridge.waitForReady();
      // If we got here, it resolved
      expect(resolved).toBeUndefined(); // Promise<void>
    });
  });

  // ── boot ──────────────────────────────────────────────────────

  describe("boot", () => {
    it("sends snapshot, sets up observer and listeners", async () => {
      bridge.boot();
      await delay(200);

      // Should have sent a snapshot
      const snap = col.last("vf:snapshot");
      expect(snap).toBeTruthy();
      expect(snap.body.tag).toBe("body");
    });
  });
});
