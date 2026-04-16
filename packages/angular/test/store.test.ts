import { describe, it, expect, beforeEach } from "vitest";
import { createStore, getStore, type StoreProxy } from "@virtual-frame/store";

// Angular's `injectStoreValue` requires an injection context (inject(DestroyRef)).
// Testing the full Angular DI context in a unit test is heavy, so we test the
// reactive subscription logic that `injectStoreValue` wraps: getStore → subscribe
// → signal update.  This validates the contract without requiring TestBed.

describe("store subscription logic (Angular)", () => {
  let store: StoreProxy;

  beforeEach(() => {
    store = createStore();
  });

  it("subscribe fires when a watched path changes", async () => {
    store.count = 0;
    const handle = getStore(store);

    const values: number[] = [];
    const unsub = handle.subscribe(["count"], () => {
      values.push(store.count as number);
    });

    store.count = 1;
    // Wait for microtask-batched notification
    await new Promise((r) => setTimeout(r, 10));

    expect(values).toContain(1);
    unsub();
  });

  it("subscribe fires on nested path changes", async () => {
    store.user = { name: "Alice" };
    const handle = getStore(store);

    const values: string[] = [];
    const unsub = handle.subscribe(["user", "name"], () => {
      const user = store.user as Record<string, unknown>;
      values.push(user?.name as string);
    });

    (store.user as Record<string, unknown>).name = "Bob";
    await new Promise((r) => setTimeout(r, 10));

    expect(values).toContain("Bob");
    unsub();
  });

  it("root subscription fires on any change", async () => {
    const handle = getStore(store);

    let callCount = 0;
    const unsub = handle.subscribe(() => {
      callCount++;
    });

    store.a = 1;
    store.b = 2;
    // Both ops in same microtask → batched to one notification
    await new Promise((r) => setTimeout(r, 10));

    expect(callCount).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it("unsubscribe stops notifications", async () => {
    store.count = 0;
    const handle = getStore(store);

    let callCount = 0;
    const unsub = handle.subscribe(["count"], () => {
      callCount++;
    });

    store.count = 1;
    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(1);

    unsub();

    store.count = 2;
    await new Promise((r) => setTimeout(r, 10));
    // Should still be 1 — no new notification after unsubscribe
    expect(callCount).toBe(1);
  });

  it("snapshot returns a deep clone of current state", () => {
    store.items = [1, 2, 3];
    const handle = getStore(store);

    const snap = handle.snapshot() as Record<string, unknown>;
    expect(snap.items).toEqual([1, 2, 3]);

    // Mutating the snapshot should not affect the store
    (snap.items as number[]).push(4);
    expect((store.items as number[]).length).toBe(3);
  });

  it("path-specific subscriber is not called for unrelated changes", async () => {
    store.a = 1;
    store.b = 2;

    // Wait for the initial mutations' microtask notifications to flush
    await new Promise((r) => setTimeout(r, 10));

    const handle = getStore(store);
    let aCalls = 0;
    const unsub = handle.subscribe(["a"], () => {
      aCalls++;
    });

    store.b = 99;
    await new Promise((r) => setTimeout(r, 10));

    // Only "b" changed — "a" subscriber should NOT fire
    expect(aCalls).toBe(0);
    unsub();
  });
});
