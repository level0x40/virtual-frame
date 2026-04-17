"use client";

import { useState } from "react";

export function ToggleCheck() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="card" id="toggle-card">
      <p>Toggle the checkbox — state mirrors through the virtual frame:</p>
      <label className="checkbox-label">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>{checked ? "✅ Checked" : "⬜ Unchecked"}</span>
      </label>
    </div>
  );
}
