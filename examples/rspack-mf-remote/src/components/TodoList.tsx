import { useState } from "react";
import { useStore } from "@virtual-frame/react";
import { useStore as useRemoteStore } from "@virtual-frame/react/store";
import type { StoreProxy } from "@virtual-frame/store";

/**
 * A todo list backed by the shared store.
 *
 * Like Counter, this works in two modes (MF prop vs iframe remote store).
 * The wrapper pattern avoids conditional hook calls.
 */
export function TodoList({ store }: { store?: StoreProxy } = {}) {
  if (store) {
    return <TodoListView store={store} />;
  }
  return <TodoListWithRemoteStore />;
}

function TodoListWithRemoteStore() {
  const store = useRemoteStore();
  return <TodoListView store={store} />;
}

function TodoListView({ store }: { store: StoreProxy }) {
  const todos = useStore<string[]>(store, ["todos"]);
  const [draft, setDraft] = useState("");

  const items = (todos as unknown as string[]) ?? [];

  return (
    <div
      id="todo-card"
      style={{
        background: "#f0fff4",
        borderRadius: 12,
        padding: 24,
        minWidth: 280,
      }}
    >
      <h2 style={{ margin: "0 0 16px" }}>Shared Todos</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              store.todos = [...items, draft.trim()];
              setDraft("");
            }
          }}
          placeholder="Add a todo…"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              store.todos = [...items, draft.trim()];
              setDraft("");
            }
          }}
          style={{
            padding: "6px 16px",
            fontSize: 14,
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>
      {items.length === 0 ? (
        <p style={{ color: "#999", fontSize: 14 }}>No todos yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {item}
              <button
                onClick={() => {
                  store.todos = items.filter((_, j) => j !== i);
                }}
                style={{
                  marginLeft: 8,
                  background: "none",
                  border: "none",
                  color: "#c00",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
