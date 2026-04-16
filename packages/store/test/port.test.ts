import { describe, it, expect } from "vitest";
import { createStore, getStore, connectPort } from "../src/index.js";

// ── Helper ───────────────────────────────────────────────────────────

/** Wait for all pending microtasks and MessagePort messages. */
function flushMessages(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// ── connectPort basic ────────────────────────────────────────────────

describe("connectPort", () => {
  it("sends init message with current log on connect", async () => {
    const store = createStore({ sourceId: "host" });
    store.x = 1;

    const { port1, port2 } = new MessageChannel();
    const received: MessageEvent[] = [];
    port2.addEventListener("message", (e) => received.push(e));
    port2.start();

    connectPort(store, port1);
    await flushMessages();

    expect(received.length).toBeGreaterThanOrEqual(1);
    const initMsg = received.find((e) => e.data?.type === "vf-store:init");
    expect(initMsg).toBeDefined();
    expect(initMsg!.data.ops).toHaveLength(1);
    expect(initMsg!.data.ops[0].path).toEqual(["x"]);
    expect(initMsg!.data.ops[0].value).toBe(1);

    port1.close();
    port2.close();
  });

  it("forwards local operations to the port", async () => {
    const store = createStore({ sourceId: "host" });
    const { port1, port2 } = new MessageChannel();
    const received: MessageEvent[] = [];
    port2.addEventListener("message", (e) => received.push(e));
    port2.start();

    connectPort(store, port1);
    await flushMessages();

    store.y = 42;
    await flushMessages();

    const opMsgs = received.filter((e) => e.data?.type === "vf-store:op");
    expect(opMsgs.length).toBeGreaterThanOrEqual(1);
    const lastOp = opMsgs[opMsgs.length - 1].data.op;
    expect(lastOp.path).toEqual(["y"]);
    expect(lastOp.value).toBe(42);

    port1.close();
    port2.close();
  });

  it("receives and applies remote ops from port", async () => {
    const store = createStore({ sourceId: "local" });
    const { port1, port2 } = new MessageChannel();

    connectPort(store, port1);

    // Send a remote op through port2
    port2.postMessage({
      type: "vf-store:op",
      op: {
        ts: 1,
        source: "remote",
        seq: 0,
        type: "set",
        path: ["z"],
        value: 99,
      },
    });

    await flushMessages();
    expect(store.z).toBe(99);

    port1.close();
    port2.close();
  });

  it("receives and applies init batch from port", async () => {
    const store = createStore({ sourceId: "local" });
    const { port1, port2 } = new MessageChannel();

    connectPort(store, port1);

    port2.postMessage({
      type: "vf-store:init",
      ops: [
        { ts: 1, source: "remote", seq: 0, type: "set", path: ["a"], value: 1 },
        { ts: 2, source: "remote", seq: 1, type: "set", path: ["b"], value: 2 },
      ],
    });

    await flushMessages();
    expect(store.a).toBe(1);
    expect(store.b).toBe(2);

    port1.close();
    port2.close();
  });

  it("disconnect stops forwarding and receiving", async () => {
    const store = createStore({ sourceId: "local" });
    const { port1, port2 } = new MessageChannel();
    const received: MessageEvent[] = [];
    port2.addEventListener("message", (e) => received.push(e));
    port2.start();

    const disconnect = connectPort(store, port1);
    await flushMessages();
    const initCount = received.length;

    disconnect();

    store.after = "disconnect";
    await flushMessages();

    // No new messages after disconnect (port is closed)
    const opMsgsAfter = received
      .slice(initCount)
      .filter((e) => e.data?.type === "vf-store:op");
    expect(opMsgsAfter).toHaveLength(0);

    port2.close();
  });
});

// ── Two stores connected via MessageChannel ──────────────────────────

describe("connectPort — bidirectional sync", () => {
  it("syncs host state to frame", async () => {
    const host = createStore({ sourceId: "host" });
    host.theme = "dark";
    host.user = { name: "Viktor" };

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);

    await flushMessages();

    expect(frame.theme).toBe("dark");
    expect(frame.user.name).toBe("Viktor");
  });

  it("syncs frame writes back to host", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);

    await flushMessages();

    frame.message = "hello from frame";
    await flushMessages();

    expect(host.message).toBe("hello from frame");
  });

  it("bidirectional: both sides write and see each other's changes", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);

    await flushMessages();

    host.hostData = "from host";
    frame.frameData = "from frame";

    await flushMessages();

    expect(frame.hostData).toBe("from host");
    expect(host.frameData).toBe("from frame");
  });

  it("does not duplicate operations (init merge is idempotent)", async () => {
    const host = createStore({ sourceId: "host" });
    host.x = 1;

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);

    await flushMessages();

    // The frame should have exactly 1 op for x, not duplicated
    const frameHandle = getStore(frame);
    const setXOps = frameHandle.log.filter(
      (op) => op.type === "set" && op.path[0] === "x",
    );
    expect(setXOps).toHaveLength(1);
  });

  it("host-first initialization: frame receives existing state", async () => {
    const host = createStore({ sourceId: "host" });
    host.config = { theme: "dark", lang: "en" };
    host.items = [1, 2, 3];

    // Connect host first
    const { port1, port2 } = new MessageChannel();
    const disconnectHost = connectPort(host, port1);

    // Frame connects later
    const frame = createStore({ sourceId: "frame" });
    const disconnectFrame = connectPort(frame, port2);

    await flushMessages();

    expect(frame.config.theme).toBe("dark");
    expect(frame.config.lang).toBe("en");
    expect(frame.items[0]).toBe(1);
    expect(frame.items[2]).toBe(3);

    disconnectHost();
    disconnectFrame();
  });

  it("frame-first: frame writes before host exists, host receives on connect", async () => {
    const frame = createStore({ sourceId: "frame" });
    frame.earlyWrite = "before host";

    const { port1, port2 } = new MessageChannel();
    // Frame connects first
    connectPort(frame, port2);

    // Host connects later
    const host = createStore({ sourceId: "host" });
    connectPort(host, port1);

    await flushMessages();

    expect(host.earlyWrite).toBe("before host");
  });
});

