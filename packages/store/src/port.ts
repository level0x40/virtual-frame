import type { StoreProxy } from "./types.js";
import { getStore } from "./store.js";

/**
 * Connect a store to a MessagePort for bidirectional synchronization.
 *
 * - Immediately sends a `vf-store:init` message with the full operation log.
 * - Listens for `vf-store:init` (merge remote log) and `vf-store:op` (apply single op).
 * - Forwards all local operations to the port.
 *
 * Returns a disconnect function that closes the port and unsubscribes.
 */
export function connectPort(store: StoreProxy, port: MessagePort): () => void {
  const handle = getStore(store);

  // Receive remote ops ← port
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === "vf-store:op") {
      handle.apply(data.op);
    } else if (data?.type === "vf-store:init") {
      handle.applyBatch(data.ops);
    }
  };

  port.addEventListener("message", onMessage);
  port.start();

  // Send our full log so the peer gets current state
  port.postMessage({
    type: "vf-store:init",
    ops: handle.log.slice(),
  });

  // Forward local ops → port (from now on)
  const unsubOp = handle.onOperation((op) => {
    port.postMessage({ type: "vf-store:op", op });
  });

  return () => {
    unsubOp();
    port.removeEventListener("message", onMessage);
    port.close();
  };
}
