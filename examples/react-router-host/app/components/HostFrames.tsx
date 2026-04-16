import { VirtualFrame } from "@virtual-frame/react-router";
import { useStore } from "@virtual-frame/react";
import { store } from "../store";

interface FrameProps {
  _vfHtml: string;
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}

interface HostFramesProps {
  frameProps: FrameProps;
  counterProps: FrameProps;
}

export function HostFrames({ frameProps, counterProps }: HostFramesProps) {
  const count = useStore<number>(store, ["count"]);

  return (
    <div className="layout">
      <div className="panel info">
        <strong>How it works:</strong> The host calls{" "}
        <code>fetchVirtualFrame()</code> in a route <code>loader</code> to fetch
        the remote React Router page during SSR.{" "}
        <code>prepareVirtualFrameProps()</code> wraps the content in declarative
        shadow DOM for instant display. On the client, a hidden{" "}
        <code>&lt;iframe src&gt;</code> loads the remote app at its real origin —
        the <strong>cross-origin bridge</strong> handles live DOM mirroring via{" "}
        <code>postMessage</code>. Two <code>&lt;VirtualFrame&gt;</code>{" "}
        components are rendered — one showing the full page, one showing only{" "}
        <code>#counter-card</code>. Both{" "}
        <strong>share a single hidden iframe</strong> (ref-counted). The{" "}
        <code>store</code> prop bridges <code>@virtual-frame/store</code> state
        between the host and remote via a <code>MessagePort</code>.
      </div>

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

      <div className="panel">
        <h2>Full Remote App (no selector)</h2>
        <VirtualFrame {...frameProps} store={store} />
      </div>

      <div className="panel">
        <h2>
          Counter Card Only (selector: <code>#counter-card</code>)
        </h2>
        <VirtualFrame {...counterProps} store={store} />
      </div>
    </div>
  );
}
