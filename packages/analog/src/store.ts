/**
 * @virtual-frame/analog/store — Remote-side store helpers.
 *
 * Re-exports the remote store setup from `@virtual-frame/angular/store`.
 * On the remote (iframe) side, `injectStore()` creates a singleton store
 * and sets up the MessagePort bridge to the host automatically.
 *
 * ```ts
 * import { injectStore, injectStoreValue } from "@virtual-frame/analog/store";
 *
 * @Component({ ... })
 * class MyComponent {
 *   store = injectStore();
 *   count = injectStoreValue<number>(this.store, ["count"]);
 * }
 * ```
 */

export { injectStore, injectStoreValue } from "@virtual-frame/angular/store";
