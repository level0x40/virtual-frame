import { describe, it, expect, beforeEach } from "vitest";
import { createStore, type StoreProxy } from "@virtual-frame/store";
import { useStore } from "../src/composables.js";

describe("useStore (Svelte)", () => {
  let store: StoreProxy;

  beforeEach(() => {
    store = createStore();
  });

  it("returns a readable with the initial value at a selector path", () => {
    store.count = 42;

    const readable = useStore<number>(store, ["count"]);
    let value: number | undefined;
    const unsub = readable.subscribe((v) => {
      value = v;
    });

    expect(value).toBe(42);
    unsub();
  });

  it("returns undefined for a missing path", () => {
    const readable = useStore<unknown>(store, ["nonexistent"]);
    let value: unknown = "sentinel";
    const unsub = readable.subscribe((v) => {
      value = v;
    });

    expect(value).toBeUndefined();
    unsub();
  });

  it("returns the full proxy when no selector is given", () => {
    store.a = 1;

    const readable = useStore(store);
    let value: unknown;
    const unsub = readable.subscribe((v) => {
      value = v;
    });

    expect(value).toStrictEqual({ a: 1 });
    unsub();
  });

  it("updates the readable when the subscribed path changes", async () => {
    store.count = 0;

    const readable = useStore<number>(store, ["count"]);
    const values: number[] = [];
    const unsub = readable.subscribe((v) => {
      values.push(v);
    });

    expect(values).toEqual([0]);

    store.count = 5;
    // Wait for microtask-batched store notification
    await new Promise((r) => setTimeout(r, 10));

    expect(values).toContain(5);
    unsub();
  });

  it("reads nested paths", () => {
    store.user = { name: "Alice" };

    const readable = useStore<string>(store, ["user", "name"]);
    let value: string | undefined;
    const unsub = readable.subscribe((v) => {
      value = v;
    });

    expect(value).toBe("Alice");
    unsub();
  });

  it("handles null intermediate in nested path gracefully", () => {
    const readable = useStore<unknown>(store, ["user", "name"]);
    let value: unknown = "sentinel";
    const unsub = readable.subscribe((v) => {
      value = v;
    });

    expect(value).toBeUndefined();
    unsub();
  });

  it("stops updating after unsubscribe", async () => {
    store.count = 0;

    const readable = useStore<number>(store, ["count"]);
    const values: number[] = [];
    const unsub = readable.subscribe((v) => {
      values.push(v);
    });

    expect(values).toEqual([0]);
    unsub();

    store.count = 99;
    await new Promise((r) => setTimeout(r, 10));

    // Should only have the initial value — no update after unsubscribe
    expect(values).toEqual([0]);
  });

  it("multiple readables track different paths independently", async () => {
    store.a = 1;
    store.b = 2;

    const aReadable = useStore<number>(store, ["a"]);
    const bReadable = useStore<number>(store, ["b"]);

    let aVal: number | undefined;
    let bVal: number | undefined;
    const unsubA = aReadable.subscribe((v) => {
      aVal = v;
    });
    const unsubB = bReadable.subscribe((v) => {
      bVal = v;
    });

    expect(aVal).toBe(1);
    expect(bVal).toBe(2);

    store.a = 10;
    await new Promise((r) => setTimeout(r, 10));

    expect(aVal).toBe(10);
    // b should remain unchanged
    expect(bVal).toBe(2);

    unsubA();
    unsubB();
  });
});
