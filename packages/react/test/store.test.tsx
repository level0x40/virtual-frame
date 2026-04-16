import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createStore, type StoreProxy } from "@virtual-frame/store";
import { useStore } from "../src/index.tsx";

describe("useStore (React)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: StoreProxy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    store = createStore();
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  it("returns the initial value at a selector path", async () => {
    store.count = 42;
    await Promise.resolve();

    let rendered: number | undefined;
    function App() {
      rendered = useStore<number>(store, ["count"]);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBe(42);
  });

  it("returns undefined for a missing path", async () => {
    let rendered: unknown = "sentinel";
    function App() {
      rendered = useStore<number>(store, ["nonexistent"]);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBeUndefined();
  });

  it("returns the full proxy when no selector is given", async () => {
    store.a = 1;
    // Drain the microtask-batched notification queued by the mutation above
    // before any component subscribes, so it can't fire into a fresh
    // subscription after render and trip React's act(...) check.
    await Promise.resolve();

    let rendered: unknown;
    function App() {
      rendered = useStore(store);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toStrictEqual({ a: 1 });
  });

  it("re-renders when the subscribed path changes", async () => {
    store.count = 0;
    await Promise.resolve(); // drain pre-render notification microtask
    const values: number[] = [];

    function App() {
      const count = useStore<number>(store, ["count"]);
      values.push(count);
      return null;
    }

    await act(() => root.render(<App />));
    expect(values).toEqual([0]);

    // Wrap both the mutation and the microtask-batched notification +
    // React re-render in a single act() so the subscriber callback fires
    // inside act's scope.
    await act(async () => {
      store.count = 1;
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(values).toContain(1);
  });

  it("reads nested paths", async () => {
    store.user = { name: "Alice" };
    await Promise.resolve();

    let rendered: string | undefined;
    function App() {
      rendered = useStore<string>(store, ["user", "name"]);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBe("Alice");
  });

  it("handles null intermediate in nested path", async () => {
    // store.user is undefined, path is ["user", "name"]
    let rendered: unknown = "sentinel";
    function App() {
      rendered = useStore<string>(store, ["user", "name"]);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBeUndefined();
  });

  it("multiple components can subscribe to different paths independently", async () => {
    store.a = 1;
    store.b = 2;
    await Promise.resolve();

    let aVal: number | undefined;
    let bVal: number | undefined;

    function CompA() {
      aVal = useStore<number>(store, ["a"]);
      return null;
    }
    function CompB() {
      bVal = useStore<number>(store, ["b"]);
      return null;
    }
    function App() {
      return (
        <>
          <CompA />
          <CompB />
        </>
      );
    }

    await act(() => root.render(<App />));
    expect(aVal).toBe(1);
    expect(bVal).toBe(2);
  });
});
