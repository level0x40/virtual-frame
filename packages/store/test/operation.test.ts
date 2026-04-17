import { describe, it, expect } from "vitest";
import { applyOperation, compareOperations, deepClone } from "../src/operation.js";
import type { Operation } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeOp(partial: Partial<Operation> & Pick<Operation, "type" | "path">): Operation {
  return {
    ts: 0,
    source: "a",
    seq: 0,
    ...partial,
  };
}

// ── compareOperations ────────────────────────────────────────────────

describe("compareOperations", () => {
  it("sorts by timestamp first", () => {
    const a = makeOp({ ts: 1, source: "a", seq: 0, type: "set", path: [] });
    const b = makeOp({ ts: 2, source: "a", seq: 0, type: "set", path: [] });
    expect(compareOperations(a, b)).toBeLessThan(0);
    expect(compareOperations(b, a)).toBeGreaterThan(0);
  });

  it("breaks ts ties by source", () => {
    const a = makeOp({ ts: 1, source: "aaa", seq: 0, type: "set", path: [] });
    const b = makeOp({ ts: 1, source: "bbb", seq: 0, type: "set", path: [] });
    expect(compareOperations(a, b)).toBeLessThan(0);
    expect(compareOperations(b, a)).toBeGreaterThan(0);
  });

  it("breaks source ties by seq", () => {
    const a = makeOp({ ts: 1, source: "a", seq: 1, type: "set", path: [] });
    const b = makeOp({ ts: 1, source: "a", seq: 2, type: "set", path: [] });
    expect(compareOperations(a, b)).toBeLessThan(0);
    expect(compareOperations(b, a)).toBeGreaterThan(0);
  });

  it("returns 0 for identical operations", () => {
    const a = makeOp({ ts: 1, source: "a", seq: 1, type: "set", path: [] });
    expect(compareOperations(a, a)).toBe(0);
  });
});

// ── applyOperation: set ──────────────────────────────────────────────

describe("applyOperation — set", () => {
  it("sets a root-level property", () => {
    const state: Record<string, unknown> = {};
    applyOperation(state, makeOp({ type: "set", path: ["name"], value: "Viktor" }));
    expect(state.name).toBe("Viktor");
  });

  it("sets a nested property", () => {
    const state: Record<string, unknown> = { user: { name: "Old" } };
    applyOperation(state, makeOp({ type: "set", path: ["user", "name"], value: "New" }));
    expect((state.user as Record<string, unknown>).name).toBe("New");
  });

  it("sets an array element by index", () => {
    const state: Record<string, unknown> = { items: [1, 2, 3] };
    applyOperation(state, makeOp({ type: "set", path: ["items", 1], value: 99 }));
    expect((state.items as number[])[1]).toBe(99);
  });

  it("sets a deeply nested value", () => {
    const state: Record<string, unknown> = {
      a: { b: { c: { d: "old" } } },
    };
    applyOperation(state, makeOp({ type: "set", path: ["a", "b", "c", "d"], value: "new" }));
    expect(
      ((state.a as Record<string, unknown>).b as Record<string, unknown>).c as Record<
        string,
        unknown
      >,
    ).toEqual({ d: "new" });
  });

  it("overwrites an entire subtree", () => {
    const state: Record<string, unknown> = { user: { name: "A", age: 25 } };
    applyOperation(state, makeOp({ type: "set", path: ["user"], value: { name: "B" } }));
    expect(state.user).toEqual({ name: "B" });
  });

  it("silently ignores set on missing parent", () => {
    const state: Record<string, unknown> = {};
    applyOperation(state, makeOp({ type: "set", path: ["missing", "child"], value: 1 }));
    expect(state).toEqual({});
  });

  it("sets value to null", () => {
    const state: Record<string, unknown> = { x: 1 };
    applyOperation(state, makeOp({ type: "set", path: ["x"], value: null }));
    expect(state.x).toBeNull();
  });

  it("sets value to undefined", () => {
    const state: Record<string, unknown> = { x: 1 };
    applyOperation(state, makeOp({ type: "set", path: ["x"], value: undefined }));
    expect(state.x).toBeUndefined();
  });

  it("sets value to an array", () => {
    const state: Record<string, unknown> = {};
    applyOperation(state, makeOp({ type: "set", path: ["items"], value: [1, 2, 3] }));
    expect(state.items).toEqual([1, 2, 3]);
  });

  it("sets value in a Map container", () => {
    const map = new Map<string, unknown>();
    const state: Record<string, unknown> = { data: map };
    applyOperation(state, makeOp({ type: "set", path: ["data", "key"], value: "val" }));
    expect(map.get("key")).toBe("val");
  });
});

