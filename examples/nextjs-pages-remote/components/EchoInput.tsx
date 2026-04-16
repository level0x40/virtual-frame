import { useState } from "react";

export function EchoInput() {
  const [text, setText] = useState("");

  return (
    <div className="card" id="echo-card">
      <p>Type something — it mirrors live through the virtual frame:</p>
      <input
        type="text"
        placeholder="Type here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="echo">{text || "…"}</div>
    </div>
  );
}
