import { describe, it, expect, vi } from "vitest";
import { createStore, getStore, connectPort } from "../src/index.js";

/** Wait for MessagePort messages to propagate. */
function flushMessages(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

// ── End-to-end: host ↔ frame via MessageChannel ─────────────────────

describe("Integration — full host ↔ frame flow", () => {
  it("complete demo flow from design doc", async () => {
    // Host side
    const host = createStore({ sourceId: "host" });
    host.theme = "dark";
    host.user = { name: "Viktor", role: "admin" };

    // Create channel
    const { port1, port2 } = new MessageChannel();

    // Host connects
    const disconnectHost = connectPort(host, port1);

    // Frame connects later
    const frame = createStore({ sourceId: "frame" });
    const disconnectFrame = connectPort(frame, port2);

    await flushMessages();

    // Frame should see host's initial state
    expect(frame.theme).toBe("dark");
    expect(frame.user.name).toBe("Viktor");
    expect(frame.user.role).toBe("admin");

    // Frame mutates
    frame.user.name = "Changed";
    await flushMessages();

    // Host should see the change
    expect(host.user.name).toBe("Changed");

    // Host changes theme
    host.theme = "light";
    await flushMessages();

    // Frame should see it
    expect(frame.theme).toBe("light");

    disconnectHost();
    disconnectFrame();
  });

  it("array operations sync correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.items = [];

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);

    const frame = createStore({ sourceId: "frame" });
    connectPort(frame, port2);
    await flushMessages();

    // Host pushes items
    host.items.push({ id: 1, name: "A" });
    host.items.push({ id: 2, name: "B" });
    await flushMessages();

    expect(frame.items.length).toBe(2);
    expect(frame.items[0].name).toBe("A");
    expect(frame.items[1].name).toBe("B");

    // Frame modifies an item
    frame.items[0].name = "Modified";
    await flushMessages();

    expect(host.items[0].name).toBe("Modified");

    // Host removes first item
    host.items.shift();
    await flushMessages();

    expect(frame.items.length).toBe(1);
    expect(frame.items[0].name).toBe("B");

    port1.close();
    port2.close();
  });

  it("Map operations sync correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.cache = new Map();

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);

    const frame = createStore({ sourceId: "frame" });
    connectPort(frame, port2);
    await flushMessages();

    host.cache.set("key1", "value1");
    await flushMessages();

    expect(frame.cache.get("key1")).toBe("value1");

    frame.cache.set("key2", "value2");
    await flushMessages();

    expect(host.cache.get("key2")).toBe("value2");

    port1.close();
    port2.close();
  });

  it("Set operations sync correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.tags = new Set();

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);

    const frame = createStore({ sourceId: "frame" });
    connectPort(frame, port2);
    await flushMessages();

    host.tags.add("js");
    host.tags.add("ts");
    await flushMessages();

    expect(frame.tags.has("js")).toBe(true);
    expect(frame.tags.has("ts")).toBe(true);

    frame.tags.delete("js");
    await flushMessages();

    expect(host.tags.has("js")).toBe(false);

    port1.close();
    port2.close();
  });
});

// ── Subscription integration ─────────────────────────────────────────

describe("Integration — subscriptions across ports", () => {
  it("subscriber on frame fires when host writes", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    const callback = vi.fn();
    getStore(frame).subscribe(callback);

    host.x = 42;
    await flushMessages();
    // Extra flush for the subscriber microtask
    await new Promise<void>((r) => queueMicrotask(r));

    expect(callback).toHaveBeenCalled();
    expect(frame.x).toBe(42);

    port1.close();
    port2.close();
  });

  it("path subscriber on host fires for frame writes to that path", async () => {
    const host = createStore({ sourceId: "host" });
    host.user = { name: "V" };

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    const callback = vi.fn();
    getStore(host).subscribe(["user"], callback);

    frame.user.name = "Changed";
    await flushMessages();
    await new Promise<void>((r) => queueMicrotask(r));

    expect(callback).toHaveBeenCalled();
    expect(host.user.name).toBe("Changed");

    port1.close();
    port2.close();
  });
});

// ── Disconnect behavior ──────────────────────────────────────────────

describe("Integration — disconnect", () => {
  it("stores diverge after disconnect", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    const disconnectHost = connectPort(host, port1);
    const disconnectFrame = connectPort(frame, port2);
    await flushMessages();

    host.shared = "together";
    await flushMessages();
    expect(frame.shared).toBe("together");

    disconnectHost();
    disconnectFrame();

    host.shared = "host only";
    frame.shared = "frame only";
    await flushMessages();

    expect(host.shared).toBe("host only");
    expect(frame.shared).toBe("frame only");
  });
});

