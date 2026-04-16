import { VirtualFrame, useVirtualFrame, useStore } from "@virtual-frame/react";
import { store } from "./store";

// When VITE_REMOTE_URL is set (e.g. by the e2e harness or prod build),
// use it directly — VirtualFrame works cross-origin via the bridge script
// in the remote. Fall back to the dev proxy path for standalone `vite dev`.
const REMOTE_URL = import.meta.env.VITE_REMOTE_URL
  ? `${import.meta.env.VITE_REMOTE_URL}/remote/`
  : "/remote/";

export default function App() {
  const count = useStore<number>(store, ["count"]);

  // Single shared iframe for both VirtualFrame instances below.
  const frame = useVirtualFrame(REMOTE_URL, { store });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", margin: 20 }}>
      <h1>Virtual Frame — React Store Example</h1>
      <p style={{ color: "#666" }}>
        The host and remote share a <code>@virtual-frame/store</code> instance.
        Clicking buttons on either side updates both in real time.
      </p>

      <div
        style={{
          display: "flex",
          gap: 24,
          alignItems: "flex-start",
          flexWrap: "wrap",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ── Host counter ─────────────────────────── */}
        <div
          style={{
            background: "#fff7ed",
            borderRadius: 12,
            padding: 24,
            minWidth: 280,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: "0 0 16px" }}>Host Counter</h2>
          <div style={{ fontSize: 48, fontWeight: "bold", marginBottom: 16 }}>
            {count}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={() => {
                store.count = count - 1;
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
                store.count = count + 1;
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

        {/* ── Remote counter (mirrored via shared frame) ── */}
        <div style={{ minWidth: 280 }}>
          <VirtualFrame
            frame={frame}
            selector="#counter-card"
            style={{
              border: "2px dashed #007acc",
              borderRadius: 8,
              minHeight: 200,
              overflow: "hidden",
              position: "relative",
            }}
          />
        </div>
      </div>

      {/* ── Full remote app (same shared frame) ──── */}
      <h2 style={{ marginTop: 32 }}>Full Remote App</h2>
      <VirtualFrame
        frame={frame}
        style={{
          border: "2px dashed #007acc",
          borderRadius: 8,
          minHeight: 300,
          marginTop: 8,
          overflow: "hidden",
          position: "relative",
        }}
      />
    </div>
  );
}
