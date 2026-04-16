/**
 * @virtual-frame/nuxt/store — Remote-side store composable.
 *
 * Re-exports the remote store setup from `@virtual-frame/vue/store`.
 * On the remote (iframe) side, `useStore()` creates a singleton store
 * and sets up the MessagePort bridge to the host automatically.
 *
 * ```vue
 * <script setup>
 * import { useStore as useRemoteStore } from "@virtual-frame/nuxt/store";
 * import { useStore } from "@virtual-frame/nuxt";
 *
 * const store = useRemoteStore();
 * const count = useStore<number>(store, ["count"]);
 * </script>
 * ```
 */

export { useStore } from "@virtual-frame/vue/store";
