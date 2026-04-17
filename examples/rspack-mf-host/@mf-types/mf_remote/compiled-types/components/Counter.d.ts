import type { StoreProxy } from "@virtual-frame/store";
/**
 * A counter that reads from the Virtual Frame shared store.
 *
 * Works in two modes:
 *   1. **Module Federation** — host passes `store` as a prop (same JS context)
 *   2. **Virtual Frame iframe** — no prop, falls back to `useRemoteStore()`
 *      which connects to the host's store via MessagePort.
 *
 * The wrapper decides which path, so each inner component has a stable
 * hook call order (React requires hooks to be called unconditionally).
 */
export declare function Counter({
  label,
  store,
}: {
  label?: string;
  store?: StoreProxy;
}): import("react/jsx-runtime").JSX.Element;
