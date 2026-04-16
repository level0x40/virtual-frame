// Virtual Frame bridge — auto-initialises when loaded inside an iframe
// (window.parent !== window).  Enables cross-origin DOM mirroring via
// the postMessage protocol.  When loaded standalone (not in an iframe),
// the auto-init check skips and the import is a no-op.
import "virtual-frame/bridge";

export default defineNuxtPlugin(() => {});
