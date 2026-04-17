import { describe, it, expect, vi } from "vitest";
import { OperationLog } from "../src/log.js";
import type { Operation } from "../src/types.js";

function makeOp(partial: Partial<Operation> & Pick<Operation, "type" | "path">): Operation {
  return {
    ts: 0,
    source: "a",
    seq: 0,
    ...partial,
  };
}

// ── Basic append ─────────────────────────────────────────────────────

describe("OperationLog — append", () => {
  it("appends an operation to the log", () => {
    const log = new OperationLog();
    const op = makeOp({ type: "set", path: ["x"], value: 1 });
    log.append(op, true);
    expect(log.ops).toHaveLength(1);
    expect(log.ops[0]).toBe(op);
  });

  it("appends multiple operations", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["a"], value: 1, seq: 0 }), true);
    log.append(makeOp({ type: "set", path: ["b"], value: 2, seq: 1 }), true);
    log.append(makeOp({ type: "set", path: ["c"], value: 3, seq: 2 }), true);
    expect(log.ops).toHaveLength(3);
  });

  it("returns true for new operations", () => {
    const log = new OperationLog();
    const result = log.append(makeOp({ type: "set", path: ["x"], value: 1 }), true);
    expect(result).toBe(true);
  });
});

// ── Duplicate detection ──────────────────────────────────────────────

describe("OperationLog — duplicate detection", () => {
  it("rejects duplicate operations (same source+seq)", () => {
    const log = new OperationLog();
    const op1 = makeOp({
      source: "a",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    const op2 = makeOp({
      source: "a",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 2,
    });
    expect(log.append(op1, true)).toBe(true);
    expect(log.append(op2, false)).toBe(false);
    expect(log.ops).toHaveLength(1);
  });

  it("accepts operations from different sources", () => {
    const log = new OperationLog();
    const op1 = makeOp({
      source: "a",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 1,
    });
    const op2 = makeOp({
      source: "b",
      seq: 0,
      type: "set",
      path: ["x"],
      value: 2,
    });
    expect(log.append(op1, true)).toBe(true);
    expect(log.append(op2, false)).toBe(true);
    expect(log.ops).toHaveLength(2);
  });

  it("accepts operations with different seqs from same source", () => {
    const log = new OperationLog();
    expect(
      log.append(makeOp({ source: "a", seq: 0, type: "set", path: ["x"], value: 1 }), true),
    ).toBe(true);
    expect(
      log.append(makeOp({ source: "a", seq: 1, type: "set", path: ["x"], value: 2 }), true),
    ).toBe(true);
    expect(log.ops).toHaveLength(2);
  });
});

// ── appendBatch ──────────────────────────────────────────────────────

describe("OperationLog — appendBatch", () => {
  it("appends a batch of operations", () => {
    const log = new OperationLog();
    const ops = [
      makeOp({ source: "b", seq: 0, type: "set", path: ["a"], value: 1 }),
      makeOp({ source: "b", seq: 1, type: "set", path: ["b"], value: 2 }),
      makeOp({ source: "b", seq: 2, type: "set", path: ["c"], value: 3 }),
    ];
    const count = log.appendBatch(ops);
    expect(count).toBe(3);
    expect(log.ops).toHaveLength(3);
  });

  it("skips duplicates in batch", () => {
    const log = new OperationLog();
    log.append(makeOp({ source: "a", seq: 0, type: "set", path: ["x"], value: 1 }), true);
    const ops = [
      makeOp({ source: "a", seq: 0, type: "set", path: ["x"], value: 1 }), // dup
      makeOp({ source: "b", seq: 0, type: "set", path: ["y"], value: 2 }), // new
    ];
    const count = log.appendBatch(ops);
    expect(count).toBe(1);
    expect(log.ops).toHaveLength(2);
  });

  it("returns 0 when all ops are duplicates", () => {
    const log = new OperationLog();
    log.append(makeOp({ source: "a", seq: 0, type: "set", path: ["x"], value: 1 }), true);
    const ops = [makeOp({ source: "a", seq: 0, type: "set", path: ["x"], value: 99 })];
    expect(log.appendBatch(ops)).toBe(0);
  });
});

// ── Materialization ──────────────────────────────────────────────────

describe("OperationLog — materialization", () => {
  it("materializes state from operations", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["name"], value: "Viktor", seq: 0 }), true);
    log.append(makeOp({ type: "set", path: ["age"], value: 30, seq: 1 }), true);
    const state = log.state;
    expect(state).toEqual({ name: "Viktor", age: 30 });
  });

  it("replays operations lazily on state access", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["x"], value: 1, seq: 0 }), true);
    expect(log.cursor).toBe(0); // Not yet materialized
    const _state = log.state;
    expect(log.cursor).toBe(1); // Now materialized
  });

  it("materializes incrementally", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["a"], value: 1, seq: 0 }), true);
    expect(log.state).toEqual({ a: 1 });
    expect(log.cursor).toBe(1);

    log.append(makeOp({ type: "set", path: ["b"], value: 2, seq: 1 }), true);
    expect(log.cursor).toBe(1); // Not yet re-materialized
    expect(log.state).toEqual({ a: 1, b: 2 });
    expect(log.cursor).toBe(2);
  });

  it("handles delete followed by set", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["x"], value: 1, seq: 0 }), true);
    log.append(makeOp({ type: "delete", path: ["x"], seq: 1 }), true);
    log.append(makeOp({ type: "set", path: ["x"], value: 2, seq: 2 }), true);
    expect(log.state).toEqual({ x: 2 });
  });
});

