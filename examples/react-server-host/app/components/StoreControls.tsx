"use client";

import { useStore } from "@virtual-frame/react";
import { store } from "../store";

export function StoreControls() {
  const count = useStore<number>(store, ["count"]);

  return (
    <div className="panel">
      <h2>Shared Store</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Modify the counter from the host — changes propagate live to the
        remote app via <code>@virtual-frame/store</code>.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => {
            store.count = (count ?? 0) - 1;
          }}
        >
          − Decrement
        </button>
        <span
          style={{
            fontSize: 32,
            fontWeight: "bold",
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {count ?? 0}
        </span>
        <button
          onClick={() => {
            store.count = (count ?? 0) + 1;
          }}
        >
          + Increment
        </button>
      </div>
    </div>
  );
}
