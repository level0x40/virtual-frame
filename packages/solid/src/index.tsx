import {
  onMount,
  onCleanup,
  createEffect,
  createSignal,
  mergeProps,
  type JSX,
} from "solid-js";
import {
  VirtualFrame as VirtualFrameCore,
  type VirtualFrameOptions,
} from "virtual-frame";
import { getStore as _getStore, type StoreProxy } from "@virtual-frame/store";

// ── Shared frame handle ─────────────────────────────────────

export interface VirtualFrameRef {
  /** @internal */ readonly _iframe: HTMLIFrameElement;
  /** @internal */ _refCount: number;
  /** @internal */ _storeCleanup?: () => void;
}

export interface CreateVirtualFrameOptions {
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided, state is synchronised between the host and the
   * remote in real time.
   */
  store?: StoreProxy;
}

/**
 * Creates a shared source for `src` and returns a handle that can be
 * passed to one or more `<VirtualFrame frame={frame} />` instances.
 *
 * Must be called during component initialisation (so `onCleanup` can
 * register cleanup).
 *
 * ```tsx
 * const frame = createVirtualFrame("/remote/", { store });
 *
 * <VirtualFrame frame={frame} selector="#header" />
 * <VirtualFrame frame={frame} selector="#counter" />
 * ```
 */
export function createVirtualFrame(
  src: string,
  options?: CreateVirtualFrameOptions,
): VirtualFrameRef {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  document.body.appendChild(iframe);

  const frame: VirtualFrameRef = { _iframe: iframe, _refCount: 0 };

  // ── Store bridge ────────────────────────────────────
  const store = options?.store;
  if (store) {
    import("@virtual-frame/store").then(({ connectPort }) => {
      if (frame._storeCleanup) return;

      let portCleanup: (() => void) | undefined;

      const connect = () => {
        if (portCleanup) return;
        if (!iframe.contentWindow) return;
        const channel = new MessageChannel();
        iframe.contentWindow.postMessage(
          { type: "vf-store:connect" },
          "*",
          [channel.port2],
        );
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (
          e.source === iframe.contentWindow &&
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
    });
  }

  onCleanup(() => {
    frame._storeCleanup?.();
    frame._storeCleanup = undefined;
    iframe.remove();
  });

  return frame;
}

// ── VirtualFrame component ──────────────────────────────────

export interface VirtualFrameHandle {
  /** Force a full re-projection. */
  refresh(): void;
}

export interface VirtualFrameProps extends VirtualFrameOptions {
  /** URL to load and project. */
  src?: string;
  /**
   * Shared frame handle from `createVirtualFrame()`.
   *
   * When provided, the component projects from this shared source
   * instead of creating its own.  Multiple components can share the
   * same frame, each projecting a different subtree via `selector`.
   */
  frame?: VirtualFrameRef;
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided (with `src`), state is synchronised between host
   * and remote in real time.
   */
  store?: StoreProxy;
  /** Callback ref that receives `{ refresh() }`. */
  ref?: (handle: VirtualFrameHandle) => void;
  /** Child elements. */
  children?: JSX.Element;
  /** Additional attributes spread onto the wrapper `<div>`. */
  [key: string]: unknown;
}

/**
 * Solid component that projects remote content into your page.
 */
export function VirtualFrame(props: VirtualFrameProps) {
  const merged = mergeProps(
    {
      src: undefined as string | undefined,
      frame: undefined as VirtualFrameRef | undefined,
      isolate: undefined as VirtualFrameOptions["isolate"],
      selector: undefined as string | undefined,
      streamingFps: undefined as VirtualFrameOptions["streamingFps"],
      store: undefined as StoreProxy | undefined,
    },
    props,
  );

  // Assigned by Solid via `ref={hostEl}` in the JSX below.
  // eslint-disable-next-line no-unassigned-vars
  let hostEl!: HTMLDivElement;
  let core: VirtualFrameCore | null = null;
  let ownedIframe: HTMLIFrameElement | null = null;
  let storeCleanup: (() => void) | null = null;

  function setup() {
    teardown();
    if (!hostEl) return;

    let iframe: HTMLIFrameElement | undefined;

    if (merged.frame) {
      iframe = merged.frame._iframe;
      merged.frame._refCount++;
    } else if (merged.src) {
      iframe = document.createElement("iframe");
      iframe.src = merged.src;
      iframe.style.cssText =
        "position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      hostEl.parentNode!.insertBefore(iframe, hostEl);
      ownedIframe = iframe;

      // ── Store bridge (owned source only) ──────────────
      if (merged.store) {
        const store = merged.store;
        const capturedIframe = iframe;
        import("@virtual-frame/store").then(({ connectPort }) => {
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

          storeCleanup = () => {
            window.removeEventListener("message", onMessage);
            portCleanup?.();
          };
        });
      }
    } else {
      return;
    }

    if (!iframe) return;

    core = new VirtualFrameCore(iframe, hostEl, {
      isolate: merged.isolate,
      selector: merged.selector,
      streamingFps: merged.streamingFps,
    });
  }

  function teardown() {
    if (core) {
      core.destroy();
      core = null;
    }
    storeCleanup?.();
    storeCleanup = null;
    if (merged.frame) {
      merged.frame._refCount--;
    }
    if (ownedIframe) {
      ownedIframe.remove();
      ownedIframe = null;
    }
  }

  if (typeof props.ref === "function") {
    props.ref({ refresh: () => core?.refresh() });
  }

  onMount(() => {
    setup();
  });

  onCleanup(teardown);

  createEffect(() => {
    // Track reactive props (read each prop so Solid registers it)
    const _deps = [
      merged.src,
      merged.frame,
      merged.isolate,
      merged.selector,
      merged.streamingFps,
      merged.store,
    ];
    if (hostEl) setup();
  });

  return <div ref={hostEl}>{props.children}</div>;
}

/**
 * Subscribes to a path in a `@virtual-frame/store` proxy, returning a
 * Solid signal accessor that updates whenever that path changes.
 *
 * ```tsx
 * import { useStore } from "@virtual-frame/solid";
 *
 * function MyComponent() {
 *   // Subscribe to a single key
 *   const count = useStore<number>(store, ["count"]);
 *
 *   // Subscribe to a nested path
 *   const name = useStore<string>(store, ["user", "name"]);
 *
 *   // Subscribe to every change (no selector)
 *   const snapshot = useStore(store);
 *
 *   return <div>{count()}</div>;
 * }
 * ```
 *
 * @param store     Store proxy from `createStore()` or the remote `useStore()`.
 * @param selector  Property path to subscribe to (e.g. `["count"]`). When
 *                  omitted the signal updates on any mutation.
 * @returns A Solid signal accessor with the current value at the path.
 */
export function useStore<T = unknown>(
  store: StoreProxy,
  selector?: PropertyKey[],
): () => T {
  const handle = _getStore(store);

  function getSnapshot(): T {
    if (!selector) return handle.snapshot() as T;
    return handle.readPath(selector) as T;
  }

  const [value, setValue] = createSignal<T>(getSnapshot());

  const unsubscribe = selector
    ? handle.subscribe(selector, () => setValue(() => getSnapshot()))
    : handle.subscribe(() => setValue(() => getSnapshot()));

  onCleanup(unsubscribe);

  return value;
}
