import type { Operation } from "./types.js";
import type { OperationLog } from "./log.js";

/** Symbol used to store the proxy metadata on the proxy target. */
const PROXY_META = Symbol("vf-store-proxy");

/** Symbol to brand a proxy so we can identify it. */
export const STORE_PROXY_BRAND = Symbol("vf-store-proxy-brand");

export type ProxyMeta = {
  path: PropertyKey[];
  log: OperationLog;
  emitOp: (op: Operation) => void;
  proxyCache: Map<string, WeakRef<object>>;
  sourceId: string;
  seqCounter: { value: number };
};

/**
 * Create a Proxy for a given path in the store.
 */
export function createProxy(meta: ProxyMeta): object {
  const { path, log, emitOp, proxyCache, sourceId, seqCounter } = meta;

  // Create a transparent target — we use a function so we can intercept
  // apply traps if needed, but primarily we use an object.
  const target = Object.create(null) as Record<PropertyKey, unknown>;

  // Stash metadata on target so nested traps can access it.
  // Must be configurable so we don't violate ownKeys invariant.
  Object.defineProperty(target, PROXY_META, {
    value: meta,
    enumerable: false,
    configurable: true,
    writable: false,
  });

  const handler: ProxyHandler<typeof target> = {
    get(_target, prop, _receiver) {
      // Brand check
      if (prop === STORE_PROXY_BRAND) return true;
      // Allow metadata access
      if (prop === PROXY_META) return meta;

      // For most symbols, don't trap into the store.
      // But Symbol.iterator must pass through for Map/Set iterability.
      const state = log.state;
      const value = getValueAtPath(state, path);

      if (typeof prop === "symbol" && prop !== Symbol.iterator) {
        return undefined;
      }

      // If the value at this path is a Map or Set, intercept method calls
      if (value instanceof Map) {
        return getMapTrap(prop, path, value, meta);
      }
      if (value instanceof Set) {
        return getSetTrap(prop, path, value, meta);
      }

      // If value is an array and prop is a mutating method, intercept
      if (Array.isArray(value)) {
        const arrayTrap = getArrayTrap(prop, path, value, meta);
        if (arrayTrap !== undefined) return arrayTrap;
        // For index access or non-mutating methods, fall through
      }

      // Read the child value
      const childValue =
        value != null && typeof value === "object"
          ? Array.isArray(value)
            ? (value as unknown[])[prop as unknown as number]
            : (value as Record<PropertyKey, unknown>)[prop]
          : undefined;

      // If child is object/array/Map/Set, return a child proxy
      if (childValue != null && typeof childValue === "object") {
        return getOrCreateChildProxy([...path, prop], meta);
      }

      // Array .length
      if (prop === "length" && Array.isArray(value)) {
        return value.length;
      }

      return childValue;
    },

    set(_target, prop, newValue) {
      if (typeof prop === "symbol") return false;

      const op: Operation = {
        ts: performance.now(),
        source: sourceId,
        seq: seqCounter.value++,
        type: "set",
        path: [...path, prop],
        value: newValue,
      };

      emitOp(op);

      // Invalidate any cached proxy for this path since the value changed
      invalidateProxyCache(proxyCache, [...path, prop]);

      return true;
    },

    deleteProperty(_target, prop) {
      if (typeof prop === "symbol") return false;

      const op: Operation = {
        ts: performance.now(),
        source: sourceId,
        seq: seqCounter.value++,
        type: "delete",
        path: [...path, prop],
      };

      emitOp(op);
      invalidateProxyCache(proxyCache, [...path, prop]);

      return true;
    },

    has(_target, prop) {
      if (prop === STORE_PROXY_BRAND) return true;
      if (prop === PROXY_META) return true;
      if (typeof prop === "symbol") return false;

      const state = log.state;
      const value = getValueAtPath(state, path);
      if (value == null || typeof value !== "object") return false;
      if (value instanceof Map) return value.has(prop);
      if (value instanceof Set) return value.has(prop);
      return prop in (value as Record<PropertyKey, unknown>);
    },

    ownKeys() {
      const state = log.state;
      const value = getValueAtPath(state, path);
      if (value == null || typeof value !== "object") return [];
      if (value instanceof Map) return [...value.keys()] as string[];
      if (value instanceof Set) return [];
      if (Array.isArray(value)) {
        const keys: string[] = [];
        for (let i = 0; i < value.length; i++) keys.push(String(i));
        keys.push("length");
        return keys;
      }
      return Object.keys(value as Record<string, unknown>);
    },

    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "symbol") return undefined;

      const state = log.state;
      const value = getValueAtPath(state, path);
      if (value == null || typeof value !== "object") return undefined;

      if (Array.isArray(value)) {
        if (prop === "length") {
          return {
            value: value.length,
            writable: true,
            enumerable: false,
            configurable: true,
          };
        }
        const idx = Number(prop);
        if (Number.isInteger(idx) && idx >= 0 && idx < value.length) {
          return {
            value: value[idx],
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      }

      if (value instanceof Map) {
        if (value.has(prop)) {
          return {
            value: value.get(prop),
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        return undefined;
      }

      const obj = value as Record<PropertyKey, unknown>;
      if (prop in obj) {
        return {
          value: obj[prop],
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
      return undefined;
    },
  };

  const proxy = new Proxy(target, handler);

  // Cache this proxy
  const cacheKey = JSON.stringify(path);
  proxyCache.set(cacheKey, new WeakRef(proxy));

  return proxy;
}

/**
 * Navigate the state tree to get the value at a given path.
 */
function getValueAtPath(state: Record<string, unknown>, path: PropertyKey[]): unknown {
  let current: unknown = state;
  for (const segment of path) {
    if (current == null || typeof current !== "object") return undefined;
    if (current instanceof Map) {
      current = current.get(segment);
    } else if (Array.isArray(current)) {
      current = current[segment as number];
    } else {
      current = (current as Record<PropertyKey, unknown>)[segment as string];
    }
  }
  return current;
}

/**
 * Get or create a child proxy, using the WeakRef cache.
 */
function getOrCreateChildProxy(childPath: PropertyKey[], parentMeta: ProxyMeta): object {
  const cacheKey = JSON.stringify(childPath);
  const cached = parentMeta.proxyCache.get(cacheKey)?.deref();
  if (cached) return cached;

  return createProxy({
    ...parentMeta,
    path: childPath,
  });
}

/**
 * Invalidate cached proxies for a path and all sub-paths.
 */
function invalidateProxyCache(cache: Map<string, WeakRef<object>>, path: PropertyKey[]): void {
  const prefix = JSON.stringify(path);
  // Remove exact match and any sub-paths
  for (const key of cache.keys()) {
    if (key === prefix || key.startsWith(prefix.slice(0, -1) + ",")) {
      cache.delete(key);
    }
  }
}

// ── Array method traps ──────────────────────────────────────────────

const ARRAY_MUTATING_METHODS = new Set([
  "push",
  "pop",
  "splice",
  "shift",
  "unshift",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

function getArrayTrap(
  prop: PropertyKey,
  path: PropertyKey[],
  array: unknown[],
  meta: ProxyMeta,
): unknown | undefined {
  if (typeof prop !== "string") return undefined;

  // Non-mutating methods and properties — return bound versions
  if (!ARRAY_MUTATING_METHODS.has(prop)) {
    // For non-mutating methods like map, filter, etc., return them bound to
    // a snapshot of the array. For numeric index or 'length', return undefined
    // to fall through to get handler.
    if (typeof (array as unknown as Record<string, unknown>)[prop] === "function") {
      return (array as unknown as Record<string, Function>)[prop].bind(array);
    }
    return undefined; // Fall through to get handler
  }

  const { sourceId, seqCounter, emitOp } = meta;

  // Return a function that produces splice operations
  switch (prop) {
    case "push":
      return (...items: unknown[]) => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: array.length,
          deleteCount: 0,
          items,
        };
        emitOp(op);
        return array.length + items.length;
      };

    case "pop":
      return () => {
        if (array.length === 0) return undefined;
        const removed = array[array.length - 1];
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: array.length - 1,
          deleteCount: 1,
          items: [],
        };
        emitOp(op);
        return removed;
      };

    case "shift":
      return () => {
        if (array.length === 0) return undefined;
        const removed = array[0];
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: 1,
          items: [],
        };
        emitOp(op);
        return removed;
      };

    case "unshift":
      return (...items: unknown[]) => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: 0,
          items,
        };
        emitOp(op);
        return array.length + items.length;
      };

    case "splice":
      return (start: number, deleteCount?: number, ...items: unknown[]) => {
        const normalizedStart =
          start < 0 ? Math.max(array.length + start, 0) : Math.min(start, array.length);
        const normalizedDeleteCount =
          deleteCount === undefined
            ? array.length - normalizedStart
            : Math.max(0, Math.min(deleteCount, array.length - normalizedStart));
        const removed = array.slice(normalizedStart, normalizedStart + normalizedDeleteCount);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: normalizedStart,
          deleteCount: normalizedDeleteCount,
          items,
        };
        emitOp(op);
        return removed;
      };

    case "sort":
      return (compareFn?: (a: unknown, b: unknown) => number) => {
        const sorted = [...array].sort(compareFn);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: array.length,
          items: sorted,
        };
        emitOp(op);
        // Return the proxy so chaining works
        return getOrCreateChildProxy(path, meta);
      };

    case "reverse":
      return () => {
        const reversed = [...array].reverse();
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: array.length,
          items: reversed,
        };
        emitOp(op);
        return getOrCreateChildProxy(path, meta);
      };

    case "fill":
      return (value: unknown, start = 0, end = array.length) => {
        const normalizedStart =
          start < 0 ? Math.max(array.length + start, 0) : Math.min(start, array.length);
        const normalizedEnd =
          end < 0 ? Math.max(array.length + end, 0) : Math.min(end, array.length);
        const items = [...array];
        items.fill(value, normalizedStart, normalizedEnd);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: array.length,
          items,
        };
        emitOp(op);
        return getOrCreateChildProxy(path, meta);
      };

    case "copyWithin":
      return (target: number, start: number, end: number = array.length) => {
        const items = [...array];
        items.copyWithin(target, start, end);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "splice",
          path,
          index: 0,
          deleteCount: array.length,
          items,
        };
        emitOp(op);
        return getOrCreateChildProxy(path, meta);
      };
  }

  return undefined;
}

