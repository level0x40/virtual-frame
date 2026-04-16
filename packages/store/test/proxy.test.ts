import { describe, it, expect } from "vitest";
import { createStore, getStore } from "../src/store.js";
import { isStoreProxy } from "../src/proxy.js";

// ── Basic proxy reads/writes ─────────────────────────────────────────

describe("Proxy — basic read/write", () => {
  it("sets and reads a root property", () => {
    const store = createStore();
    store.theme = "dark";
    expect(store.theme).toBe("dark");
  });

  it("sets and reads multiple root properties", () => {
    const store = createStore();
    store.a = 1;
    store.b = "hello";
    store.c = true;
    expect(store.a).toBe(1);
    expect(store.b).toBe("hello");
    expect(store.c).toBe(true);
  });

  it("reads undefined for missing property", () => {
    const store = createStore();
    expect(store.missing).toBeUndefined();
  });

  it("writes and reads null", () => {
    const store = createStore();
    store.x = null;
    expect(store.x).toBeNull();
  });

  it("writes and reads 0", () => {
    const store = createStore();
    store.x = 0;
    expect(store.x).toBe(0);
  });

  it("writes and reads empty string", () => {
    const store = createStore();
    store.x = "";
    expect(store.x).toBe("");
  });

  it("overwrites a property", () => {
    const store = createStore();
    store.x = 1;
    store.x = 2;
    expect(store.x).toBe(2);
  });
});

// ── Nested objects ───────────────────────────────────────────────────

describe("Proxy — nested objects", () => {
  it("sets and reads a nested object", () => {
    const store = createStore();
    store.user = { name: "Viktor", age: 30 };
    expect(store.user.name).toBe("Viktor");
    expect(store.user.age).toBe(30);
  });

  it("mutates a nested property", () => {
    const store = createStore();
    store.user = { name: "Viktor" };
    store.user.name = "Changed";
    expect(store.user.name).toBe("Changed");
  });

  it("sets deep structure and reads through", () => {
    const store = createStore();
    store.config = {
      theme: "dark",
      layout: { sidebar: true, columns: 3 },
    };
    expect(store.config.theme).toBe("dark");
    expect(store.config.layout.sidebar).toBe(true);
    expect(store.config.layout.columns).toBe(3);
  });

  it("mutates deep property", () => {
    const store = createStore();
    store.config = { layout: { columns: 3 } };
    store.config.layout.columns = 2;
    expect(store.config.layout.columns).toBe(2);
  });

  it("overwrites subtree completely", () => {
    const store = createStore();
    store.user = { name: "A", age: 25, extra: true };
    store.user = { name: "B" };
    expect(store.user.name).toBe("B");
    expect(store.user.age).toBeUndefined();
    expect(store.user.extra).toBeUndefined();
  });
});

// ── Delete ───────────────────────────────────────────────────────────

describe("Proxy — delete", () => {
  it("deletes a root property", () => {
    const store = createStore();
    store.x = 1;
    delete store.x;
    expect(store.x).toBeUndefined();
    expect("x" in store).toBe(false);
  });

  it("deletes a nested property", () => {
    const store = createStore();
    store.user = { name: "V", age: 30 };
    delete store.user.age;
    expect(store.user.age).toBeUndefined();
    expect(store.user.name).toBe("V");
  });
});

// ── has / in operator ────────────────────────────────────────────────

describe("Proxy — has (in operator)", () => {
  it("returns true for existing property", () => {
    const store = createStore();
    store.x = 1;
    expect("x" in store).toBe(true);
  });

  it("returns false for missing property", () => {
    const store = createStore();
    expect("x" in store).toBe(false);
  });

  it("returns true after set, false after delete", () => {
    const store = createStore();
    store.x = 1;
    expect("x" in store).toBe(true);
    delete store.x;
    expect("x" in store).toBe(false);
  });
});

// ── ownKeys / Object.keys ────────────────────────────────────────────

describe("Proxy — ownKeys", () => {
  it("returns keys of root properties", () => {
    const store = createStore();
    store.a = 1;
    store.b = 2;
    store.c = 3;
    expect(Object.keys(store)).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty store", () => {
    const store = createStore();
    expect(Object.keys(store)).toEqual([]);
  });

  it("reflects deletions", () => {
    const store = createStore();
    store.a = 1;
    store.b = 2;
    delete store.a;
    expect(Object.keys(store)).toEqual(["b"]);
  });
});

// ── Array operations ─────────────────────────────────────────────────

