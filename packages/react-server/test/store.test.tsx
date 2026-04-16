import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createStore } from "@virtual-frame/store";
import { useStore } from "../src/store.ts";

describe("useStore (react-server)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    createStore();
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  it("returns undefined for a path with no data yet", async () => {
    let rendered: number | undefined;
    function App() {
      rendered = useStore<number>(["count"]);
      return null;
    }

    await act(() => root.render(<App />));
    // The internal singleton has no data until a MessagePort connects
    expect(rendered).toBeUndefined();
  });

  it("returns undefined for a missing path", async () => {
    let rendered: unknown = "sentinel";
    function App() {
      rendered = useStore<number>(["nonexistent"]);
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBeUndefined();
  });

  it("returns the full proxy when no selector is given", async () => {
    let rendered: unknown;
    function App() {
      rendered = useStore();
      return null;
    }

    await act(() => root.render(<App />));
    expect(rendered).toBeDefined();
    expect(typeof rendered).toBe("object");
  });
});
