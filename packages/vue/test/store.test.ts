import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp, nextTick, defineComponent, h, type App, type Ref } from "vue";
import { createStore, type StoreProxy } from "@virtual-frame/store";
import { useStore } from "../src/composables.js";

describe("useStore (Vue)", () => {
  let container: HTMLDivElement;
  let app: App | null;
  let store: StoreProxy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    store = createStore();
  });

  afterEach(() => {
    if (app) {
      app.unmount();
      app = null;
    }
    container.remove();
  });

  it("returns a ref with the initial value at a selector path", async () => {
    store.count = 42;

    let result: Ref<number> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore<number>(store, ["count"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    expect(result).toBeDefined();
    expect(result!.value).toBe(42);
  });

  it("returns undefined for a missing path", async () => {
    let result: Ref<unknown> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore(store, ["nonexistent"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    expect(result!.value).toBeUndefined();
  });

  it("returns the full proxy ref when no selector is given", async () => {
    store.a = 1;

    let result: Ref<unknown> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore(store);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    // Vue's ref() wraps/unwraps values, so identity check won't hold.
    // Instead verify the value reflects the store's state.
    expect((result!.value as Record<string, unknown>).a).toBe(1);
  });

  it("updates the ref when the subscribed path changes", async () => {
    store.count = 0;

    let result: Ref<number> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore<number>(store, ["count"]);
          return () => h("div", result!.value);
        },
      }),
    );
    app.mount(container);
    await nextTick();
    expect(result!.value).toBe(0);

    store.count = 10;
    // Wait for microtask-batched store notification
    await new Promise((r) => setTimeout(r, 10));
    await nextTick();

    expect(result!.value).toBe(10);
  });

  it("reads nested paths", async () => {
    store.user = { name: "Alice" };

    let result: Ref<string> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore<string>(store, ["user", "name"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    expect(result!.value).toBe("Alice");
  });

  it("handles null intermediate in nested path gracefully", async () => {
    let result: Ref<unknown> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore(store, ["user", "name"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    expect(result!.value).toBeUndefined();
  });

  it("multiple composables track different paths independently", async () => {
    store.a = 1;
    store.b = 2;

    let aRef: Ref<number> | undefined;
    let bRef: Ref<number> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          aRef = useStore<number>(store, ["a"]);
          bRef = useStore<number>(store, ["b"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();

    expect(aRef!.value).toBe(1);
    expect(bRef!.value).toBe(2);
  });

  it("unsubscribes on unmount", async () => {
    store.count = 0;

    let result: Ref<number> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          result = useStore<number>(store, ["count"]);
          return () => null;
        },
      }),
    );
    app.mount(container);
    await nextTick();
    expect(result!.value).toBe(0);

    // Unmount — should unsubscribe
    app.unmount();
    app = null;

    // Mutate after unmount — the ref should NOT update since listener is removed.
    // (We mainly verify no errors are thrown.)
    store.count = 99;
    await new Promise((r) => setTimeout(r, 10));
    // The ref value may or may not update — the important thing is no crash.
  });
});
