import { mount, StartClient } from "@solidjs/start/client";

// Virtual Frame bridge — auto-initialises when loaded inside an iframe.
import "virtual-frame/bridge";

mount(() => <StartClient />, document.getElementById("app")!);
