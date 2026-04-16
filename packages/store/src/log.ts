import type { Operation, OperationCallback } from "./types.js";
import { applyOperation, compareOperations } from "./operation.js";

/**
 * Append-only operation log with dirty-path tracking and lazy materialization.
 *
 * The log is the single source of truth. The materialized state is a cache
 * that can always be rebuilt from the log.
 */
export class OperationLog {
  /** The append-only operation list. */
  private _ops: Operation[] = [];

  /** Global replay cursor — index up to which the materialized state is current. */
  private _cursor = 0;

  /** Materialized state root (rebuilt lazily from ops). */
  private _state: Record<string, unknown> = {};

  /** Dirty path prefixes (serialized via JSON.stringify). */
  private _dirty = new Set<string>();

  /** Set of seen operation keys for duplicate detection. */
  private _seen = new Set<string>();

  /** Operation listeners (for forwarding local ops). */
  private _listeners = new Set<OperationCallback>();

  get ops(): ReadonlyArray<Operation> {
    return this._ops;
  }

  get cursor(): number {
    return this._cursor;
  }

  /**
   * Get the materialized state, replaying any pending operations first.
   */
  get state(): Record<string, unknown> {
    this._materialize();
    return this._state;
  }

  /**
   * Check if a path (or any prefix) is dirty.
   */
  isDirty(path: PropertyKey[]): boolean {
    if (this._cursor < this._ops.length) return true;
    // Check this path and all prefixes
    for (let i = 0; i <= path.length; i++) {
      const prefix = JSON.stringify(path.slice(0, i));
      if (this._dirty.has(prefix)) return true;
    }
    return false;
  }

  /**
   * Append an operation. If `local` is true, notify listeners.
   * Returns false if the operation was a duplicate (already seen).
   */
  append(op: Operation, local: boolean): boolean {
    const key = `${op.source}:${op.seq}`;
    if (this._seen.has(key)) return false;
    this._seen.add(key);

    this._ops.push(op);
    this._markDirty(op.path);

    if (local) {
      for (const listener of this._listeners) {
        listener(op);
      }
    }

    return true;
  }

  /**
   * Append a batch of operations (all remote).
   * Returns the number of new (non-duplicate) operations applied.
   */
  appendBatch(ops: Operation[]): number {
    let count = 0;
    for (const op of ops) {
      if (this.append(op, false)) count++;
    }
    return count;
  }

  /**
   * Register a listener for local operations.
   */
  onOperation(callback: OperationCallback): () => void {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Replay pending operations onto the materialized state.
   */
  private _materialize(): void {
    if (this._cursor >= this._ops.length) return;

    // Sort only the pending slice if there are remote ops that may be out of order
    const pending = this._ops.slice(this._cursor);
    if (pending.length > 1) {
      pending.sort(compareOperations);
      // Replace the pending portion with sorted ops
      this._ops.splice(this._cursor, pending.length, ...pending);
    }

    for (let i = this._cursor; i < this._ops.length; i++) {
      applyOperation(this._state, this._ops[i]);
    }

    this._cursor = this._ops.length;
    this._dirty.clear();
  }

  /**
   * Mark a path and all its prefixes as dirty.
   */
  private _markDirty(path: PropertyKey[]): void {
    for (let i = 0; i <= path.length; i++) {
      this._dirty.add(JSON.stringify(path.slice(0, i)));
    }
  }

  /**
   * Clear all internal state.
   */
  destroy(): void {
    this._ops.length = 0;
    this._cursor = 0;
    this._state = {};
    this._dirty.clear();
    this._seen.clear();
    this._listeners.clear();
  }
}
