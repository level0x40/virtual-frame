import { useState } from "react";

export function EchoInput() {
  const [text, setText] = useState("");

  return (
    <div className="card" id="echo-card">
      <h2>Echo Input</h2>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type here…"
      />
      <p className="echo">{text || "…"}</p>
    </div>
  );
}