// ── applyOperation: delete ───────────────────────────────────────────

describe("applyOperation — delete", () => {
  it("deletes a root-level property", () => {
    const state: Record<string, unknown> = { name: "Viktor" };
    applyOperation(state, makeOp({ type: "delete", path: ["name"] }));
    expect("name" in state).toBe(false);
  });

  it("deletes a nested property", () => {
    const state: Record<string, unknown> = { user: { name: "V", age: 25 } };
    applyOperation(state, makeOp({ type: "delete", path: ["user", "age"] }));
    expect(state.user).toEqual({ name: "V" });
  });

  it("silently ignores delete on missing parent", () => {
    const state: Record<string, unknown> = {};
    applyOperation(state, makeOp({ type: "delete", path: ["missing", "child"] }));
    expect(state).toEqual({});
  });

  it("deletes from a Map container", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const state: Record<string, unknown> = { data: map };
    applyOperation(state, makeOp({ type: "delete", path: ["data", "a"] }));
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
  });
});

// ── applyOperation: splice ───────────────────────────────────────────

describe("applyOperation — splice", () => {
  it("inserts at the end (push equivalent)", () => {
    const state: Record<string, unknown> = { items: [1, 2] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 2,
        deleteCount: 0,
        items: [3],
      }),
    );
    expect(state.items).toEqual([1, 2, 3]);
  });

  it("removes from the beginning (shift equivalent)", () => {
    const state: Record<string, unknown> = { items: [1, 2, 3] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 0,
        deleteCount: 1,
        items: [],
      }),
    );
    expect(state.items).toEqual([2, 3]);
  });

  it("inserts at the beginning (unshift equivalent)", () => {
    const state: Record<string, unknown> = { items: [2, 3] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 0,
        deleteCount: 0,
        items: [1],
      }),
    );
    expect(state.items).toEqual([1, 2, 3]);
  });

  it("replaces elements in the middle", () => {
    const state: Record<string, unknown> = { items: [1, 2, 3] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 1,
        deleteCount: 1,
        items: [99],
      }),
    );
    expect(state.items).toEqual([1, 99, 3]);
  });

  it("removes from the end (pop equivalent)", () => {
    const state: Record<string, unknown> = { items: [1, 2, 3] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 2,
        deleteCount: 1,
        items: [],
      }),
    );
    expect(state.items).toEqual([1, 2]);
  });

  it("inserts multiple items", () => {
    const state: Record<string, unknown> = { arr: [1, 4] };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["arr"],
        index: 1,
        deleteCount: 0,
        items: [2, 3],
      }),
    );
    expect(state.arr).toEqual([1, 2, 3, 4]);
  });

  it("silently ignores splice on non-array", () => {
    const state: Record<string, unknown> = { items: "not-array" };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["items"],
        index: 0,
        deleteCount: 0,
        items: [1],
      }),
    );
    expect(state.items).toBe("not-array");
  });
});

// ── applyOperation: map operations ───────────────────────────────────

describe("applyOperation — Map", () => {
  it("map-set adds a key-value pair", () => {
    const state: Record<string, unknown> = { m: new Map() };
    applyOperation(state, makeOp({ type: "map-set", path: ["m"], key: "hello", value: "world" }));
    expect((state.m as Map<string, string>).get("hello")).toBe("world");
  });

  it("map-set overwrites existing key", () => {
    const state: Record<string, unknown> = { m: new Map([["k", "old"]]) };
    applyOperation(state, makeOp({ type: "map-set", path: ["m"], key: "k", value: "new" }));
    expect((state.m as Map<string, string>).get("k")).toBe("new");
  });

  it("map-delete removes a key", () => {
    const state: Record<string, unknown> = {
      m: new Map([
        ["a", 1],
        ["b", 2],
      ]),
    };
    applyOperation(state, makeOp({ type: "map-delete", path: ["m"], key: "a" }));
    expect((state.m as Map<string, unknown>).has("a")).toBe(false);
    expect((state.m as Map<string, unknown>).get("b")).toBe(2);
  });

  it("map-clear removes all entries", () => {
    const state: Record<string, unknown> = {
      m: new Map([
        ["a", 1],
        ["b", 2],
      ]),
    };
    applyOperation(state, makeOp({ type: "map-clear", path: ["m"] }));
    expect((state.m as Map<unknown, unknown>).size).toBe(0);
  });

  it("map operations silently ignore non-Map targets", () => {
    const state: Record<string, unknown> = { m: {} };
    applyOperation(state, makeOp({ type: "map-set", path: ["m"], key: "k", value: "v" }));
    expect(state.m).toEqual({});
  });
});

