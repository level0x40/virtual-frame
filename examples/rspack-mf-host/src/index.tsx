// No async boundary. The host declares all shared modules as
// `eager: true` (see rspack.config.js), so they are bundled into
// main.js and registered synchronously. An `import("./bootstrap")`
// boundary would create a lazy consume-chunk for react/react-dom
// that loads before the eager provide is wired up, crashing with
//   factory is undefined (webpack/sharing/consume/default/react)
// The remote still uses an async boundary because its shares are
// non-eager — see examples/rspack-mf-remote/src/index.tsx.
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
