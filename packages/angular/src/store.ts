import {
  afterNextRender,
  inject,
  DestroyRef,
  signal,
  type Signal,
} from "@angular/core";
import {
  createStore,
  connectPort,
  getStore as _getStore,
  type StoreProxy,
} from "@virtual-frame/store";

// ── Module-level remote store singleton ────────────────────────────────────
// Created lazily on first `injectStore()` call. Populated with the host's
// state once the MessagePort arrives via a "vf-store:connect" postMessage.
// Lives for the lifetime of the page — intentionally not cleaned up.

let _store: StoreProxy | undefined;
let _portSetup = false;

function ensureStore(): StoreProxy {
  if (!_store) _store = createStore();
  return _store;
}

/**
 * Returns the shared store that the host connected via `@virtual-frame/store`.
 *
 * Must be called inside an injection context (e.g. component constructor).
 *
 * On first call this function:
 *  1. Creates the local store instance (if not already created).
 *  2. Schedules a `message` listener for the `"vf-store:connect"` port
 *     message sent by the host's `VirtualFrame` after the next render.
 *  3. Announces `"vf-store:ready"` to the parent frame so the host knows
 *     the remote is ready to receive the port.
 *
 * All subsequent calls return the same singleton — the listener is set up
 * only once regardless of how many components call this function.
 *
 * Use `injectStoreValue(store, selector)` together with this to subscribe to
 * individual paths:
 *
 * ```ts
 * import { injectStore, injectStoreValue } from "@virtual-frame/angular/store";
 *
 * @Component({ ... })
 * class MyComponent {
 *   store = injectStore();
 *   count = injectStoreValue<number>(this.store, ["count"]);
 *   // this.count() is reactive (Angular signal)
 * }
 * ```
 */
export function injectStore(): StoreProxy {
  const store = ensureStore();

  afterNextRender(() => {
    if (_portSetup) return;
    _portSetup = true;

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "vf-store:connect" && e.ports[0]) {
        connectPort(store, e.ports[0]);
      }
    };

    window.addEventListener("message", onMessage);

    // Tell the host frame that the remote is ready to receive the port.
    if (window.parent !== window) {
      window.parent.postMessage({ type: "vf-store:ready" }, "*");
    }
  });

  return store;
}

/**
 * Subscribes to a path in a `@virtual-frame/store` proxy and returns an
 * Angular signal that updates whenever that path changes.
 *
 * Must be called inside an injection context (e.g. component constructor).
 *
 * ```ts
 * import { injectStoreValue } from "@virtual-frame/angular/store";
 *
 * @Component({ ... })
 * class MyComponent {
 *   count = injectStoreValue<number>(store, ["count"]);
 *   name  = injectStoreValue<string>(store, ["user", "name"]);
 *   // Subscribe to every change (no selector):
 *   all   = injectStoreValue(store);
 * }
 * ```
 *
 * @param store     Store proxy from `createStore()` or `injectStore()`.
 * @param selector  Property path to subscribe to (e.g. `["count"]`). When
 *                  omitted the signal updates on any mutation.
 * @returns A read-only Angular signal with the current value at the path.
 */
export function injectStoreValue<T = unknown>(
  store: StoreProxy,
  selector?: PropertyKey[],
): Signal<T> {
  const destroyRef = inject(DestroyRef);
  const handle = _getStore(store);

  function getSnapshot(): T {
    if (!selector) return handle.snapshot() as T;
    return handle.readPath(selector) as T;
  }

  const sig = signal<T>(getSnapshot());

  const unsubscribe = selector
    ? handle.subscribe(selector, () => sig.set(getSnapshot()))
    : handle.subscribe(() => sig.set(getSnapshot()));

  destroyRef.onDestroy(unsubscribe);

  return sig.asReadonly();
}
