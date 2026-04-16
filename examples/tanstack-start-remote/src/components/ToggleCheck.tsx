import { useState } from "react";

export function ToggleCheck() {
  const [checked, setChecked] = useState(false);

  return (
    <div className="card" id="toggle-card">
      <h2>Toggle Checkbox</h2>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        Toggle me
      </label>
      <p>{checked ? "✅ Checked" : "⬜ Unchecked"}</p>
    </div>
  );
}