// ── Map traps ───────────────────────────────────────────────────────

function getMapTrap(
  prop: PropertyKey,
  path: PropertyKey[],
  map: Map<unknown, unknown>,
  meta: ProxyMeta,
): unknown {
  const { sourceId, seqCounter, emitOp } = meta;

  switch (prop) {
    case "get":
      return (key: unknown) => map.get(key);
    case "has":
      return (key: unknown) => map.has(key);
    case "size":
      return map.size;
    case "set":
      return (key: unknown, value: unknown) => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "map-set",
          path,
          key,
          value,
        };
        emitOp(op);
        return getOrCreateChildProxy(path, meta); // return the map proxy for chaining
      };
    case "delete":
      return (key: unknown) => {
        const had = map.has(key);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "map-delete",
          path,
          key,
        };
        emitOp(op);
        return had;
      };
    case "clear":
      return () => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "map-clear",
          path,
        };
        emitOp(op);
      };
    case "keys":
      return () => map.keys();
    case "values":
      return () => map.values();
    case "entries":
      return () => map.entries();
    case "forEach":
      return (cb: (value: unknown, key: unknown, map: Map<unknown, unknown>) => void) =>
        map.forEach(cb);
    case Symbol.iterator:
      return () => map[Symbol.iterator]();
    default:
      return undefined;
  }
}

