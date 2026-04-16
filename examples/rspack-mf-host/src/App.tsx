import { lazy, Suspense } from "react";
import { VirtualFrame, useVirtualFrame, useStore } from "@virtual-frame/react";
import { store } from "./store";

// ── Module Federation import ────────────────────────────────
// The Counter component is loaded from the remote at runtime via
// Module Federation. It runs in the SAME JavaScript context as the
// host — no iframe, no serialization boundary.
const MFCounter = lazy(() =>
  import("mf_remote/Counter").then((mod) => ({ default: mod.Counter })),
);

// ── Virtual Frame iframe URL ────────────────────────────────
// Injected by rspack DefinePlugin from the REMOTE_URL env var.
// VirtualFrame works cross-origin via the bridge script in the remote,
// so no same-origin proxy is needed.
declare const __VF_REMOTE_URL__: string;
const REMOTE_URL = __VF_REMOTE_URL__;

export function App() {
  const count = useStore<number>(store, ["count"]);
  const todos = useStore<string[]>(store, ["todos"]);

  // Create a single shared iframe for all VirtualFrame instances.
  const frame = useVirtualFrame(REMOTE_URL, { store });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", margin: 20 }}>
      <h1>Module Federation + Virtual Frame</h1>
      <p style={{ color: "#666", maxWidth: 700 }}>
        This example uses <strong>both</strong> composition strategies with the
        same remote app. Module Federation loads the Counter component directly
        into the host's JS context. Virtual Frame mirrors the full remote app
        via an iframe. Both share the same{" "}
        <code>@virtual-frame/store</code> — click any button and all three
        update in sync.
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
        {/* ── 1. Host counter (native) ──────────────────── */}
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
          <div
            style={{ fontSize: 48, fontWeight: "bold", marginBottom: 16 }}
          >
            {count ?? 0}
          </div>
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
          <p style={{ color: "#999", fontSize: 13, marginTop: 12 }}>
            Rendered natively by the host
          </p>
        </div>

        {/* ── 2. MF Counter (Module Federation) ─────────── */}
        <div style={{ minWidth: 280 }}>
          <Suspense fallback={<div style={loadingStyle}>Loading MF Counter…</div>}>
            <MFCounter label="MF Counter" store={store} />
          </Suspense>
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 8 }}>
            Loaded via Module Federation
          </p>
        </div>

        {/* ── 3. VF Counter (Virtual Frame iframe) ──────── */}
        <div style={{ minWidth: 280 }}>
          <VirtualFrame
            frame={frame}
            selector="#counter-card"
            style={{
              border: "2px dashed #007acc",
              borderRadius: 8,
              minHeight: 180,
              overflow: "hidden",
              position: "relative",
            }}
          />
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 8 }}>
            Mirrored via Virtual Frame (iframe)
          </p>
        </div>
      </div>

      {/* ── Full remote app via Virtual Frame ──────────── */}
      <h2 style={{ marginTop: 32 }}>Full Remote App (Virtual Frame)</h2>
      <p style={{ color: "#666" }}>
        The entire remote application mirrored from the iframe. The todo list
        is also backed by the shared store — additions sync to the host
        instantly.
      </p>
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

      {/* ── Host view of shared todos ──────────────────── */}
      <div style={{ marginTop: 24 }}>
        <h3>Host's view of shared todos</h3>
        <p style={{ color: "#666", fontSize: 14 }}>
          This list is rendered by the host, reading directly from the store.
          Todos added in the remote's Virtual Frame UI appear here instantly.
        </p>
        {((todos as unknown as string[]) ?? []).length === 0 ? (
          <p style={{ color: "#999" }}>No todos yet — add one in the remote above.</p>
        ) : (
          <ul>
            {((todos as unknown as string[]) ?? []).map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
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

const loadingStyle: React.CSSProperties = {
  background: "#f0f4ff",
  borderRadius: 12,
  padding: 24,
  minWidth: 280,
  textAlign: "center",
  color: "#999",
};
