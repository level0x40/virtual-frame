import { VirtualFrame, _buildEnvShim } from "./core.ts";

// ── Shared iframe registry ──────────────────────────────────
// Multiple <virtual-frame> elements pointing to the same `src` share a
// single hidden iframe.  The first element to initialise creates it (and
// seeds it with srcdoc when resuming from SSR); subsequent elements just
// increment the refCount.  The iframe is removed only when the last
// consumer disconnects.
const _sharedIframes = new Map(); // src → { iframe, refCount }

class VirtualFrameElement extends HTMLElement {
  _mirror: VirtualFrame | null = null;
  _ownedIframe: HTMLIFrameElement | null = null;
  _sharedSrc: string | null = null;
  _setupScheduled = false;

  static get observedAttributes() {
    return ["src", "isolate", "selector", "streaming-fps", "proxy"];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this._scheduleSetup();
  }

  disconnectedCallback() {
    this._teardown();
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue && this.isConnected) {
      this._scheduleSetup();
    }
  }

  _scheduleSetup() {
    if (this._setupScheduled) return;
    this._setupScheduled = true;
    queueMicrotask(() => {
      this._setupScheduled = false;
      if (!this.isConnected) return;
      this._teardown();
      this._setup();
    });
  }

  _setup() {
    const src = this.getAttribute("src");
    if (!src) return;

    const isolate = this.getAttribute("isolate") || undefined;
    const selector = this.getAttribute("selector") || undefined;
    const proxy = this.getAttribute("proxy") || undefined;
    const rawFps = this.getAttribute("streaming-fps");
    let streamingFps;
    if (rawFps != null) {
      const trimmed = rawFps.trim();
      if (trimmed.startsWith("{")) {
        try {
          streamingFps = JSON.parse(trimmed);
        } catch {
          streamingFps = Number(trimmed) || undefined;
        }
      } else {
        streamingFps = Number(trimmed) || undefined;
      }
    }

    if (src.startsWith("#")) {
      // Reference to an existing iframe by ID
      const iframe = document.getElementById(src.slice(1));
      if (!iframe) {
        console.error(`VirtualFrame: No element found with id "${src.slice(1)}"`);
        return;
      }
      this._mirror = new VirtualFrame(iframe as HTMLIFrameElement, this, {
        isolate: isolate as "open" | "closed" | undefined,
        selector,
        streamingFps,
      });
    } else {
      // URL — reuse an existing shared iframe or create a new one.
      let iframe;
      let shared = _sharedIframes.get(src);

      if (shared) {
        // Another <virtual-frame> already owns an iframe for this src.
        iframe = shared.iframe;
        shared.refCount++;
      } else {
        // First element for this src → create the hidden iframe.
        iframe = document.createElement("iframe");

        // SSR resume: reconstruct the iframe content from the
        // already-rendered shadow DOM body + a diff operations array.
        // Each diff entry is a literal string fragment; joined they
        // produce the full <body> innerHTML with relative URLs that the
        // <base href> tag in the iframe resolves.
        //
        // We use document.write (not srcdoc) so the iframe is
        // same-origin with the host and history.replaceState can set
        // the correct pathname — frameworks reading window.location
        // (e.g. usePathname) then see the remote URL, not about:srcdoc.
        const resumeScript = this.querySelector('script[type="text/vf-resume"]');

        // Style the iframe identically regardless of resume vs src.
        // position:fixed prevents focus-induced scrolling of the host.
        iframe.style.cssText =
          "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
        iframe.setAttribute("aria-hidden", "true");
        iframe.setAttribute("tabindex", "-1");

        if (resumeScript) {
          const delta = JSON.parse(resumeScript.textContent);

          const baseUrl = delta.u || src;
          const baseTag = `<base href="${baseUrl}">`;
          const bodyAttrs = delta.a ? " " + delta.a : "";
          const body = delta.d.join("");

          // Env shim: runs before any framework code inside the iframe.
          const envShim = _buildEnvShim(baseUrl, {
            proxyBase: proxy,
          });

          const htmlAttrs = delta.r ? " " + delta.r : "";

          const htmlContent =
            `<!DOCTYPE html><html${htmlAttrs}><head>${baseTag}${envShim}${delta.h}</head>` +
            `<body${bodyAttrs}>${body}</body></html>`;

          // Insert iframe into DOM first so contentDocument is accessible,
          // then inject content via document.write.  This makes the iframe
          // same-origin with the host so history.replaceState works.
          this.parentNode!.insertBefore(iframe, this);
          const iframeDoc = iframe.contentDocument!;
          iframeDoc.open();
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          // Clean up the resume script
          resumeScript.remove();
          this.removeAttribute("data-vf-ssr");
        } else {
          iframe.src = src;
          this.parentNode!.insertBefore(iframe, this);
        }

        // Register in the shared map
        shared = { iframe, refCount: 1 };
        _sharedIframes.set(src, shared);
      }

      // If this element has a resume script but the iframe was already
      // created by a sibling, we still need to clean up our own resume
      // script and SSR marker.
      const leftoverResume = this.querySelector('script[type="text/vf-resume"]');
      if (leftoverResume) {
        leftoverResume.remove();
        this.removeAttribute("data-vf-ssr");
      }

      this._sharedSrc = src; // remember which key we registered under
      this._mirror = new VirtualFrame(iframe, this, {
        isolate: isolate as "open" | "closed" | undefined,
        selector,
        streamingFps,
      });
    }
  }

  _teardown() {
    if (this._mirror) {
      this._mirror.destroy();
      this._mirror = null;
    }
    // Shared iframe: decrement refCount and only remove when last user leaves.
    if (this._sharedSrc) {
      const shared = _sharedIframes.get(this._sharedSrc);
      if (shared) {
        shared.refCount--;
        if (shared.refCount <= 0) {
          shared.iframe.remove();
          _sharedIframes.delete(this._sharedSrc);
        }
      }
      this._sharedSrc = null;
    }
    // Legacy: non-shared owned iframe (e.g. src="#id" reference)
    if (this._ownedIframe) {
      this._ownedIframe.remove();
      this._ownedIframe = null;
    }
  }

  refresh() {
    if (this._mirror) {
      this._mirror.refresh();
    }
  }
}

customElements.define("virtual-frame", VirtualFrameElement);
