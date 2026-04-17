import { A } from "@solidjs/router";
import { useStore as useRemoteStore } from "@virtual-frame/solid/store";
import { useStore } from "@virtual-frame/solid";

export default function Home() {
  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);

  return (
    <div
      style={{
        "font-family": "system-ui, sans-serif",
        padding: "24px",
        color: "#1a1a2e",
      }}
    >
      <div
        id="info-card"
        style={{
          padding: "24px",
          "border-radius": "12px",
          background: "linear-gradient(135deg, #2c4f7c 0%, #335d91 50%, #4477a8 100%)",
          color: "#fff",
          "margin-bottom": "16px",
        }}
      >
        <h1>Remote SolidStart App</h1>
        <p>
          Standalone SolidStart application. During SSR the host fetches this page and renders it
          instantly inside a virtual frame — no extra client-side network request. The counter is
          backed by a shared store, synced with the host via MessagePort.
        </p>
      </div>

      <div
        id="counter-card"
        style={{
          padding: "24px",
          "border-radius": "12px",
          background: "#fff",
          "border-left": "4px solid #2c4f7c",
          "box-shadow": "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <h2>Counter (shared store)</h2>
        <div style={{ "font-size": "2em", "font-weight": "bold" }}>{count() ?? 0}</div>
        <button
          onClick={() => (store["count"] = (count() ?? 0) + 1)}
          style={{
            "margin-right": "8px",
            "margin-top": "8px",
            padding: "6px 12px",
            background: "#2c4f7c",
            color: "#fff",
            border: "none",
            "border-radius": "6px",
            cursor: "pointer",
          }}
        >
          Increment
        </button>
        <button
          onClick={() => (store["count"] = 0)}
          style={{
            "margin-top": "8px",
            padding: "6px 12px",
            background: "#2c4f7c",
            color: "#fff",
            border: "none",
            "border-radius": "6px",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <nav style={{ "margin-top": "16px" }}>
        <A href="/">Home</A>
        {" · "}
        <A href="/about">About</A>
      </nav>
    </div>
  );
}
