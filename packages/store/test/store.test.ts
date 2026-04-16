import { describe, it, expect, vi } from "vitest";
import { createStore, getStore } from "../src/store.js";
import { isStoreProxy } from "../src/proxy.js";

// ── createStore ──────────────────────────────────────────────────────

describe("createStore", () => {
  it("returns a proxy object", () => {
    const store = createStore();
    expect(store).toBeDefined();
    expect(typeof store).toBe("object");
  });

  it("accepts a custom sourceId", () => {
    const store = createStore({ sourceId: "custom-123" });
    const handle = getStore(store);
    expect(handle.sourceId).toBe("custom-123");
  });

  it("generates a random sourceId by default", () => {
    const store1 = createStore();
    const store2 = createStore();
    expect(getStore(store1).sourceId).not.toBe(getStore(store2).sourceId);
  });

  it("returns a proxy that isStoreProxy identifies", () => {
    const store = createStore();
    expect(isStoreProxy(store)).toBe(true);
  });

  it("non-proxies are not identified as store proxies", () => {
    expect(isStoreProxy({})).toBe(false);
    expect(isStoreProxy(null)).toBe(false);
    expect(isStoreProxy(42)).toBe(false);
  });
});

// ── getStore ──────────────────────────────────────────────────────────

describe("getStore", () => {
  it("returns a handle for the root proxy", () => {
    const store = createStore();
    const handle = getStore(store);
    expect(handle).toBeDefined();
    expect(handle.proxy).toBe(store);
  });

  it("throws for non-store objects", () => {
    expect(() => getStore({} as any)).toThrow();
  });

  it("handle.log is initially empty", () => {
    const store = createStore();
    expect(getStore(store).log).toHaveLength(0);
  });

  it("handle.log grows with writes", () => {
    const store = createStore();
    const handle = getStore(store);
    store.a = 1;
    store.b = 2;
    expect(handle.log).toHaveLength(2);
  });
});

// ── apply / applyBatch ───────────────────────────────────────────────

describe("StoreHandle — apply", () => {
  it("applies a remote operation", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.apply({
      ts: 1,
      source: "remote",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 42,
    });
    expect(store.x).toBe(42);
  });

  it("skips duplicate operations", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.apply({
      ts: 1,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    handle.apply({
      ts: 2,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 2,
    });
    // Same source+seq → second is skipped
    expect(store.x).toBe(1);
    expect(handle.log).toHaveLength(1);
  });

  it("applyBatch applies multiple operations", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.applyBatch([
      { ts: 1, source: "r", seq: 0, type: "set", path: ["a"], value: 1 },
      { ts: 2, source: "r", seq: 1, type: "set", path: ["b"], value: 2 },
      { ts: 3, source: "r", seq: 2, type: "set", path: ["c"], value: 3 },
    ]);
    expect(store.a).toBe(1);
    expect(store.b).toBe(2);
    expect(store.c).toBe(3);
    expect(handle.log).toHaveLength(3);
  });

  it("applyBatch skips duplicates", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.apply({
      ts: 1,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    handle.applyBatch([
      { ts: 1, source: "r", seq: 0, type: "set", path: ["x"], value: 99 },
      { ts: 2, source: "r", seq: 1, type: "set", path: ["y"], value: 2 },
    ]);
    expect(store.x).toBe(1); // not 99
    expect(store.y).toBe(2);
    expect(handle.log).toHaveLength(2);
  });
});

// ── snapshot ──────────────────────────────────────────────────────────

describe("StoreHandle — snapshot", () => {
  it("returns a deep clone of current state", () => {
    const store = createStore();
    store.user = { name: "Viktor" };
    store.items = [1, 2, 3];
    const snap = getStore(store).snapshot() as Record<string, unknown>;
    expect(snap).toEqual({ user: { name: "Viktor" }, items: [1, 2, 3] });
  });

  it("snapshot is independent of future mutations", () => {
    const store = createStore();
    store.x = 1;
    const snap = getStore(store).snapshot() as Record<string, unknown>;
    store.x = 2;
    expect(snap.x).toBe(1);
    expect(store.x).toBe(2);
  });

  it("snapshot handles nested objects", () => {
    const store = createStore();
    store.deep = { a: { b: { c: 1 } } };
    const snap = getStore(store).snapshot() as Record<string, unknown>;
    store.deep.a.b.c = 99;
    expect((snap.deep as any).a.b.c).toBe(1);
  });
});

// ── onOperation ──────────────────────────────────────────────────────