// ── Multiple operations in quick succession ──────────────────────────

describe("Integration — rapid mutations", () => {
  it("handles many rapid writes from host", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    // Rapid writes
    for (let i = 0; i < 100; i++) {
      (host as Record<string, unknown>)[`key${i}`] = i;
    }

    await flushMessages();

    for (let i = 0; i < 100; i++) {
      expect((frame as Record<string, unknown>)[`key${i}`]).toBe(i);
    }

    port1.close();
    port2.close();
  });

  it("handles rapid array pushes", async () => {
    const host = createStore({ sourceId: "host" });
    host.items = [];

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    for (let i = 0; i < 50; i++) {
      host.items.push(i);
    }

    await flushMessages();

    expect(frame.items.length).toBe(50);
    for (let i = 0; i < 50; i++) {
      expect(frame.items[i]).toBe(i);
    }

    port1.close();
    port2.close();
  });
});

// ── Snapshot after sync ──────────────────────────────────────────────

describe("Integration — snapshot", () => {
  it("snapshot on frame matches host state after sync", async () => {
    const host = createStore({ sourceId: "host" });
    host.theme = "dark";
    host.count = 42;
    host.nested = { deep: { value: true } };

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    const hostSnap = getStore(host).snapshot();
    const frameSnap = getStore(frame).snapshot();

    expect(frameSnap).toEqual(hostSnap);

    port1.close();
    port2.close();
  });
});

// ── Edge cases ───────────────────────────────────────────────────────

describe("Integration — edge cases", () => {
  it("empty stores connect without error", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    expect(Object.keys(host)).toEqual([]);
    expect(Object.keys(frame)).toEqual([]);

    port1.close();
    port2.close();
  });

  it("boolean, number, string, null, undefined values sync", async () => {
    const host = createStore({ sourceId: "host" });
    host.bool = true;
    host.num = 42;
    host.str = "hello";
    host.nil = null;

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    expect(frame.bool).toBe(true);
    expect(frame.num).toBe(42);
    expect(frame.str).toBe("hello");
    expect(frame.nil).toBeNull();

    port1.close();
    port2.close();
  });

  it("overwriting subtree syncs correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.data = { a: 1, b: 2, c: 3 };

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    expect(frame.data.a).toBe(1);

    // Overwrite entire subtree
    host.data = { x: 10 };
    await flushMessages();

    expect(frame.data.x).toBe(10);
    expect(frame.data.a).toBeUndefined();

    port1.close();
    port2.close();
  });

  it("Map and Set nested inside objects sync", async () => {
    const host = createStore({ sourceId: "host" });
    host.data = {
      lookup: new Map([["key", "val"]]),
      tags: new Set(["a", "b"]),
    };

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    expect(frame.data.lookup.get("key")).toBe("val");
    expect(frame.data.tags.has("a")).toBe(true);

    host.data.lookup.set("key2", "val2");
    host.data.tags.add("c");
    await flushMessages();

    expect(frame.data.lookup.get("key2")).toBe("val2");
    expect(frame.data.tags.has("c")).toBe(true);

    port1.close();
    port2.close();
  });

  it("delete operations sync correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.a = 1;
    host.b = 2;
    host.c = 3;

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    expect(frame.a).toBe(1);
    expect(frame.b).toBe(2);

    delete host.b;
    await flushMessages();

    expect(frame.b).toBeUndefined();
    expect("b" in frame).toBe(false);
    expect(frame.a).toBe(1);
    expect(frame.c).toBe(3);

    port1.close();
    port2.close();
  });

  it("array sort syncs correctly", async () => {
    const host = createStore({ sourceId: "host" });
    host.items = [3, 1, 4, 1, 5];

    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    host.items.sort((a: number, b: number) => a - b);
    await flushMessages();

    const sorted = [];
    for (let i = 0; i < frame.items.length; i++) {
      sorted.push(frame.items[i]);
    }
    expect(sorted).toEqual([1, 1, 3, 4, 5]);

    port1.close();
    port2.close();
  });

  it("concurrent writes from both sides resolve deterministically", async () => {
    const host = createStore({ sourceId: "host" });
    const frame = createStore({ sourceId: "frame" });

    const { port1, port2 } = new MessageChannel();
    connectPort(host, port1);
    connectPort(frame, port2);
    await flushMessages();

    // Both sides write to the same key
    host.conflict = "from-host";
    frame.conflict = "from-frame";
    await flushMessages();

    // Both should converge to the same value (deterministic ordering)
    expect(host.conflict).toBe(frame.conflict);

    port1.close();
    port2.close();
  });
});
