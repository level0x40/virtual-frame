/**
 * @virtual-frame/analog/client — Client-side Angular component with SSR support.
 *
 * Extends the base `@virtual-frame/angular` directive with SSR HTML handoff:
 * on initial page load the declarative shadow DOM from `prepareVirtualFrameProps()`
 * is rendered inline; after hydration, VirtualFrameCore takes over the shadow root
 * for live mirroring.
 */

import {
  Component,
  ElementRef,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { VirtualFrame as VirtualFrameCore, type VirtualFrameOptions } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";

// ── Shared iframe registry (module-scoped) ──────────────────────
// Multiple VirtualFrameComponent instances pointing to the same `src` share a
// single hidden iframe (ref-counted).  The first instance to mount
// creates the iframe; subsequent instances just bump the refCount.
// The iframe is removed only when the last consumer unmounts.
const _sharedIframes: Map<
  string,
  { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
> = new Map();

/**
 * Angular component that projects remote content into the host element
 * with SSR support for Analog.js.
 *
 * On the server, the component renders the SSR HTML from
 * `prepareVirtualFrameProps()` as `innerHTML` (declarative shadow DOM).
 * On the client, after hydration, VirtualFrameCore takes over the
 * existing shadow root for live mirroring — no flash of content.
 *
 * Usage:
 * ```html
 * <virtual-frame
 *   [src]="frameProps.src"
 *   [isolate]="frameProps.isolate"
 *   [vfHtml]="frameProps._vfHtml"
 * ></virtual-frame>
 * ```
 */
@Component({
  selector: "virtual-frame",
  standalone: true,
  template: "",
})
export class VirtualFrameComponent implements OnInit, OnDestroy, OnChanges {
  @Input() src!: string;
  @Input() isolate?: VirtualFrameOptions["isolate"];
  @Input() selector?: string;
  @Input() streamingFps?: VirtualFrameOptions["streamingFps"];
  @Input() store?: StoreProxy;
  @Input() proxy?: string;
  /** @internal SSR HTML from `prepareVirtualFrameProps()`. */
  @Input() vfHtml?: string;

  private core: VirtualFrameCore | null = null;
  private sharedKey: string | null = null;
  private initialized = false;

  // Use inject() rather than constructor injection so this component
  // does not rely on emitDecoratorMetadata / reflect-metadata at runtime.
  private readonly el = inject(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit() {
    // On the server, render the SSR HTML as innerHTML so the browser's
    // HTML parser processes the declarative shadow DOM on initial load.
    // Under Angular Universal / Analog Nitro SSR there is no `document`,
    // no `window`, and no `MessageChannel` — so `setup()` is strictly
    // browser-only.  Always bail on the server path; render vfHtml when
    // available, otherwise render nothing.
    if (!this.isBrowser) {
      if (this.vfHtml) {
        this.el.nativeElement.innerHTML = this.vfHtml;
      }
      return;
    }

    // ngOnChanges fires before ngOnInit with the initial input values.
    // Guard against double-setup: only call setup() here if ngOnChanges
    // hasn't already done it.
    if (!this.initialized) {
      this.setup();
    }
  }

  ngOnChanges() {
    if (this.isBrowser) {
      this.setup();
    }
  }

  ngOnDestroy() {
    this.teardown();
  }

  private setup() {
    this.teardown();
    this.initialized = true;
    const host = this.el.nativeElement;
    if (!host || !this.src) return;

    // On client-side navigation, the browser's HTML parser doesn't process
    // <template shadowrootmode> in innerHTML.  Use setHTMLUnsafe() to parse it.
    if (this.vfHtml && !host.shadowRoot) {
      const template = host.querySelector("template[shadowrootmode]") as HTMLTemplateElement | null;
      if (template && typeof (host as any).setHTMLUnsafe === "function") {
        (host as any).setHTMLUnsafe(this.vfHtml);
      }
    }

    // ── Shared iframe setup (cross-origin via iframe.src) ──────
    let iframe: HTMLIFrameElement;
    let shared = _sharedIframes.get(this.src);

    if (shared) {
      iframe = shared.iframe;
      shared.refCount++;
    } else {
      iframe = document.createElement("iframe");
      iframe.src = this.src;

      iframe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");

      host.parentNode!.insertBefore(iframe, host);

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(this.src, shared);
    }

    // ── Store bridge ────────────────────────────────────────
    if (this.store && !shared.storeCleanup) {
      const store = this.store;
      const capturedSrc = this.src;
      import("@virtual-frame/store").then(({ connectPort }) => {
        const s = _sharedIframes.get(capturedSrc);
        if (!s || s.storeCleanup) return;

        let portCleanup: (() => void) | undefined;

        const connect = () => {
          if (portCleanup) return;
          if (!s.iframe.contentWindow) return;
          const channel = new MessageChannel();
          s.iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
          portCleanup = connectPort(store, channel.port1);
        };

        const onMessage = (e: MessageEvent) => {
          if (e.source === s.iframe.contentWindow && e.data?.type === "vf-store:ready") {
            connect();
          }
        };

        window.addEventListener("message", onMessage);

        s.storeCleanup = () => {
          window.removeEventListener("message", onMessage);
          portCleanup?.();
        };
      });
    }

    this.sharedKey = this.src;

    this.core = new VirtualFrameCore(iframe, host, {
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

    if (this.sharedKey) {
      const s = _sharedIframes.get(this.sharedKey);
      if (s) {
        s.refCount--;
        if (s.refCount <= 0) {
          s.storeCleanup?.();
          s.iframe.remove();
          _sharedIframes.delete(this.sharedKey);
        }
      }
      this.sharedKey = null;
    }
  }

  refresh() {
    if (this.core) this.core.refresh();
  }
}
