import { Counter } from "./Counter";

export function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Remote App</h1>
      <p style={{ color: "#666" }}>
        This app runs inside a hidden iframe. Its UI is mirrored into the host
        via <code>@virtual-frame/react</code>.
      </p>
      <Counter />
    </div>
  );
}