// ── applyOperation: Set operations ───────────────────────────────────

describe("applyOperation — Set", () => {
  it("set-add adds a value", () => {
    const state: Record<string, unknown> = { s: new Set() };
    applyOperation(state, makeOp({ type: "set-add", path: ["s"], value: 1 }));
    expect((state.s as Set<number>).has(1)).toBe(true);
  });

  it("set-add is idempotent for same value", () => {
    const state: Record<string, unknown> = { s: new Set([1]) };
    applyOperation(state, makeOp({ type: "set-add", path: ["s"], value: 1 }));
    expect((state.s as Set<number>).size).toBe(1);
  });

  it("set-delete removes a value", () => {
    const state: Record<string, unknown> = { s: new Set([1, 2, 3]) };
    applyOperation(state, makeOp({ type: "set-delete", path: ["s"], value: 2 }));
    expect((state.s as Set<number>).has(2)).toBe(false);
    expect((state.s as Set<number>).size).toBe(2);
  });

  it("set-clear removes all values", () => {
    const state: Record<string, unknown> = { s: new Set([1, 2, 3]) };
    applyOperation(state, makeOp({ type: "set-clear", path: ["s"] }));
    expect((state.s as Set<unknown>).size).toBe(0);
  });

  it("set operations silently ignore non-Set targets", () => {
    const state: Record<string, unknown> = { s: [] };
    applyOperation(state, makeOp({ type: "set-add", path: ["s"], value: 1 }));
    expect(state.s).toEqual([]);
  });
});

// ── deepClone ────────────────────────────────────────────────────────

describe("deepClone", () => {
  it("clones primitive values", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
    expect(deepClone(true)).toBe(true);
  });

  it("clones a plain object", () => {
    const obj = { a: 1, b: { c: 2 } };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned).not.toBe(obj);
    expect(cloned.b).not.toBe(obj.b);
  });

  it("clones an array", () => {
    const arr = [1, [2, 3], { a: 4 }];
    const cloned = deepClone(arr);
    expect(cloned).toEqual(arr);
    expect(cloned).not.toBe(arr);
    expect(cloned[1]).not.toBe(arr[1]);
    expect(cloned[2]).not.toBe(arr[2]);
  });

  it("clones a Map", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const cloned = deepClone(map);
    expect(cloned).toBeInstanceOf(Map);
    expect(cloned.get("a")).toBe(1);
    expect(cloned).not.toBe(map);
  });

  it("clones a Set", () => {
    const set = new Set([1, 2, 3]);
    const cloned = deepClone(set);
    expect(cloned).toBeInstanceOf(Set);
    expect(cloned.has(1)).toBe(true);
    expect(cloned).not.toBe(set);
  });

  it("clones a Date", () => {
    const date = new Date(2024, 0, 1);
    const cloned = deepClone(date);
    expect(cloned).toBeInstanceOf(Date);
    expect(cloned.getTime()).toBe(date.getTime());
    expect(cloned).not.toBe(date);
  });

  it("clones nested structures", () => {
    const obj = {
      map: new Map([["k", { nested: true }]]),
      set: new Set([1, 2]),
      arr: [{ x: 1 }],
    };
    const cloned = deepClone(obj);
    expect(cloned).toEqual(obj);
    expect(cloned.map).not.toBe(obj.map);
    expect(cloned.set).not.toBe(obj.set);
    expect(cloned.arr).not.toBe(obj.arr);
  });

  it("clones a Uint8Array (typed array)", () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    const cloned = deepClone(buf);
    expect(cloned).toBeInstanceOf(Uint8Array);
    expect(cloned).toEqual(buf);
    expect(cloned.buffer).not.toBe(buf.buffer);
  });

  it("clones an ArrayBuffer", () => {
    const buf = new ArrayBuffer(8);
    const view = new Uint8Array(buf);
    view[0] = 42;
    const cloned = deepClone(buf);
    expect(cloned).toBeInstanceOf(ArrayBuffer);
    expect(cloned).not.toBe(buf);
    const clonedView = new Uint8Array(cloned);
    expect(clonedView[0]).toBe(42);
  });

  it("clones a Float64Array", () => {
    const arr = new Float64Array([1.5, 2.5, 3.5]);
    const cloned = deepClone(arr);
    expect(cloned).toBeInstanceOf(Float64Array);
    expect(cloned[0]).toBe(1.5);
    expect(cloned.buffer).not.toBe(arr.buffer);
  });
});