// ── Port edge cases ──────────────────────────────────────────────────

describe("connectPort — edge cases", () => {
  it("ignores unknown message types", async () => {
    const store = createStore({ sourceId: "local" });
    const { port1, port2 } = new MessageChannel();

    connectPort(store, port1);

    // Send an unrecognized message type
    port2.postMessage({ type: "unknown-type", data: "hello" });
    // Send a message without a type
    port2.postMessage({ foo: "bar" });
    // Send null data
    port2.postMessage(null);

    await flushMessages();

    // Store should be unaffected
    expect(Object.keys(store)).toEqual([]);

    port1.close();
    port2.close();
  });

  it("sends empty init when store has no ops", async () => {
    const store = createStore({ sourceId: "empty" });
    const { port1, port2 } = new MessageChannel();
    const received: MessageEvent[] = [];
    port2.addEventListener("message", (e) => received.push(e));
    port2.start();

    connectPort(store, port1);
    await flushMessages();

    const initMsg = received.find((e) => e.data?.type === "vf-store:init");
    expect(initMsg).toBeDefined();
    expect(initMsg!.data.ops).toHaveLength(0);

    port1.close();
    port2.close();
  });

  it("multiple ports can connect to the same store", async () => {
    const store = createStore({ sourceId: "host" });
    store.x = 1;

    const { port1: p1a, port2: p1b } = new MessageChannel();
    const { port1: p2a, port2: p2b } = new MessageChannel();

    const frame1 = createStore({ sourceId: "frame1" });
    const frame2 = createStore({ sourceId: "frame2" });

    connectPort(store, p1a);
    connectPort(frame1, p1b);
    connectPort(store, p2a);
    connectPort(frame2, p2b);

    await flushMessages();

    expect(frame1.x).toBe(1);
    expect(frame2.x).toBe(1);

    store.y = 2;
    await flushMessages();

    expect(frame1.y).toBe(2);
    expect(frame2.y).toBe(2);

    p1a.close();
    p1b.close();
    p2a.close();
    p2b.close();
  });
});