describe("StoreHandle — onOperation", () => {
  it("fires for local writes", () => {
    const store = createStore();
    const handle = getStore(store);
    const ops: unknown[] = [];
    handle.onOperation((op) => ops.push(op));
    store.x = 1;
    expect(ops).toHaveLength(1);
    expect((ops[0] as any).type).toBe("set");
    expect((ops[0] as any).value).toBe(1);
  });

  it("does not fire for remote apply", () => {
    const store = createStore();
    const handle = getStore(store);
    const ops: unknown[] = [];
    handle.onOperation((op) => ops.push(op));
    handle.apply({
      ts: 1,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    expect(ops).toHaveLength(0);
  });

  it("unsubscribes correctly", () => {
    const store = createStore();
    const handle = getStore(store);
    const ops: unknown[] = [];
    const unsub = handle.onOperation((op) => ops.push(op));
    store.x = 1;
    unsub();
    store.y = 2;
    expect(ops).toHaveLength(1);
  });
});

// ── subscribe ────────────────────────────────────────────────────────

describe("StoreHandle — subscribe", () => {
  it("root subscriber fires on any change", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(callback);
    store.x = 1;
    // Notifications are microtask-batched
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("root subscriber fires once per microtask batch", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(callback);
    store.x = 1;
    store.y = 2;
    store.z = 3;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("path subscriber fires for matching writes", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(["user"], callback);
    store.user = { name: "V" };
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("path subscriber fires for nested writes", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(["user"], callback);
    store.user = { name: "V" };
    await new Promise<void>((r) => queueMicrotask(r));
    callback.mockClear();
    store.user.name = "Changed";
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("path subscriber does not fire for unrelated writes", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(["user"], callback);
    store.theme = "dark";
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).not.toHaveBeenCalled();
  });

  it("unsubscribes correctly", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    const unsub = handle.subscribe(callback);
    store.x = 1;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
    unsub();
    callback.mockClear();
    store.y = 2;
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).not.toHaveBeenCalled();
  });

  it("subscriber fires for remote operations", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(callback);
    handle.apply({
      ts: 1,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });
});

// ── destroy ──────────────────────────────────────────────────────────

describe("StoreHandle — destroy", () => {
  it("cleans up the store", () => {
    const store = createStore();
    const handle = getStore(store);
    store.x = 1;
    handle.destroy();
    expect(() => getStore(store)).toThrow();
  });

  it("ignores operations after destroy", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.destroy();
    // apply should not throw, just no-op
    handle.apply({
      ts: 1,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    // log was cleared
    expect(handle.log).toHaveLength(0);
  });

  it("applyBatch ignores operations after destroy", () => {
    const store = createStore();
    const handle = getStore(store);
    handle.destroy();
    handle.applyBatch([
      { ts: 1, source: "r", seq: 0, type: "set", path: ["x"], value: 1 },
      { ts: 2, source: "r", seq: 1, type: "set", path: ["y"], value: 2 },
    ]);
    expect(handle.log).toHaveLength(0);
  });
});

// ── getStore from child proxy ────────────────────────────────────────

describe("getStore — child proxy lookup", () => {
  it("returns handle from a child proxy", () => {
    const store = createStore({ sourceId: "test" });
    store.user = { name: "V" };
    // Access child to create a child proxy
    const child = store.user;
    const handle = getStore(child as any);
    expect(handle).toBeDefined();
    expect(handle.sourceId).toBe("test");
    expect(handle.proxy).toBe(store);
  });

  it("returns handle from deeply nested child proxy", () => {
    const store = createStore({ sourceId: "deep-test" });
    store.a = { b: { c: { d: 1 } } };
    const deepChild = store.a.b.c;
    const handle = getStore(deepChild as any);
    expect(handle).toBeDefined();
    expect(handle.sourceId).toBe("deep-test");
  });
});

// ── Subscription path matching edge cases ────────────────────────────

describe("StoreHandle — subscribe path matching", () => {
  it("path subscriber fires when parent path is overwritten", async () => {
    const store = createStore();
    const handle = getStore(store);
    store.user = { name: "V" };
    await new Promise<void>((r) => queueMicrotask(r));

    const callback = vi.fn();
    handle.subscribe(["user", "name"], callback);

    // Overwrite parent — should fire child subscriber
    store.user = { name: "New" };
    await new Promise<void>((r) => queueMicrotask(r));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("multiple path subscribers fire independently", async () => {
    const store = createStore();
    const handle = getStore(store);
    const userCb = vi.fn();
    const themeCb = vi.fn();
    handle.subscribe(["user"], userCb);
    handle.subscribe(["theme"], themeCb);

    store.user = { name: "V" };
    await new Promise<void>((r) => queueMicrotask(r));

    expect(userCb).toHaveBeenCalledOnce();
    expect(themeCb).not.toHaveBeenCalled();
  });

  it("root subscriber and path subscriber both fire on matching write", async () => {
    const store = createStore();
    const handle = getStore(store);
    const rootCb = vi.fn();
    const pathCb = vi.fn();
    handle.subscribe(rootCb);
    handle.subscribe(["x"], pathCb);

    store.x = 1;
    await new Promise<void>((r) => queueMicrotask(r));

    expect(rootCb).toHaveBeenCalledOnce();
    expect(pathCb).toHaveBeenCalledOnce();
  });

  it("subscriber fires for remote batch operations", async () => {
    const store = createStore();
    const handle = getStore(store);
    const callback = vi.fn();
    handle.subscribe(callback);

    handle.applyBatch([
      { ts: 1, source: "r", seq: 0, type: "set", path: ["a"], value: 1 },
      { ts: 2, source: "r", seq: 1, type: "set", path: ["b"], value: 2 },
    ]);
    await new Promise<void>((r) => queueMicrotask(r));

    // Batched into one notification
    expect(callback).toHaveBeenCalledOnce();
  });
});
