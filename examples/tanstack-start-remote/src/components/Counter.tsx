import { useStore } from "@virtual-frame/tanstack-start";

export function Counter() {
  const store = useStore();
  const count = useStore<number>(["count"]);

  return (
    <div className="card" id="counter-card">
      <h2>Counter</h2>
      <div className="counter">{count ?? 0}</div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
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
