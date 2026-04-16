import { describe, it, expect, beforeEach } from "vitest";
import { createRoot, createEffect } from "solid-js";
import { createStore, type StoreProxy } from "@virtual-frame/store";
import { useStore } from "../src/index.tsx";

describe("useStore (Solid)", () => {
  let store: StoreProxy;

  beforeEach(() => {
    store = createStore();
  });

  it("returns a signal accessor with the initial value at a selector path", () => {
    store.count = 42;

    let value: number | undefined;
    createRoot((dispose) => {
      const count = useStore<number>(store, ["count"]);
      value = count();
      dispose();
    });

    expect(value).toBe(42);
  });

  it("returns undefined for a missing path", () => {
    let value: unknown = "sentinel";
    createRoot((dispose) => {
      const val = useStore<unknown>(store, ["nonexistent"]);
      value = val();
      dispose();
    });

    expect(value).toBeUndefined();
  });

  it("returns the full proxy when no selector is given", () => {
    store.a = 1;

    let value: unknown;
    createRoot((dispose) => {
      const val = useStore(store);
      value = val();
      dispose();
    });

    expect(value).toStrictEqual({ a: 1 });
  });

  it("reads nested paths", () => {
    store.user = { name: "Alice" };

    let value: string | undefined;
    createRoot((dispose) => {
      const name = useStore<string>(store, ["user", "name"]);
      value = name();
      dispose();
    });

    expect(value).toBe("Alice");
  });

  it("handles null intermediate in nested path gracefully", () => {
    let value: unknown = "sentinel";
    createRoot((dispose) => {
      const val = useStore<unknown>(store, ["user", "name"]);
      value = val();
      dispose();
    });

    expect(value).toBeUndefined();
  });

  it("signal updates when the subscribed path changes", async () => {
    store.count = 0;

    const values: number[] = [];

    const dispose = await new Promise<() => void>((resolve) => {
      createRoot((dispose) => {
        const count = useStore<number>(store, ["count"]);

        createEffect(() => {
          values.push(count());
        });

        resolve(dispose);
      });
    });

    expect(values).toEqual([0]);

    store.count = 7;
    // Wait for microtask-batched store notification + Solid reactivity
    await new Promise((r) => setTimeout(r, 10));

    expect(values).toContain(7);
    dispose();
  });

  it("multiple signals track different paths independently", () => {
    store.a = 1;
    store.b = 2;

    let aVal: number | undefined;
    let bVal: number | undefined;

    createRoot((dispose) => {
      const a = useStore<number>(store, ["a"]);
      const b = useStore<number>(store, ["b"]);
      aVal = a();
      bVal = b();
      dispose();
    });

    expect(aVal).toBe(1);
    expect(bVal).toBe(2);
  });
});
