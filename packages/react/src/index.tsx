import {
  useRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  useSyncExternalStore,
  type Ref,
} from "react";
import {
  VirtualFrame as VirtualFrameCore,
  type VirtualFrameOptions,
} from "virtual-frame";
import {
  type StoreProxy,
  getStore as _getStore,
  connectPort,
} from "@virtual-frame/store";

// ── useStore ────────────────────────────────────────────────
// Subscribes to a store path and returns the current value,
// re-rendering only when that path changes.

/**
 * Read a value from a `@virtual-frame/store` proxy, re-rendering when it
 * changes.  Wraps `useSyncExternalStore` so you don't have to.
 *
 * ```tsx
 * import { useStore } from "@virtual-frame/react";
 *
 * // Subscribe to a single key
 * const count = useStore<number>(store, ["count"]);
 *
 * // Subscribe to a nested path
 * const name = useStore<string>(store, ["user", "name"]);
 *
 * // Subscribe to every change (no selector)
 * const snapshot = useStore(store);
 * ```
 *
 * @param store  Store proxy from `createStore()` or the remote `useStore()` hook.
 * @param selector  Property path to subscribe to (e.g. `["count"]`). When
 *                  omitted the hook subscribes to the root — any mutation
 *                  triggers a re-render.
 * @returns The current value at the path, or the full proxy when no
 *          selector is given.
 */
