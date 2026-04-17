import { createSignal, For } from "solid-js";
import { VirtualFrame } from "@virtual-frame/solid";

const pages = [
  { label: "Hello", src: "/hello.html" },
  { label: "Forms", src: "/forms.html" },
  { label: "SVG", src: "/svg.html" },
  { label: "Media", src: "/media.html" },
];

export default function App() {
  const [current, setCurrent] = createSignal(pages[0]);

  return (
    <div style={{ "font-family": "system-ui, sans-serif", margin: "20px" }}>
      <h1>Virtual Frame — Solid Example</h1>
      <p>
        This example uses <code>@virtual-frame/solid</code> to mirror pages into a shadow DOM.
      </p>

      <nav style={{ display: "flex", gap: "8px", "margin-bottom": "16px" }}>
        <For each={pages}>
          {(p) => (
            <button
              onClick={() => setCurrent(p)}
              style={{
                padding: "8px 16px",
                "border-radius": "6px",
                border: "1px solid #ccc",
                background: current() === p ? "#007acc" : "#fff",
                color: current() === p ? "#fff" : "#333",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          )}
        </For>
      </nav>

      <VirtualFrame
        src={current().src}
        style={{
          border: "2px dashed #007acc",
          "border-radius": "8px",
          "min-height": "400px",
        }}
      />
    </div>
  );
}
