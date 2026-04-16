// ── Operation types ──────────────────────────────────────────────────

export type OperationType =
  | "set"
  | "delete"
  | "splice"
  | "map-set"
  | "map-delete"
  | "set-add"
  | "set-delete"
  | "set-clear"
  | "map-clear";

export type Operation = {
  /** Timestamp from performance.now() at creation time. */
  ts: number;
  /** Unique runtime id (random at startup). */
  source: string;
  /** Monotonic per-source sequence counter. */
  seq: number;
  /** Operation type. */
  type: OperationType;
  /** Path to the target property (e.g. ["user", "name"]). */
  path: PropertyKey[];
  /** Value for set, map-set, set-add. */
  value?: unknown;
  /** Number of elements to remove (splice). */
  deleteCount?: number;
  /** Elements to insert (splice). */
  items?: unknown[];
  /** Splice start index. */
  index?: number;
  /** Map key for map-set, map-delete. */
  key?: unknown;
};

// ── Store options ───────────────────────────────────────────────────

export type StoreOptions = {
  /** Unique id for this runtime (random default). */
  sourceId?: string;
};

// ── Store handle (control surface) ──────────────────────────────────

export interface StoreHandle {
  /** The Proxy root (same as what createStore returned). */
  readonly proxy: StoreProxy;

  /** Unique source id of this runtime. */
  readonly sourceId: string;

  /** Full operation log (read-only snapshot). */
  readonly log: ReadonlyArray<Operation>;

  /** Apply a single remote operation (appends to log, marks dirty). */
  apply(op: Operation): void;

  /** Apply a batch of remote operations. */
  applyBatch(ops: Operation[]): void;

  /** Take a snapshot of the current materialized state (deep clone). */
  snapshot(): unknown;

  /**
   * Register a callback invoked whenever a LOCAL write produces an
   * operation. This is the hook the transport layer uses to forward
   * ops to the peer.
   */
  onOperation(callback: (op: Operation) => void): () => void;

  /**
   * Subscribe to changes at a specific path (or root).
   * Callback fires after any operation that touches that path.
   * Returns an unsubscribe function.
   */
  subscribe(path: PropertyKey[], callback: () => void): () => void;
  subscribe(callback: () => void): () => void;

  /**
   * Read the raw materialized value at a given path (no proxy wrapping).
   * Returns `undefined` for missing paths. Triggers state materialization
   * if there are pending operations.
   *
   * This is intended for snapshot comparisons (e.g. `useSyncExternalStore`)
   * where stable object identity after mutation would defeat change detection.
   */
  readPath(path: PropertyKey[]): unknown;

  /** Destroy the store, cleaning up internal state. */
  destroy(): void;
}

// ── Proxy type (branded for type safety) ────────────────────────────

/** Branded type for the store proxy root. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StoreProxy = Record<string, any>;

// ── Internal types ──────────────────────────────────────────────────

export type OperationCallback = (op: Operation) => void;
export type SubscriptionCallback = () => void;

export type Subscription = {
  path: string; // JSON.stringify(path) — empty string for root
  callback: SubscriptionCallback;
};