// ── Set traps ───────────────────────────────────────────────────────

function getSetTrap(
  prop: PropertyKey,
  path: PropertyKey[],
  set: Set<unknown>,
  meta: ProxyMeta,
): unknown {
  const { sourceId, seqCounter, emitOp } = meta;

  switch (prop) {
    case "has":
      return (value: unknown) => set.has(value);
    case "size":
      return set.size;
    case "add":
      return (value: unknown) => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "set-add",
          path,
          value,
        };
        emitOp(op);
        return getOrCreateChildProxy(path, meta); // return set proxy for chaining
      };
    case "delete":
      return (value: unknown) => {
        const had = set.has(value);
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "set-delete",
          path,
          value,
        };
        emitOp(op);
        return had;
      };
    case "clear":
      return () => {
        const op: Operation = {
          ts: performance.now(),
          source: sourceId,
          seq: seqCounter.value++,
          type: "set-clear",
          path,
        };
        emitOp(op);
      };
    case "keys":
      return () => set.keys();
    case "values":
      return () => set.values();
    case "entries":
      return () => set.entries();
    case "forEach":
      return (cb: (value: unknown, key: unknown, set: Set<unknown>) => void) => set.forEach(cb);
    case Symbol.iterator:
      return () => set[Symbol.iterator]();
    default:
      return undefined;
  }
}

/**
 * Extract ProxyMeta from a store proxy. Returns null if not a store proxy.
 */
export function getProxyMeta(proxy: object): ProxyMeta | null {
  try {
    const meta = (proxy as Record<PropertyKey, unknown>)[PROXY_META];
    if (meta && typeof meta === "object") return meta as ProxyMeta;
  } catch {
    // Not a proxy or doesn't have metadata
  }
  return null;
}

/**
 * Check if a value is a store proxy.
 */
export function isStoreProxy(value: unknown): boolean {
  if (value == null || typeof value !== "object") return false;
  try {
    return (value as Record<PropertyKey, unknown>)[STORE_PROXY_BRAND] === true;
  } catch {
    return false;
  }
}
