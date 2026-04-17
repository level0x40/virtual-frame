import { Directive, ElementRef, Input, OnInit, OnDestroy, OnChanges, inject } from "@angular/core";
import { VirtualFrame } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";

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
 * Creates a shared source and returns a handle that can be passed to
 * one or more `<div virtualFrame [frame]="frame">` instances.
 *
 * The caller is responsible for calling `destroyVirtualFrame(frame)`
 * (or using the directive's `ngOnDestroy`) when the source is no
 * longer needed.
 *
 * ```ts
 * import { createVirtualFrame, destroyVirtualFrame } from "@virtual-frame/angular";
 *
 * @Component({ ... })
 * class MyComponent implements OnDestroy {
 *   frame = createVirtualFrame("/remote/", { store: this.store });
 *
 *   ngOnDestroy() {
 *     destroyVirtualFrame(this.frame);
 *   }
 * }
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
        iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (e.source === iframe.contentWindow && e.data?.type === "vf-store:ready") {
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

  return frame;
}

/**
 * Destroys a shared frame handle created by `createVirtualFrame()`.
 *
 * Cleans up the store bridge and removes the source element from the DOM.
 */
export function destroyVirtualFrame(frame: VirtualFrameRef): void {
  frame._storeCleanup?.();
  frame._storeCleanup = undefined;
  (frame as { _iframe: HTMLIFrameElement })._iframe.remove();
}

/**
 * Angular directive that projects remote content into the host element.
 *
 * Usage:
 *   <div virtualFrame src="./page.html"></div>
 *   <div virtualFrame [src]="url" isolate="open" [streamingFps]="30"></div>
 *   <div virtualFrame [frame]="frame" selector="#header"></div>
 *   <div virtualFrame [src]="url" [store]="myStore"></div>
 */
@Directive({
  selector: "[virtualFrame]",
  standalone: true,
})
export class VirtualFrameDirective implements OnInit, OnDestroy, OnChanges {
  @Input() src?: string;
  @Input() frame?: VirtualFrameRef;
  @Input() isolate?: "open" | "closed";
  @Input() selector?: string;
  @Input() streamingFps?: number | Record<string, number>;
  @Input() store?: StoreProxy;

  private core: VirtualFrame | null = null;
  private ownedIframe: HTMLIFrameElement | null = null;
  private storeCleanup: (() => void) | null = null;
  // Use `inject()` rather than constructor injection so this directive
  // does not rely on `Reflect.getMetadata("design:paramtypes", …)` being
  // available at runtime. That metadata is only emitted when the
  // consumer compiles with `emitDecoratorMetadata: true` AND loads a
  // `reflect-metadata` polyfill — neither of which is required in modern
  // Angular apps, and missing either causes NG0202 at bootstrap.
  private readonly el = inject(ElementRef);

  ngOnInit() {
    this.setup();
  }

  ngOnChanges() {
    this.setup();
  }

  ngOnDestroy() {
    this.teardown();
  }

  private setup() {
    this.teardown();
    const host = this.el.nativeElement;

    let iframe: HTMLIFrameElement | undefined;

    if (this.frame) {
      iframe = this.frame._iframe;
      this.frame._refCount++;
    } else if (this.src) {
      iframe = document.createElement("iframe");
      iframe.src = this.src;
      iframe.style.cssText =
        "position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      host.parentNode.insertBefore(iframe, host);
      this.ownedIframe = iframe;

      // ── Store bridge (owned source only) ─────────────
      if (this.store) {
        const store = this.store;
        const capturedIframe = iframe;
        import("@virtual-frame/store").then(({ connectPort }) => {
          let portCleanup: (() => void) | undefined;

          const connect = () => {
            if (portCleanup) return;
            if (!capturedIframe.contentWindow) return;
            const channel = new MessageChannel();
            capturedIframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [
              channel.port2,
            ]);
            portCleanup = connectPort(store, channel.port1);
          };

          const onMessage = (e: MessageEvent) => {
            if (e.source === capturedIframe.contentWindow && e.data?.type === "vf-store:ready") {
              connect();
            }
          };

          window.addEventListener("message", onMessage);

          this.storeCleanup = () => {
            window.removeEventListener("message", onMessage);
            portCleanup?.();
          };
        });
      }
    } else {
      return;
    }

    if (!iframe) return;

    this.core = new VirtualFrame(iframe, host, {
      isolate: this.isolate,
      selector: this.selector,
      streamingFps: this.streamingFps,
    });
  }

  private teardown() {
    if (this.core) {
      this.core.destroy();
      this.core = null;
    }
    this.storeCleanup?.();
    this.storeCleanup = null;
    if (this.frame) {
      this.frame._refCount--;
    }
    if (this.ownedIframe) {
      this.ownedIframe.remove();
      this.ownedIframe = null;
    }
  }

  refresh() {
    if (this.core) this.core.refresh();
  }
}
