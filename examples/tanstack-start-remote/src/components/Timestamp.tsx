import { useState, useEffect } from "react";

export function Timestamp() {
  const [time, setTime] = useState(() => new Date().toISOString());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toISOString()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="timestamp" suppressHydrationWarning>
      Rendered at: {time}
    </p>
  );
}