// ── applyOperation: navigation through Map parent ────────────────────

describe("applyOperation — Map parent navigation", () => {
  it("navigates through a Map to set a nested value", () => {
    const inner = { value: "old" };
    const map = new Map<string, unknown>([["child", inner]]);
    const state: Record<string, unknown> = { data: map };
    applyOperation(
      state,
      makeOp({
        type: "set",
        path: ["data", "child", "value"],
        value: "new",
      }),
    );
    expect(inner.value).toBe("new");
  });

  it("navigates through a Map to delete a nested value", () => {
    const inner = { a: 1, b: 2 };
    const map = new Map<string, unknown>([["child", inner]]);
    const state: Record<string, unknown> = { data: map };
    applyOperation(state, makeOp({ type: "delete", path: ["data", "child", "a"] }));
    expect("a" in inner).toBe(false);
    expect(inner.b).toBe(2);
  });

  it("splice on array nested inside a Map", () => {
    const arr = [1, 2, 3];
    const map = new Map<string, unknown>([["list", arr]]);
    const state: Record<string, unknown> = { data: map };
    applyOperation(
      state,
      makeOp({
        type: "splice",
        path: ["data", "list"],
        index: 1,
        deleteCount: 1,
        items: [99],
      }),
    );
    expect(arr).toEqual([1, 99, 3]);
  });

  it("map-set on Map nested inside another Map", () => {
    const innerMap = new Map<string, unknown>();
    const outerMap = new Map<string, unknown>([["inner", innerMap]]);
    const state: Record<string, unknown> = { data: outerMap };
    applyOperation(
      state,
      makeOp({
        type: "map-set",
        path: ["data", "inner"],
        key: "k",
        value: "v",
      }),
    );
    expect(innerMap.get("k")).toBe("v");
  });

  it("set-add on Set nested inside a Map", () => {
    const set = new Set<number>();
    const map = new Map<string, unknown>([["tags", set]]);
    const state: Record<string, unknown> = { data: map };
    applyOperation(
      state,
      makeOp({
        type: "set-add",
        path: ["data", "tags"],
        value: 42,
      }),
    );
    expect(set.has(42)).toBe(true);
  });
});

// ── applyOperation: edge cases ───────────────────────────────────────

describe("applyOperation — edge cases", () => {
  it("set on primitive parent is no-op", () => {
    const state: Record<string, unknown> = { x: 42 };
    applyOperation(state, makeOp({ type: "set", path: ["x", "y"], value: "nope" }));
    expect(state.x).toBe(42);
  });

  it("delete on primitive parent is no-op", () => {
    const state: Record<string, unknown> = { x: "str" };
    applyOperation(state, makeOp({ type: "delete", path: ["x", "y"] }));
    expect(state.x).toBe("str");
  });

  it("map-delete on non-Map is no-op", () => {
    const state: Record<string, unknown> = { m: { a: 1 } };
    applyOperation(state, makeOp({ type: "map-delete", path: ["m"], key: "a" }));
    expect((state.m as Record<string, unknown>).a).toBe(1);
  });

  it("map-clear on non-Map is no-op", () => {
    const state: Record<string, unknown> = { m: { a: 1 } };
    applyOperation(state, makeOp({ type: "map-clear", path: ["m"] }));
    expect((state.m as Record<string, unknown>).a).toBe(1);
  });

  it("set-delete on non-Set is no-op", () => {
    const state: Record<string, unknown> = { s: [1, 2] };
    applyOperation(state, makeOp({ type: "set-delete", path: ["s"], value: 1 }));
    expect(state.s).toEqual([1, 2]);
  });

  it("set-clear on non-Set is no-op", () => {
    const state: Record<string, unknown> = { s: [1, 2] };
    applyOperation(state, makeOp({ type: "set-clear", path: ["s"] }));
    expect(state.s).toEqual([1, 2]);
  });

  it("splice with defaults when fields are missing", () => {
    const state: Record<string, unknown> = { items: [1, 2, 3] };
    applyOperation(state, makeOp({ type: "splice", path: ["items"] }));
    // index defaults to 0, deleteCount to 0, items to []
    expect(state.items).toEqual([1, 2, 3]);
  });
});
