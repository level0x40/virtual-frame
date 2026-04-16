// Virtual Frame bridge — enables cross-origin DOM mirroring when this
// app is loaded inside a VirtualFrame iframe. No-op when standalone.
import "virtual-frame/bridge";

import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
