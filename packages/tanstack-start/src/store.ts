import { useRef, useMemo, useEffect, useSyncExternalStore } from "react";
import {
  createStore,
  connectPort,
  getStore as _getStore,
  type StoreProxy,
} from "@virtual-frame/store";

// ── Module-level remote store singleton ────────────────────────────────────
// Created lazily on first `useStore()` call.  Populated with the host's
// state once the MessagePort arrives via a "vf-store:connect" postMessage.
// Lives for the lifetime of the page — intentionally not cleaned up.

let _store: StoreProxy | undefined;
let _portSetup = false;

function ensureRemoteStore(): StoreProxy {
  if (!_store) _store = createStore();
  return _store;
}

function useRemoteStoreSetup(store: StoreProxy): void {
  useEffect(() => {
    if (_portSetup) return;
    _portSetup = true;

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "vf-store:connect" && e.ports[0]) {
        connectPort(store, e.ports[0]);
      }
    };

    window.addEventListener("message", onMessage);

    if (window.parent !== window) {
      window.parent.postMessage({ type: "vf-store:ready" }, "*");
    }
  }, [store]);
}

// ── Unified useStore ────────────────────────────────────────

/**
 * Unified store hook for `@virtual-frame/tanstack-start`.
 *
 * On the **remote** (iframe) side, this hook manages the store singleton
 * and the `MessagePort` bridge to the host automatically.
 *
 * ```tsx
 * // Get the store instance (no selector)
 * const store = useStore();
 *
 * // Subscribe to a path reactively
 * const count = useStore<number>(["count"]);
 * const name  = useStore<string>(["user", "name"]);
 * ```
 *
 * @param selector  Optional property path to subscribe to. When omitted,
 *                  returns the store proxy directly. When provided,
 *                  subscribes and re-renders when the value at that path
 *                  changes.
 */
export function useStore(): StoreProxy;
export function useStore<T = unknown>(selector: PropertyKey[]): T;
export function useStore<T = unknown>(
  selector?: PropertyKey[],
): StoreProxy | T {
  const store = ensureRemoteStore();
  useRemoteStoreSetup(store);

  const handle = useMemo(() => _getStore(store), [store]);
  const selectorKey = selector ? JSON.stringify(selector) : "";

  const versionRef = useRef(0);
  const cacheRef = useRef<{ version: number; value: T }>({
    version: -1,
    value: undefined as T,
  });

  const subscribe = useMemo(() => {
    return (cb: () => void) => {
      const notify = () => {
        versionRef.current++;
        cb();
      };
      return selector
        ? handle.subscribe(selector, notify)
        : handle.subscribe(notify);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, selectorKey]);

  const getSnapshot = useMemo(() => {
    return () => {
      // No selector → return store proxy directly (stable identity)
      if (!selector) return store as unknown as T;

      const v = versionRef.current;
      if (cacheRef.current.version === v) return cacheRef.current.value;

      const value = handle.readPath(selector) as T;
      cacheRef.current = { version: v, value };
      return value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, store, selectorKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
