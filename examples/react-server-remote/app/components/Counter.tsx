"use client";

import { useStore } from "@virtual-frame/react-server";

export function Counter() {
  const store = useStore();
  const count = useStore<number>(["count"]);

  return (
    <div className="card" id="counter-card">
      <div className="counter">{count ?? 0}</div>
      <div className="actions">
        <button
          onClick={() => {
            store.count = (count ?? 0) - 1;
          }}
        >
          − Decrement
        </button>
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
