import type {
  Operation,
  OperationCallback,
  StoreHandle,
  StoreOptions,
  StoreProxy,
  Subscription,
  SubscriptionCallback,
} from "./types.js";
import { OperationLog } from "./log.js";
import { createProxy, getProxyMeta } from "./proxy.js";
import { deepClone } from "./operation.js";

/**
 * Internal store state, stored in a WeakMap keyed by the root proxy.
 */
type StoreInternals = {
  log: OperationLog;
  sourceId: string;
  seqCounter: { value: number };
  proxyCache: Map<string, WeakRef<object>>;
  subscriptions: Set<Subscription>;
  rootProxy: StoreProxy;
  destroyed: boolean;
};

/** WeakMap from root proxy → internal state. */
const storeMap = new WeakMap<object, StoreInternals>();

/**
 * Generate a random source id (8 hex chars).
 */
function randomSourceId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new store. Returns the Proxy root.
 */
export function createStore(options?: StoreOptions): StoreProxy {
  const sourceId = options?.sourceId ?? randomSourceId();
  const log = new OperationLog();
  const seqCounter = { value: 0 };
  const proxyCache = new Map<string, WeakRef<object>>();
  const subscriptions = new Set<Subscription>();

  let rootProxy: StoreProxy;

  const emitOp = (op: Operation) => {
    log.append(op, true);
    // Schedule subscriber notification
    scheduleNotify(internals, op);
  };

  rootProxy = createProxy({
    path: [],
    log,
    emitOp,
    proxyCache,
    sourceId,
    seqCounter,
  }) as StoreProxy;

  const internals: StoreInternals = {
    log,
    sourceId,
    seqCounter,
    proxyCache,
    subscriptions,
    rootProxy,
    destroyed: false,
  };

  storeMap.set(rootProxy, internals);

  return rootProxy;
}

/**
 * Get the internal store handle from a proxy.
 * Works with the root proxy or any child proxy.
 */
export function getStore(proxy: StoreProxy): StoreHandle {
  // First check if this is the root proxy
  let internals = storeMap.get(proxy);

  if (!internals) {
    // This might be a child proxy — get its metadata and find the root
    const meta = getProxyMeta(proxy);
    if (meta) {
      // Walk up to the root by checking the proxy cache
      const rootCacheKey = JSON.stringify([]);
      const rootRef = meta.proxyCache.get(rootCacheKey);
      const rootProxy = rootRef?.deref();
      if (rootProxy) {
        internals = storeMap.get(rootProxy);
      }
    }
  }

  if (!internals) {
    throw new Error("Not a store proxy. Use createStore() to create a store.");
  }

  return createHandle(internals);
}

/**
 * Create a StoreHandle for the given internals.
 */
function createHandle(internals: StoreInternals): StoreHandle {
  const { log, sourceId, rootProxy, subscriptions } = internals;

  const handle: StoreHandle = {
    get proxy() {
      return rootProxy;
    },

    get sourceId() {
      return sourceId;
    },

    get log() {
      return log.ops;
    },

    apply(op: Operation): void {
      if (internals.destroyed) return;
      const applied = log.append(op, false);
      if (applied) {
        scheduleNotify(internals, op);
      }
    },

    applyBatch(ops: Operation[]): void {
      if (internals.destroyed) return;
      let anyApplied = false;
      const affectedOps: Operation[] = [];
      for (const op of ops) {
        const applied = log.append(op, false);
        if (applied) {
          anyApplied = true;
          affectedOps.push(op);
        }
      }
      if (anyApplied) {
        for (const op of affectedOps) {
          scheduleNotify(internals, op);
        }
      }
    },

    snapshot(): unknown {
      return deepClone(log.state);
    },

    onOperation(callback: OperationCallback): () => void {
      return log.onOperation(callback);
    },

    subscribe(
      pathOrCallback: PropertyKey[] | SubscriptionCallback,
      maybeCallback?: SubscriptionCallback,
    ): () => void {
      let path: string;
      let callback: SubscriptionCallback;

      if (typeof pathOrCallback === "function") {
        path = ""; // Root subscription
        callback = pathOrCallback;
      } else {
        path = JSON.stringify(pathOrCallback);
        callback = maybeCallback!;
      }

      const subscription: Subscription = { path, callback };
      subscriptions.add(subscription);
      return () => subscriptions.delete(subscription);
    },

    readPath(path: PropertyKey[]): unknown {
      const state = log.state; // triggers materialization
      let current: unknown = state;
      for (const key of path) {
        if (current == null) return undefined;
        if (current instanceof Map) {
          current = current.get(key);
        } else if (Array.isArray(current)) {
          current = current[key as unknown as number];
        } else {
          current = (current as Record<PropertyKey, unknown>)[key as string];
        }
      }
      return current;
    },

    destroy(): void {
      internals.destroyed = true;
      log.destroy();
      internals.proxyCache.clear();
      subscriptions.clear();
      storeMap.delete(rootProxy);
    },
  };

  return handle;
}

// ── Subscriber notification ─────────────────────────────────────────

/**
 * Pending notification state — batched per microtask.
 */
const pendingNotifications = new WeakMap<StoreInternals, Set<string>>();
let pendingFlush = new WeakSet<StoreInternals>();

/**
 * Schedule subscriber notification for an operation.
 * Notifications are batched: multiple ops in the same microtask produce
 * one notification per affected subscriber.
 */
function scheduleNotify(internals: StoreInternals, op: Operation): void {
  let pending = pendingNotifications.get(internals);
  if (!pending) {
    pending = new Set<string>();
    pendingNotifications.set(internals, pending);
  }

  // Add the affected path and all its prefixes
  for (let i = 0; i <= op.path.length; i++) {
    pending.add(JSON.stringify(op.path.slice(0, i)));
  }

  // Schedule flush if not already scheduled
  if (!pendingFlush.has(internals)) {
    pendingFlush.add(internals);
    queueMicrotask(() => flushNotifications(internals));
  }
}

/**
 * Flush pending notifications for a store.
 */
function flushNotifications(internals: StoreInternals): void {
  pendingFlush.delete(internals);
  const pending = pendingNotifications.get(internals);
  if (!pending || pending.size === 0) return;

  const affectedPaths = new Set(pending);
  pending.clear();

  for (const subscription of internals.subscriptions) {
    if (subscription.path === "") {
      // Root subscription — always fire if anything changed
      subscription.callback();
    } else {
      // Check if the subscription path matches any affected path.
      // A subscription at ["user"] fires for:
      //   - ops at ["user"] (exact match)
      //   - ops at ["user", "name"] (sub-path of subscription)
      //   - ops at [] (parent of subscription — replaces everything)
      const subPath = subscription.path;
      for (const affected of affectedPaths) {
        // Exact match
        if (affected === subPath) {
          subscription.callback();
          break;
        }
        // affected is a child of subscription path (e.g. sub=["user"], affected=["user","name"])
        if (affected.startsWith(subPath.slice(0, -1) + ",")) {
          subscription.callback();
          break;
        }
        // affected is a parent of subscription path (e.g. sub=["user"], affected=[])
        // Only the root path "[]" is a parent of everything
        if (subPath.startsWith(affected.slice(0, -1) + ",")) {
          subscription.callback();
          break;
        }
      }
    }
  }
}
