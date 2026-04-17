import type { Operation } from "./types.js";

/**
 * Compare two operations for total ordering.
 * Sort by (ts, source, seq). This produces a deterministic total order
 * even when two runtimes produce operations at the exact same timestamp.
 *
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareOperations(a: Operation, b: Operation): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  return a.seq - b.seq;
}

/**
 * Apply a single operation to a plain state tree (mutates in place).
 * This is the core replay function — given a state root object and an
 * operation, it navigates to the target path and applies the mutation.
 */
export function applyOperation(state: Record<string, unknown>, op: Operation): void {
  const { type, path } = op;

  // Navigate to parent
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  let target: unknown = state;

  for (const segment of parentPath) {
    if (target == null || typeof target !== "object") return;
    if (target instanceof Map) {
      target = target.get(segment);
    } else {
      target = (target as Record<PropertyKey, unknown>)[segment as string];
    }
  }

  if (target == null || typeof target !== "object") return;

  switch (type) {
    case "set": {
      if (target instanceof Map) {
        target.set(key, op.value);
      } else {
        (target as Record<PropertyKey, unknown>)[key as string] = op.value;
      }
      break;
    }
    case "delete": {
      if (target instanceof Map) {
        target.delete(key);
      } else {
        delete (target as Record<PropertyKey, unknown>)[key as string];
      }
      break;
    }
    case "splice": {
      const arr =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!Array.isArray(arr)) return;
      const index = op.index ?? 0;
      const deleteCount = op.deleteCount ?? 0;
      const items = op.items ?? [];
      arr.splice(index, deleteCount, ...items);
      break;
    }
    case "map-set": {
      const map =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(map instanceof Map)) return;
      map.set(op.key, op.value);
      break;
    }
    case "map-delete": {
      const map =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(map instanceof Map)) return;
      map.delete(op.key);
      break;
    }
    case "map-clear": {
      const map =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(map instanceof Map)) return;
      map.clear();
      break;
    }
    case "set-add": {
      const set =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(set instanceof Set)) return;
      set.add(op.value);
      break;
    }
    case "set-delete": {
      const set =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(set instanceof Set)) return;
      set.delete(op.value);
      break;
    }
    case "set-clear": {
      const set =
        path.length === 0
          ? target
          : target instanceof Map
            ? target.get(key)
            : (target as Record<PropertyKey, unknown>)[key as string];
      if (!(set instanceof Set)) return;
      set.clear();
      break;
    }
  }
}

/**
 * Deep clone a value in a structured-clone-safe manner.
 */
export function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (value instanceof Map) {
    const cloned = new Map();
    for (const [k, v] of value) {
      cloned.set(deepClone(k), deepClone(v));
    }
    return cloned as T;
  }
  if (value instanceof Set) {
    const cloned = new Set();
    for (const v of value) {
      cloned.add(deepClone(v));
    }
    return cloned as T;
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (ArrayBuffer.isView(value)) {
    const ctor = value.constructor as new (buffer: ArrayBuffer) => typeof value;
    return new ctor((value as unknown as { buffer: ArrayBuffer }).buffer.slice(0)) as T;
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T;
  }
  if (Array.isArray(value)) {
    return value.map(deepClone) as T;
  }

  // Plain object
  const cloned: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>)) {
    cloned[k] = deepClone((value as Record<string, unknown>)[k]);
  }
  return cloned as T;
}
