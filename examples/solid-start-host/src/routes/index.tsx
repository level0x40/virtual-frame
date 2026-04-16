import { query, createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { VirtualFrame, useStore } from "@virtual-frame/solid-start";
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/solid-start/server";
import { store } from "../store";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3015";

const getFrames = query(async () => {
  "use server";
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame, { proxy: "/__vf" }),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
      proxy: "/__vf",
    }),
  };
}, "frames");

export default function Home() {
  const data = createAsync(() => getFrames());
  const count = useStore<number>(store, ["count"]);

  return (
    <main style={{ padding: "32px", "font-family": "system-ui, sans-serif" }}>
      <h1>Virtual Frame — SolidStart SSR Example</h1>
      <p>
        Two separate SolidStart apps: <strong>host</strong> (port 3014) fetches
        {" "}<strong>remote</strong> (port 3015) during SSR via a{" "}
        <code>"use server"</code> route query, then VirtualFrame mirrors on the
        client. A shared store keeps the counter in sync across host and both
        projected frames.
      </p>

      <section
        style={{
          margin: "24px 0",
          padding: "24px",
          background: "#fff",
          "border-left": "4px solid #2c4f7c",
          "border-radius": "12px",
          "box-shadow": "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <h2>Host controls (shared store)</h2>
        <p>
          Host count: <strong>{count() ?? 0}</strong>
        </p>
        <button
          onClick={() => (store["count"] = (count() ?? 0) + 1)}
          style={{
            "margin-right": "8px",
            padding: "6px 12px",
            background: "#2c4f7c",
            color: "#fff",
            border: "none",
            "border-radius": "6px",
            cursor: "pointer",
          }}
        >
          Increment from host
        </button>
        <button
          onClick={() => (store["count"] = 0)}
          style={{
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
      </section>

      <Show when={data()}>
        {(frames) => (
          <div style={{ display: "grid", gap: "24px" }}>
            <section
              style={{
                background: "#fff",
                "border-radius": "12px",
                padding: "24px",
                "box-shadow": "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <h2>Full page projection</h2>
              <VirtualFrame {...frames().fullFrame} store={store} />
            </section>

            <section
              style={{
                background: "#fff",
                "border-radius": "12px",
                padding: "24px",
                "box-shadow": "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <h2>
                Selector projection — <code>#counter-card</code>
              </h2>
              <VirtualFrame {...frames().counterFrame} store={store} />
            </section>
          </div>
        )}
      </Show>
    </main>
  );
}