export function useStore<T = unknown>(
  store: StoreProxy,
  selector?: PropertyKey[],
): T {
  const handle = useMemo(() => _getStore(store), [store]);

  const selectorKey = selector ? JSON.stringify(selector) : "";

  // Version counter — incremented on every store notification so
  // getSnapshot can cache its result between React's repeated calls
  // and only recompute when data actually changed.
  const versionRef = useRef(0);
  const cacheRef = useRef<{ version: number; value: T }>({
    version: -1,
    value: undefined as T,
  });

  const subscribe = useMemo(() => {
    return (cb: () => void) => {
      const notify = () => {
        versionRef.current++;
        cb();
      };
      return selector
        ? handle.subscribe(selector, notify)
        : handle.subscribe(notify);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, selectorKey]);

  const getSnapshot = useMemo(() => {
    return () => {
      const v = versionRef.current;
      if (cacheRef.current.version === v) return cacheRef.current.value;

      let value: T;
      if (!selector) {
        value = handle.snapshot() as T;
      } else {
        value = handle.readPath(selector) as T;
      }

      cacheRef.current = { version: v, value };
      return value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, selectorKey]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Shared virtual frame handle ─────────────────────────────
// Created by `useVirtualFrame()`.  Owns the source (ref-counted)
// and an optional store bridge.  Passed to `<VirtualFrame frame={…} />`
// so multiple component instances project from the same source.

export interface VirtualFrameRef {
  /** @internal */ readonly _iframe: HTMLIFrameElement;
  /** @internal */ _refCount: number;
  /** @internal */ _storeCleanup?: () => void;
}

export interface UseVirtualFrameOptions {
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided, state is synchronised between the host and the
   * remote in real time.
   */
  store?: StoreProxy;
}

/**
 * Creates a shared source for `src` and returns a handle that can
 * be passed to one or more `<VirtualFrame frame={…} />` instances.
 *
 * The source is created on mount and cleaned up on unmount.  The
 * optional `store` connection is established once (when the remote
 * signals ready).
 *
 * ```tsx
 * const frame = useVirtualFrame("/remote/", { store });
 *
 * <VirtualFrame frame={frame} selector="#header" />
 * <VirtualFrame frame={frame} selector="#counter" />
 * ```
 */
export function useVirtualFrame(
  src: string,
  options?: UseVirtualFrameOptions,
): VirtualFrameRef {
  const frameRef = useRef<VirtualFrameRef | null>(null);

  // Create source synchronously (stable across renders) so the
  // returned handle is the same object reference on every render.
  if (!frameRef.current) {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");

    frameRef.current = { _iframe: iframe, _refCount: 0 };
  }

  useEffect(() => {
    const frame = frameRef.current!;
    document.body.appendChild(frame._iframe);

    // ── Store bridge ────────────────────────────────────
    const store = options?.store;
    if (store) {
      // import("@virtual-frame/store").then(({ connectPort }) => {
      if (frame._storeCleanup) return;

      let portCleanup: (() => void) | undefined;

      const connect = () => {
        if (portCleanup) return;
        if (!frame._iframe.contentWindow) return;
        const channel = new MessageChannel();
        frame._iframe.contentWindow.postMessage(
          { type: "vf-store:connect" },
          "*",
          [channel.port2],
        );
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (
          e.source === frame._iframe.contentWindow &&
          e.data?.type === "vf-store:ready"
        ) {
          connect();
        }
      };

      window.addEventListener("message", onMessage);

      frame._storeCleanup = () => {
        window.removeEventListener("message", onMessage);
        portCleanup?.();
      };
      // });
    }

    return () => {
      frame._storeCleanup?.();
      frame._storeCleanup = undefined;
      frame._iframe.remove();
    };
    // src is baked into the source at creation time; store identity is
    // stable (module-level singleton).  Re-running this effect is not
    // expected — if the caller changes src they should key the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return frameRef.current!;
}

// ── VirtualFrame component ──────────────────────────────────

export interface VirtualFrameHandle {
  /** Force a full re-projection. */
  refresh(): void;
}

export interface VirtualFrameProps
  extends
    VirtualFrameOptions,
    Omit<React.HTMLAttributes<HTMLDivElement>, "ref"> {
  /** URL to load and project. */
  src?: string;
  /**
   * Shared frame handle from `useVirtualFrame()`.
   *
   * When provided, the component projects from this shared source
   * instead of creating its own.  Multiple components can share the
   * same frame, each projecting a different subtree via `selector`.
   */
  frame?: VirtualFrameRef;
  /** Exposes `{ refresh() }` via React ref. */
  ref?: Ref<VirtualFrameHandle>;
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided (and the component owns its own source via `src`),
   * state is synchronised between host and remote in real time.
   *
   * When using a shared `frame`, pass the store to `useVirtualFrame()`
   * instead.
   */
  store?: StoreProxy;
}

/**
 * React component that projects remote content into your page.
 *
 * Usage:
 *   // Project a URL (creates a source automatically)
 *   <VirtualFrame src="./hello.html" />
 *
 *   // Project only a specific part
 *   <VirtualFrame src="./page.html" selector="#header" />
 *
 *   // Project with shared store
 *   <VirtualFrame src="./page.html" store={myStore} />
 *
 *   // Share one source across multiple components via useVirtualFrame()
 *   const frame = useVirtualFrame("./page.html", { store });
 *   <VirtualFrame frame={frame} selector="#header" />
 *   <VirtualFrame frame={frame} selector="#counter" />
 *
 * Props:
 *   - src: URL string — creates a dedicated source per instance
 *   - frame: shared frame handle from useVirtualFrame()
 *   - selector: CSS selector to project only a part of the content
 *   - streamingFps: number or { selector: fps } map for streaming
 *   - store: StoreProxy (only used with `src`, not `frame`)
 *   - ref: exposes { refresh() } via React 19 ref
 *   - All other props are spread onto the host <div>
 */
export function VirtualFrame({
  src,
  frame,
  isolate,
  selector,
  streamingFps,
  ref,
  store,
  ...props
}: VirtualFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<VirtualFrameCore | null>(null);
  const ownedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const storeCleanupRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    refresh() {
      coreRef.current?.refresh();
    },
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let iframe: HTMLIFrameElement;

    if (frame) {
      // ── Shared frame from useVirtualFrame() ──────────
      iframe = frame._iframe;
      frame._refCount++;
    } else if (src) {
      // ── Owned source (default mode) ─────────────────
      iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      host.parentNode!.insertBefore(iframe, host);
      ownedIframeRef.current = iframe;

      // ── Store bridge (owned source only) ──────────────
      if (store) {
        const capturedIframe = iframe;
        // import("@virtual-frame/store").then(({ connectPort }) => {
        let portCleanup: (() => void) | undefined;

        const connect = () => {
          if (portCleanup) return;
          if (!capturedIframe.contentWindow) return;
          const channel = new MessageChannel();
          capturedIframe.contentWindow.postMessage(
            { type: "vf-store:connect" },
            "*",
            [channel.port2],
          );
          portCleanup = connectPort(store, channel.port1);
        };

        const onMessage = (e: MessageEvent) => {
          if (
            e.source === capturedIframe.contentWindow &&
            e.data?.type === "vf-store:ready"
          ) {
            connect();
          }
        };

        window.addEventListener("message", onMessage);

        storeCleanupRef.current = () => {
          window.removeEventListener("message", onMessage);
          portCleanup?.();
        };
        // });
      }
    } else {
      return;
    }

    coreRef.current = new VirtualFrameCore(iframe, host, {
      isolate,
      selector,
      streamingFps,
    });

    return () => {
      coreRef.current?.destroy();
      coreRef.current = null;

      if (frame) {
        frame._refCount--;
      }

      storeCleanupRef.current?.();
      storeCleanupRef.current = null;

      if (ownedIframeRef.current) {
        ownedIframeRef.current.remove();
        ownedIframeRef.current = null;
      }
    };
  }, [src, frame, isolate, selector, streamingFps, store]);

  return <div ref={hostRef} {...props} />;
}
