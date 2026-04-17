import { useStore } from "@virtual-frame/react";
import { useStore as useRemoteStore } from "@virtual-frame/react/store";
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
export function Counter({
  label = "Remote Counter",
  store,
}: {
  label?: string;
  store?: StoreProxy;
}) {
  // When a store is provided (MF path), render directly — no remote hook.
  // Otherwise delegate to the iframe-aware variant that calls useRemoteStore().
  if (store) {
    return <CounterView label={label} store={store} />;
  }
  return <CounterWithRemoteStore label={label} />;
}

/** iframe path — calls useRemoteStore() to get the shared store singleton. */
function CounterWithRemoteStore({ label }: { label: string }) {
  const store = useRemoteStore();
  return <CounterView label={label} store={store} />;
}

/** Pure presentational counter — store is always provided. */
function CounterView({ label, store }: { label: string; store: StoreProxy }) {
  const count = useStore<number>(store, ["count"]);

  return (
    <div
      id="counter-card"
      style={{
        background: "#f0f4ff",
        borderRadius: 12,
        padding: 24,
        minWidth: 280,
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: "0 0 16px" }}>{label}</h2>
      <div style={{ fontSize: 48, fontWeight: "bold", marginBottom: 16 }}>{count ?? 0}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          onClick={() => {
            store.count = ((count as number) ?? 0) - 1;
          }}
          style={btnStyle}
        >
          − Decrement
        </button>
        <button
          onClick={() => {
            store.count = ((count as number) ?? 0) + 1;
          }}
          style={btnStyle}
        >
          + Increment
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 20px",
  fontSize: 16,
  borderRadius: 6,
  border: "1px solid #ccc",
  cursor: "pointer",
};
