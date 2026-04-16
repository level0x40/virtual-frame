import { describe, it, expect, afterEach } from "vitest";
import { VirtualFrame } from "../src/core.js";
import { cleanup, delay } from "./helpers.js";
import { setupCrossOrigin, bridgeSend, performHandshake } from "./cross-origin-helpers.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VirtualFrame — Cross-origin bridge protocol", () => {
  let iframe, vf, host, channel;

  afterEach(() => {
    if (vf) {
      try {
        vf.destroy();
      } catch {}
    }
    cleanup();
  });

  // ── Handshake ─────────────────────────────────────────────────

  describe("handshake", () => {
    it("enters cross-origin mode when _isCrossOrigin returns true", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      expect(vf._crossOrigin).toBe(true);
    });

    it("stores bridge channel on vf:ready", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());

      bridgeSend(iframe, channel, "vf:ready", { channel });
      await delay(50);

      expect(vf._bridgeChannel).toBe(channel);
    });

    it("replaces channel on re-announcement (MPA navigation)", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());

      bridgeSend(iframe, channel, "vf:ready", { channel });
      await delay(50);

      const newChannel = "__vf_new_" + Math.random().toString(36).slice(2, 8);
      bridgeSend(iframe, newChannel, "vf:ready", { channel: newChannel });
      await delay(50);

      expect(vf._bridgeChannel).toBe(newChannel);
    });

    it("initializes after full handshake with snapshot", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      expect(vf.isInitialized).toBe(true);
    });

    it("ignores messages from non-matching channel", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());

      // First establish a valid channel
      bridgeSend(iframe, channel, "vf:ready", { channel });
      await delay(50);

      // Send snapshot on a DIFFERENT channel — should be ignored
      const wrongChannel = "__vf_wrong";
      bridgeSend(iframe, wrongChannel, "vf:snapshot", {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [{ type: "text", id: 2, data: "Wrong" }],
        },
        css: [],
      });
      await delay(100);

      // Should NOT be initialized (no valid snapshot received)
      expect(vf.isInitialized).toBe(false);
    });

    it("ignores messages without __virtualFrame marker", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      bridgeSend(iframe, channel, "vf:ready", { channel });
      await delay(50);

      // Dispatch a message without __virtualFrame
      const event = new MessageEvent("message", {
        data: { channel, type: "vf:snapshot", body: null },
        source: iframe.contentWindow,
      });
      window.dispatchEvent(event);
      await delay(100);

      expect(vf.isInitialized).toBe(false);
    });
  });

  // ── Snapshot reconstruction ───────────────────────────────────

  describe("snapshot reconstruction", () => {
    it("builds DOM tree from snapshot body", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      expect(shadow).toBeTruthy();

      const content = shadow.querySelector("#content");
      expect(content).toBeTruthy();
      expect(content.tagName.toLowerCase()).toBe("div");
      expect(content.className).toBe("main");
      expect(content.textContent).toBe("Hello Cross-Origin");
    });

    it("replaces body tag with div[data-vf-body]", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const bodyDiv = shadow.querySelector("[data-vf-body]");
      expect(bodyDiv).toBeTruthy();
      expect(bodyDiv.tagName.toLowerCase()).toBe("div");
    });

    it("injects CSS from snapshot", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const styles = shadow.querySelectorAll("style");
      expect(styles.length).toBeGreaterThan(0);

      const allCSS = Array.from(styles)
        .map((s) => s.textContent)
        .join("\n");
      expect(allCSS).toContain("color");
    });

    it("creates text nodes in the mirrored DOM", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");
      const textNode = content?.firstChild;
      expect(textNode).toBeTruthy();
      expect(textNode.nodeType).toBe(Node.TEXT_NODE);
      expect(textNode.textContent).toBe("Hello Cross-Origin");
    });

    it("creates comment nodes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [{ type: "comment", id: 2, data: "cross-origin comment" }],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const bodyDiv = shadow.querySelector("[data-vf-body]");
      const comment = bodyDiv?.firstChild;
      expect(comment).toBeTruthy();
      expect(comment.nodeType).toBe(Node.COMMENT_NODE);
      expect(comment.textContent).toBe("cross-origin comment");
    });

    it("skips script and noscript elements", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "script",
              attrs: { src: "evil.js" },
              children: [],
            },
            {
              type: "element",
              id: 3,
              tag: "noscript",
              attrs: {},
              children: [{ type: "text", id: 4, data: "no js" }],
            },
            {
              type: "element",
              id: 5,
              tag: "p",
              attrs: {},
              children: [{ type: "text", id: 6, data: "safe content" }],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      expect(shadow.querySelector("script")).toBeNull();
      expect(shadow.querySelector("noscript")).toBeNull();
      expect(shadow.querySelector("p")?.textContent).toBe("safe content");
    });

    it("strips inline event handler attributes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "button",
              attrs: { id: "btn", onclick: "alert('xss')", class: "my-btn" },
              children: [{ type: "text", id: 3, data: "Click" }],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const btn = shadow.querySelector("#btn");
      expect(btn).toBeTruthy();
      expect(btn.hasAttribute("onclick")).toBe(false);
      expect(btn.className).toBe("my-btn");
    });

    it("maps remote node IDs to local DOM nodes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      // id=2 was the #content div
      const node = vf._remoteIdToNode.get(2);
      expect(node).toBeTruthy();
      expect(node.id).toBe("content");
    });

    it("handles canvas elements as img placeholders", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "canvas",
              attrs: { id: "my-canvas", width: "200", height: "100" },
              children: [],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const img = shadow.querySelector("img[data-mirror-source='canvas']");
      expect(img).toBeTruthy();
      expect(img.getAttribute("width")).toBe("200");
      expect(img.getAttribute("height")).toBe("100");
    });

    it("handles video elements with fetchable src as native video", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "video",
              attrs: {
                id: "my-video",
                src: "https://example.com/video.mp4",
              },
              children: [],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const video = shadow.querySelector("video");
      expect(video).toBeTruthy();
      expect(video.getAttribute("src")).toBe("https://example.com/video.mp4");
    });

    it("handles audio element as hidden placeholder", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "audio",
              attrs: { id: "my-audio" },
              children: [],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const placeholder = shadow.querySelector("div[data-mirror-source='audio']");
      expect(placeholder).toBeTruthy();
      expect(placeholder.style.display).toBe("none");
    });

    it("restores form values across snapshot rebuilds", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());

      // First snapshot with a form input
      const snapshot1 = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "field", type: "text" },
              children: [],
              value: "",
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot1);

      const shadow = host.shadowRoot;
      const input = shadow.querySelector("#field");
      expect(input).toBeTruthy();

      // User types in the mirrored input
      input.value = "user typed";

      // Second snapshot arrives (e.g. DOM change in source page)
      const snapshot2 = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "field", type: "text" },
              children: [],
              value: "",
            },
          ],
        },
        css: [],
      };
      bridgeSend(iframe, channel, "vf:snapshot", snapshot2);
      await delay(200);

      const inputAfter = shadow.querySelector("#field");
      expect(inputAfter).toBeTruthy();
      // The user's typed value should be restored
      expect(inputAfter.value).toBe("user typed");
    });
  });

  // ── Incremental mutations ─────────────────────────────────────

  describe("incremental mutations", () => {
    it("applies childList additions", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      // Add a new element to #content
      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "childList",
            parentId: 2,
            removed: [],
            added: [
              {
                type: "element",
                id: 10,
                tag: "span",
                attrs: { id: "added-span", class: "new" },
                children: [{ type: "text", id: 11, data: "New content" }],
              },
            ],
          },
        ],
      });
      await delay(50);

      const shadow = host.shadowRoot;
      const span = shadow.querySelector("#added-span");
      expect(span).toBeTruthy();
      expect(span.textContent).toBe("New content");
      expect(span.className).toBe("new");
    });

    it("applies childList removals", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      expect(shadow.querySelector("#content")).toBeTruthy();

      // Remove the #content div (id=2)
      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "childList",
            parentId: 1,
            removed: [2],
            added: [],
          },
        ],
      });
      await delay(50);

      expect(shadow.querySelector("#content")).toBeNull();
    });

    it("applies attribute changes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");
      expect(content.className).toBe("main");

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "attributes",
            id: 2,
            name: "class",
            value: "updated-class",
          },
        ],
      });
      await delay(50);

      expect(content.className).toBe("updated-class");
    });

    it("applies attribute removal", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");
      expect(content.hasAttribute("class")).toBe(true);

      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "attributes",
            id: 2,
            name: "class",
            value: null,
          },
        ],
      });
      await delay(50);

      expect(content.hasAttribute("class")).toBe(false);
    });

    it("applies characterData changes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");
      expect(content.textContent).toBe("Hello Cross-Origin");

      // Update text node (id=3)
      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "characterData",
            id: 3,
            data: "Updated text",
          },
        ],
      });
      await delay(50);

      expect(content.textContent).toBe("Updated text");
    });

    it("inserts before a specific sibling", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
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
              attrs: { id: "first" },
              children: [],
            },
            {
              type: "element",
              id: 3,
              tag: "div",
              attrs: { id: "last" },
              children: [],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      // Insert before #last (id=3)
      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "childList",
            parentId: 1,
            removed: [],
            added: [
              {
                type: "element",
                id: 10,
                tag: "div",
                attrs: { id: "middle" },
                children: [],
                nextSiblingId: 3,
              },
            ],
          },
        ],
      });
      await delay(50);

      const shadow = host.shadowRoot;
      const bodyDiv = shadow.querySelector("[data-vf-body]");
      const children = Array.from(bodyDiv.children);
      const ids = children.map((c) => c.id);
      expect(ids).toEqual(["first", "middle", "last"]);
    });

    it("skips inline event handler attributes in mutations", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      // Try to set onclick via mutation
      bridgeSend(iframe, channel, "vf:mutations", {
        mutations: [
          {
            type: "attributes",
            id: 2,
            name: "onclick",
            value: "alert('xss')",
          },
        ],
      });
      await delay(50);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");
      expect(content.hasAttribute("onclick")).toBe(false);
    });
  });

  // ── CSS updates ───────────────────────────────────────────────

  describe("CSS updates", () => {
    it("applies CSS updates from bridge", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      bridgeSend(iframe, channel, "vf:css", {
        css: [
          {
            cssText: "body { background: blue; } .main { font-size: 20px; }",
            attr: "data-iframe-stylesheet",
            index: 0,
          },
        ],
      });
      await delay(100);

      const shadow = host.shadowRoot;
      const styles = shadow.querySelectorAll("style");
      const allCSS = Array.from(styles)
        .map((s) => s.textContent)
        .join("\n");
      expect(allCSS).toContain("font-size");
    });

    it("replaces existing styles on CSS update", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;

      // Send new CSS
      bridgeSend(iframe, channel, "vf:css", {
        css: [
          {
            cssText: ".new-style { display: flex; }",
            attr: "data-iframe-stylesheet",
            index: 0,
          },
        ],
      });
      await delay(100);

      const allCSS = Array.from(shadow.querySelectorAll("style"))
        .map((s) => s.textContent)
        .join("\n");
      expect(allCSS).toContain("flex");
      // The old "color: red" CSS should have been replaced
      expect(allCSS).not.toContain("color");
    });
  });

  // ── Canvas frame updates ──────────────────────────────────────

  describe("canvas frame updates", () => {
    it("updates img src on vf:canvasFrame message", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "canvas",
              attrs: { id: "c", width: "100", height: "50" },
              children: [],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const img = shadow.querySelector("img[data-mirror-source='canvas']");
      expect(img).toBeTruthy();

      const fakeDataURL = "data:image/png;base64,AAAA";
      bridgeSend(iframe, channel, "vf:canvasFrame", {
        targetId: 2,
        dataURL: fakeDataURL,
      });
      await delay(50);

      expect(img.src).toBe(fakeDataURL);
    });

    it("ignores canvasFrame for non-img nodes", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      // Attempt to set canvasFrame on a div (id=2 is #content div)
      bridgeSend(iframe, channel, "vf:canvasFrame", {
        targetId: 2,
        dataURL: "data:image/png;base64,BBBB",
      });
      await delay(50);

      const content = host.shadowRoot.querySelector("#content");
      expect(content.hasAttribute("src")).toBe(false);
    });
  });

  // ── Form value updates ────────────────────────────────────────

  describe("form value updates", () => {
    it("updates mirrored input value on vf:formUpdate", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "field", type: "text" },
              children: [],
              value: "initial",
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      bridgeSend(iframe, channel, "vf:formUpdate", {
        targetId: 2,
        value: "updated by bridge",
      });
      await delay(50);

      const input = host.shadowRoot.querySelector("#field");
      expect(input.value).toBe("updated by bridge");
    });

    it("updates checkbox checked state on vf:formUpdate", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "cb", type: "checkbox" },
              children: [],
              checked: false,
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      bridgeSend(iframe, channel, "vf:formUpdate", {
        targetId: 2,
        checked: true,
      });
      await delay(50);

      const cb = host.shadowRoot.querySelector("#cb");
      expect(cb.checked).toBe(true);
    });
  });

  // ── Scroll sync ───────────────────────────────────────────────

  describe("scroll sync", () => {
    it("applies scroll position from vf:scrollUpdate", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
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
              attrs: {
                id: "scroller",
                style: "width:100px;height:100px;overflow:auto;",
              },
              children: [
                {
                  type: "element",
                  id: 3,
                  tag: "div",
                  attrs: {
                    style: "width:300px;height:300px;",
                  },
                  children: [],
                },
              ],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      bridgeSend(iframe, channel, "vf:scrollUpdate", {
        targetId: 2,
        pctY: 0.5,
        pctX: 0.25,
      });
      await delay(50);

      const scroller = host.shadowRoot.querySelector("#scroller");
      if (scroller.scrollHeight > scroller.clientHeight) {
        expect(scroller.scrollTop).toBeGreaterThan(0);
      }
    });

    it("does not echo bridge scroll back as vf:scroll", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
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
              attrs: {
                id: "scroller",
                style: "width:100px;height:100px;overflow:auto;",
              },
              children: [
                {
                  type: "element",
                  id: 3,
                  tag: "div",
                  attrs: {
                    style: "width:300px;height:300px;",
                  },
                  children: [],
                },
              ],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      // Spy on _sendToBridge
      const messages = [];
      const origSend = vf._sendToBridge.bind(vf);
      vf._sendToBridge = function (type, payload) {
        messages.push({ type, ...payload });
        origSend(type, payload);
      };

      // Receive scroll from bridge
      bridgeSend(iframe, channel, "vf:scrollUpdate", {
        targetId: 2,
        pctY: 0.5,
        pctX: 0,
      });
      await delay(100);

      // The bridge-originated scroll should NOT echo back as vf:scroll
      const scrollEcho = messages.find((m) => m.type === "vf:scroll");
      expect(scrollEcho).toBeUndefined();
    });
  });

  // ── Event proxying ────────────────────────────────────────────

  describe("event proxying", () => {
    it("sends vf:event to bridge on click", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const shadow = host.shadowRoot;
      const content = shadow.querySelector("#content");

      // Spy on _sendToBridge
      const messages = [];
      const origSend = vf._sendToBridge.bind(vf);
      vf._sendToBridge = function (type, payload) {
        messages.push({ type, ...payload });
        origSend(type, payload);
      };

      content.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 }));
      await delay(50);

      const clickMsg = messages.find((m) => m.type === "vf:event" && m.eventType === "click");
      expect(clickMsg).toBeTruthy();
      expect(clickMsg.targetId).toBe(2);
    });

    it("sends vf:input on form element input event", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "field", type: "text" },
              children: [],
              value: "",
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const messages = [];
      const origSend = vf._sendToBridge.bind(vf);
      vf._sendToBridge = function (type, payload) {
        messages.push({ type, ...payload });
        origSend(type, payload);
      };

      const input = host.shadowRoot.querySelector("#field");
      input.value = "hello";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(50);

      const inputMsg = messages.find((m) => m.type === "vf:input");
      expect(inputMsg).toBeTruthy();
      expect(inputMsg.value).toBe("hello");
    });

    it("sends vf:scroll on scroll event", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
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
              attrs: {
                id: "scroller",
                style: "width:100px;height:100px;overflow:auto;",
              },
              children: [
                {
                  type: "element",
                  id: 3,
                  tag: "div",
                  attrs: { style: "width:300px;height:300px;" },
                  children: [],
                },
              ],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const messages = [];
      const origSend = vf._sendToBridge.bind(vf);
      vf._sendToBridge = function (type, payload) {
        messages.push({ type, ...payload });
        origSend(type, payload);
      };

      const scroller = host.shadowRoot.querySelector("#scroller");
      scroller.scrollTop = 50;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await delay(50);

      const scrollMsg = messages.find((m) => m.type === "vf:scroll");
      expect(scrollMsg).toBeTruthy();
      expect(scrollMsg.targetId).toBe(2);
    });

    it("prevents default on anchor clicks", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "a",
              attrs: { id: "link", href: "https://example.com" },
              children: [{ type: "text", id: 3, data: "Link" }],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      const link = shadow.querySelector("#link");

      let defaultPrevented = false;
      link.addEventListener("click", (e) => {
        defaultPrevented = e.defaultPrevented;
      });

      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: 0,
          clientY: 0,
        }),
      );
      await delay(50);

      expect(defaultPrevented).toBe(true);
    });

    it("does not proxy events directly on form elements (handled by form sync)", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      const snapshot = {
        body: {
          type: "element",
          id: 1,
          tag: "body",
          attrs: {},
          children: [
            {
              type: "element",
              id: 2,
              tag: "input",
              attrs: { id: "field", type: "text" },
              children: [],
              value: "",
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const messages = [];
      const origSend = vf._sendToBridge.bind(vf);
      vf._sendToBridge = function (type, payload) {
        messages.push({ type, ...payload });
        origSend(type, payload);
      };

      const input = host.shadowRoot.querySelector("#field");
      // Non-bubbling mousedown on form element
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: false }));
      await delay(50);

      // No vf:event with the input's targetId should be sent
      const mouseMsg = messages.find(
        (m) => m.type === "vf:event" && m.eventType === "mousedown" && m.targetId === 2,
      );
      expect(mouseMsg).toBeUndefined();
    });
  });

  // ── _sendToBridge ─────────────────────────────────────────────

  describe("_sendToBridge", () => {
    it("sends postMessage with correct structure", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      bridgeSend(iframe, channel, "vf:ready", { channel });
      await delay(50);

      const sent = [];
      const origPostMessage = iframe.contentWindow.postMessage.bind(iframe.contentWindow);
      iframe.contentWindow.postMessage = function (data, origin) {
        sent.push(data);
        origPostMessage(data, origin);
      };

      vf._sendToBridge("vf:test", { foo: "bar" });

      expect(sent.length).toBe(1);
      expect(sent[0].__virtualFrame).toBe(true);
      expect(sent[0].channel).toBe(channel);
      expect(sent[0].type).toBe("vf:test");
      expect(sent[0].foo).toBe("bar");

      iframe.contentWindow.postMessage = origPostMessage;
    });

    it("does nothing when bridgeChannel is null", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());

      // Don't do handshake — _bridgeChannel should be null
      expect(vf._bridgeChannel).toBeNull();

      // This should silently return
      expect(() => vf._sendToBridge("vf:test", {})).not.toThrow();
    });
  });

  // ── _isCrossOrigin detection ──────────────────────────────────

  describe("cross-origin detection", () => {
    it("returns false for same-origin iframe", () => {
      const iframe = document.createElement("iframe");
      iframe.src = window.location.href;
      document.body.appendChild(iframe);

      const host = document.createElement("div");
      document.body.appendChild(host);

      // Stub init to prevent full initialization
      const origInit = VirtualFrame.prototype.init;
      VirtualFrame.prototype.init = function () {};
      const vf = new VirtualFrame(iframe, host);
      VirtualFrame.prototype.init = origInit;

      expect(vf._isCrossOrigin()).toBe(false);

      iframe.remove();
      host.remove();
    });

    it("returns true for cross-origin src URL", () => {
      const iframe = document.createElement("iframe");
      iframe.src = "https://other-domain.example.com/page.html";
      document.body.appendChild(iframe);

      const host = document.createElement("div");
      document.body.appendChild(host);

      const origInit = VirtualFrame.prototype.init;
      VirtualFrame.prototype.init = function () {};
      const vf = new VirtualFrame(iframe, host);
      VirtualFrame.prototype.init = origInit;

      expect(vf._isCrossOrigin()).toBe(true);

      iframe.remove();
      host.remove();
    });
  });

  // ── Destroy cleanup ───────────────────────────────────────────

  describe("destroy in cross-origin mode", () => {
    it("clears bridge channel and remote node maps", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      expect(vf._bridgeChannel).toBe(channel);
      expect(vf._remoteIdToNode.size).toBeGreaterThan(0);

      vf.destroy();

      expect(vf._bridgeChannel).toBeNull();
      expect(vf._remoteIdToNode.size).toBe(0);
    });

    it("removes window message listener", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin());
      await performHandshake(iframe, vf, channel);

      const messageHandler = vf._onMessage;
      expect(messageHandler).toBeTruthy();

      vf.destroy();

      expect(vf._onMessage).toBeNull();

      // Sending another message should not cause errors
      bridgeSend(iframe, channel, "vf:snapshot", {
        body: {
          type: "element",
          id: 100,
          tag: "body",
          attrs: {},
          children: [],
        },
        css: [],
      });
      await delay(50);
      // Should not crash
    });
  });

  // ── Selector in cross-origin ──────────────────────────────────

  describe("selector projection in cross-origin mode", () => {
    it("projects only the matching subtree from snapshot", async () => {
      ({ iframe, vf, host, channel } = await setupCrossOrigin({
        selector: "#target",
      }));

      const snapshot = {
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
              attrs: { id: "not-target" },
              children: [{ type: "text", id: 3, data: "Hidden" }],
            },
            {
              type: "element",
              id: 4,
              tag: "div",
              attrs: { id: "target" },
              children: [{ type: "text", id: 5, data: "Visible" }],
            },
          ],
        },
        css: [],
      };
      await performHandshake(iframe, vf, channel, snapshot);

      const shadow = host.shadowRoot;
      // The projected root should be #target, not the full body
      const target = shadow.querySelector("#target");
      expect(target).toBeTruthy();
      expect(target.textContent).toBe("Visible");

      // #not-target should NOT be directly visible as a child of shadowRoot
      // (it's inside the body div which was replaced by #target)
      const notTarget = shadow.querySelector("#not-target");
      expect(notTarget).toBeNull();
    });
  });
});
