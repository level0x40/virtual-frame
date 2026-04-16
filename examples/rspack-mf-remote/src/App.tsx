import { Counter } from "./components/Counter";
import { TodoList } from "./components/TodoList";

export function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Remote App</h1>
      <p style={{ color: "#666" }}>
        This app is both a <strong>Module Federation remote</strong> (exposes
        components) and a <strong>Virtual Frame remote</strong> (mirrored into
        the host via iframe).
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <Counter />
        <TodoList />
      </div>
    </div>
  );
}