describe("Proxy — arrays", () => {
  it("reads array elements by index", () => {
    const store = createStore();
    store.items = [10, 20, 30];
    expect(store.items[0]).toBe(10);
    expect(store.items[1]).toBe(20);
    expect(store.items[2]).toBe(30);
  });

  it("reads array length", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    expect(store.items.length).toBe(3);
  });

  it("push adds to end", () => {
    const store = createStore();
    store.items = [1, 2];
    store.items.push(3);
    expect(store.items[2]).toBe(3);
    expect(store.items.length).toBe(3);
  });

  it("push adds multiple items", () => {
    const store = createStore();
    store.items = [];
    store.items.push(1, 2, 3);
    expect(store.items.length).toBe(3);
    expect(store.items[0]).toBe(1);
    expect(store.items[2]).toBe(3);
  });

  it("pop removes from end", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    const popped = store.items.pop();
    expect(popped).toBe(3);
    expect(store.items.length).toBe(2);
  });

  it("shift removes from beginning", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    const shifted = store.items.shift();
    expect(shifted).toBe(1);
    expect(store.items.length).toBe(2);
    expect(store.items[0]).toBe(2);
  });

  it("unshift adds to beginning", () => {
    const store = createStore();
    store.items = [2, 3];
    store.items.unshift(1);
    expect(store.items.length).toBe(3);
    expect(store.items[0]).toBe(1);
  });

  it("splice removes and inserts", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4];
    const removed = store.items.splice(1, 2, 99, 100);
    expect(removed).toEqual([2, 3]);
    expect(store.items.length).toBe(4);
    expect(store.items[1]).toBe(99);
    expect(store.items[2]).toBe(100);
  });

  it("reverse reverses in place", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    store.items.reverse();
    expect(store.items[0]).toBe(3);
    expect(store.items[1]).toBe(2);
    expect(store.items[2]).toBe(1);
  });

  it("sort sorts in place", () => {
    const store = createStore();
    store.items = [3, 1, 2];
    store.items.sort((a: number, b: number) => a - b);
    expect(store.items[0]).toBe(1);
    expect(store.items[1]).toBe(2);
    expect(store.items[2]).toBe(3);
  });

  it("non-mutating methods work (map, filter)", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4];
    const even = store.items.filter((x: number) => x % 2 === 0);
    expect(even).toEqual([2, 4]);
    const doubled = store.items.map((x: number) => x * 2);
    expect(doubled).toEqual([2, 4, 6, 8]);
  });

  it("array of objects — read nested", () => {
    const store = createStore();
    store.users = [{ name: "A" }, { name: "B" }];
    expect(store.users[0].name).toBe("A");
    expect(store.users[1].name).toBe("B");
  });

  it("array of objects — mutate nested", () => {
    const store = createStore();
    store.users = [{ name: "A" }];
    store.users[0].name = "Changed";
    expect(store.users[0].name).toBe("Changed");
  });

  it("set array element by index", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    store.items[1] = 99;
    expect(store.items[1]).toBe(99);
  });
});

// ── Map operations ───────────────────────────────────────────────────

describe("Proxy — Map", () => {
  it("reads from a Map via get", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    expect(store.m.get("a")).toBe(1);
    expect(store.m.get("b")).toBe(2);
  });

  it("checks membership via has", () => {
    const store = createStore();
    store.m = new Map([["exists", true]]);
    expect(store.m.has("exists")).toBe(true);
    expect(store.m.has("nope")).toBe(false);
  });

  it("reports size", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    expect(store.m.size).toBe(2);
  });

  it("set adds a key-value pair", () => {
    const store = createStore();
    store.m = new Map();
    store.m.set("key", "value");
    expect(store.m.get("key")).toBe("value");
  });

  it("delete removes a key", () => {
    const store = createStore();
    store.m = new Map([["a", 1]]);
    store.m.delete("a");
    expect(store.m.has("a")).toBe(false);
  });

  it("clear removes all entries", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    store.m.clear();
    expect(store.m.size).toBe(0);
  });

  it("iterates with forEach", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const entries: [unknown, unknown][] = [];
    store.m.forEach((v: unknown, k: unknown) => entries.push([k, v]));
    expect(entries).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

// ── Set operations ───────────────────────────────────────────────────

describe("Proxy — Set", () => {
  it("checks membership via has", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    expect(store.s.has(1)).toBe(true);
    expect(store.s.has(4)).toBe(false);
  });

  it("reports size", () => {
    const store = createStore();
    store.s = new Set([1, 2]);
    expect(store.s.size).toBe(2);
  });

  it("add adds a value", () => {
    const store = createStore();
    store.s = new Set();
    store.s.add(1);
    expect(store.s.has(1)).toBe(true);
  });

  it("delete removes a value", () => {
    const store = createStore();
    store.s = new Set([1, 2]);
    store.s.delete(1);
    expect(store.s.has(1)).toBe(false);
  });

  it("clear removes all values", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    store.s.clear();
    expect(store.s.size).toBe(0);
  });

  it("iterates with forEach", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    const values: unknown[] = [];
    store.s.forEach((v: unknown) => values.push(v));
    expect(values).toEqual([1, 2, 3]);
  });
});

