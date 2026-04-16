import { describe, it, expect } from "vitest";
import { createStore, getStore } from "../src/index.js";
import { compareOperations } from "../src/operation.js";
import type { Operation } from "../src/types.js";

// ── Total ordering determinism ───────────────────────────────────────

describe("Ordering — deterministic total order", () => {
  it("operations from different sources at different times are ordered by time", () => {
    const store = createStore({ sourceId: "host" });
    const handle = getStore(store);

    handle.apply({
      ts: 10,
      source: "a",
      seq: 0,
      type: "set",
      path: ["x"],
      value: "first",
    });
    handle.apply({
      ts: 20,
      source: "b",
      seq: 0,
      type: "set",
      path: ["x"],
      value: "second",
    });

    // After materialization, x should be "second" (later timestamp wins)
    expect(store.x).toBe("second");
  });

  it("operations with same timestamp ordered by source", () => {
    const store = createStore({ sourceId: "observer" });
    const handle = getStore(store);

    // Same ts, different source — "b" > "a" so b's op comes second
    handle.applyBatch([
      {
        ts: 10,
        source: "b",
        seq: 0,
        type: "set",
        path: ["x"],
        value: "from-b",
      },
      {
        ts: 10,
        source: "a",
        seq: 0,
        type: "set",
        path: ["x"],
        value: "from-a",
      },
    ]);

    // After sorting: a(ts10) < b(ts10), so b's set comes last → x = "from-b"
    expect(store.x).toBe("from-b");
  });

  it("operations with same timestamp and source ordered by seq", () => {
    const store = createStore({ sourceId: "observer" });
    const handle = getStore(store);

    handle.applyBatch([
      { ts: 10, source: "a", seq: 1, type: "set", path: ["x"], value: "seq1" },
      { ts: 10, source: "a", seq: 0, type: "set", path: ["x"], value: "seq0" },
    ]);

    // After sorting: seq0 < seq1, so seq1's set comes last → x = "seq1"
    expect(store.x).toBe("seq1");
  });

  it("compareOperations produces stable sort", () => {
    const ops: Operation[] = [
      { ts: 5, source: "c", seq: 0, type: "set", path: ["x"], value: 3 },
      { ts: 1, source: "a", seq: 0, type: "set", path: ["x"], value: 1 },
      { ts: 5, source: "b", seq: 0, type: "set", path: ["x"], value: 2 },
      { ts: 5, source: "c", seq: 1, type: "set", path: ["x"], value: 4 },
      { ts: 1, source: "a", seq: 1, type: "set", path: ["x"], value: 5 },
    ];

    const sorted = [...ops].sort(compareOperations);
    expect(sorted.map((o) => o.value)).toEqual([1, 5, 2, 3, 4]);
  });

  it("out-of-order remote ops are sorted correctly on replay", () => {
    const store = createStore({ sourceId: "local" });
    const handle = getStore(store);

    // Apply ops in non-chronological order
    handle.apply({
      ts: 30,
      source: "r",
      seq: 2,
      type: "set",
      path: ["x"],
      value: "third",
    });
    handle.apply({
      ts: 10,
      source: "r",
      seq: 0,
      type: "set",
      path: ["x"],
      value: "first",
    });
    handle.apply({
      ts: 20,
      source: "r",
      seq: 1,
      type: "set",
      path: ["x"],
      value: "second",
    });

    // After materialization: sorted by ts → x = "third"
    expect(store.x).toBe("third");
  });
});

// ── Interleaved host and frame operations ────────────────────────────

describe("Ordering — interleaved operations", () => {
  it("interleaved set+delete produces correct final state", () => {
    const store = createStore({ sourceId: "observer" });
    const handle = getStore(store);

    handle.applyBatch([
      { ts: 1, source: "a", seq: 0, type: "set", path: ["x"], value: 1 },
      { ts: 2, source: "b", seq: 0, type: "delete", path: ["x"] },
      { ts: 3, source: "a", seq: 1, type: "set", path: ["x"], value: 2 },
    ]);

    expect(store.x).toBe(2);
  });

  it("delete after all sets removes the property", () => {
    const store = createStore({ sourceId: "observer" });
    const handle = getStore(store);

    handle.applyBatch([
      { ts: 1, source: "a", seq: 0, type: "set", path: ["x"], value: 1 },
      { ts: 2, source: "a", seq: 1, type: "set", path: ["x"], value: 2 },
      { ts: 3, source: "b", seq: 0, type: "delete", path: ["x"] },
    ]);

    expect(store.x).toBeUndefined();
    expect("x" in store).toBe(false);
  });

  it("concurrent array operations from two sources", () => {
    const store = createStore({ sourceId: "observer" });
    const handle = getStore(store);

    // First: create the array
    handle.apply({
      ts: 1,
      source: "a",
      seq: 0,
      type: "set",
      path: ["items"],
      value: [1, 2, 3],
    });

    // Both sources push concurrently (a pushes 4, b pushes 5)
    // "a" < "b" alphabetically, so a's op gets sorted first
    handle.applyBatch([
      {
        ts: 10,
        source: "a",
        seq: 1,
        type: "splice",
        path: ["items"],
        index: 3,
        deleteCount: 0,
        items: [4],
      },
      {
        ts: 10,
        source: "b",
        seq: 0,
        type: "splice",
        path: ["items"],
        index: 3,
        deleteCount: 0,
        items: [5],
      },
    ]);

    // After sort: a's splice first (inserts 4 at index 3 → [1,2,3,4])
    //             b's splice second (inserts 5 at index 3 → [1,2,3,5,4])
    const items = [];
    for (let i = 0; i < store.items.length; i++) {
      items.push(store.items[i]);
    }
    expect(items).toEqual([1, 2, 3, 5, 4]);
  });
});

// ── Sequence counter monotonicity ────────────────────────────────────

describe("Ordering — sequence counter", () => {
  it("local writes have monotonically increasing seq", () => {
    const store = createStore({ sourceId: "test" });
    const handle = getStore(store);
    store.a = 1;
    store.b = 2;
    store.c = 3;
    expect(handle.log[0].seq).toBe(0);
    expect(handle.log[1].seq).toBe(1);
    expect(handle.log[2].seq).toBe(2);
  });

  it("all local ops share the same sourceId", () => {
    const store = createStore({ sourceId: "myid" });
    const handle = getStore(store);
    store.x = 1;
    store.y = 2;
    expect(handle.log.every((op) => op.source === "myid")).toBe(true);
  });

  it("timestamps are non-decreasing", () => {
    const store = createStore();
    const handle = getStore(store);
    for (let i = 0; i < 10; i++) {
      (store as Record<string, unknown>)[`k${i}`] = i;
    }
    for (let i = 1; i < handle.log.length; i++) {
      expect(handle.log[i].ts).toBeGreaterThanOrEqual(handle.log[i - 1].ts);
    }
  });
});
