/**
 * @virtual-frame/sveltekit/store — Remote-side store helper.
 *
 * Re-exports the remote store setup from `@virtual-frame/svelte/store`.
 * On the remote (iframe) side, `useStore()` creates a singleton store
 * and sets up the MessagePort bridge to the host automatically.
 */

export { useStore } from "@virtual-frame/svelte/store";