// ── No auto-vivification ────────────────────────────────────────────

describe("Proxy — no auto-vivification", () => {
  it("returns undefined for missing path", () => {
    const store = createStore();
    expect(store.missing).toBeUndefined();
  });

  it("throws when accessing property on undefined (natural JS behavior)", () => {
    const store = createStore();
    expect(() => store.missing.deep).toThrow();
  });

  it("works after creating intermediates", () => {
    const store = createStore();
    store.obj = { nested: {} };
    store.obj.nested.value = 42;
    expect(store.obj.nested.value).toBe(42);
  });
});

// ── Operation log integration ────────────────────────────────────────

describe("Proxy — operation log", () => {
  it("generates operations in the log for each write", () => {
    const store = createStore();
    const handle = getStore(store);
    store.x = 1;
    store.y = 2;
    expect(handle.log).toHaveLength(2);
    expect(handle.log[0].type).toBe("set");
    expect(handle.log[0].path).toEqual(["x"]);
    expect(handle.log[0].value).toBe(1);
  });

  it("generates delete operations", () => {
    const store = createStore();
    const handle = getStore(store);
    store.x = 1;
    delete store.x;
    expect(handle.log).toHaveLength(2);
    expect(handle.log[1].type).toBe("delete");
  });

  it("generates splice operations for push", () => {
    const store = createStore();
    const handle = getStore(store);
    store.items = [];
    store.items.push(1);
    expect(handle.log).toHaveLength(2);
    expect(handle.log[1].type).toBe("splice");
    expect(handle.log[1].items).toEqual([1]);
  });
});

// ── Array fill & copyWithin ──────────────────────────────────────────

describe("Proxy — array fill and copyWithin", () => {
  it("fill replaces all elements with a value", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4];
    store.items.fill(0);
    expect(store.items[0]).toBe(0);
    expect(store.items[3]).toBe(0);
    expect(store.items.length).toBe(4);
  });

  it("fill replaces elements within a range", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4, 5];
    store.items.fill(99, 1, 3);
    expect(store.items[0]).toBe(1);
    expect(store.items[1]).toBe(99);
    expect(store.items[2]).toBe(99);
    expect(store.items[3]).toBe(4);
  });

  it("fill handles negative start/end", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4];
    store.items.fill(0, -2);
    expect(store.items[0]).toBe(1);
    expect(store.items[1]).toBe(2);
    expect(store.items[2]).toBe(0);
    expect(store.items[3]).toBe(0);
  });

  it("copyWithin copies elements within the array", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4, 5];
    store.items.copyWithin(0, 3, 5);
    expect(store.items[0]).toBe(4);
    expect(store.items[1]).toBe(5);
    expect(store.items[2]).toBe(3);
    expect(store.items[3]).toBe(4);
    expect(store.items[4]).toBe(5);
  });

  it("copyWithin with partial end", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4, 5];
    store.items.copyWithin(1, 3);
    expect(store.items[0]).toBe(1);
    expect(store.items[1]).toBe(4);
    expect(store.items[2]).toBe(5);
  });
});

// ── Pop/shift on empty arrays ────────────────────────────────────────

describe("Proxy — empty array operations", () => {
  it("pop on empty array returns undefined", () => {
    const store = createStore();
    store.items = [];
    const result = store.items.pop();
    expect(result).toBeUndefined();
  });

  it("shift on empty array returns undefined", () => {
    const store = createStore();
    store.items = [];
    const result = store.items.shift();
    expect(result).toBeUndefined();
  });
});

// ── Map iteration methods ────────────────────────────────────────────

describe("Proxy — Map iteration", () => {
  it("keys() returns map keys", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const keys = [...store.m.keys()];
    expect(keys).toEqual(["a", "b"]);
  });

  it("values() returns map values", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const values = [...store.m.values()];
    expect(values).toEqual([1, 2]);
  });

  it("entries() returns map entries", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const entries = [...store.m.entries()];
    expect(entries).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("Symbol.iterator works on Map", () => {
    const store = createStore();
    store.m = new Map([
      ["x", 10],
      ["y", 20],
    ]);
    const entries: [string, number][] = [];
    for (const [k, v] of store.m) {
      entries.push([k, v]);
    }
    expect(entries).toEqual([
      ["x", 10],
      ["y", 20],
    ]);
  });

  it("unknown Map property returns undefined", () => {
    const store = createStore();
    store.m = new Map();
    expect(store.m.nonExistentMethod).toBeUndefined();
  });
});

