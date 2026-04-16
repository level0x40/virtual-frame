import { useStore } from "@virtual-frame/react";
import { useStore as useRemoteStore } from "@virtual-frame/react/store";

export function Counter() {
  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);

  return (
    <div
      id="counter-card"
      style={{
        background: "#f0f4ff",
        borderRadius: 12,
        padding: 24,
        maxWidth: 320,
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: "0 0 16px" }}>Remote Counter</h2>
      <div style={{ fontSize: 48, fontWeight: "bold", marginBottom: 16 }}>
        {count ?? 0}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          onClick={() => {
            store.count = (count ?? 0) - 1;
          }}
          style={{
            padding: "8px 20px",
            fontSize: 16,
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          − Decrement
        </button>
        <button
          onClick={() => {
            store.count = (count ?? 0) + 1;
          }}
          style={{
            padding: "8px 20px",
            fontSize: 16,
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          + Increment
        </button>
      </div>
    </div>
  );
}
