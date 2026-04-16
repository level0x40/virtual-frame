// Virtual Frame bridge — auto-initialises when loaded inside an iframe.
// Using `hooks.client.ts` so the bridge is imported exactly once on the
// client and is a no-op when the app is loaded standalone.
import "virtual-frame/bridge";
