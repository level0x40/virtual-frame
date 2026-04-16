import { onMount } from "svelte";
import { createStore, connectPort, type StoreProxy } from "@virtual-frame/store";

// ── Module-level remote store singleton ────────────────────────────────────
// Created lazily on first `useStore()` call. Populated with the host's state
// once the MessagePort arrives via a "vf-store:connect" postMessage. Lives
// for the lifetime of the page — intentionally not cleaned up on unmount.

let _store: StoreProxy | undefined;
let _portSetup = false;

function ensureStore(): StoreProxy {
  if (!_store) _store = createStore();
  return _store;
}

/**
 * Returns the shared store that the host connected via `@virtual-frame/store`.
 *
 * On first call this function:
 *  1. Creates the local store instance (if not already created).
 *  2. Sets up a `message` listener for the `"vf-store:connect"` port message
 *     sent by the host's `VirtualFrame`.
 *  3. Announces `"vf-store:ready"` to the parent frame so the host knows
 *     the remote is ready to receive the port.
 *
 * All subsequent calls return the same singleton — the listener is set up
 * only once regardless of how many components call this function.
 *
 * Use the `useStore(store, selector)` helper from `@virtual-frame/svelte`
 * together with this to subscribe to individual paths:
 *
 * ```svelte
 * <script>
 *   import { useStore as useRemoteStore } from "@virtual-frame/svelte/store";
 *   import { useStore } from "@virtual-frame/svelte";
 *
 *   const store = useRemoteStore();
 *   const count = useStore(store, ["count"]);
 *   // $count is reactive
 * </script>
 * ```
 */
export function useStore(): StoreProxy {
  const store = ensureStore();

  onMount(() => {
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
