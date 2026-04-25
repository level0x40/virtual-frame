const _svgTags = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "image",
  "use",
  "symbol",
  "marker",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feFlood",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "feSpecularLighting",
  "feTile",
  "feTurbulence",
  "foreignObject",
  "animate",
  "animateMotion",
  "animateTransform",
  "set",
]);

const _formTags = new Set(["input", "textarea", "select"]);

// ── URL rewriting for mirrored attributes ──────────────────
// Attributes that contain URLs needing rewriting when mirrored
// from the iframe to the host shadow DOM.
const _urlAttrs = new Set([
  "src",
  "href",
  "action",
  "poster",
  "data",
  "formaction",
  "background",
  "cite",
  "longdesc",
]);

function _resolveUrl(value: string, baseUrl: string): string {
  if (!value || /^(data:|blob:|javascript:|#|mailto:|tel:|https?:\/\/)/i.test(value)) return value;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function _resolveSrcset(value: string, baseUrl: string): string {
  return value
    .split(",")
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      if (parts[0]) parts[0] = _resolveUrl(parts[0], baseUrl);
      return parts.join(" ");
    })
    .join(", ");
}

/**
 * Rewrite a single attribute value to absolute URL if it's a URL
 * attribute. Returns the original value if no rewriting is needed.
 */
function _rewriteAttrUrl(attrName: string, value: string, baseUrl: string | null): string {
  if (!baseUrl) return value;
  if (attrName === "srcset") return _resolveSrcset(value, baseUrl);
  if (_urlAttrs.has(attrName)) return _resolveUrl(value, baseUrl);
  return value;
}

/**
 * Rewrite CSS selectors that target `body` (or `html`) to use
 * `[data-vf-body]` instead. This prevents the host page's body styles from
 * bleeding into the mirrored content and ensures the iframe's body-targeted
 * rules still apply to the replacement `<div data-vf-body>`.
 */
