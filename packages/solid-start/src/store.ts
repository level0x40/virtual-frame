/**
 * @virtual-frame/solid-start/store — Remote-side store primitive.
 *
 * Re-exports the remote store setup from `@virtual-frame/solid/store`.
 * On the remote (iframe) side, `useStore()` creates a singleton store
 * and sets up the MessagePort bridge to the host automatically.
 *
 * ```tsx
 * import { useStore as useRemoteStore } from "@virtual-frame/solid-start/store";
 * import { useStore } from "@virtual-frame/solid-start";
 *
 * function Counter() {
 *   const store = useRemoteStore();
 *   const count = useStore<number>(store, ["count"]);
 *   return <div>{count()}</div>;
 * }
 * ```
 */

export { useStore } from "@virtual-frame/solid/store";