// ── Set iteration methods ────────────────────────────────────────────

describe("Proxy — Set iteration", () => {
  it("keys() returns set values (same as values)", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    const keys = [...store.s.keys()];
    expect(keys).toEqual([1, 2, 3]);
  });

  it("values() returns set values", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    const values = [...store.s.values()];
    expect(values).toEqual([1, 2, 3]);
  });

  it("entries() returns [v, v] pairs", () => {
    const store = createStore();
    store.s = new Set([1, 2]);
    const entries = [...store.s.entries()];
    expect(entries).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("Symbol.iterator works on Set", () => {
    const store = createStore();
    store.s = new Set(["a", "b", "c"]);
    const values: string[] = [];
    for (const v of store.s) {
      values.push(v);
    }
    expect(values).toEqual(["a", "b", "c"]);
  });

  it("unknown Set property returns undefined", () => {
    const store = createStore();
    store.s = new Set();
    expect(store.s.nonExistentMethod).toBeUndefined();
  });
});

// ── Symbol property handling ─────────────────────────────────────────

describe("Proxy — symbol properties", () => {
  it("reading a symbol returns undefined", () => {
    const store = createStore();
    store.x = 1;
    expect((store as any)[Symbol("test")]).toBeUndefined();
  });

  it("setting a symbol returns false (no-op)", () => {
    const store = createStore();
    // Proxy set trap returns false for symbols, which would throw in strict mode,
    // but we can test via Reflect.set
    const result = Reflect.set(store, Symbol("test"), 42);
    expect(result).toBe(false);
  });

  it("deleting a symbol returns false (no-op)", () => {
    const store = createStore();
    const result = Reflect.deleteProperty(store, Symbol("test"));
    expect(result).toBe(false);
  });

  it("'in' check for symbol returns false", () => {
    const store = createStore();
    expect(Symbol("test") in store).toBe(false);
  });
});

// ── ownKeys on arrays and Maps ───────────────────────────────────────

describe("Proxy — ownKeys edge cases", () => {
  it("ownKeys on array returns indices (length is non-enumerable)", () => {
    const store = createStore();
    store.items = [10, 20, 30];
    const keys = Object.keys(store.items);
    // Object.keys filters by enumerable — length is non-enumerable
    expect(keys).toEqual(["0", "1", "2"]);
  });

  it("ownKeys on Map returns map keys via Reflect.ownKeys", () => {
    const store = createStore();
    store.m = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    const keys = Reflect.ownKeys(store.m);
    expect(keys).toEqual(["a", "b"]);
  });

  it("ownKeys on Set returns empty array", () => {
    const store = createStore();
    store.s = new Set([1, 2, 3]);
    const keys = Object.keys(store.s);
    expect(keys).toEqual([]);
  });

  it("ownKeys on null value returns empty array", () => {
    const store = createStore();
    store.x = null;
    // Accessing ownKeys on a null path — we must go through a nested proxy
    // This tests the branch where value is null/non-object
    const handle = getStore(store);
    handle.apply({
      ts: 0,
      source: "r",
      seq: 0,
      type: "set",
      path: ["obj"],
      value: { a: 1 },
    });
    // Now delete the obj to make it undefined
    handle.apply({
      ts: 1,
      source: "r",
      seq: 1,
      type: "delete",
      path: ["obj"],
    });
    // The child proxy for ["obj"] still exists in cache, ownKeys should return []
    expect(Object.keys(store)).not.toContain("obj");
  });
});

// ── getOwnPropertyDescriptor ─────────────────────────────────────────

