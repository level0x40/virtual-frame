import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="card" id="counter-card">
      <div className="counter">{count}</div>
      <div className="actions">
        <button onClick={() => setCount((c) => c - 1)}>− Decrement</button>
        <button onClick={() => setCount((c) => c + 1)}>+ Increment</button>
      </div>
    </div>
  );
}