// ── Dirty tracking ───────────────────────────────────────────────────

describe("OperationLog — dirty tracking", () => {
  it("marks paths dirty on append", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["user", "name"], value: "V", seq: 0 }), true);
    expect(log.isDirty(["user", "name"])).toBe(true);
    expect(log.isDirty(["user"])).toBe(true);
    expect(log.isDirty([])).toBe(true);
  });

  it("clears dirty after materialization", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["x"], value: 1, seq: 0 }), true);
    expect(log.isDirty(["x"])).toBe(true);
    const _state = log.state; // triggers materialization
    expect(log.isDirty(["x"])).toBe(false);
  });
});

// ── Listeners ────────────────────────────────────────────────────────

describe("OperationLog — listeners", () => {
  it("notifies listeners for local operations", () => {
    const log = new OperationLog();
    const listener = vi.fn();
    log.onOperation(listener);
    const op = makeOp({ type: "set", path: ["x"], value: 1 });
    log.append(op, true);
    expect(listener).toHaveBeenCalledWith(op);
  });

  it("does not notify listeners for remote operations", () => {
    const log = new OperationLog();
    const listener = vi.fn();
    log.onOperation(listener);
    log.append(makeOp({ type: "set", path: ["x"], value: 1 }), false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribes correctly", () => {
    const log = new OperationLog();
    const listener = vi.fn();
    const unsub = log.onOperation(listener);
    unsub();
    log.append(makeOp({ type: "set", path: ["x"], value: 1 }), true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners", () => {
    const log = new OperationLog();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    log.onOperation(listener1);
    log.onOperation(listener2);
    log.append(makeOp({ type: "set", path: ["x"], value: 1 }), true);
    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });
});

// ── Destroy ──────────────────────────────────────────────────────────

describe("OperationLog — destroy", () => {
  it("clears all state on destroy", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["x"], value: 1, seq: 0 }), true);
    log.append(makeOp({ type: "set", path: ["y"], value: 2, seq: 1 }), true);
    log.destroy();
    expect(log.ops).toHaveLength(0);
    expect(log.cursor).toBe(0);
    expect(log.state).toEqual({});
  });
});

// ── isDirty edge cases ───────────────────────────────────────────────

describe("OperationLog — isDirty edge cases", () => {
  it("isDirty returns false for unaffected sibling path", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["user", "name"], value: "V", seq: 0 }), true);
    // user.name and user and root are dirty
    // but "theme" is not
    // After materialization dirty is cleared. Before, cursor < ops.length returns true for all.
    // So we must materialize first, then add a new op
    const _state = log.state; // materialize
    log.append(makeOp({ type: "set", path: ["user", "age"], value: 30, seq: 1 }), true);
    // Now only user.age, user, and root are dirty
    // "theme" should not be dirty
    // But cursor < ops.length so isDirty returns true for everything
    // We need to check after materialization
    const _state2 = log.state;
    expect(log.isDirty(["theme"])).toBe(false);
  });

  it("isDirty returns true for root when any path is dirty", () => {
    const log = new OperationLog();
    log.append(
      makeOp({
        type: "set",
        path: ["deep", "nested", "value"],
        value: 1,
        seq: 0,
      }),
      true,
    );
    // Before materialization, cursor=0 < ops.length=1, so isDirty always returns true
    expect(log.isDirty([])).toBe(true);
    expect(log.isDirty(["deep"])).toBe(true);
    expect(log.isDirty(["deep", "nested"])).toBe(true);
    expect(log.isDirty(["deep", "nested", "value"])).toBe(true);
    expect(log.isDirty(["unrelated"])).toBe(true); // because cursor < ops.length
  });

  it("isDirty checks prefixes after materialization", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["a", "b", "c"], value: 1, seq: 0 }), true);
    const _s = log.state; // materialize & clear dirty

    // Append another op
    log.append(makeOp({ type: "set", path: ["a", "b", "c"], value: 2, seq: 1 }), true);
    // Now cursor = 1 < ops.length = 2, so isDirty returns true
    expect(log.isDirty(["x"])).toBe(true);

    // Materialize again
    const _s2 = log.state;
    // Now cursor = 2, no pending ops
    expect(log.isDirty(["a"])).toBe(false);
    expect(log.isDirty(["a", "b"])).toBe(false);
    expect(log.isDirty(["a", "b", "c"])).toBe(false);
    expect(log.isDirty(["x"])).toBe(false);
  });
});

// ── Materialization with single pending op ───────────────────────────

describe("OperationLog — materialization edge cases", () => {
  it("materializes correctly with a single pending op", () => {
    const log = new OperationLog();
    log.append(makeOp({ type: "set", path: ["x"], value: 42, seq: 0 }), true);
    expect(log.state).toEqual({ x: 42 });
  });

  it("no-op when no pending operations", () => {
    const log = new OperationLog();
    // Accessing state twice should be fine
    expect(log.state).toEqual({});
    expect(log.state).toEqual({});
    expect(log.cursor).toBe(0);
  });
});