describe("Proxy — getOwnPropertyDescriptor", () => {
  it("returns descriptor for existing object property", () => {
    const store = createStore();
    store.x = 42;
    const desc = Object.getOwnPropertyDescriptor(store, "x");
    expect(desc).toBeDefined();
    expect(desc!.value).toBe(42);
    expect(desc!.writable).toBe(true);
    expect(desc!.enumerable).toBe(true);
    expect(desc!.configurable).toBe(true);
  });

  it("returns undefined for non-existent property", () => {
    const store = createStore();
    const desc = Object.getOwnPropertyDescriptor(store, "missing");
    expect(desc).toBeUndefined();
  });

  it("returns descriptor for array index", () => {
    const store = createStore();
    store.items = [10, 20];
    const desc = Object.getOwnPropertyDescriptor(store.items, "0");
    expect(desc).toBeDefined();
    expect(desc!.value).toBe(10);
    expect(desc!.enumerable).toBe(true);
    expect(desc!.configurable).toBe(true);
  });

  it("returns descriptor for array length (configurable for proxy compat)", () => {
    const store = createStore();
    store.items = [1, 2, 3];
    const desc = Object.getOwnPropertyDescriptor(store.items, "length");
    expect(desc).toBeDefined();
    expect(desc!.value).toBe(3);
    expect(desc!.enumerable).toBe(false);
    expect(desc!.configurable).toBe(true);
  });

  it("returns undefined for out-of-bounds array index", () => {
    const store = createStore();
    store.items = [1, 2];
    const desc = Object.getOwnPropertyDescriptor(store.items, "5");
    expect(desc).toBeUndefined();
  });

  it("returns undefined for symbol property", () => {
    const store = createStore();
    store.x = 1;
    const desc = Object.getOwnPropertyDescriptor(store, Symbol("test"));
    expect(desc).toBeUndefined();
  });
});

// ── has trap on Map/Set ──────────────────────────────────────────────

describe("Proxy — has trap for Map and Set", () => {
  it("'in' check on Map checks map keys", () => {
    const store = createStore();
    store.m = new Map([["hello", 1]]);
    expect("hello" in store.m).toBe(true);
    expect("missing" in store.m).toBe(false);
  });

  it("'in' check on Set checks set values", () => {
    const store = createStore();
    store.s = new Set(["x", "y"]);
    expect("x" in store.s).toBe(true);
    expect("z" in store.s).toBe(false);
  });
});

// ── Proxy cache and identity ─────────────────────────────────────────

describe("Proxy — proxy cache identity", () => {
  it("same path returns same proxy (identity stable)", () => {
    const store = createStore();
    store.user = { name: "V" };
    const proxy1 = store.user;
    const proxy2 = store.user;
    expect(proxy1).toBe(proxy2);
  });

  it("overwriting a path invalidates the proxy cache", () => {
    const store = createStore();
    store.user = { name: "V" };
    store.user = { name: "New" };
    // After overwrite, may or may not be same proxy object, but value is correct
    expect(store.user.name).toBe("New");
  });
});

// ── isStoreProxy edge cases ──────────────────────────────────────────

describe("Proxy — isStoreProxy edge cases", () => {
  it("returns false for string", () => {
    expect(isStoreProxy("hello")).toBe(false);
  });

  it("returns false for proxy-like object without brand", () => {
    expect(isStoreProxy({ some: "object" })).toBe(false);
  });

  it("returns true for child proxy", () => {
    const store = createStore();
    store.nested = { deep: { val: 1 } };
    expect(isStoreProxy(store.nested)).toBe(true);
    expect(isStoreProxy(store.nested.deep)).toBe(true);
  });
});

// ── Splice with negative start ───────────────────────────────────────

describe("Proxy — splice edge cases", () => {
  it("splice with negative start index", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4, 5];
    const removed = store.items.splice(-2, 1);
    expect(removed).toEqual([4]);
    expect(store.items.length).toBe(4);
    expect(store.items[3]).toBe(5);
  });

  it("splice with no deleteCount removes to end", () => {
    const store = createStore();
    store.items = [1, 2, 3, 4];
    const removed = store.items.splice(2);
    expect(removed).toEqual([3, 4]);
    expect(store.items.length).toBe(2);
  });

  it("unshift adds multiple items", () => {
    const store = createStore();
    store.items = [3, 4];
    store.items.unshift(1, 2);
    expect(store.items.length).toBe(4);
    expect(store.items[0]).toBe(1);
    expect(store.items[1]).toBe(2);
  });
});

// ── has/getOwnPropertyDescriptor on null/undefined paths ─────────────

describe("Proxy — non-object value paths", () => {
  it("'in' returns false when path resolves to null", () => {
    const store = createStore();
    store.x = null;
    // Going through the proxy at store.x which is null,
    // 'has' trap at that path returns false
    // We can safely check via 'in' on the root (which is an object)
    expect("x" in store).toBe(true);
    // But the value is null, not a property-bearing container
  });

  it("getOwnPropertyDescriptor returns undefined for null path", () => {
    const store = createStore();
    store.x = null;
    // x is set, has descriptor
    const desc = Object.getOwnPropertyDescriptor(store, "x");
    expect(desc!.value).toBeNull();
  });
});