export function _rewriteBodySelectors(css: string): string {
  // Replace `body` selector with `[data-vf-body]` and `html` with `:host, [data-vf-body]`
  // Handle: body, body.cls, body > ..., body ..., html body, etc.
  // Use a regex that matches `body` as a tag selector (word boundary, not part of a property value)
  // We operate on selectors, not inside declaration blocks.

  // Process rule-by-rule to only rewrite selectors, not property values.
  return css.replace(/([^{}]*?)\{/g, (match: string, selectorPart: string) => {
    let rewritten = selectorPart;
    // Replace `body` used as a tag selector
    rewritten = rewritten.replace(/(^|[,\s>+~])body(?=[\s,.:#>[+~{\])]|$)/g, "$1[data-vf-body]");
    // Replace `html` and `:root` used as selectors — in shadow DOM :root
    // still targets the host document, so remap to :host so that e.g.
    // CSS custom-property definitions are available inside the shadow tree.
    rewritten = rewritten.replace(/(^|[,\s>+~])html(?=[\s,.:#>[+~{\])]|$)/g, "$1:host");
    rewritten = rewritten.replace(/(^|[,\s>+~]):root(?=[\s,.:#>[+~{\])]|$)/g, "$1:host");
    return rewritten + "{";
  });
}

/**
 * Rewrite viewport-relative width units (vw, dvw, svw, lvw) to container
 * query units (cqw) so that the mirrored content sizes its *width* relative
 * to the virtual frame container instead of the browser viewport.
 *
 * Height-related viewport units (vh, vmin, vmax) are left as-is because
 * the host element uses `container-type: inline-size` (width only).  Full
 * size containment would require the host to have an explicit block height,
 * which causes a zero-height collapse when inner content uses `100cqh`.
 * Keeping `vh` intact lets the content behave like a normal page while the
 * virtual-frame's `overflow: auto` handles any overflow.
 */
export function _rewriteViewportUnits(css: string): string {
  return css.replace(/(\d+\.?\d*|\d*\.\d+)\s*(d|s|l)?vw\b/gi, (match: string, num: string) => {
    return num + "cqw";
  });
}

/**
 * Apply all CSS transformations for mirrored content.
 */
export function _rewriteCSS(css: string): string {
  return _rewriteViewportUnits(_rewriteBodySelectors(css));
}

// ── Debug logging ───────────────────────────────────────────
// Enable via localStorage.setItem('VF_DEBUG', '1') or
//           sessionStorage.setItem('VF_DEBUG', '1')
function _isDebugEnabled() {
  try {
    return (
      (typeof localStorage !== "undefined" && localStorage.getItem("VF_DEBUG") === "1") ||
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem("VF_DEBUG") === "1")
    );
  } catch {
    return false;
  }
}
function _vflog(...args: unknown[]) {
  if (_isDebugEnabled()) console.log("%c[VF]", "color:#0af;font-weight:bold", ...args);
}
function _vfwarn(...args: unknown[]) {
  if (_isDebugEnabled()) console.warn("%c[VF]", "color:#fa0;font-weight:bold", ...args);
}

// ── Selector matching on serialised descriptors ─────────────
// Walks the serialised node tree produced by the bridge to check whether
// any element matches a CSS selector.  Pure function — no side-effects
// on element maps, no DOM construction.  Used by _handleRemoteMutations
// to detect when a selector target reappears after client-side navigation.

function _descriptorMatchesSelector(descs: any[], selector: string): boolean {
  try {
    for (const desc of descs) {
      if (!desc || desc.type === "text" || desc.type === "comment") continue;
      if (desc.tag && _elementDescMatchesSelector(desc, selector)) return true;
    }
  } catch {
    // Invalid selector or unexpected descriptor shape — treat as no match
    return false;
  }
  return false;
}

/** Check a single element descriptor (and its children) against a selector. */
function _elementDescMatchesSelector(desc: any, selector: string): boolean {
  if (_descNodeMatchesSelector(desc, selector)) return true;
  // Recurse into children
  if (desc.children) {
    for (const child of desc.children) {
      if (!child || child.type === "text" || child.type === "comment") continue;
      if (child.tag && _elementDescMatchesSelector(child, selector)) return true;
    }
  }
  return false;
}

/** Safely set an attribute, ignoring invalid names/values. */
function _safeSetAttr(el: Element, k: string, v: string): void {
  // Skip attribute names that would throw (e.g. empty string, invalid XML chars)
  if (!k || typeof v !== "string") return;
  el.setAttribute(k, v);
}

/** Match a single descriptor node against a selector using a detached element. */
function _descNodeMatchesSelector(desc: any, selector: string): boolean {
  const tag = desc.tag === "body" || desc.tag === "html" ? "div" : desc.tag;
  if (!tag || typeof tag !== "string") return false;
  const el = _svgTags.has(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  if (desc.attrs) {
    for (const [k, v] of Object.entries(desc.attrs)) {
      _safeSetAttr(el, k, v as string);
    }
  }
  return el.matches(selector);
}

// ── Env shim builder ─────────────────────────────────────────
// Builds the <script> tag injected into the iframe before any framework
// code runs.  Shared between element.ts, client.tsx and the navigation
// re-inject path so the shim is always identical.

export interface EnvShimOptions {
  /**
   * Same-origin proxy prefix.  When set, the fetch/XHR shim rewrites
   * host-origin requests to `location.origin + proxyBase + pathname`
   * instead of the remote origin — keeping everything same-origin and
   * avoiding CORS.
   *
   * The host server is expected to have a rewrite / proxy rule that
   * forwards `proxyBase/:path*` → `remoteOrigin/:path*`.
   */
  proxyBase?: string;
}

export function _buildEnvShim(baseUrl: string, options?: EnvShimOptions): string {
  const safeBase = JSON.stringify(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  // Proxy base: normalise to no trailing slash so the shim can
  // simply concatenate  proxyBase + pathname.
  const proxyBase = options?.proxyBase
    ? JSON.stringify(
        options.proxyBase.endsWith("/") ? options.proxyBase.slice(0, -1) : options.proxyBase,
      )
    : "null";
  return (
    "<script>(function(){" +
    "var O=URL,b=" +
    safeBase +
    ",pB=" +
    proxyBase +
    ";" +
    // ── URL shim ──
    // hO = host origin (same-origin), bOr = remote origin (base tag)
    //
    // IMPORTANT: We do NOT rewrite the base URL in the URL constructor.
    // The <base> tag handles HTML/CSS relative URL resolution (images,
    // stylesheets, etc.).  The fetch/XHR shim handles HTTP request URL
    // rewriting.  The URL constructor must return same-origin URLs so
    // that framework routers (e.g. Next.js) don't classify navigations
    // as "external" and fall back to hard (MPA) navigation.
    //
    // The only rewrite we do: fall back to the remote base `b` in the
    // catch block when resolution fails (e.g. `new URL(path, location)`
    // in browsers that don't coerce Location to string).
    "var hO=location.origin,hOP=hO+'/';" +
    "var bOr=new O(b).origin;" +
    "function U(u,B){" +
    // When there is no proxy and the base is the host origin, rewrite
    // it to the remote origin.  This is needed because dynamic import()
    // (e.g. in Vite's __webpack_require__) constructs URLs via
    // `new URL(path, location.origin)` — and location.origin in a
    // document.write() iframe is the HOST, not the remote.  We can't
    // intercept import(), but we CAN fix the URL it receives.
    // When a proxy IS configured, fetch/XHR handle rewriting, so we
    // must NOT rewrite here (the proxy expects same-origin URLs).
    "if(pB===null&&hO!==bOr&&typeof B==='string'&&(B===hO||B===hOP)){B=bOr+'/'}" +
    "try{return new O(u,B)}" +
    "catch(e){if(B!==void 0)try{return new O(u,b)}catch(_){}" +
    "throw e}}" +
    "U.prototype=O.prototype;" +
    "U.createObjectURL=O.createObjectURL.bind(O);" +
    "U.revokeObjectURL=O.revokeObjectURL.bind(O);" +
    "if(O.canParse)U.canParse=function(u,B){return O.canParse(u,B)||O.canParse(u,b)};" +
    "if(O.parse)U.parse=function(u,B){return O.parse(u,B)||O.parse(u,b)};" +
    "URL=U;" +
    // ── Fetch shim ──
    // Intercept fetch() calls where the resolved URL points to the
    // host origin and redirect them to the remote origin.  This is
    // needed because frameworks (e.g. Next.js RSC) may construct
    // fetch URLs via string concatenation with location.origin,
    // bypassing both the <base> tag and the URL constructor shim.
    "var oF=window.fetch.bind(window);" +
    "function __vfRewriteUrl(u){" +
    "if(hO!==bOr&&typeof u==='string'){" +
    "if(u===hO||u.lastIndexOf(hOP,0)===0){" +
    // When a proxy base is configured, rewrite to same-origin
    // proxy path instead of cross-origin remote URL.
    // e.g. http://host:3000/about → http://host:3000/__vf/about
    "var r=pB!==null" +
    "?hO+pB+u.substring(hO.length)" +
    ":bOr+u.substring(hO.length);" +
    "return r" +
    "}" +
    "}" +
    "return u" +
    "}" +
    "window.fetch=function(u,o){" +
    // Handle URL objects (Next.js passes URL objects to fetch)
    "if(typeof u==='object'&&u!==null&&typeof u.href==='string'&&!(u instanceof Request)){" +
    "u=__vfRewriteUrl(u.href)" +
    "}else if(typeof u==='string')u=__vfRewriteUrl(u);" +
    "else if(u instanceof Request){" +
    "var ru=__vfRewriteUrl(u.url);" +
    "if(ru!==u.url)u=new Request(ru,u)" +
    "}" +
    "return oF(u,o)" +
    "};" +
    // ── XMLHttpRequest shim ──
    // Same host→remote rewrite for XHR (some frameworks/polyfills
    // use XHR instead of fetch).
    "var xO=XMLHttpRequest.prototype.open;" +
    "XMLHttpRequest.prototype.open=function(m,u){" +
    "var r=__vfRewriteUrl(u);" +
    "arguments[1]=r;" +
    "return xO.apply(this,arguments)" +
    "};" +
    // ── History shim ──
    // The <base> tag resolves relative URLs against the remote origin,
    // which causes pushState/replaceState to throw a SecurityError
    // (cross-origin URL).  We patch History.prototype (not just the
    // instance) so even code that captures History.prototype.pushState
    // directly (e.g. Next.js) goes through our rewriting.
    "var H=history;" +
    "var HP=History.prototype;" +
    "var oR=HP.replaceState,oP=HP.pushState;" +
    "function __vfFixHistUrl(u){" +
    "if(u==null)return u;" +
    "try{" +
    "var resolved=new O(String(u),b);" +
    "if(resolved.origin!==hO){" +
    "var fixed=hO+resolved.pathname+resolved.search+resolved.hash;" +
    "return fixed" +
    "}" +
    "}catch(e){}" +
    "return u" +
    "}" +
    "HP.replaceState=function(s,t,u){" +
    "var fu=__vfFixHistUrl(u);" +
    "try{return oR.call(this,s,t,fu)}catch(e){}" +
    "};" +
    "HP.pushState=function(s,t,u){" +
    "var fu=__vfFixHistUrl(u);" +
    "try{return oP.call(this,s,t,fu)}catch(e){}" +
    "};" +
    // ── Location fix ──
    // Set the iframe's pathname to match the remote page so that
    // framework routers (e.g. Next.js) see the expected URL during
    // hydration.  Uses the original replaceState directly with an
    // absolute same-origin URL.
    "(function(){" +
    "var bU=new O(b);" +
    "var target=hO+bU.pathname+bU.search+bU.hash;" +
    "try{oR.call(H,{},'',target)}catch(e){}" +
    "})();" +
    // ── Navigation guard ──
    "function __vfNav(u){" +
    "window.parent.postMessage({type:'__vf:navigate',url:String(u)},'*')" +
    "}" +
    "var L=location;" +
    // ── location.href setter interception ──
    // When the Router sets location.href to a cross-origin URL (resolved
    // via <base>), the browser does a hard navigation.  We intercept
    // the href setter to rewrite cross-origin URLs to same-origin.
    "try{" +
    "var hrefDesc=Object.getOwnPropertyDescriptor(Location.prototype,'href');" +
    "if(hrefDesc&&hrefDesc.set){" +
    "var origHrefSet=hrefDesc.set;" +
    "Object.defineProperty(Location.prototype,'href',{" +
    "get:hrefDesc.get," +
    "set:function(v){" +
    "var fixed=__vfFixHistUrl(v);" +
    "origHrefSet.call(this,fixed)" +
    "}," +
    "configurable:true,enumerable:true" +
    "});" +
    "}" +
    "}catch(e){}" +
    // location.assign/replace/reload
    "try{" +
    "Object.defineProperty(Location.prototype,'assign',{configurable:true,value:function(u){" +
    "var fixed=__vfFixHistUrl(u);" +
    "origHrefSet.call(this,fixed)" +
    "}});" +
    "Object.defineProperty(Location.prototype,'replace',{configurable:true,value:function(u){" +
    "var fixed=__vfFixHistUrl(u);" +
    "origHrefSet.call(this,fixed)" +
    "}});" +
    "Object.defineProperty(Location.prototype,'reload',{configurable:true,value:function(){" +
    "origHrefSet.call(this,L.href)" +
    "}});" +
    "}catch(e){}" +
    // ── Navigation API: patch navigate() to rewrite URLs ──
    // navigation.navigate('/about') resolves against <base> to
    // http://remote:3001/about (cross-origin) → SecurityError.
    // Rewrite to same-origin before calling the real navigate().
    "if(typeof navigation!=='undefined'){" +
    "try{" +
    "var oNav=navigation.navigate.bind(navigation);" +
    "navigation.navigate=function(u,opts){" +
    "var fixed=__vfFixHistUrl(u);" +
    "return oNav(fixed,opts)" +
    "};" +
    "}catch(x){}" +
    // Event listener as a safety net for any remaining navigations
    "try{navigation.addEventListener('navigate',function(e){" +
    "try{" +
    "var dest=e.destination.url;" +
    "var destOrigin=new O(dest).origin;" +
    "if(e.hashChange||e.destination.sameDocument)return;" +
    "if(!e.canIntercept&&destOrigin!==hO){" +
    "e.preventDefault()" +
    "}" +
    "}catch(x){}" +
    "})}catch(x){}" +
    "}" +
    "})()</" +
    "script>"
  );
}

// Helper: detect MediaStream across iframe realms (instanceof fails cross-realm)
function _isMediaStream(obj: unknown): obj is MediaStream {
  return (
    !!obj &&
    typeof (obj as MediaStream).getTracks === "function" &&
    typeof (obj as MediaStream).getAudioTracks === "function"
  );
}

export interface VirtualFrameOptions {
  /** Shadow DOM mode. `"open"` or `"closed"` to enable shadow DOM isolation. */
  isolate?: "open" | "closed";
  /** CSS selector to project only a matching subtree of the iframe content. */
  selector?: string;
  /**
   * Frames-per-second for canvas/video snapshot streaming.
   * Pass a number to apply to all media elements, or a
   * `{ selector: fps }` map for per-element control.
   * @default 5
   */
  streamingFps?: number | Record<string, number>;
}

interface ActiveStream {
  canvas?: HTMLCanvasElement;
  video?: HTMLVideoElement;
  stream?: MediaStream;
  interval?: ReturnType<typeof setInterval>;
  cleanup?: () => void;
  poll?: ReturnType<typeof setInterval>;
  timeout?: ReturnType<typeof setTimeout>;
  rafId?: number;
}

// Augment HTMLElement to allow storing closed shadow root reference
declare global {
  interface HTMLElement {
    __virtualFrameShadowRoot?: ShadowRoot;
  }
}

export class VirtualFrame {
  iframe: HTMLIFrameElement;
  host: HTMLElement;
  isolate: "open" | "closed" | undefined;
  selector: string | null;
  streamingFps: number | Record<string, number> | undefined;
  elementMap: WeakMap<Node, Node>;
  reverseElementMap: WeakMap<Node, Node>;
  observer: MutationObserver | null;
  shadowRoot: ShadowRoot | null;
  renderRoot: ShadowRoot | HTMLElement | null;
  shadowBody: HTMLElement | null;
  isInitialized: boolean;
  mutationQueue: MutationRecord[];
  processingMutations: boolean;
  activeStreams: ActiveStream[];
  _onIframeLoad: (() => void) | null;
  _mirrorGen: number;
  _crossOrigin: boolean;
  _bridgeChannel: string | null;
  _remoteIdToNode: Map<number, Node>;
  _nodeToRemoteId: WeakMap<Node, number>;
  _onMessage: ((e: MessageEvent) => void) | null;
  _injectedJSFonts: FontFace[];
  _reiniting: boolean;
  _baseUrl: string | null;
  _onNavigateMessage: ((e: MessageEvent) => void) | null;
  _remirrorTimer: ReturnType<typeof setTimeout> | null;
  _cssomCleanup: (() => void) | null;
  /**
   * True when a selector-based instance has bailed on a snapshot because
   * the selector didn't match.  In this state the shadow root holds the
   * last-known-good mirror; incoming `vf:css` and `vf:mutations` messages
   * are ignored so the preserved content isn't wiped or corrupted.
   */
  _selectorFrozen: boolean;
  /**
   * Remote-ids of every node along the projected ancestor path (from
   * body down to and including the matched element).  Used to detect
   * when a mutation batch would remove any ancestor of the match, which
   * indicates the selector target is being torn down (e.g. SPA route
   * change) — in which case we freeze instead of applying the mutation.
   */
  _selectorPathIds: Set<unknown>;
  /**
   * Same-origin analogue of `_selectorPathIds`: the actual source iframe
   * DOM nodes along the ancestor path from body → matched element.  Used
   * by `handleChildListMutation` to detect when a SPA navigation removes
   * any node on the projected path and freeze instead of applying the
   * mutation (which would wipe our preserved subtree).
   */
  _selectorSourcePathNodes: Set<Node>;
  /** Source iframe node currently matched by `selector` (same-origin). */
  _selectorSourceMatch: Node | null;

  constructor(
    iframe: HTMLIFrameElement,
    host: HTMLElement,
    { isolate, selector, streamingFps }: VirtualFrameOptions = {},
  ) {
    _vflog("constructor", { iframe, host, isolate, selector, streamingFps });
    this.iframe = iframe;
    this.host = host;
    this.isolate = isolate; // "closed" | "open" | falsy
    this.selector = selector || null; // CSS selector to project a subset of the iframe
    this.streamingFps = streamingFps ?? undefined; // number, { selector: fps } map, or undefined (smooth)
    this.elementMap = new WeakMap();
    this.reverseElementMap = new WeakMap();
    this.observer = null;
    this.shadowRoot = null;
    this.renderRoot = null; // shadow root or host element
    this.shadowBody = null;
    this.isInitialized = false;
    this.mutationQueue = [];
    this.processingMutations = false;
    this.activeStreams = []; // track captureStream() streams for cleanup
    this._onIframeLoad = null; // navigation listener
    this._mirrorGen = 0; // generation counter — incremented on each mirror pass

    // Cross-origin state
    this._crossOrigin = false;
    this._bridgeChannel = null;
    this._remoteIdToNode = new Map(); // bridge node-id → local DOM node
    this._nodeToRemoteId = new WeakMap(); // local DOM node → bridge node-id
    this._onMessage = null;
    this._injectedJSFonts = [];
    this._reiniting = false;
    this._baseUrl = null; // set during init from iframe's baseURI
    this._onNavigateMessage = null;
    this._remirrorTimer = null;
    this._cssomCleanup = null;
    this._selectorFrozen = false;
    this._selectorPathIds = new Set();
    this._selectorSourcePathNodes = new Set();
    this._selectorSourceMatch = null;

    this.init();
  }

  // Getter for accessing closed shadow root
  getShadowRoot() {
    return this.shadowRoot;
  }

  async init() {
    _vflog("init() start");
    try {
      // Detect cross-origin
      this._crossOrigin = this._isCrossOrigin();
      _vflog("crossOrigin =", this._crossOrigin);

      // Create render root — shadow DOM when isolate is set, otherwise host element
      if (this.isolate) {
        this.shadowRoot =
          this.shadowRoot ||
          this.host.shadowRoot ||
          this.host.__virtualFrameShadowRoot ||
          this.host.attachShadow({ mode: this.isolate });
        this.host.__virtualFrameShadowRoot = this.shadowRoot;
        this.renderRoot = this.shadowRoot;
      } else {
        this.renderRoot = this.host;
      }

      // Make the host a CSS container so that viewport-relative units
      // (rewritten to container query units) resolve against the virtual
      // frame's dimensions instead of the browser viewport.
      // Skip when using a selector — projected fragments don't need this
      // and it would require the host to have explicit dimensions.
      if (!this.selector) {
        this.host.style.containerType = "inline-size";
      }

      if (this._crossOrigin) {
        _vflog("init → _initCrossOrigin");
        await this._initCrossOrigin();
      } else {
        _vflog("init → _initSameOrigin");
        await this._initSameOrigin();
      }
      _vflog("init() done");
    } catch (error) {
      console.error("VirtualFrame: Initialization failed:", error);
    }
  }

  _isCrossOrigin() {
    // Check src URL first — before the iframe loads, contentDocument is
    // the initial about:blank (same-origin) even for cross-origin src.
    try {
      const src = this.iframe.src;
      if (src && src !== "about:blank") {
        const iframeOrigin = new URL(src, location.href).origin;
        if (iframeOrigin !== location.origin) return true;
      }
    } catch {}

    // Same-origin src (or no src) — verify via direct DOM access
    try {
      const doc = this.iframe.contentDocument;
      if (doc) return false;
    } catch {
      return true; // SecurityError → cross-origin
    }

    return false;
  }

  async _initSameOrigin() {
    _vflog("_initSameOrigin() start");
    // Wait for iframe to be accessible
    await this.waitForIframeReady();
    _vflog("_initSameOrigin() iframe ready");

    // Listen for subsequent navigations (MPA) to re-mirror.
    // Register BEFORE mirroring so a fast iframe reload (cached) doesn't
    // fire before we're listening — which would cause a missed re-init or
    // a double mirrorContent() race.
    //
    // For document.write iframes the first load event fires when
    // resources finish loading (not a navigation).  Calling
    // _reinitOnNavigation on it is harmless: the generation counter in
    // mirrorContent() ensures only the latest pass completes, and
    // delegated event listeners live on the renderRoot (not per-element),
    // so stale WeakMap references don't break click handlers.
    this._onIframeLoad = () => {
      this._reinitOnNavigation();
    };
    this.iframe.addEventListener("load", this._onIframeLoad);

    // DEBUG: listen for beforeunload inside the iframe to catch
    // the exact moment something triggers a full navigation.
    try {
      this.iframe.contentWindow!.addEventListener("beforeunload", () => {});
    } catch {}

    // Listen for navigation requests from the iframe's env shim.
    // When a hard navigation is attempted inside the iframe (e.g.
    // location.href = '/about', or the Navigation API fires a
    // cross-document navigate event), the env shim forwards the URL
    // via postMessage instead of actually navigating (which would break
    // same-origin).  We fetch the new page and re-inject via
    // document.write.
    if (!this._onNavigateMessage) {
      this._onNavigateMessage = (e: MessageEvent) => {
        if (e.source === this.iframe.contentWindow && e.data?.type === "__vf:navigate") {
          this._navigateIframe(e.data.url);
        }
      };
      window.addEventListener("message", this._onNavigateMessage);
    }

    // Set up mutation observer FIRST - before mirroring content
    this.setupMutationObserver();
    _vflog("_initSameOrigin() observer set up, calling mirrorContent");

    // Patch top-layer methods in the iframe's realm so showModal / show /
    // close / showPopover / hidePopover / togglePopover on a source node
    // also fire on its mirror in the host shadow root.  Must run inside
    // the iframe's window so the prototypes patched are the source's own.
    this._installSameOriginTopLayerInterception();

    // Mirror whatever content is available now - mutation observer will handle the rest
    await this.mirrorContent();

    this.isInitialized = true;
    _vflog("_initSameOrigin() DONE, isInitialized=true");
  }

  /**
   * Same-origin equivalent of the bridge's setupTopLayerInterception().
   *
   * The cross-origin path patches prototypes from inside the iframe (the
   * bridge runs there).  For same-origin, the host has direct access to
   * the iframe's window and can wrap the prototypes itself, avoiding a
   * postMessage round-trip and any node-identity serialisation — the
   * wrapper closure captures the source node reference and looks up the
   * mirror via `this.elementMap` directly.
   *
   * Idempotent per iframe window: the first install tags the window via
   * `__vfTopLayerPatched` so subsequent calls (e.g. after an MPA reload
   * that reuses the same window) are no-ops.  For a fresh window the flag
   * isn't present and we patch anew.
   */
  _installSameOriginTopLayerInterception() {
    const win = this.iframe?.contentWindow as any;
    if (!win || win.__vfTopLayerPatched) return;

    const DIALOG_METHODS = ["showModal", "show", "close"] as const;
    const POPOVER_METHODS = ["showPopover", "hidePopover", "togglePopover"] as const;
    const SUPPRESS = Symbol.for("__vfTopLayerSuppress");
    // WeakSet-style token stored per mirror node to prevent re-entry:
    // when we call mirror.close() in response to source.close(), the
    // mirror's own close listener must not echo back to the source.
    const suppressed = new WeakSet<object>();
    const elementMap = this.elementMap;
    const attachCloseMirror = this._attachSameOriginCloseMirror.bind(this);

    const wrap = (proto: any, method: string, isOpener: boolean) => {
      const original = proto[method];
      if (typeof original !== "function") return;
      proto[method] = function (...args: unknown[]) {
        const result = original.apply(this, args);
        if (!(this as any)[SUPPRESS]) {
          const mirror = elementMap.get(this as Node) as any;
          if (mirror && typeof mirror[method] === "function") {
            suppressed.add(mirror);
            try {
              mirror[method](...args);
            } catch {
              // Source and mirror out of sync — ignore.
            } finally {
              suppressed.delete(mirror);
            }
            if (isOpener) attachCloseMirror(mirror, this as Node, method);
          }
        }
        return result;
      };
    };

    const HTMLDialogElement = win.HTMLDialogElement;
    if (HTMLDialogElement) {
      for (const m of DIALOG_METHODS) {
        wrap(HTMLDialogElement.prototype, m, m === "showModal" || m === "show");
      }
    }
    const HTMLElement = win.HTMLElement;
    if (HTMLElement) {
      for (const m of POPOVER_METHODS) {
        wrap(HTMLElement.prototype, m, m === "showPopover" || m === "togglePopover");
      }
    }

    // Store so the close-mirror can flip the suppress flag on sources.
    (this as any)._topLayerSuppressSymbol = SUPPRESS;
    (this as any)._topLayerSuppressSet = suppressed;
    win.__vfTopLayerPatched = true;
  }

  /**
   * Same-origin reverse direction: when the user dismisses the mirror
   * (ESC, backdrop click, declarative `popovertarget` hide), fire the
   * corresponding close on the source so both sides stay in sync.
   */
  _attachSameOriginCloseMirror(mirror: any, source: Node, method: string) {
    const SUPPRESS = (this as any)._topLayerSuppressSymbol;
    const suppressed = (this as any)._topLayerSuppressSet as WeakSet<object>;
    const isDialog = method === "showModal" || method === "show";

    if (isDialog) {
      const onClose = () => {
        mirror.removeEventListener("close", onClose);
        if (suppressed.has(mirror)) return;
        (source as any)[SUPPRESS] = true;
        try {
          (source as any).close(mirror.returnValue);
        } catch {
          // ignore
        } finally {
          (source as any)[SUPPRESS] = false;
        }
      };
      mirror.addEventListener("close", onClose);
    } else {
      const onToggle = (e: any) => {
        if (e.newState !== "closed") return;
        mirror.removeEventListener("toggle", onToggle);
        if (suppressed.has(mirror)) return;
        (source as any)[SUPPRESS] = true;
        try {
          (source as any).hidePopover();
        } catch {
          // ignore
        } finally {
          (source as any)[SUPPRESS] = false;
        }
      };
      mirror.addEventListener("toggle", onToggle);
    }
  }

  // ---------------------------------------------------------------
  // Cross-origin mode: communicate with bridge.js via postMessage
  // ---------------------------------------------------------------

  async _initCrossOrigin() {
    return new Promise<void>((resolve) => {
      let resolved = false;

      this._onMessage = (e) => {
        const d = e.data;
        if (!d || !d.__virtualFrame) return;

        // Only accept messages from our iframe
        if (e.source !== this.iframe.contentWindow) return;

        // vf:ready — bridge announces (or re-announces) its channel.
        // Always accept it: on MPA navigation the bridge sends a fresh
        // channel id, which replaces the previous one.
        if (d.type === "vf:ready" && d.channel) {
          const isNewChannel = this._bridgeChannel !== d.channel;
          this._bridgeChannel = d.channel;

          if (isNewChannel) {
            // New page — reset local DOM state
            this._remoteIdToNode.clear();
            this._nodeToRemoteId = new WeakMap();
          }

          // Acknowledge so the bridge stops retrying
          // Convert streamingFps to interval map for the bridge:
          //   number → { "*": ms }
          //   { sel: fps, ... } → { sel: ms, ... }
          const fps = this.streamingFps;
          let streamingIntervals;
          if (typeof fps === "number") {
            streamingIntervals = { "*": Math.round(1000 / fps) };
          } else if (fps && typeof fps === "object") {
            streamingIntervals = {} as Record<string, number>;
            for (const [sel, f] of Object.entries(fps)) {
              streamingIntervals[sel] = Math.round(1000 / f);
            }
          }
          this._sendToBridge("vf:ack", { streamingIntervals });
          // Request a full snapshot
          this._sendToBridge("vf:requestSnapshot");
          return;
        }

        // Ignore messages from other channels
        if (d.channel !== this._bridgeChannel) return;

        switch (d.type) {
          case "vf:snapshot":
            this._handleSnapshot(d);
            this.isInitialized = true;
            if (!resolved) {
              resolved = true;
              resolve();
            }
            break;
          case "vf:mutations":
            if (this._selectorFrozen) {
              // Still watch for the selector target re-appearing via SPA
              // navigation.  If any added node matches our selector,
              // request a fresh snapshot which will unfreeze us.
              if (this.selector) {
                for (const m of d.mutations) {
                  if (m.type === "childList" && m.added?.length) {
                    if (_descriptorMatchesSelector(m.added, this.selector)) {
                      _vflog(
                        `_handleSnapshot(frozen): selector "${this.selector}" reappeared — requesting snapshot`,
                      );
                      this._sendToBridge("vf:requestSnapshot");
                      break;
                    }
                  }
                }
              }
              break;
            }
            this._handleRemoteMutations(d.mutations);
            break;
          case "vf:css":
            if (this._selectorFrozen) break;
            this._handleRemoteCSS(d.css);
            break;
          case "vf:canvasFrame": {
            // Update <img> mirror for canvas/video frames
            const img = this._remoteIdToNode.get(d.targetId) as HTMLElement | undefined;
            if (img && img.tagName === "IMG") {
              (img as HTMLImageElement).src = d.dataURL;
            }
            break;
          }
          case "vf:formUpdate": {
            // Bridge form element value changed — update mirrored element
            const el = this._remoteIdToNode.get(d.targetId) as HTMLInputElement | undefined;
            if (el) {
              if (d.value !== undefined) el.value = d.value;
              if (d.checked !== undefined) el.checked = d.checked;
            }
            break;
          }
          case "vf:scrollUpdate": {
            // Bridge element scrolled — update mirrored element
            const el = this._remoteIdToNode.get(d.targetId) as HTMLElement | undefined;
            if (el) {
              (el as any)._vfScrollFromBridge = true;
              const maxY = el.scrollHeight - el.clientHeight;
              const maxX = el.scrollWidth - el.clientWidth;
              el.scrollTop = (d.pctY ?? 0) * maxY;
              el.scrollLeft = (d.pctX ?? 0) * maxX;
            }
            break;
          }
          case "vf:eventResult":
            break;
          case "vf:invokeMethod": {
            // Mirror a top-layer method call from the source onto the
            // projected clone.  This is how the clone actually enters the
            // host document's top layer (showModal, showPopover etc.) —
            // setting the `open` attribute alone would not promote it.
            const el = this._remoteIdToNode.get(d.targetId) as any;
            if (!el || typeof el[d.method] !== "function") break;
            try {
              el[d.method](...(d.args || []));
            } catch {
              // InvalidStateError etc. — source and clone are out of sync;
              // swallow rather than throw in the message handler.
              break;
            }
            // For "open" methods, wire the reverse direction so that
            // closing the clone (ESC, backdrop click, close button proxied
            // through event replay that didn't close the source) keeps
            // the source in sync.  Without this, the source stays open
            // and the next showModal() throws InvalidStateError.
            this._attachTopLayerCloseMirror(el, d.targetId, d.method);
            break;
          }
        }
      };
      window.addEventListener("message", this._onMessage);
    });
  }

  /**
   * After the clone has been promoted to the top layer, attach one-shot
   * listeners that echo a close back to the source when the user dismisses
   * the clone from the host side.
   *
   *   <dialog>:  `close` event  → source.close(returnValue)
   *   popover:   `toggle` event → source.hidePopover() when newState = "closed"
   */
  _attachTopLayerCloseMirror(el: any, targetId: number, method: string) {
    const isDialogOpen = method === "showModal" || method === "show";
    const isPopoverOpen = method === "showPopover" || method === "togglePopover";
    if (!isDialogOpen && !isPopoverOpen) return;

    if (isDialogOpen) {
      const onClose = () => {
        el.removeEventListener("close", onClose);
        this._sendToBridge("vf:invokeMethod", {
          targetId,
          method: "close",
          args: el.returnValue != null ? [el.returnValue] : [],
        });
      };
      el.addEventListener("close", onClose);
    } else {
      const onToggle = (e: any) => {
        if (e.newState !== "closed") return;
        el.removeEventListener("toggle", onToggle);
        this._sendToBridge("vf:invokeMethod", {
          targetId,
          method: "hidePopover",
          args: [],
        });
      };
      el.addEventListener("toggle", onToggle);
    }
  }

  _sendToBridge(type: string, payload: Record<string, unknown> = {}) {
    if (!this._bridgeChannel) return;
    this.iframe.contentWindow?.postMessage(
      { __virtualFrame: true, channel: this._bridgeChannel, type, ...payload },
      "*",
    );
  }

  async waitForIframeReady() {
    _vflog("waitForIframeReady() start");
    return new Promise<void>((resolve, reject) => {
      const isContentReady = () => {
        try {
          return (
            this.iframe.contentDocument &&
            this.iframe.contentDocument.documentElement &&
            this.iframe.contentDocument.documentElement.nodeType === Node.ELEMENT_NODE &&
            this.iframe.contentDocument.body &&
            this.iframe.contentDocument.body.children.length > 0
          );
        } catch {
          return false;
        }
      };

      // If the iframe already has real content, resolve immediately
      if (isContentReady()) {
        _vflog("waitForIframeReady → already ready");
        resolve();
        return;
      }
      _vflog("waitForIframeReady → waiting for load event");

      // Otherwise wait for the load event
      this.iframe.addEventListener(
        "load",
        () => {
          setTimeout(() => {
            try {
              if (isContentReady()) {
                resolve();
              } else {
                console.error("VirtualFrame: Document still not ready after load");
                reject(new Error("Iframe document not ready after load event"));
              }
            } catch (e) {
              console.error("VirtualFrame: Error accessing document after load:", e);
              reject(e);
            }
          }, 10);
        },
        { once: true },
      );
    });
  }

  async mirrorContent() {
    // Bump generation — any in-flight mirror from a previous generation
    // will detect the mismatch and bail out after its next await.
    const gen = ++this._mirrorGen;
    _vflog(`mirrorContent() start  gen=${gen}`);

    try {
      const iframeDoc = this.iframe.contentDocument;

      if (!iframeDoc) {
        _vfwarn("mirrorContent: no iframe document");
        return;
      }

      // Determine the remote base URL for URL rewriting.
      // The iframe's baseURI is set by the <base href> tag injected
      // during SSR — it always points to the remote origin.
      if (!this._baseUrl) {
        const base = iframeDoc.baseURI;
        if (base && base !== "about:blank" && base !== "about:srcdoc") {
          this._baseUrl = base;
        }
      }

      const iframeBody = iframeDoc.body;

      // When using a selector, check whether it matches BEFORE clearing
      // CSS or the render root.  If the new page doesn't contain the
      // projected element, preserve the existing content.
      if (this.selector && iframeBody) {
        const probe = iframeBody.querySelector(this.selector);
        if (!probe) {
          _vflog(
            `mirrorContent: selector "${this.selector}" not in iframe — keeping existing content`,
          );
          return;
        }
      }

      // Copy all CSS from iframe (this can work even without body)
      // Await ensures styles are injected before content renders (prevents FOUC)
      await this.copyIframeCSS();
      _vflog(`mirrorContent() CSS copied  gen=${gen}  current=${this._mirrorGen}`);

      // Stale? A newer mirrorContent superseded us (e.g. iframe reloaded).
      if (gen !== this._mirrorGen) {
        _vfwarn(
          `mirrorContent() STALE after CSS copy — bailing (gen=${gen}, current=${this._mirrorGen})`,
        );
        return;
      }

      if (!iframeBody) {
        return;
      }

      // Always clone the full iframe body.  When a selector is set we
      // prune the clone afterwards to keep only the ancestor chain from
      // body → match (and match's descendants).  This preserves Angular
      // component host elements and their view-encapsulation attributes
      // (_nghost-*/_ngcontent-*) so that scoped CSS continues to work.
      if (this.selector) {
        const sourceMatch = iframeBody.querySelector(this.selector);
        if (!sourceMatch) {
          console.warn(`VirtualFrame: selector "${this.selector}" matched nothing in iframe`);
          return;
        }
      }

      // Clear shadow root content (but keep the styles that were just copied)
      const stylesToKeep = Array.from(
        this.renderRoot!.querySelectorAll(
          "style[data-iframe-stylesheet], style[data-iframe-inline-style], link[data-iframe-stylesheet], link[data-vf-head-link], style[data-vf-head-style]",
        ),
      );
      this.renderRoot!.innerHTML = "";
      stylesToKeep.forEach((style) => this.renderRoot!.appendChild(style));

      // Hide content until fonts are ready to prevent FOUC
      const hasFonts = this.isolate && stylesToKeep.length > 0;
      if (hasFonts) {
        // Inject a visibility:hidden rule; will be removed after fonts load
        const hideStyle = document.createElement("style");
        hideStyle.setAttribute("data-vf-hide", "");
        hideStyle.textContent = ":host { visibility: hidden !important; }";
        this.renderRoot!.appendChild(hideStyle);
      }

      // Clone the full body
      _vflog(
        `mirrorContent() cloning source element <${iframeBody.tagName}> children=${iframeBody.children.length}`,
      );
      const clonedBody = this.cloneElementStructure(iframeBody);

      // If a selector is set, prune the clone to only the ancestor
      // chain from body down to the matched element.
      if (this.selector) {
        const match = (clonedBody as Element).querySelector(this.selector);
        if (match) {
          const ancestorPath = new Set<Node>();
          let cursor: Node | null = match;
          while (cursor && cursor !== clonedBody) {
            ancestorPath.add(cursor);
            cursor = cursor.parentNode;
          }
          ancestorPath.add(clonedBody);

          const prune = (node: Node) => {
            if (node === match) return;
            const children = Array.from(node.childNodes);
            for (const child of children) {
              if (ancestorPath.has(child)) {
                prune(child);
              } else {
                node.removeChild(child);
              }
            }
          };
          prune(clonedBody);
        }

        // Record the SOURCE (iframe) ancestor path — used by
        // handleChildListMutation to detect SPA navigations that tear
        // down the projected subtree.
        const sourceMatch = iframeBody.querySelector(this.selector);
        const sourcePath = new Set<Node>();
        if (sourceMatch) {
          let cursor: Node | null = sourceMatch;
          while (cursor && cursor !== iframeBody) {
            sourcePath.add(cursor);
            cursor = cursor.parentNode;
          }
          sourcePath.add(iframeBody);
        }
        this._selectorSourcePathNodes = sourcePath;
        this._selectorSourceMatch = sourceMatch;
        this._selectorFrozen = false;
      }

      this.shadowBody = clonedBody as HTMLElement;
      this.renderRoot!.appendChild(clonedBody);
      _vflog(`mirrorContent() cloned body appended to renderRoot`);

      // Set up event proxying and form element synchronization
      _vflog(`mirrorContent() setupEventProxying...`);
      this.setupEventProxying();
      _vflog(`mirrorContent() setupEventProxying done`);

      // Clean up any inline event handlers that might have been copied
      this.cleanupInlineEventHandlers();
      _vflog(`mirrorContent() cleanupInlineEventHandlers done, hasFonts=${hasFonts}`);

      // Reveal content once fonts have loaded (or after a timeout)
      if (hasFonts) {
        const reveal = () => {
          const h = this.renderRoot!.querySelector("style[data-vf-hide]");
          if (h) h.remove();
        };
        // Wait for font loads triggered by the newly-injected content
        _vflog(`mirrorContent() awaiting document.fonts.ready...`);
        try {
          await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
        } catch {}
        _vflog(`mirrorContent() fonts ready (or timed out)`);
        // Stale? Don't reveal if a newer mirror has taken over.
        if (gen !== this._mirrorGen) {
          _vfwarn(
            `mirrorContent() STALE after fonts — bailing (gen=${gen}, current=${this._mirrorGen})`,
          );
          return;
        }
        reveal();
      }
      _vflog(
        `mirrorContent() DONE  gen=${gen}  document.readyState=${document.readyState}  iframe.readyState=${this.iframe.contentDocument?.readyState}`,
      );
      // Log when states change
      if (document.readyState !== "complete") {
        const _onStateChange = () => {
          _vflog(`document.readyState changed to: ${document.readyState}`);
          if (document.readyState === "complete")
            document.removeEventListener("readystatechange", _onStateChange);
        };
        document.addEventListener("readystatechange", _onStateChange);
      }
      // Log video element states in shadow DOM
      setTimeout(() => {
        if (!this.renderRoot) return;
        const videos = this.renderRoot.querySelectorAll("video");
        for (const v of videos) {
          _vflog(
            `mirror-video id=${v.id || "?"} networkState=${v.networkState} readyState=${v.readyState} paused=${v.paused} srcObject=${!!v.srcObject}`,
          );
        }
        _vflog(
          `document.readyState=${document.readyState}  iframe.readyState=${this.iframe.contentDocument?.readyState}`,
        );
      }, 2000);
    } catch (error) {
      console.error("IframeMirror: Error in mirrorContent:", error);
    }
  }

  async copyIframeCSS() {
    const iframeDoc = this.iframe.contentDocument;

    // If the iframe has no CSS rules yet (e.g. Vite dev — CSS is loaded
    // via JS modules that populate CSSOM asynchronously), preserve the
    // existing shadow DOM styles (SSR-extracted CSS) rather than clearing
    // to an empty state.
    const iframeHasCSSRules =
      iframeDoc &&
      Array.from(iframeDoc.styleSheets).some((sheet) => {
        try {
          return sheet.cssRules.length > 0;
        } catch {
          // Cross-origin sheet — treat as having content
          return true;
        }
      });
    if (!iframeHasCSSRules) {
      return;
    }

    // Clear existing styles first to avoid duplicates
    const existingStyles = this.renderRoot!.querySelectorAll("style, link");
    existingStyles.forEach((style) => style.remove());

    if (this.isolate) {
      // In shadow DOM mode, @font-face rules register globally (browser
      // behaviour) which causes font leaking. We namespace font-family names
      // with a "__vf_" prefix so the host page cannot accidentally match them.
      await this._copyIframeCSSIsolated(iframeDoc!);
    } else {
      // Non-isolated: copy everything as-is
      this._copyIframeCSSNormal(iframeDoc!);
    }

    // Always mirror <link>/<style> DOM elements from the iframe's head
    // as a fallback.  CSSOM-based copying above may fail for cross-origin
    // stylesheets (cssRules throws, fetch may also fail).  Cloning the
    // actual <link> elements lets the browser load them natively without
    // CORS restrictions.  Duplicate CSS rules from both paths are harmless
    // (same rules, same cascade result).
    this._mirrorIframeHeadStyles(iframeDoc!);
  }

  /**
   * Clone `<link rel="stylesheet">` and `<style>` elements from the
   * iframe's document into the shadow DOM.
   *
   * Unlike the CSSOM-based `_copyIframeCSSNormal` / `_copyIframeCSSIsolated`,
   * this works even for cross-origin stylesheets because the browser loads
   * `<link>` elements natively without CORS restrictions.
   *
   * Elements are marked with `data-vf-head-link` / `data-vf-head-style`
   * so they can be preserved across re-mirrors and distinguished from
   * CSSOM-inlined styles.
   */
  _mirrorIframeHeadStyles(iframeDoc: Document) {
    if (!iframeDoc) return;

    // Remove previously mirrored head styles to avoid stale duplicates
    this.renderRoot!.querySelectorAll("link[data-vf-head-link], style[data-vf-head-style]").forEach(
      (el) => el.remove(),
    );

    // Clone <link rel="stylesheet"> elements
    iframeDoc.querySelectorAll('link[rel="stylesheet"]').forEach((link, i) => {
      const clone = link.cloneNode(true) as HTMLLinkElement;
      // Resolve href to absolute URL using the iframe's base URI
      // (the <base> tag points to the remote origin).
      const rawHref = link.getAttribute("href");
      if (rawHref) {
        try {
          clone.href = new URL(rawHref, iframeDoc.baseURI).href;
        } catch {}
      }
      clone.setAttribute("data-vf-head-link", String(i));
      this.renderRoot!.appendChild(clone);
    });

    // Clone <style> elements
    iframeDoc.querySelectorAll("style").forEach((styleEl, i) => {
      const clone = document.createElement("style");
      clone.textContent = _rewriteCSS(styleEl.textContent ?? "");
      clone.setAttribute("data-vf-head-style", String(i));
      this.renderRoot!.appendChild(clone);
    });
  }

  _copyIframeCSSNormal(iframeDoc: Document) {
    Array.from(iframeDoc.styleSheets).forEach((styleSheet: CSSStyleSheet, index: number) => {
      try {
        const styleElement = document.createElement("style");
        styleElement.type = "text/css";
        styleElement.setAttribute("data-iframe-stylesheet", String(index));
        let cssText = "";

        Array.from(styleSheet.cssRules || (styleSheet as any).rules).forEach((rule: CSSRule) => {
          cssText += rule.cssText + "\n";
        });

        styleElement.textContent = _rewriteCSS(cssText);
        this.renderRoot!.appendChild(styleElement);
      } catch (e) {
        console.warn("Cannot access stylesheet:", e);

        if (styleSheet.href) {
          const linkElement = document.createElement("link");
          linkElement.rel = "stylesheet";
          linkElement.type = "text/css";
          linkElement.href = styleSheet.href;
          linkElement.setAttribute("data-iframe-stylesheet", String(index));
          this.renderRoot!.appendChild(linkElement);
        }
      }
    });

    Array.from(iframeDoc.querySelectorAll("style")).forEach((styleEl, index) => {
      const clonedStyle = document.createElement("style");
      clonedStyle.type = "text/css";
      clonedStyle.textContent = _rewriteCSS(styleEl.textContent ?? "");
      clonedStyle.setAttribute("data-iframe-inline-style", String(index));
      this.renderRoot!.appendChild(clonedStyle);
    });
  }

  async _copyIframeCSSIsolated(iframeDoc: Document) {
    // Wait for iframe fonts to finish loading so the font file data is cached.
    // This prevents FOUC: when we re-declare the same font URLs in the shadow
    // root, the browser serves them from cache instead of re-downloading.
    try {
      await iframeDoc.fonts.ready;
    } catch {}

    // Phase 1: Collect all CSS text (fetching CORS-blocked sheets instead of
    // recreating <link>, which would register @font-face globally).
    const cssEntries: Array<{
      cssText: string | null;
      attr: string;
      index: string | number;
    }> = [];
    const fetchPromises: Promise<void>[] = [];

    Array.from(iframeDoc.styleSheets).forEach((styleSheet: CSSStyleSheet, index: number) => {
      try {
        let cssText = "";
        Array.from(styleSheet.cssRules || (styleSheet as any).rules).forEach((rule: CSSRule) => {
          cssText += rule.cssText + "\n";
        });
        cssEntries.push({
          cssText,
          attr: "data-iframe-stylesheet",
          index,
        });
      } catch {
        if (styleSheet.href) {
          fetchPromises.push(
            fetch(styleSheet.href, {
              headers: { Accept: "text/css" },
            })
              .then((r) => r.text())
              .then((cssText) => {
                cssEntries.push({
                  cssText,
                  attr: "data-iframe-stylesheet",
                  index: `ext-${index}`,
                });
              })
              .catch((err) => console.warn("VirtualFrame: Cannot fetch stylesheet:", err)),
          );
        }
      }
    });

    Array.from(iframeDoc.querySelectorAll("style")).forEach((styleEl, index) => {
      cssEntries.push({
        cssText: styleEl.textContent,
        attr: "data-iframe-inline-style",
        index,
      });
    });

    // Wait for all external stylesheet fetches
    await Promise.all(fetchPromises);

    // Phase 2: Collect @font-face font-family names across ALL collected CSS
    const fontNames = new Set<string>();
    for (const entry of cssEntries) {
      for (const name of this._extractFontFaceNames(entry.cssText ?? "")) {
        fontNames.add(name);
      }
    }

    // Phase 3: Handle JS-created FontFace objects.
    // These aren't in any stylesheet so CSS namespacing can't cover them.
    // We add them directly to document.fonts (required for shadow DOM access).
    // Their family names are NOT namespaced (can't clone FontFace without
    // source access), so we exclude them from CSS rewriting.
    const jsFontNames = this._addJSFontFaces(iframeDoc, fontNames);

    // Only namespace CSS-declared font names, not JS font names
    const namespaceable = new Set([...fontNames].filter((n) => !jsFontNames.has(n)));

    // Compute a content-based prefix from the @font-face CSS
    const fontPrefix = this._computeFontPrefix(cssEntries);

    // Phase 4: Namespace font references and inject into shadow root
    for (const entry of cssEntries) {
      let css = entry.cssText;
      if (!css) continue;
      if (namespaceable.size > 0) {
        css = this._namespaceFontReferences(css, namespaceable, fontPrefix);
      }
      css = _rewriteCSS(css);
      const styleElement = document.createElement("style");
      styleElement.type = "text/css";
      styleElement.textContent = css;
      styleElement.setAttribute(entry.attr, String(entry.index));
      this.renderRoot!.appendChild(styleElement);
    }
  }

  _addJSFontFaces(iframeDoc: Document, cssFontNames: Set<string>) {
    // Clean up previously injected JS fonts
    if (this._injectedJSFonts) {
      for (const font of this._injectedJSFonts) {
        document.fonts.delete(font);
      }
    }
    this._injectedJSFonts = [];
    const jsFontNames = new Set<string>();

    try {
      for (const font of iframeDoc.fonts) {
        const familyName = font.family.replace(/^['"]|['"]$/g, "");
        if (font.status === "loaded" && !cssFontNames.has(familyName)) {
          // JS-created font — add to document.fonts for shadow DOM access
          jsFontNames.add(familyName);
          let exists = false;
          for (const mainFont of document.fonts) {
            if (
              mainFont === font ||
              (mainFont.family === font.family &&
                mainFont.weight === font.weight &&
                mainFont.style === font.style &&
                mainFont.stretch === font.stretch)
            ) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            document.fonts.add(font);
            this._injectedJSFonts.push(font);
          }
        }
      }
    } catch (e) {
      console.warn("VirtualFrame: Cannot copy JS FontFace entries:", e);
    }

    return jsFontNames;
  }

  _extractFontFaceNames(cssText: string) {
    const names = new Set<string>();
    const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
    let match;
    while ((match = fontFaceRegex.exec(cssText)) !== null) {
      const block = match[1];
      const familyMatch = block.match(/font-family\s*:\s*(['"]?)([^'";\n}]+)\1/i);
      if (familyMatch) {
        names.add(familyMatch[2].trim());
      }
    }
    return names;
  }

  // Compute a short, deterministic font namespace prefix from the actual
  // @font-face CSS content. Same font definitions = same prefix (shared even
  // across different origins); different definitions = different prefix.
  _computeFontPrefix(cssEntries: Array<{ cssText: string | null }>) {
    // Collect all @font-face blocks across every CSS entry
    let fontFaceCSS = "";
    const fontFaceRegex = /@font-face\s*\{[^}]+\}/gi;
    for (const entry of cssEntries) {
      if (!entry.cssText) continue;
      let m;
      while ((m = fontFaceRegex.exec(entry.cssText)) !== null) {
        fontFaceCSS += m[0];
      }
    }
    if (!fontFaceCSS) return "__vf_";
    // djb2 hash of the concatenated @font-face blocks
    let h = 5381;
    for (let i = 0; i < fontFaceCSS.length; i++) {
      h = ((h << 5) + h + fontFaceCSS.charCodeAt(i)) >>> 0;
    }
    return `__vf_${h.toString(16)}_`;
  }

  _namespaceFontReferences(cssText: string, fontNames: Set<string>, prefix: string) {
    let css = cssText;
    for (const name of fontNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Replace double-quoted occurrences
      css = css.replaceAll(`"${name}"`, `"${prefix}${name}"`);
      // Replace single-quoted occurrences
      css = css.replaceAll(`'${name}'`, `'${prefix}${name}'`);
      // Replace unquoted occurrences in font / font-family declarations
      css = css.replace(
        new RegExp(`(font(?:-family)?\\s*:[^;{}]*?)\\b${escaped}\\b(?![\\w-])`, "gi"),
        `$1"${prefix}${name}"`,
      );
    }
    return css;
  }

  cloneElementStructure(element: Element): Node {
    const tagName = element.tagName?.toLowerCase();

    // Replace <body>/<html> with <div data-vf-body> so host page body styles
    // don't bleed in, while rewritten CSS still targets [data-vf-body].
    if (tagName === "body" || tagName === "html") {
      const div = document.createElement("div");
      div.setAttribute("data-vf-body", "");
      // Copy attributes
      for (const attr of element.attributes) {
        if (attr.name.startsWith("on")) continue;
        div.setAttribute(attr.name, _rewriteAttrUrl(attr.name, attr.value, this._baseUrl));
      }
      this.elementMap.set(element, div);
      this.reverseElementMap.set(div, element);
      for (const child of element.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          div.appendChild(this.cloneElementStructure(child as Element));
        } else if (child.nodeType === Node.TEXT_NODE) {
          const clonedTextNode = child.cloneNode(true);
          div.appendChild(clonedTextNode);
          this.elementMap.set(child, clonedTextNode);
          this.reverseElementMap.set(clonedTextNode, child);
        }
      }
      return div;
    }

    // Skip script/noscript — no need to mirror
    if (tagName === "script" || tagName === "noscript") {
      const placeholder = document.createComment(`${tagName} skipped`);
      this.elementMap.set(element, placeholder);
      this.reverseElementMap.set(placeholder, element);
      return placeholder;
    }

    // Special handling for media/canvas elements
    if (tagName === "canvas") {
      _vflog(
        `clone: <canvas id=${element.id || "?"}> w=${(element as HTMLCanvasElement).width} h=${(element as HTMLCanvasElement).height} offsetW=${(element as HTMLElement).offsetWidth} offsetH=${(element as HTMLElement).offsetHeight}`,
      );
      // Create a mirror <canvas> that copies frames via drawImage.
      // This preserves transparency / alpha perfectly (unlike
      // captureStream → <video> which strips alpha via the codec).
      const mirror = document.createElement("canvas");
      mirror.setAttribute("data-mirror-source", "canvas");
      if (element.id) mirror.id = element.id;
      if (element.className) mirror.className = element.className;
      const inlineStyle = element.getAttribute("style");
      if (inlineStyle) mirror.setAttribute("style", inlineStyle);
      this.elementMap.set(element, mirror);
      this.reverseElementMap.set(mirror, element);
      this._deferCanvasMirror(element as HTMLCanvasElement, mirror);
      return mirror;
    }
    if (tagName === "video") {
      _vflog(
        `clone: <video id=${element.id || "?"}> srcObject=${(element as HTMLVideoElement).srcObject} readyState=${(element as HTMLVideoElement).readyState}`,
      );
      try {
        return this.createStreamMirror(element as HTMLVideoElement);
      } catch (e) {
        console.warn(`VirtualFrame: createStreamMirror failed for <video>`, e);
        const placeholder = document.createElement("div");
        placeholder.setAttribute("data-mirror-source", "video");
        this.elementMap.set(element, placeholder);
        this.reverseElementMap.set(placeholder, element);
        return placeholder;
      }
    }
    if (tagName === "audio") {
      return this.createAudioPlaceholder(element as HTMLAudioElement);
    }

    const clone = element.cloneNode(false) as Element;

    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("on")) {
        return;
      }
      clone.setAttribute(attr.name, _rewriteAttrUrl(attr.name, attr.value, this._baseUrl));
    });

    this.elementMap.set(element, clone);
    this.reverseElementMap.set(clone, element);

    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        clone.appendChild(this.cloneElementStructure(child as Element));
      } else if (child.nodeType === Node.TEXT_NODE) {
        const clonedTextNode = child.cloneNode(true);
        clone.appendChild(clonedTextNode);
        this.elementMap.set(child, clonedTextNode);
        this.reverseElementMap.set(clonedTextNode, child);
      }
    }

    // Restore form element values AFTER children are appended so that
    // <select>.value works (needs <option> children to be present first).
    if (this.isFormElement(clone)) {
      const existingMirroredElement = this.elementMap.get(element);

      if (
        existingMirroredElement &&
        existingMirroredElement !== clone &&
        this.isFormElement(existingMirroredElement as Element)
      ) {
        const prev = existingMirroredElement as HTMLInputElement;
        if (prev.type === "checkbox" || prev.type === "radio") {
          (clone as HTMLInputElement).checked = prev.checked;
        } else {
          (clone as HTMLInputElement).value = prev.value;
        }
      }
    }

    return clone;
  }

  /**
   * Defer `fn` until the parent document has finished loading.
   *
   * Setting `video.srcObject = MediaStream` puts the video into
   * networkState NETWORK_LOADING, which blocks `document.readyState`
   * from reaching 'complete' (tab spinner keeps spinning).  By
   * deferring srcObject assignment to after the load event we avoid
   * this.  If the document has already loaded, `fn` runs immediately.
   */
  _afterDocumentLoad(fn: () => void) {
    if (document.readyState === "complete") {
      fn();
    } else {
      _vflog("_afterDocumentLoad() deferring until load event");
      window.addEventListener("load", () => fn(), { once: false });
    }
  }

  /**
   * Resolve the streaming fps for a given element.
   * Returns a number or undefined (smooth / every-frame) based on the
   * streamingFps config.
   */
  _getStreamingFps(element: Element): number | undefined {
    const fps = this.streamingFps;
    if (typeof fps === "number") return fps;
    // { selector: fps } map — check each selector
    if (fps && typeof fps === "object") {
      try {
        for (const [sel, val] of Object.entries(fps)) {
          if (sel === "*" || element.matches?.(sel)) return val;
        }
      } catch {}
    }
    return undefined; // smooth — every painted frame
  }

  /**
   * Mirror a canvas element by copying frames via drawImage.
   *
   * Using drawImage on a mirror <canvas> instead of captureStream →
   * <video> preserves alpha / transparency perfectly.  The source
   * canvas may not have buffer dimensions yet (dynamically sized
   * canvases set `c.width = c.offsetWidth * 2` every frame), so we
   * poll until it is ready, then start a rAF loop that syncs every
   * painted frame.
   *
   * The generation counter (`_mirrorGen`) lets us bail out if a new
   * mirror pass supersedes this one (e.g. iframe reload on page refresh).
   */
  _deferCanvasMirror(canvas: HTMLCanvasElement, mirror: HTMLCanvasElement) {
    const gen = this._mirrorGen;
    let attempts = 0;
    const maxAttempts = 120; // 30 seconds at 250 ms
    const canvasId = canvas.id || "?";
    _vflog(`_deferCanvasMirror(${canvasId}) gen=${gen}`);

    const tryAttach = () => {
      // Bail out if a newer mirror pass has started
      if (gen !== this._mirrorGen) {
        _vfwarn(
          `_deferCanvasMirror(${canvasId}) STALE gen=${gen} current=${this._mirrorGen} — bailing`,
        );
        return;
      }

      attempts++;

      // Wait for the canvas to have real buffer dimensions
      if (!canvas.width || !canvas.height) {
        if (attempts === 1 || attempts % 10 === 0) {
          _vflog(
            `_deferCanvasMirror(${canvasId}) attempt=${attempts} w=${canvas.width} h=${canvas.height} — waiting`,
          );
        }
        if (attempts < maxAttempts) {
          const t = setTimeout(tryAttach, 250);
          this.activeStreams.push({ timeout: t });
        } else {
          _vfwarn(`_deferCanvasMirror(${canvasId}) gave up after ${maxAttempts} attempts`);
        }
        return;
      }

      // Canvas is ready — start the drawImage loop
      _vflog(
        `_deferCanvasMirror(${canvasId}) ready w=${canvas.width} h=${canvas.height} — starting drawImage loop`,
      );
      const ctx = mirror.getContext("2d");

      // Store entry so cleanup can cancel the loop
      const entry = { rafId: 0 };
      this.activeStreams.push(entry);

      const copyFrame = () => {
        if (gen !== this._mirrorGen) return; // stale
        // Sync buffer dimensions if the source canvas resizes
        if (mirror.width !== canvas.width) mirror.width = canvas.width;
        if (mirror.height !== canvas.height) mirror.height = canvas.height;
        try {
          ctx!.clearRect(0, 0, mirror.width, mirror.height);
          ctx!.drawImage(canvas, 0, 0);
        } catch {
          // tainted canvas — bail silently
        }
        entry.rafId = requestAnimationFrame(copyFrame);
      };

      // Defer the first frame copy until after document load so we
      // don't block readyState → complete.
      this._afterDocumentLoad(() => {
        if (gen !== this._mirrorGen) return;
        entry.rafId = requestAnimationFrame(copyFrame);
        _vflog(`_deferCanvasMirror(${canvasId}) ✓ drawImage loop started`);
      });
    };

    _vflog(`_deferCanvasMirror(${canvasId}) scheduling rAF → tryAttach`);
    requestAnimationFrame(tryAttach);
  }

  /**
   * Mirror a <video> element.
   *
   * If the original video already has a MediaStream srcObject (e.g. from
   * a canvas captureStream), we reuse that stream directly instead of
   * creating another captureStream (which chains streams and is very
   * expensive).  For file/blob sources we fall back to captureStream
   * with an fps limit.
   */
  createStreamMirror(originalElement: HTMLVideoElement) {
    const elId = originalElement.id || "?";
    _vflog(
      `createStreamMirror(<video id=${elId}>) srcObj=${!!originalElement.srcObject} readyState=${originalElement.readyState}`,
    );
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "none";
    video.setAttribute("data-mirror-source", "video");

    // Copy id / class / style / dimensions so CSS matches
    if (originalElement.id) video.id = originalElement.id;
    if (originalElement.className) video.className = originalElement.className;
    const inlineStyle = originalElement.getAttribute("style");
    if (inlineStyle) video.setAttribute("style", inlineStyle);
    const w =
      originalElement.getAttribute("width") || originalElement.width || originalElement.offsetWidth;
    const h =
      originalElement.getAttribute("height") ||
      originalElement.height ||
      originalElement.offsetHeight;
    if (w) video.setAttribute("width", String(w));
    if (h) video.setAttribute("height", String(h));

    const attach = () => {
      _vflog(`createStreamMirror(<video id=${elId}>) attach() called`);
      try {
        // If the original already plays a MediaStream, reuse it
        // (avoids expensive chained captureStream calls).
        // Use duck-typing — instanceof fails across iframe realms.
        let stream = _isMediaStream(originalElement.srcObject) ? originalElement.srcObject : null;

        if (stream) {
          _vflog(
            `createStreamMirror(<video id=${elId}>) reusing existing MediaStream  tracks=${stream.getTracks().length}`,
          );
        } else {
          const fps = this._getStreamingFps(originalElement);
          _vflog(
            `createStreamMirror(<video id=${elId}>) calling captureStream(${fps ?? "smooth"})`,
          );
          stream = (originalElement as any).captureStream
            ? fps != null
              ? (originalElement as any).captureStream(fps)
              : (originalElement as any).captureStream()
            : (originalElement as any).mozCaptureStream?.();
        }
        if (!stream) {
          _vfwarn(`createStreamMirror(<video id=${elId}>) no stream available`);
          return;
        }

        this.activeStreams.push({ video, stream });

        // Defer srcObject until after document load so the video's
        // networkState doesn't block readyState → complete.
        this._afterDocumentLoad(() => {
          video.srcObject = stream;
          video.play().catch((e) => {
            _vfwarn(`createStreamMirror(<video id=${elId}>) play() rejected:`, e);
          });
          _vflog(
            `createStreamMirror(<video id=${elId}>) ✓ attached  tracks=${stream.getTracks().length}`,
          );
        });
      } catch (e) {
        _vfwarn(`createStreamMirror(<video id=${elId}>) EXCEPTION`, e);
      }
    };

    // If it already has a live MediaStream, attach now.
    // Otherwise wait for data to load.
    if (_isMediaStream(originalElement.srcObject)) {
      _vflog(`createStreamMirror(<video id=${elId}>) has MediaStream → attach now`);
      attach();
    } else if (originalElement.readyState >= 2) {
      _vflog(
        `createStreamMirror(<video id=${elId}>) readyState=${originalElement.readyState} → attach now`,
      );
      attach();
    } else {
      _vflog(`createStreamMirror(<video id=${elId}>) waiting for loadeddata event`);
      originalElement.addEventListener("loadeddata", attach, { once: true });
    }

    this.elementMap.set(originalElement, video);
    this.reverseElementMap.set(video, originalElement);
    return video;
  }

  /**
   * Replace <audio> with a hidden placeholder — audio is already playing
   * from the original element on the same machine.
   */
  createAudioPlaceholder(originalElement: HTMLAudioElement) {
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-mirror-source", "audio");
    placeholder.style.display = "none";
    this.elementMap.set(originalElement, placeholder);
    this.reverseElementMap.set(placeholder, originalElement);
    return placeholder;
  }

  cleanupInlineEventHandlers() {
    this.renderRoot!.querySelectorAll("*").forEach((element) => {
      const attributesToRemove = [];
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (attr.name.startsWith("on")) {
          attributesToRemove.push(attr.name);
        }
      }
      attributesToRemove.forEach((attrName) => {
        element.removeAttribute(attrName);
      });
    });
  }

  isFormElement(element: Element): boolean {
    const tagName = element.tagName?.toLowerCase();
    return ["input", "textarea", "select"].includes(tagName);
  }

  setupMutationObserver() {
    _vflog("setupMutationObserver()");
    const iframeDoc = this.iframe.contentDocument;

    if (!iframeDoc) {
      _vfwarn("setupMutationObserver: no iframe document!");
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      this.mutationQueue.push(...mutations);
      this.processMutationQueue();
    });

    try {
      const observeTarget = iframeDoc.documentElement;

      if (!observeTarget || observeTarget.nodeType !== Node.ELEMENT_NODE) {
        throw new Error("DocumentElement is not ready despite waiting - this should not happen");
      }

      this.observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        characterDataOldValue: true,
      });

      setTimeout(() => this.checkForLateContent(), 1000);

      // Patch CSSOM APIs in the iframe so we detect stylesheet changes
      // that don't produce DOM mutations (e.g. Vite dev injects CSS
      // via sheet.insertRule / sheet.replaceSync, not textContent).
      this._patchIframeCSSOM(iframeDoc);
    } catch (error) {
      console.error("IframeMirror: Error setting up mutation observer:", error);
    }
  }

  _patchIframeCSSOM(iframeDoc: Document) {
    // Clean up previous patches if any
    this._cssomCleanup?.();

    const iframeWin = iframeDoc.defaultView;
    if (!iframeWin) {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const onCSSOMChange = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        if (this._selectorFrozen) return;
        const existingStyles = this.renderRoot!.querySelectorAll("style, link");
        existingStyles.forEach((style) => style.remove());
        await this.copyIframeCSS();
      }, 16);
    };

    // Patch CSSStyleSheet.prototype methods on the iframe's window
    const CSSProto = iframeWin.CSSStyleSheet.prototype as CSSStyleSheet;
    const origInsertRule = CSSProto.insertRule;
    const origDeleteRule = CSSProto.deleteRule;

    CSSProto.insertRule = function (...args: Parameters<CSSStyleSheet["insertRule"]>) {
      const result = origInsertRule.apply(this, args);
      onCSSOMChange();
      return result;
    };

    CSSProto.deleteRule = function (...args: Parameters<CSSStyleSheet["deleteRule"]>) {
      origDeleteRule.apply(this, args);
      onCSSOMChange();
    };

    // replaceSync / replace are newer APIs — patch if available
    const origReplaceSync = CSSProto.replaceSync;
    const origReplace = CSSProto.replace;

    if (origReplaceSync) {
      CSSProto.replaceSync = function (...args: Parameters<CSSStyleSheet["replaceSync"]>) {
        origReplaceSync.apply(this, args);
        onCSSOMChange();
      };
    }

    if (origReplace) {
      CSSProto.replace = function (...args: Parameters<CSSStyleSheet["replace"]>) {
        const result = origReplace.apply(this, args);
        result.then(() => onCSSOMChange());
        return result;
      };
    }

    this._cssomCleanup = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      CSSProto.insertRule = origInsertRule;
      CSSProto.deleteRule = origDeleteRule;
      if (origReplaceSync) CSSProto.replaceSync = origReplaceSync;
      if (origReplace) CSSProto.replace = origReplace;
    };
  }

  processMutationQueue() {
    if (this.processingMutations) return;

    this.processingMutations = true;

    setTimeout(async () => {
      if (this.mutationQueue.length === 0) {
        this.processingMutations = false;
        return;
      }

      const mutations = this.mutationQueue.splice(0);
      let shouldRecopyCSS = false;

      mutations.forEach((mutation) => {
        if (this._selectorFrozen) {
          // Frozen: skip CSS-recopy detection and the direct mutation
          // application, but still let handleMutation run so it can
          // detect the selector reappearing and thaw.
          this.handleMutation(mutation);
          return;
        }
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              ((node as Element).tagName === "STYLE" || (node as Element).tagName === "LINK")
            ) {
              shouldRecopyCSS = true;
            }
          });
          mutation.removedNodes.forEach((node) => {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              ((node as Element).tagName === "STYLE" || (node as Element).tagName === "LINK")
            ) {
              shouldRecopyCSS = true;
            }
          });
        }

        if (
          mutation.type === "characterData" &&
          mutation.target.parentElement?.tagName === "STYLE"
        ) {
          shouldRecopyCSS = true;
        }

        this.handleMutation(mutation);
      });

      if (shouldRecopyCSS && !this._selectorFrozen) {
        const existingStyles = this.renderRoot!.querySelectorAll("style, link");
        existingStyles.forEach((style) => style.remove());
        await this.copyIframeCSS();
      }

      this.processingMutations = false;

      if (this.mutationQueue.length > 0) {
        this.processMutationQueue();
      }
    }, 16);
  }

  async checkForLateContent() {
    const iframeDoc = this.iframe.contentDocument;
    if (iframeDoc && iframeDoc.body && iframeDoc.body.children.length > 0) {
      if (!this.shadowBody || this.shadowBody.children.length === 0) {
        if (this.observer) {
          this.observer.disconnect();
        }

        this.elementMap = new WeakMap();
        this.reverseElementMap = new WeakMap();

        await this.mirrorContent();
        this.setupMutationObserver();
      }
    }
  }

  /**
   * Schedule a debounced full re-mirror.
   *
   * Used when a selector-filtered instance detects that its target
   * element has been replaced (e.g. after a soft navigation).  Multiple
   * mutations during the same navigation batch are coalesced into a
   * single re-mirror.
   */
  /**
   * Freeze the selector-projected mirror (same-origin path).
   *
   * Called when a mutation indicates the projected subtree is being
   * torn down by a SPA navigation.  Synchronously clears the element
   * maps so any remaining mutations in the current batch cannot find
   * a mirrored parent to write into, then schedules a re-mirror that
   * will thaw once a page containing the selector loads.
   */
  _freezeSelectorMirror() {
    this._selectorFrozen = true;
    this._selectorSourcePathNodes = new Set();
    this._selectorSourceMatch = null;
    // Synchronous — must happen before the rest of the current
    // mutation batch is processed.
    this.elementMap = new WeakMap();
    this.reverseElementMap = new WeakMap();
    this._scheduleRemirror();
  }

  _scheduleRemirror() {
    if (this._remirrorTimer) return; // already scheduled
    this._remirrorTimer = setTimeout(async () => {
      this._remirrorTimer = null;
      _vflog("_scheduleRemirror: re-mirroring selector content");
      this.elementMap = new WeakMap();
      this.reverseElementMap = new WeakMap();
      await this.mirrorContent();
    }, 16);
  }

  handleMutation(mutation: MutationRecord) {
    if (this._selectorFrozen) {
      // While frozen we don't apply mutations to the mirror, but we
      // DO watch for the selector reappearing (e.g. the iframe
      // navigates back to a page containing the projected element)
      // and thaw by scheduling a re-mirror.
      if (this.selector && mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches(this.selector) || el.querySelector(this.selector)) {
            _vflog(`handleMutation: selector "${this.selector}" reappeared — thawing`);
            this._scheduleRemirror();
            return;
          }
        }
      }
      return;
    }
    const target = mutation.target;
    const mirroredElement = this.elementMap.get(target);

    switch (mutation.type) {
      case "childList":
        this.handleChildListMutation(mutation, mirroredElement);
        break;
      case "attributes":
        this.handleAttributeMutation(mutation, mirroredElement);
        break;
      case "characterData":
        this.handleCharacterDataMutation(mutation, mirroredElement);
        break;
    }
  }

  handleChildListMutation(mutation: MutationRecord, mirroredParent: Node | undefined) {
    // Selector projection: if any removed node is on the source ancestor
    // path (body → matched element), a SPA navigation is tearing down
    // our projected subtree.  Freeze the mirror — preserve the existing
    // shadow DOM — and schedule a re-mirror.  The re-mirror's early-bail
    // in mirrorContent() will keep the frozen state until a page that
    // matches the selector loads.
    if (this.selector && this._selectorSourcePathNodes.size > 0) {
      // (a) A node on the ancestor path was removed → selector subtree
      //     is being torn down.
      for (const removedNode of mutation.removedNodes) {
        if (this._selectorSourcePathNodes.has(removedNode)) {
          _vflog(`handleChildListMutation: ancestor path node removed — freezing selector mirror`);
          this._freezeSelectorMirror();
          return;
        }
      }
      // (b) The mutation target is an ancestor-path node but not the
      //     matched element itself.  Any added/removed children here
      //     are siblings of the projected subtree — outside our
      //     projection.  This happens when a SPA router mutates a
      //     shared parent (e.g. <body>, <div id="__next">) to swap in
      //     the next route's content.  Treat as navigation: freeze and
      //     reschedule; do NOT apply the mutation.
      if (
        mutation.target !== this._selectorSourceMatch &&
        this._selectorSourcePathNodes.has(mutation.target)
      ) {
        _vflog(
          `handleChildListMutation: mutation on ancestor path node (not match) — freezing selector mirror`,
        );
        this._freezeSelectorMirror();
        return;
      }
    }

    if (!mirroredParent) {
      // When using a selector, the parent of the matched element is NOT
      // in the elementMap.  If a soft navigation replaces the DOM tree,
      // the old selector target is removed and a new one appears — but
      // because the parent is untracked the mutation is silently ignored.
      //
      // Detect this case: if any added node matches (or contains) the
      // selector, schedule a full re-mirror so the new element is picked up.
      if (this.selector) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches(this.selector) || el.querySelector(this.selector)) {
            _vflog(
              `handleChildListMutation: selector "${this.selector}" target replaced — scheduling re-mirror`,
            );
            this._scheduleRemirror();
            return;
          }
        }
      }
      return;
    }

    // Comment nodes (used as placeholders for skipped <script>/<noscript>)
    // cannot have children — skip the mutation entirely.
    if (
      mirroredParent.nodeType !== Node.ELEMENT_NODE &&
      mirroredParent.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return;
    }

    mutation.removedNodes.forEach((removedNode: Node) => {
      const mirroredNode = this.elementMap.get(removedNode);
      if (mirroredNode && mirroredNode.parentNode) {
        if ((removedNode as Element).tagName) {
          _vflog(
            `MUTATION REMOVE: <${(removedNode as Element).tagName}> text="${(removedNode as Element).textContent?.trim()?.substring(0, 40)}"`,
          );
        }
        mirroredNode.parentNode.removeChild(mirroredNode);
        this.elementMap.delete(removedNode);
        this.reverseElementMap.delete(mirroredNode);
      }
    });

    mutation.addedNodes.forEach((addedNode: Node) => {
      if (this.elementMap.has(addedNode)) {
        return;
      }

      if (addedNode.nodeType === Node.ELEMENT_NODE) {
        _vflog(
          `MUTATION ADD: <${(addedNode as Element).tagName}> text="${(addedNode as Element).textContent?.trim()?.substring(0, 40)}"`,
        );
        const clonedNode = this.cloneElementStructure(addedNode as Element);
        const nextSibling = addedNode.nextSibling;
        if (nextSibling && this.elementMap.has(nextSibling)) {
          const mirroredNextSibling = this.elementMap.get(nextSibling);
          mirroredParent.insertBefore(clonedNode, mirroredNextSibling ?? null);
        } else {
          mirroredParent.appendChild(clonedNode);
        }

        if (clonedNode.nodeType === Node.ELEMENT_NODE) {
          this.setupEventProxyingForElement(clonedNode as Element);
          (clonedNode as Element).querySelectorAll("*").forEach((childElement: Element) => {
            this.setupEventProxyingForElement(childElement);
          });
        }
      } else if (addedNode.nodeType === Node.TEXT_NODE) {
        const clonedTextNode = addedNode.cloneNode(true);
        this.elementMap.set(addedNode, clonedTextNode);
        this.reverseElementMap.set(clonedTextNode, addedNode);
        const nextSibling = addedNode.nextSibling;
        if (nextSibling && this.elementMap.has(nextSibling)) {
          const mirroredNextSibling = this.elementMap.get(nextSibling);
          mirroredParent.insertBefore(clonedTextNode, mirroredNextSibling ?? null);
        } else {
          mirroredParent.appendChild(clonedTextNode);
        }
      }
    });
  }

  handleAttributeMutation(mutation: MutationRecord, mirroredElement: Node | undefined) {
    if (!mirroredElement) return;

    const attributeName = mutation.attributeName;
    if (!attributeName) return;
    const target = mutation.target as Element;
    const mirrorEl = mirroredElement as Element;
    const newValue = target.getAttribute(attributeName);

    if (attributeName.startsWith("on")) {
      return;
    }

    // Skip width/height mutations on canvas elements — these change
    // rapidly (every animation frame) and the mirror uses a <video> or
    // <div> placeholder, not a real canvas.
    if (target.tagName === "CANVAS" && (attributeName === "width" || attributeName === "height")) {
      return;
    }

    if (
      this.isFormElement(mirrorEl) &&
      (attributeName === "value" || attributeName === "checked")
    ) {
      return;
    }

    if (newValue !== null) {
      mirrorEl.setAttribute(attributeName, _rewriteAttrUrl(attributeName, newValue, this._baseUrl));
    } else {
      mirrorEl.removeAttribute(attributeName);
    }
  }

  handleCharacterDataMutation(mutation: MutationRecord, _mirroredElement: Node | undefined) {
    const originalTextNode = mutation.target;
    const mirroredTextNode = this.elementMap.get(originalTextNode);

    if (mirroredTextNode && mirroredTextNode.nodeType === Node.TEXT_NODE) {
      mirroredTextNode.textContent = originalTextNode.textContent;
    } else {
      const parentElement = originalTextNode.parentElement;
      if (!parentElement) return;
      const mirroredParent = this.elementMap.get(parentElement);
      if (mirroredParent) {
        const originalChildNodes = Array.from(parentElement.childNodes);
        const mirroredChildNodes = Array.from(mirroredParent.childNodes);
        const textNodeIndex = originalChildNodes.indexOf(originalTextNode as ChildNode);
        if (textNodeIndex >= 0 && textNodeIndex < mirroredChildNodes.length) {
          const correspondingMirroredNode = mirroredChildNodes[textNodeIndex];
          if (correspondingMirroredNode && correspondingMirroredNode.nodeType === Node.TEXT_NODE) {
            correspondingMirroredNode.textContent = originalTextNode.textContent;
            this.elementMap.set(originalTextNode, correspondingMirroredNode);
            this.reverseElementMap.set(correspondingMirroredNode, originalTextNode);
          }
        }
      }
    }
  }

  _delegatedEventsInstalled = false;

  setupEventProxying() {
    // Set up per-element proxying (form element sync, reverse scroll
    // listeners, etc.) for every mirrored element.
    this.renderRoot!.querySelectorAll("*").forEach((element) => {
      this.setupEventProxyingForElement(element);
    });

    // Install delegated event listeners on the render root ONCE.
    // All non-form events are handled via delegation — a single
    // listener per event type on the shadow root that looks up the
    // original iframe element via reverseElementMap.  This avoids
    // per-element addEventListener, which we've observed silently
    // failing in certain shadow-DOM + framework combinations.
    if (!this._delegatedEventsInstalled) {
      this._delegatedEventsInstalled = true;
      this._installDelegatedListeners();
    }
  }

  _installDelegatedListeners() {
    const eventsToDelegate = [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "mousemove",
      "contextmenu",
      "wheel",
      "keydown",
      "keyup",
      "keypress",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "dragstart",
      "drag",
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
      "dragend",
      "submit",
      "reset",
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointercancel",
    ];

    for (const eventType of eventsToDelegate) {
      this.renderRoot!.addEventListener(eventType, (event: any) => {
        const mirroredElement = event.target as Element;
        if (!mirroredElement) return;

        // Walk up from the target to find the closest element with
        // a mapped original.  Some events target text or inner spans
        // that are not directly mapped.
        let cursor: Element | null = mirroredElement;
        let originalElement: any = null;
        while (cursor && cursor !== this.renderRoot) {
          originalElement = this.reverseElementMap.get(cursor);
          if (originalElement) break;
          cursor = cursor.parentElement;
        }
        if (!originalElement || !cursor) return;
        const mappedMirror = cursor;

        // Form elements are mostly handled by setupFormElementSync,
        // but checkbox/radio CLICK must go through delegation because
        // React's onChange listens for the native click event, and
        // per-element listeners don't fire reliably in shadow DOM.
        if (this.isFormElement(mappedMirror)) {
          const inputType = (mappedMirror as HTMLInputElement).type;
          if (eventType === "click" && (inputType === "checkbox" || inputType === "radio")) {
            // Prevent the browser from toggling the MIRROR checkbox —
            // we'll sync it from the original after React processes.
            event.preventDefault();
            // .click() triggers the native toggle AND fires the click
            // event (unlike dispatchEvent which skips default actions).
            originalElement.click();
            // Sync mirror state from original after React processes.
            const mirror = mappedMirror as HTMLInputElement;
            setTimeout(() => {
              mirror.checked = originalElement.checked;
            }, 0);
          }
          return;
        }

        if (this.isTextSelectionEvent(event, mappedMirror)) return;
        if (!this.shouldProxyEvent(event, mappedMirror, eventType)) return;

        this._handleDelegatedEvent(event, eventType, mappedMirror, originalElement);
      });
    }

    // Non-bubbling events need capture-phase delegation
    const captureEvents = [
      "focus",
      "blur",
      "focusin",
      "focusout",
      "mouseover",
      "mouseout",
      "mouseenter",
      "mouseleave",
      "pointerover",
      "pointerout",
      "pointerenter",
      "pointerleave",
      "scroll",
      "resize",
      "select",
    ];

    for (const eventType of captureEvents) {
      this.renderRoot!.addEventListener(
        eventType,
        (event: any) => {
          const mirroredElement = event.target as Element;
          if (!mirroredElement) return;

          let cursor: Element | null = mirroredElement;
          let originalElement: any = null;
          while (cursor && cursor !== this.renderRoot) {
            originalElement = this.reverseElementMap.get(cursor);
            if (originalElement) break;
            cursor = cursor.parentElement;
          }
          if (!originalElement || !cursor) return;
          const mappedMirror = cursor;

          if (this.isFormElement(mappedMirror)) return;

          this._handleDelegatedEvent(event, eventType, mappedMirror, originalElement);
        },
        true, // capture phase for non-bubbling events
      );
    }

    // Capture-phase click prevention for anchors inside the projection.
    // This must fire before any target-phase listeners so that
    // `event.defaultPrevented` is already `true` by the time they run.
    this.renderRoot!.addEventListener(
      "click",
      (event: any) => {
        if (event.target?.closest?.("a[href]")) {
          event.preventDefault();
        }
      },
      true, // capture phase
    );
  }

  _handleDelegatedEvent(
    event: any,
    eventType: string,
    mirroredElement: Element,
    originalElement: any,
  ) {
    // Sync scroll position by percentage before dispatching scroll event
    if (eventType === "scroll") {
      if ((mirroredElement as any)._vfScrollFromOriginal) {
        (mirroredElement as any)._vfScrollFromOriginal = false;
        return;
      }
      originalElement._vfScrollFromMirror = true;
      const maxScrollTop = mirroredElement.scrollHeight - mirroredElement.clientHeight;
      const maxScrollLeft = mirroredElement.scrollWidth - mirroredElement.clientWidth;
      const pctY = maxScrollTop > 0 ? mirroredElement.scrollTop / maxScrollTop : 0;
      const pctX = maxScrollLeft > 0 ? mirroredElement.scrollLeft / maxScrollLeft : 0;
      const origMaxY = originalElement.scrollHeight - originalElement.clientHeight;
      const origMaxX = originalElement.scrollWidth - originalElement.clientWidth;
      originalElement.scrollTop = pctY * origMaxY;
      originalElement.scrollLeft = pctX * origMaxX;
    }

    // Drag-and-drop: allow drop by preventing default on the mirror side
    if (eventType === "dragover" || eventType === "drop") {
      event.preventDefault();
    }

    // Use the original iframe element as drag image
    if (
      eventType === "dragstart" &&
      event.target === mirroredElement &&
      event.dataTransfer &&
      originalElement
    ) {
      try {
        const rect = mirroredElement.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        event.dataTransfer.setDragImage(originalElement, offsetX, offsetY);
      } catch {
        /* ignore if cross-origin */
      }
    }

    // Prevent main page navigation for clicks inside anchors
    if (eventType === "click" && event.target.closest?.("a[href]")) {
      event.preventDefault();
    }

    // Prevent main page form submission
    if (eventType === "submit") {
      event.preventDefault();
    }

    // Focus/blur: dispatch synthetic FocusEvents
    if (
      eventType === "focus" ||
      eventType === "blur" ||
      eventType === "focusin" ||
      eventType === "focusout"
    ) {
      const focusWin: any = this.iframe.contentWindow || window;
      const FocusCtorProxy = focusWin.FocusEvent || FocusEvent;
      originalElement.dispatchEvent(
        new FocusCtorProxy(eventType, {
          bubbles: eventType === "focusin" || eventType === "focusout",
          cancelable: false,
          relatedTarget: null,
        }),
      );
      return;
    }

    // Snapshot the iframe URL BEFORE dispatch for anchor clicks
    const isAnchorClick = eventType === "click" && originalElement.matches?.("a[href]");
    const urlBeforeDispatch = isAnchorClick ? this.iframe.contentWindow?.location.href : undefined;

    const newEvent = this.cloneEvent(event, eventType, mirroredElement, originalElement);
    const notPrevented = originalElement.dispatchEvent(newEvent);

    // Anchor click navigation
    if (isAnchorClick && originalElement.href) {
      const href = originalElement.href;
      const win = this.iframe.contentWindow!;
      const urlChanged = urlBeforeDispatch !== undefined && win.location.href !== urlBeforeDispatch;

      if (!notPrevented || urlChanged) {
        // framework handled
      } else {
        Promise.resolve().then(() => {
          try {
            const urlMicro = win.location.href;
            const changedMicro = urlBeforeDispatch !== undefined && urlMicro !== urlBeforeDispatch;
            if (changedMicro) return;
            win.location.assign(href);
          } catch (e) {
            void e;
          }
        });
      }
    }

    // Submit the original iframe form if no handler called preventDefault
    if (
      eventType === "submit" &&
      notPrevented &&
      originalElement.tagName?.toLowerCase() === "form"
    ) {
      if (typeof originalElement.requestSubmit === "function") {
        originalElement.requestSubmit();
      } else {
        originalElement.submit();
      }
    }
  }

  setupEventProxyingForElement(mirroredElement: Element) {
    const originalElement: any = this.reverseElementMap.get(mirroredElement);
    if (!originalElement) return;

    // Form elements need per-element sync (value tracking, checked state).
    // All other events are handled via delegation on the render root.
    if (this.isFormElement(mirroredElement)) {
      this.setupFormElementSync(mirroredElement, originalElement);
    }

    // Reverse direction: iframe element → mirror element scroll sync
    originalElement.addEventListener("scroll", () => {
      // Guard against infinite loops
      if (originalElement._vfScrollFromMirror) {
        originalElement._vfScrollFromMirror = false;
        return;
      }
      (mirroredElement as any)._vfScrollFromOriginal = true;
      const maxY = originalElement.scrollHeight - originalElement.clientHeight;
      const maxX = originalElement.scrollWidth - originalElement.clientWidth;
      const pctY = maxY > 0 ? originalElement.scrollTop / maxY : 0;
      const pctX = maxX > 0 ? originalElement.scrollLeft / maxX : 0;
      const mirrorMaxY = mirroredElement.scrollHeight - mirroredElement.clientHeight;
      const mirrorMaxX = mirroredElement.scrollWidth - mirroredElement.clientWidth;
      mirroredElement.scrollTop = pctY * mirrorMaxY;
      mirroredElement.scrollLeft = pctX * mirrorMaxX;
    });
  }

  setupFormElementSync(mirroredElement: any, originalElement: any) {
    const tagName = mirroredElement.tagName?.toLowerCase();

    // Proxy focus/blur via synthetic FocusEvent so iframe handlers fire,
    // without calling .focus()/.blur() which would steal real focus.
    // Use iframe's FocusEvent constructor to stay in the same JS realm.
    const formIframeWin: any = originalElement.ownerDocument?.defaultView || window;
    const FocusCtor = formIframeWin.FocusEvent || FocusEvent;
    mirroredElement.addEventListener("focus", () => {
      originalElement.dispatchEvent(new FocusCtor("focus", { bubbles: false, cancelable: false }));
      originalElement.dispatchEvent(new FocusCtor("focusin", { bubbles: true, cancelable: false }));
    });
    mirroredElement.addEventListener("blur", () => {
      originalElement.dispatchEvent(new FocusCtor("blur", { bubbles: false, cancelable: false }));
      originalElement.dispatchEvent(
        new FocusCtor("focusout", { bubbles: true, cancelable: false }),
      );
    });

    if (tagName === "input" || tagName === "textarea" || tagName === "select") {
      mirroredElement.value = originalElement.value;
      if (
        tagName === "input" &&
        (originalElement.type === "checkbox" || originalElement.type === "radio")
      ) {
        mirroredElement.checked = originalElement.checked;
      }

      let userModified = false;

      // React (and some other frameworks) monkey-patch the `.value`
      // setter on input/textarea/select elements with an internal
      // `_valueTracker`.  If we set `.value` directly then dispatch an
      // `input` event, React sees no change and ignores the event.
      // Using the *native prototype setter* bypasses the tracker so
      // the subsequent event is recognised as a real change.
      const protoMap = {
        input: "HTMLInputElement",
        textarea: "HTMLTextAreaElement",
        select: "HTMLSelectElement",
      };
      const protoName = (protoMap as Record<string, string>)[tagName];
      const iframeWin = originalElement.ownerDocument?.defaultView || window;
      const nativeValueSetter =
        protoName &&
        iframeWin[protoName] &&
        Object.getOwnPropertyDescriptor(iframeWin[protoName].prototype, "value")?.set;

      const nativeCheckedSetter =
        tagName === "input" &&
        iframeWin.HTMLInputElement &&
        Object.getOwnPropertyDescriptor(iframeWin.HTMLInputElement.prototype, "checked")?.set;

      function setOriginalValue(val: any) {
        if (nativeValueSetter) {
          nativeValueSetter.call(originalElement, val);
        } else {
          originalElement.value = val;
        }
      }

      function setOriginalChecked(val: any) {
        if (nativeCheckedSetter) {
          nativeCheckedSetter.call(originalElement, val);
        } else {
          originalElement.checked = val;
        }
      }

      // React's onChange for checkbox/radio is triggered by the native
      // `click` event, NOT `change`.  Proxy click so React sees it.
      // Use the iframe's own Event constructors (reusing `iframeWin`
      // from above) so the dispatched event belongs to the same JS
      // realm as React's listener (avoids cross-realm instanceof
      // mismatches in React 19's production build).

      if (mirroredElement.type === "checkbox" || mirroredElement.type === "radio") {
        mirroredElement.addEventListener("click", () => {
          userModified = true;
          setOriginalChecked(mirroredElement.checked);
          const Ctor = iframeWin.MouseEvent || MouseEvent;
          originalElement.dispatchEvent(new Ctor("click", { bubbles: true, cancelable: true }));
        });
      }

      mirroredElement.addEventListener("input", () => {
        userModified = true;
        setOriginalValue(mirroredElement.value);
        if (mirroredElement.type === "checkbox" || mirroredElement.type === "radio") {
          setOriginalChecked(mirroredElement.checked);
        }
        const EvtCtor = iframeWin.Event || Event;
        originalElement.dispatchEvent(new EvtCtor("input", { bubbles: true }));
      });

      mirroredElement.addEventListener("change", () => {
        userModified = true;
        setOriginalValue(mirroredElement.value);
        if (mirroredElement.type === "checkbox" || mirroredElement.type === "radio") {
          setOriginalChecked(mirroredElement.checked);
        }
        const EvtCtor = iframeWin.Event || Event;
        originalElement.dispatchEvent(new EvtCtor("change", { bubbles: true }));
      });

      originalElement.addEventListener("input", () => {
        if (!userModified && mirroredElement.value !== originalElement.value) {
          mirroredElement.value = originalElement.value;
        }
      });

      originalElement.addEventListener("change", () => {
        if (!userModified && mirroredElement.value !== originalElement.value) {
          mirroredElement.value = originalElement.value;
        }
      });

      mirroredElement.addEventListener("blur", () => {
        setTimeout(() => {
          userModified = false;
        }, 100);
      });
    }
  }

  isTextSelectionEvent(event: any, element: any) {
    if (
      event.type === "mousedown" ||
      event.type === "mousemove" ||
      event.type === "mouseup" ||
      event.type === "pointerdown" ||
      event.type === "pointermove" ||
      event.type === "pointerup"
    ) {
      const tagName = element.tagName?.toLowerCase();
      const interactiveTags = ["button", "input", "select", "textarea", "a"];
      if (!interactiveTags.includes(tagName)) {
        if (event.type === "mousedown" || event.type === "pointerdown") {
          element.setAttribute("data-selection-start", `${event.clientX},${event.clientY}`);
        } else if (
          (event.type === "mousemove" || event.type === "pointermove") &&
          event.buttons === 1
        ) {
          const startPos = element.getAttribute("data-selection-start");
          if (startPos) {
            const [startX, startY] = startPos.split(",").map(Number);
            const distance = Math.sqrt(
              Math.pow(event.clientX - startX, 2) + Math.pow(event.clientY - startY, 2),
            );
            if (distance > 5) return true;
          }
        }
      }
    }
    return event.type === "select";
  }

  shouldProxyEvent(event: Event, element: Element, eventType: string) {
    const tagName = element.tagName?.toLowerCase();
    const formElements = ["input", "select", "textarea"];
    const interactiveTags = ["button", "a"];
    const alwaysProxyEvents = ["click", "dblclick", "submit", "reset"];

    if (formElements.includes(tagName)) return false;
    if (interactiveTags.includes(tagName)) return true;
    if (alwaysProxyEvents.includes(eventType)) return true;

    if (
      eventType === "mousedown" ||
      eventType === "mouseup" ||
      eventType === "mousemove" ||
      eventType === "pointerdown" ||
      eventType === "pointerup" ||
      eventType === "pointermove"
    ) {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return false;
    }
    return true;
  }

  // Same logic as shouldProxyEvent but for cross-origin mirrored elements
  _shouldProxyCrossOriginEvent(event: Event, element: Element, eventType: string) {
    const tagName = element.tagName?.toLowerCase();
    const alwaysProxyEvents = ["click", "dblclick", "submit", "reset"];

    // Form elements are handled separately via _setupCrossOriginFormSync
    if (_formTags.has(tagName)) return false;
    if (tagName === "button" || tagName === "a") return true;
    if (alwaysProxyEvents.includes(eventType)) return true;

    if (
      eventType === "mousedown" ||
      eventType === "mouseup" ||
      eventType === "mousemove" ||
      eventType === "pointerdown" ||
      eventType === "pointerup" ||
      eventType === "pointermove"
    ) {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return false;
    }
    return true;
  }

  cloneEvent(
    originalEvent: any,
    eventType: string,
    mirroredElement: Element,
    originalElement: Element,
  ) {
    // Translate coordinates for mouse-like events (mouse, click, drag)
    let clientX = originalEvent.clientX;
    let clientY = originalEvent.clientY;
    if (mirroredElement && originalElement && originalEvent.clientX !== undefined) {
      const mirroredRect = mirroredElement.getBoundingClientRect();
      const relX = originalEvent.clientX - mirroredRect.left;
      const relY = originalEvent.clientY - mirroredRect.top;
      const originalRect = originalElement.getBoundingClientRect();
      clientX = originalRect.left + relX;
      clientY = originalRect.top + relY;
    }

    // Use the IFRAME's event constructors instead of the host page's.
    // In a document.write() iframe each window has its own set of
    // constructors.  Events created with the host's MouseEvent (etc.)
    // belong to a different JS realm — some frameworks (React 19) may
    // not recognise cross-realm event instances, causing onClick /
    // onChange handlers to silently ignore them.
    const iframeWin: any = this.iframe.contentWindow || window;

    if (eventType.startsWith("pointer")) {
      const Ctor = iframeWin.PointerEvent || PointerEvent;
      return new Ctor(eventType, {
        bubbles: originalEvent.bubbles,
        cancelable: originalEvent.cancelable,
        view: iframeWin,
        detail: originalEvent.detail,
        screenX: originalEvent.screenX,
        screenY: originalEvent.screenY,
        clientX,
        clientY,
        ctrlKey: originalEvent.ctrlKey,
        altKey: originalEvent.altKey,
        shiftKey: originalEvent.shiftKey,
        metaKey: originalEvent.metaKey,
        button: originalEvent.button,
        buttons: originalEvent.buttons,
        relatedTarget: null,
        pointerId: originalEvent.pointerId,
        width: originalEvent.width,
        height: originalEvent.height,
        pressure: originalEvent.pressure,
        tangentialPressure: originalEvent.tangentialPressure,
        tiltX: originalEvent.tiltX,
        tiltY: originalEvent.tiltY,
        twist: originalEvent.twist,
        pointerType: originalEvent.pointerType,
        isPrimary: originalEvent.isPrimary,
      });
    } else if (
      eventType.startsWith("mouse") ||
      eventType === "click" ||
      eventType === "dblclick" ||
      eventType === "contextmenu"
    ) {
      const Ctor = iframeWin.MouseEvent || MouseEvent;
      return new Ctor(eventType, {
        bubbles: originalEvent.bubbles,
        cancelable: originalEvent.cancelable,
        view: iframeWin,
        detail: originalEvent.detail,
        screenX: originalEvent.screenX,
        screenY: originalEvent.screenY,
        clientX,
        clientY,
        ctrlKey: originalEvent.ctrlKey,
        altKey: originalEvent.altKey,
        shiftKey: originalEvent.shiftKey,
        metaKey: originalEvent.metaKey,
        button: originalEvent.button,
        buttons: originalEvent.buttons,
        relatedTarget: null,
      });
    } else if (eventType.startsWith("key")) {
      const Ctor = iframeWin.KeyboardEvent || KeyboardEvent;
      return new Ctor(eventType, {
        bubbles: originalEvent.bubbles,
        cancelable: originalEvent.cancelable,
        view: iframeWin,
        key: originalEvent.key,
        code: originalEvent.code,
        location: originalEvent.location,
        ctrlKey: originalEvent.ctrlKey,
        altKey: originalEvent.altKey,
        shiftKey: originalEvent.shiftKey,
        metaKey: originalEvent.metaKey,
        repeat: originalEvent.repeat,
      });
    } else if (eventType.startsWith("drag") || eventType === "drop") {
      const Ctor = iframeWin.DragEvent || DragEvent;
      return new Ctor(eventType, {
        bubbles: originalEvent.bubbles,
        cancelable: originalEvent.cancelable,
        view: iframeWin,
        clientX,
        clientY,
        screenX: originalEvent.screenX,
        screenY: originalEvent.screenY,
        ctrlKey: originalEvent.ctrlKey,
        altKey: originalEvent.altKey,
        shiftKey: originalEvent.shiftKey,
        metaKey: originalEvent.metaKey,
        dataTransfer: originalEvent.dataTransfer,
      });
    } else if (eventType.startsWith("touch")) {
      const Ctor = iframeWin.TouchEvent || TouchEvent;
      return new Ctor(eventType, {
        bubbles: originalEvent.bubbles,
        cancelable: originalEvent.cancelable,
        view: iframeWin,
        touches: originalEvent.touches,
        targetTouches: originalEvent.targetTouches,
        changedTouches: originalEvent.changedTouches,
        ctrlKey: originalEvent.ctrlKey,
        altKey: originalEvent.altKey,
        shiftKey: originalEvent.shiftKey,
        metaKey: originalEvent.metaKey,
      });
    }
    const Ctor = iframeWin.Event || Event;
    return new Ctor(eventType, {
      bubbles: originalEvent.bubbles,
      cancelable: originalEvent.cancelable,
    });
  }

  // ---------------------------------------------------------------
  // Cross-origin: handle snapshot from bridge
  // ---------------------------------------------------------------

  async _handleSnapshot(data: any) {
    // ── Selector pre-check ───────────────────────────────────
    // When using a selector, build the body in a detached context first
    // to verify the selector matches.  If it doesn't (e.g. the iframe
    // navigated to a page without the target element), bail out entirely
    // to preserve the existing shadow root content and CSS.
    if (this.selector && data.body) {
      // Build into temporary maps so we don't pollute the live ones
      const prevIdToNode = this._remoteIdToNode;
      const prevNodeToId = this._nodeToRemoteId;
      this._remoteIdToNode = new Map();
      this._nodeToRemoteId = new WeakMap();

      const probeBody = this._buildNode(data.body);
      const match = probeBody ? (probeBody as Element).querySelector(this.selector) : null;

      // Restore original maps — the real build happens below
      this._remoteIdToNode = prevIdToNode;
      this._nodeToRemoteId = prevNodeToId;

      if (!match) {
        _vflog(
          `_handleSnapshot: selector "${this.selector}" not in snapshot — keeping existing content (frozen)`,
        );
        this._selectorFrozen = true;
        return;
      }
      // Selector matched — clear frozen state so incremental updates resume.
      this._selectorFrozen = false;
    }

    // Save user-modified form values from the existing mirror before rebuild.
    // Indexed by remote node id so we can restore them after _buildNode.
    const savedFormValues = new Map();
    for (const [id, node] of this._remoteIdToNode) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        _formTags.has((node as Element).tagName?.toLowerCase())
      ) {
        const entry: Record<string, any> = {};
        if (
          (node as HTMLInputElement).type === "checkbox" ||
          (node as HTMLInputElement).type === "radio"
        ) {
          entry.checked = (node as HTMLInputElement).checked;
        }
        entry.value = (node as HTMLInputElement).value;
        savedFormValues.set(id, entry);
      }
    }

    this._remoteIdToNode.clear();
    this._nodeToRemoteId = new WeakMap();

    // Inject CSS first (prevents FOUC)
    await this._handleRemoteCSS(data.css);

    // Clear render root (keep styles)
    const stylesToKeep = Array.from(
      this.renderRoot!.querySelectorAll(
        "style[data-iframe-stylesheet], style[data-iframe-inline-style], link[data-iframe-stylesheet], link[data-vf-head-link], style[data-vf-head-style]",
      ),
    );
    this.renderRoot!.innerHTML = "";
    stylesToKeep.forEach((s) => this.renderRoot!.appendChild(s));

    // Hide until fonts ready
    const hasFonts = this.isolate && stylesToKeep.length > 0;
    if (hasFonts) {
      const hideStyle = document.createElement("style");
      hideStyle.setAttribute("data-vf-hide", "");
      hideStyle.textContent = ":host { visibility: hidden !important; }";
      this.renderRoot!.appendChild(hideStyle);
    }

    // Reconstruct body from serialized tree
    if (data.body) {
      const body = this._buildNode(data.body);
      if (!body) return;

      // Restore previously saved form values
      for (const [id, saved] of savedFormValues) {
        const node = this._remoteIdToNode.get(id);
        if (!node) continue;
        if (saved.checked !== undefined) (node as HTMLInputElement).checked = saved.checked;
        if (saved.value !== undefined) (node as HTMLInputElement).value = saved.value;
      }

      // If a CSS selector is set, prune the tree so only the ancestor
      // chain from body → match (and match's own descendants) remains.
      // This preserves Angular component host elements and their
      // view-encapsulation attributes (_nghost-*/_ngcontent-*) so that
      // scoped CSS continues to work correctly.
      const root: Node = body;
      if (this.selector) {
        const match = (body as Element).querySelector(this.selector);
        if (match) {
          // Collect the ancestor path from match up to body (inclusive).
          const ancestorPath = new Set<Node>();
          let cursor: Node | null = match;
          while (cursor && cursor !== body) {
            ancestorPath.add(cursor);
            cursor = cursor.parentNode;
          }
          ancestorPath.add(body);

          // Remember the remote ids of every node on the ancestor path.
          // _handleRemoteMutations uses this to detect when an ancestor
          // of the match is being torn down (e.g. SPA navigation).
          this._selectorPathIds = new Set();
          for (const node of ancestorPath) {
            const id = this._nodeToRemoteId.get(node);
            if (id !== undefined) this._selectorPathIds.add(id);
          }

          // Walk the tree and remove any child of an ancestor that is
          // NOT itself on the ancestor path.  The match's own subtree
          // is preserved untouched.
          const prune = (node: Node) => {
            if (node === match) return;
            const children = Array.from(node.childNodes);
            for (const child of children) {
              if (ancestorPath.has(child)) {
                prune(child);
              } else {
                node.removeChild(child);
              }
            }
          };
          prune(body);

          // Unregister remote-id mappings for nodes we removed so
          // _handleRemoteMutations doesn't try to patch orphaned
          // subtrees.  Anything still reachable from body is kept.
          const stillReachable = new Set<unknown>();
          const collectIds = (node: Node) => {
            const id = this._nodeToRemoteId.get(node);
            if (id !== undefined) stillReachable.add(id);
            for (const child of node.childNodes) collectIds(child);
          };
          collectIds(body);
          for (const [id] of this._remoteIdToNode) {
            if (!stillReachable.has(id)) {
              const n = this._remoteIdToNode.get(id);
              this._remoteIdToNode.delete(id);
              if (n) this._nodeToRemoteId.delete(n);
            }
          }
        } else {
          console.warn(
            `VirtualFrame: selector "${this.selector}" matched nothing in cross-origin snapshot`,
          );
        }
      }

      // body is always the <div data-vf-body> replacement (see _buildNode),
      // so CSS rules rewritten from `body` → `[data-vf-body]` apply.
      this.shadowBody = root as HTMLElement;
      this.renderRoot!.appendChild(root);

      // Set up event proxying for all elements
      this._setupCrossOriginEventProxying();
    }

    // Warn about JS-only fonts that can't be replicated cross-origin
    if (data.fonts) {
      for (const f of data.fonts) {
        if (f.jsOnly) {
          console.warn(
            `VirtualFrame: JS-created font "${f.family}" cannot be mirrored cross-origin (source data not serializable)`,
          );
        }
      }
    }

    // Reveal after fonts
    if (hasFonts) {
      try {
        await document.fonts.ready;
      } catch {}
      const h = this.renderRoot!.querySelector("style[data-vf-hide]");
      if (h) h.remove();
    }
  }

  // Build a local DOM node from a serialized descriptor
  _buildNode(desc: any): Node | null {
    if (desc.type === "text") {
      const text = document.createTextNode(desc.data);
      this._remoteIdToNode.set(desc.id, text);
      this._nodeToRemoteId.set(text, desc.id);
      return text;
    }
    if (desc.type === "comment") {
      const comment = document.createComment(desc.data);
      this._remoteIdToNode.set(desc.id, comment);
      this._nodeToRemoteId.set(comment, desc.id);
      return comment;
    }

    // Element
    // Skip script/noscript — must not execute in the host page mirror
    if (desc.tag === "script" || desc.tag === "noscript") return null;

    // Replace <body>/<html> with <div data-vf-body> so host body styles
    // don't bleed in; rewritten CSS targets [data-vf-body] instead.
    const actualTag = desc.tag === "body" || desc.tag === "html" ? "div" : desc.tag;
    const isBodyReplacement = desc.tag === "body" || desc.tag === "html";

    const isSVG = _svgTags.has(actualTag);

    // Audio: create a hidden placeholder — the audio is already playing
    // on the same machine from the original iframe element.
    if (desc.tag === "audio") {
      const placeholder = document.createElement("div");
      placeholder.setAttribute("data-mirror-source", "audio");
      placeholder.style.display = "none";
      this._remoteIdToNode.set(desc.id, placeholder);
      this._nodeToRemoteId.set(placeholder, desc.id);
      return placeholder;
    }

    // Canvas / Video: create an <img> that receives periodic frame snapshots
    // from the bridge via vf:canvasFrame messages.
    // For <video> with a fetchable src, use a real <video> element instead
    // for full quality + audio.
    if (desc.tag === "canvas" || desc.tag === "video") {
      const src = desc.attrs?.src;
      const useNativeVideo = desc.tag === "video" && src && !src.startsWith("blob:");

      if (useNativeVideo) {
        const video = document.createElement("video");
        video.setAttribute("data-mirror-source", "video");
        video.autoplay = true;
        video.muted = false;
        video.playsInline = true;
        // Copy all safe attributes
        if (desc.attrs) {
          for (const [k, v] of Object.entries(desc.attrs)) {
            if (k.startsWith("on")) continue;
            try {
              video.setAttribute(k, v as string);
            } catch {}
          }
        }
        // Build <source> children if present
        if (desc.children) {
          for (const child of desc.children) {
            const n = this._buildNode(child);
            if (n) video.appendChild(n);
          }
        }
        this._remoteIdToNode.set(desc.id, video);
        this._nodeToRemoteId.set(video, desc.id);
        return video;
      }

      // Fallback: <img> receiving frame snapshots from bridge
      const img = document.createElement("img");
      img.setAttribute("data-mirror-source", desc.tag);
      if (desc.attrs) {
        if (desc.attrs.width) img.setAttribute("width", desc.attrs.width);
        if (desc.attrs.height) img.setAttribute("height", desc.attrs.height);
        if (desc.attrs.id) img.id = desc.attrs.id;
        if (desc.attrs.class) img.className = desc.attrs.class;
        if (desc.attrs.style) img.setAttribute("style", desc.attrs.style);
      }
      this._remoteIdToNode.set(desc.id, img);
      this._nodeToRemoteId.set(img, desc.id);
      return img;
    }

    const el = isSVG
      ? document.createElementNS("http://www.w3.org/2000/svg", actualTag)
      : document.createElement(actualTag);

    if (isBodyReplacement) {
      el.setAttribute("data-vf-body", "");
    }

    if (desc.attrs) {
      for (const [k, v] of Object.entries(desc.attrs)) {
        if (k.startsWith("on")) continue;
        try {
          el.setAttribute(k, v);
        } catch {}
      }
    }

    this._remoteIdToNode.set(desc.id, el);
    this._nodeToRemoteId.set(el, desc.id);

    if (desc.children) {
      for (const child of desc.children) {
        const n = this._buildNode(child);
        if (n) el.appendChild(n);
      }
    }

    // Restore form element values AFTER children are appended so that
    // <select>.value works (needs <option> children to be present first).
    if (_formTags.has(desc.tag)) {
      if (desc.value !== undefined) el.value = desc.value;
      if (desc.checked !== undefined) el.checked = desc.checked;
    }

    return el;
  }

  // ---------------------------------------------------------------
  // Cross-origin: handle incremental mutations from bridge
  // ---------------------------------------------------------------

  _handleRemoteMutations(mutations: any[]) {
    // When using a selector, first scan the batch for any removal of a
    // node on our projected ancestor path (body → match).  If such a
    // removal is present the selector target is being torn down — e.g.
    // a SPA route change.  Freeze the mirror and request a snapshot
    // instead of applying any of the mutations in this batch.
    if (this.selector && this._selectorPathIds.size > 0) {
      for (const m of mutations) {
        if (m.type !== "childList" || !m.removed?.length) continue;
        for (const removedId of m.removed) {
          if (this._selectorPathIds.has(removedId)) {
            _vflog(
              `_handleRemoteMutations: ancestor of selector "${this.selector}" removed — freezing and requesting snapshot`,
            );
            this._selectorFrozen = true;
            this._selectorPathIds = new Set();
            this._sendToBridge("vf:requestSnapshot");
            return;
          }
        }
      }
    }

    for (const m of mutations) {
      switch (m.type) {
        case "childList": {
          const parent = this._remoteIdToNode.get(m.parentId);
          if (!parent) {
            // When using a selector, the parent of the matched element
            // is NOT in the _remoteIdToNode map. If a client-side
            // navigation replaces the DOM tree, the old selector target
            // is removed and a new one appears — but because the parent
            // is untracked the mutation is silently ignored.
            //
            // Detect this case: walk the serialised descriptors (without
            // calling _buildNode, which has side-effects on the ID map)
            // to check whether any added subtree contains an element
            // matching the selector. If so, request a fresh snapshot.
            if (this.selector && m.added?.length) {
              if (_descriptorMatchesSelector(m.added, this.selector)) {
                _vflog(
                  `_handleRemoteMutations: selector "${this.selector}" target replaced — requesting fresh snapshot`,
                );
                this._sendToBridge("vf:requestSnapshot");
                return; // stop processing — snapshot will replace everything
              }
            }
            break;
          }

          // Remove nodes
          for (const id of m.removed) {
            const node = this._remoteIdToNode.get(id);
            if (node && node.parentNode) {
              node.parentNode.removeChild(node);
            }
            this._remoteIdToNode.delete(id);
            if (node) this._nodeToRemoteId.delete(node);
          }

          // Add nodes
          for (const added of m.added) {
            const node = this._buildNode(added);
            if (!node) continue;
            const nextSibling = added.nextSiblingId
              ? this._remoteIdToNode.get(added.nextSiblingId)
              : null;
            if (nextSibling && nextSibling.parentNode === parent) {
              parent.insertBefore(node, nextSibling);
            } else {
              parent.appendChild(node);
            }
            // Set up event proxying for new elements
            if (node.nodeType === Node.ELEMENT_NODE) {
              this._setupCrossOriginEventProxyingForElement(node as Element);
              (node as Element).querySelectorAll?.("*").forEach((child: Element) => {
                this._setupCrossOriginEventProxyingForElement(child);
              });
            }
          }
          break;
        }
        case "attributes": {
          const el = this._remoteIdToNode.get(m.id) as Element | undefined;
          if (!el || m.name.startsWith("on")) break;
          if (m.value !== null) {
            el.setAttribute(m.name, m.value);
          } else {
            el.removeAttribute(m.name);
          }
          break;
        }
        case "characterData": {
          const node = this._remoteIdToNode.get(m.id);
          if (node) node.textContent = m.data;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------
  // Cross-origin: handle CSS updates from bridge
  // ---------------------------------------------------------------

  async _handleRemoteCSS(cssEntries: any[]) {
    if (!cssEntries) return;

    // Clear existing styles
    const existingStyles = this.renderRoot!.querySelectorAll("style, link");
    existingStyles.forEach((s) => s.remove());

    // Fetch any href-only entries (CORS external sheets)
    const fetchPromises = [];
    for (const entry of cssEntries) {
      if (entry.href && !entry.cssText) {
        fetchPromises.push(
          fetch(entry.href, { headers: { Accept: "text/css" } })
            .then((r) => r.text())
            .then((text) => {
              entry.cssText = text;
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.all(fetchPromises);

    if (this.isolate) {
      // Font namespacing (same as same-origin isolation path)
      const fontNames = new Set<string>();
      for (const entry of cssEntries) {
        if (!entry.cssText) continue;
        for (const name of this._extractFontFaceNames(entry.cssText)) {
          fontNames.add(name);
        }
      }

      const fontPrefix = this._computeFontPrefix(cssEntries.filter((e) => e.cssText));

      for (const entry of cssEntries) {
        if (!entry.cssText) continue;
        let css = entry.cssText;
        if (fontNames.size > 0) {
          css = this._namespaceFontReferences(css, fontNames, fontPrefix);
        }
        css = _rewriteCSS(css);
        const styleEl = document.createElement("style");
        styleEl.type = "text/css";
        styleEl.textContent = css;
        styleEl.setAttribute(entry.attr || "data-iframe-stylesheet", entry.index ?? "");
        this.renderRoot!.appendChild(styleEl);
      }
    } else {
      for (const entry of cssEntries) {
        if (!entry.cssText) continue;
        const styleEl = document.createElement("style");
        styleEl.type = "text/css";
        styleEl.textContent = _rewriteCSS(entry.cssText);
        styleEl.setAttribute(entry.attr || "data-iframe-stylesheet", entry.index ?? "");
        this.renderRoot!.appendChild(styleEl);
      }
    }
  }

  // ---------------------------------------------------------------
  // Cross-origin: event proxying
  // ---------------------------------------------------------------

  _setupCrossOriginEventProxying() {
    this.renderRoot!.querySelectorAll("*").forEach((el) => {
      this._setupCrossOriginEventProxyingForElement(el);
    });
  }

  _setupCrossOriginEventProxyingForElement(mirroredElement: Element) {
    const remoteId = this._nodeToRemoteId.get(mirroredElement);
    if (remoteId == null) return;

    // Form elements: sync input/change back to the bridge AND set up
    // general event proxying (click, keyboard, etc.).  Checkboxes need
    // click events to toggle React state; text inputs need keydown/keyup
    // for controlled components.  Don't return early — fall through to
    // the general event proxy setup below.
    const tag = mirroredElement.tagName?.toLowerCase();
    if (_formTags.has(tag)) {
      this._setupCrossOriginFormSync(mirroredElement, remoteId);
    }

    const eventsToProxy = [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "mousemove",
      "mouseover",
      "mouseout",
      "mouseenter",
      "mouseleave",
      "pointerdown",
      "pointerup",
      "pointermove",
      "pointerover",
      "pointerout",
      "pointerenter",
      "pointerleave",
      "pointercancel",
      "contextmenu",
      "wheel",
      "keydown",
      "keyup",
      "keypress",
      "focus",
      "blur",
      "focusin",
      "focusout",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "dragstart",
      "drag",
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
      "dragend",
      "scroll",
      "resize",
      "select",
      "submit",
      "reset",
    ];

    eventsToProxy.forEach((eventType) => {
      mirroredElement.addEventListener(eventType, (event: any) => {
        // Don't interfere with text selection
        if (this.isTextSelectionEvent(event, mirroredElement)) return;
        if (!this._shouldProxyCrossOriginEvent(event, mirroredElement, eventType)) return;

        if (eventType === "scroll") {
          // Guard: don't echo back scroll that came from bridge
          if ((mirroredElement as any)._vfScrollFromBridge) {
            (mirroredElement as any)._vfScrollFromBridge = false;
            return;
          }
          // Send scroll sync
          const maxY = mirroredElement.scrollHeight - mirroredElement.clientHeight;
          const maxX = mirroredElement.scrollWidth - mirroredElement.clientWidth;
          this._sendToBridge("vf:scroll", {
            targetId: remoteId,
            pctY: maxY > 0 ? mirroredElement.scrollTop / maxY : 0,
            pctX: maxX > 0 ? mirroredElement.scrollLeft / maxX : 0,
          });
          return;
        }

        // Prevent the browser's default toggle on mirrored checkboxes
        // and radio buttons — the remote is the source of truth.  The
        // click is proxied to the remote; the remote's state change
        // comes back as a mutation/formUpdate that updates the mirror.
        // Check both the element itself and any label wrapping a
        // checkbox/radio (clicking a label activates its input).
        if (eventType === "click") {
          const checkable = this._findCheckableInput(mirroredElement);
          if (checkable) {
            event.preventDefault();
          }
        }

        // Prevent main page navigation / form submission
        if (eventType === "click" && event.target.closest?.("a[href]")) {
          event.preventDefault();
        }
        if (eventType === "submit") {
          event.preventDefault();
        }
        if (eventType === "dragover" || eventType === "drop") {
          event.preventDefault();
        }

        // Use the mirrored element itself as drag image (cross-origin — no
        // access to the original iframe element)
        if (eventType === "dragstart" && event.target === mirroredElement && event.dataTransfer) {
          try {
            const rect = mirroredElement.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            event.dataTransfer.setDragImage(mirroredElement, offsetX, offsetY);
          } catch {}
        }

        // Compute relative coordinates
        const rect = mirroredElement.getBoundingClientRect();
        const relX = event.clientX !== undefined ? event.clientX - rect.left : 0;
        const relY = event.clientY !== undefined ? event.clientY - rect.top : 0;

        this._sendToBridge("vf:event", {
          targetId: remoteId,
          eventType,
          relX,
          relY,
          screenX: event.screenX,
          screenY: event.screenY,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          button: event.button,
          buttons: event.buttons,
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          key: event.key,
          code: event.code,
          location: event.location,
          repeat: event.repeat,
          // Pointer event properties
          pointerId: event.pointerId,
          width: event.width,
          height: event.height,
          pressure: event.pressure,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
        });
      });
    });
  }

  /**
   * Walk up from an element to find an associated checkbox or radio input.
   * Returns the input if found, null otherwise.
   *
   * Handles: clicking the input itself, clicking a wrapping `<label>`,
   * or clicking a `<label for="id">` that references a checkbox/radio.
   */
  _findCheckableInput(el: Element): HTMLInputElement | null {
    // Direct input
    if (el.tagName === "INPUT") {
      const t = (el as HTMLInputElement).type;
      if (t === "checkbox" || t === "radio") return el as HTMLInputElement;
      return null;
    }
    // Label wrapping a checkbox/radio
    const label = el.closest("label");
    if (label) {
      const input = label.querySelector(
        'input[type="checkbox"], input[type="radio"]',
      ) as HTMLInputElement | null;
      if (input) return input;
    }
    return null;
  }

  _setupCrossOriginFormSync(mirroredElement: any, remoteId: number) {
    mirroredElement.addEventListener("input", () => {
      this._sendToBridge("vf:input", {
        targetId: remoteId,
        value: mirroredElement.value,
        checked: mirroredElement.checked,
      });
    });
    mirroredElement.addEventListener("change", () => {
      this._sendToBridge("vf:input", {
        targetId: remoteId,
        value: mirroredElement.value,
        checked: mirroredElement.checked,
        triggerChange: true,
      });
    });
  }

  /**
   * Re-initialize the mirror after the iframe navigates to a new page.
   * Keeps the render root intact but resets everything else.
   */
  /**
   * Handle a navigation request from the iframe's env shim.
   *
   * Instead of letting the iframe perform a real cross-document navigation
   * (which would make it cross-origin and break the mirror), we:
   * 1. Fetch the destination page from the remote server
   * 2. Re-inject it via document.write with the same env shim
   * 3. The iframe's `load` event triggers `_reinitOnNavigation` to re-mirror
   */
  async _navigateIframe(url: string) {
    _vflog("_navigateIframe()", url);

    // Resolve the URL against the remote base, not the host origin.
    // The env shim may send a host-origin URL (e.g. http://localhost:3000/about)
    // when the iframe's location was shimmed via replaceState.
    let resolvedUrl = url;
    if (this._baseUrl) {
      try {
        const target = new URL(url, this.iframe.contentWindow?.location.href);
        const base = new URL(this._baseUrl);
        // If the target resolves to the host origin, remap to remote origin
        if (target.origin === location.origin && target.origin !== base.origin) {
          resolvedUrl = base.origin + target.pathname + target.search + target.hash;
        }
      } catch {
        /* keep original url */
      }
    }

    _vflog("_navigateIframe() resolved →", resolvedUrl);

    try {
      const response = await fetch(resolvedUrl, {
        headers: { Accept: "text/html" },
      });
      if (!response.ok) {
        console.error(
          `VirtualFrame: navigation fetch failed (${response.status} ${response.statusText})`,
        );
        return;
      }
      const rawHtml = await response.text();

      // Extract <head> (with scripts), <body>, and attributes
      const headMatch = rawHtml.match(/<head([^>]*)>([\s\S]*?)<\/head>/i);
      const fullHead = headMatch ? headMatch[2] : "";
      const bodyMatch = rawHtml.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
      const bodyAttrs = bodyMatch ? bodyMatch[1] || "" : "";
      const bodyContent = bodyMatch ? bodyMatch[2] : rawHtml;
      const htmlAttrsMatch = rawHtml.match(/<html([^>]*)>/i);
      const htmlAttrs = htmlAttrsMatch ? (htmlAttrsMatch[1] || "").trim() : "";

      // Use the resolved URL as the new base
      const baseUrl = resolvedUrl;
      const baseTag = `<base href="${baseUrl}">`;
      const envShim = _buildEnvShim(baseUrl);
      const htmlAttrStr = htmlAttrs ? " " + htmlAttrs : "";

      const htmlContent =
        `<!DOCTYPE html><html${htmlAttrStr}><head>${baseTag}${envShim}${fullHead}</head>` +
        `<body${bodyAttrs}>${bodyContent}</body></html>`;

      // Re-inject — document.open/write/close replaces the document
      // but the iframe stays same-origin.  The load event will fire
      // and _reinitOnNavigation() will re-mirror the new content.
      const iframeDoc = this.iframe.contentDocument;
      if (!iframeDoc) {
        console.error("VirtualFrame: cannot access iframe document for navigation");
        return;
      }

      // Update baseUrl for URL rewriting of mirrored attributes
      this._baseUrl = baseUrl;

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();
    } catch (e) {
      console.error("VirtualFrame: navigation failed:", e);
    }
  }

  async _reinitOnNavigation() {
    _vflog(`_reinitOnNavigation() called  _reiniting=${!!this._reiniting}  gen=${this._mirrorGen}`);
    // Prevent concurrent re-initialization
    if (this._reiniting) {
      _vfwarn("_reinitOnNavigation() SKIPPED — already reiniting");
      return;
    }
    this._reiniting = true;

    try {
      // Disconnect old observer
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      // Stop captured streams and pending canvas timers
      _vflog(`_reinitOnNavigation() cleaning ${this.activeStreams?.length || 0} active streams`);
      if (this.activeStreams) {
        for (const entry of this.activeStreams) {
          if (entry.poll) {
            clearInterval(entry.poll);
          } else if (entry.timeout) {
            clearTimeout(entry.timeout);
          } else if (entry.rafId) {
            cancelAnimationFrame(entry.rafId);
          } else if (entry.video) {
            entry.video.srcObject = null;
            if (entry.stream) {
              for (const track of entry.stream.getTracks()) track.stop();
            }
          }
        }
        this.activeStreams = [];
      }

      // Reset element maps
      this.elementMap = new WeakMap();
      this.reverseElementMap = new WeakMap();
      this.mutationQueue = [];
      this.processingMutations = false;
      this.shadowBody = null;

      // Re-mirror with the new document
      try {
        _vflog("_reinitOnNavigation() setting up observer + mirrorContent");
        this.setupMutationObserver();
        // Re-patch the iframe's top-layer methods.  A fresh document may
        // have a fresh realm (new HTMLDialogElement.prototype); if the
        // window object is the same we early-out via __vfTopLayerPatched.
        this._installSameOriginTopLayerInterception();
        await this.mirrorContent();
        _vflog("_reinitOnNavigation() mirrorContent DONE");
      } catch (e) {
        console.error("VirtualFrame: Error re-mirroring after navigation:", e);
      }
    } finally {
      this._reiniting = false;
      _vflog("_reinitOnNavigation() DONE  _reiniting=false");
    }
  }

  destroy() {
    // Remove navigation listener
    if (this._onIframeLoad) {
      this.iframe.removeEventListener("load", this._onIframeLoad);
      this._onIframeLoad = null;
    }
    // Remove navigate message listener
    if (this._onNavigateMessage) {
      window.removeEventListener("message", this._onNavigateMessage);
      this._onNavigateMessage = null;
    }
    // Remove cross-origin message listener
    if (this._onMessage) {
      window.removeEventListener("message", this._onMessage);
      this._onMessage = null;
    }
    this._bridgeChannel = null;
    this._remoteIdToNode.clear();
    this._nodeToRemoteId = new WeakMap();

    if (this._remirrorTimer) {
      clearTimeout(this._remirrorTimer);
      this._remirrorTimer = null;
    }
    if (this.observer) this.observer.disconnect();
    this._cssomCleanup?.();
    this._cssomCleanup = null;
    // Clean up JS FontFace entries added to document.fonts
    if (this._injectedJSFonts) {
      for (const font of this._injectedJSFonts) {
        document.fonts.delete(font);
      }
      this._injectedJSFonts = [];
    }
    // Stop all captured streams and pending canvas timers
    if (this.activeStreams) {
      for (const entry of this.activeStreams) {
        if (entry.poll) {
          clearInterval(entry.poll);
        } else if (entry.timeout) {
          clearTimeout(entry.timeout);
        } else if (entry.rafId) {
          cancelAnimationFrame(entry.rafId);
        } else if (entry.video) {
          entry.video.srcObject = null;
          if (entry.stream) {
            for (const track of entry.stream.getTracks()) track.stop();
          }
        }
      }
      this.activeStreams = [];
    }
    this.elementMap = new WeakMap();
    this.reverseElementMap = new WeakMap();
    if (this.renderRoot) {
      this.renderRoot.innerHTML = "";
    }
    // Don't null shadowRoot — it can't be re-created on the same host
    this.renderRoot = null;
    this.shadowBody = null;
  }

  refresh() {
    this.destroy();
    this.init();
  }
}
