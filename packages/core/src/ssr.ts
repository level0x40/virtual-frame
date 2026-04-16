/**
 * Virtual Frame SSR (Server-Side Rendering) module.
 *
 * Fetch a remote page on the server and produce pre-rendered HTML that can be
 * served inline.  On the client the `<virtual-frame>` element will "resume"
 * by creating a same-origin srcdoc iframe seeded with the already-fetched
 * HTML, avoiding a redundant cross-origin network round-trip.
 *
 * A diff operations array in the resume delta allows the client to
 * reconstruct the full `<body>` from the shadow DOM innerHTML plus
 * surrounding literal fragments.  A tiny URL shim is injected so that
 * `new URL(x, window.location.href)` works inside the srcdoc frame
 * (where `location.href` is the non-parseable `about:srcdoc`).
 *
 * When a `selector` is specified, only the matched element is rendered
 * (extracted with a real DOM parser via `node-html-parser`).
 *
 * Usage (e.g. in a Hono / Next.js server component):
 *
 *   import { fetchVirtualFrame } from "virtual-frame/ssr";
 *
 *   const frame = await fetchVirtualFrame("http://remote-app/");
 *   // frame.html  — complete <virtual-frame> tag ready to emit
 *
 *   // With selector — only renders the matched element:
 *   const card = await fetchVirtualFrame(url, { selector: "#card" });
 */

import { _rewriteCSS } from "./core.js";
// Lazy dynamic import — never statically resolved by Vite, so
// node-html-parser is never shipped to the browser.
let _parseHTML: typeof import("node-html-parser").parse | undefined;
async function getParseHTML() {
  if (!_parseHTML) {
    _parseHTML = (await import("node-html-parser")).parse;
  }
  return _parseHTML;
}

// ── Types ───────────────────────────────────────────────────

interface StyleEntry {
  css?: string;
  href?: string;
  index: number;
  type: "inline" | "link";
}

export interface FetchVirtualFrameOptions {
  headers?: Record<string, string>;
  selector?: string;
  isolate?: "open" | "closed";
  fetchOptions?: RequestInit;
}

export interface RenderVirtualFrameOptions {
  url?: string;
  selector?: string;
  isolate?: "open" | "closed";
  _styles?: StyleEntry[];
}

export interface VirtualFrameResult {
  styles: string;
  body: string;
  srcdoc: string;
  html: string;
  rawHtml: string;
  resumeDelta: {
    u: string;
    h: string;
    a: string;
    r: string;
    d: string[];
  };
  render: (
    overrides?: Partial<RenderVirtualFrameOptions>,
  ) => Promise<VirtualFrameResult>;
}


// ── HTML helpers ────────────────────────────────────────────

/**
 * Extract all `<style>` blocks and `<link rel="stylesheet">` hrefs from
 * the `<head>` section of an HTML string.
 */
function _extractStyles(html: string, baseUrl?: string): StyleEntry[] {
  const styles: StyleEntry[] = [];
  let index = 0;

  // Inline <style> tags
  const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) {
    styles.push({ css: m[2], index: index++, type: "inline" });
  }

  // <link rel="stylesheet"> hrefs — these need to be fetched separately
  const linkRegex =
    /<link\s[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
  while ((m = linkRegex.exec(html)) !== null) {
    let href = m[1];
    // Resolve relative URLs
    if (baseUrl && !/^https?:\/\//i.test(href)) {
      href = new URL(href, baseUrl).href;
    }
    styles.push({ href, index: index++, type: "link" });
  }
  // Also match href before rel
  const linkRegex2 =
    /<link\s[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi;
  while ((m = linkRegex2.exec(html)) !== null) {
    let href = m[1];
    if (baseUrl && !/^https?:\/\//i.test(href)) {
      href = new URL(href, baseUrl).href;
    }
    // Avoid duplicates
    if (!styles.some((s) => s.href === href)) {
      styles.push({ href, index: index++, type: "link" });
    }
  }

  return styles;
}

/**
 * Extract the inner content of `<body>`.
 */
function _extractBody(html: string): { attrs: string; content: string } {
  const bodyMatch = html.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return { attrs: "", content: html };
  return { attrs: bodyMatch[1] || "", content: bodyMatch[2] };
}

/**
 * Extract the attributes string from the `<html>` tag.
 */
function _extractHtmlAttrs(html: string): string {
  const m = html.match(/<html([^>]*)>/i);
  return m ? (m[1] || "").trim() : "";
}

/**
 * Strip `<script>` and `<noscript>` tags.
 */
function _stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
}

/**
 * Extract the content of `<head>` (without `<script>` tags).
 */
function _extractHead(html: string): string {
  const match = html.match(/<head([^>]*)>([\s\S]*?)<\/head>/i);
  if (!match) return "";
  return _stripScripts(match[2]);
}

/**
 * Extract the full content of `<head>` (including `<script>` tags).
 * Used for iframe reconstruction where the complete head is needed.
 */
function _extractFullHead(html: string): string {
  const match = html.match(/<head([^>]*)>([\s\S]*?)<\/head>/i);
  if (!match) return "";
  return match[2];
}

/**
 * Extract all `<script>` tags from the `<body>`.
 */
function _extractBodyScripts(html: string): string {
  const { content } = _extractBody(html);
  const scripts = [];
  const re = /<script[\s\S]*?<\/script>/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    scripts.push(m[0]);
  }
  return scripts.join("\n");
}

/**
 * Extract trailing content after `</body>` or `</html>`.
 *
 * Streaming SSR frameworks (e.g. @lazarv/react-server) append `<script>`
 * tags after the closing `</html>` tag for flight data and hydration.
 * These scripts are outside the `<body>` and `<head>` so the normal
 * extractors miss them.
 */
function _extractTrailingScripts(html: string): string {
  // Find content after </body> (which may include </html> and trailing scripts)
  const bodyCloseIdx = html.search(/<\/body\s*>/i);
  if (bodyCloseIdx < 0) return "";
  const afterBody = html.slice(bodyCloseIdx).replace(/<\/body\s*>/i, "");
  // Extract all <script> tags from the trailing content
  const scripts: string[] = [];
  const re = /<script[\s\S]*?<\/script>/gi;
  let m;
  while ((m = re.exec(afterBody)) !== null) {
    scripts.push(m[0]);
  }
  return scripts.join("\n");
}

/**
 * Extract compiled CSS from a Vite dev CSS-as-JS module response.
 *
 * Vite dev always serves `.css` files as JS modules (even for direct
 * requests) containing:
 *   const __vite__css = "…compiled CSS…"
 * This extracts the CSS string literal so it can be used in `<style>`
 * tags without executing the JS module.
 */
function _extractCssFromViteModule(js: string): string {
  const m = js.match(/const __vite__css\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!m) return "";
  try {
    return JSON.parse(`"${m[1]}"`);
  } catch {
    return m[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

/**
 * Resolve relative URLs (src, href, action, poster, srcset) to absolute.
 */
function _resolveRelativeUrls(html: string, baseUrl?: string): string {
  if (!baseUrl) return html;
  const attrs = ["src", "href", "action", "poster"];
  let result = html;
  for (const attr of attrs) {
    const re = new RegExp(
      `(${attr}\\s*=\\s*["'])(?!https?://|data:|blob:|#|javascript:|mailto:)([^"']+)(["'])`,
      "gi",
    );
    result = result.replace(
      re,
      (_match: string, pre: string, url: string, post: string) => {
        try {
          return pre + new URL(url, baseUrl).href + post;
        } catch {
          return _match;
        }
      },
    );
  }
  // srcset needs special handling (comma-separated list of urls)
  result = result.replace(
    /(srcset\s*=\s*["'])([^"']+)(["'])/gi,
    (_match: string, pre: string, value: string, post: string) => {
      const resolved = value
        .split(",")
        .map((entry: string) => {
          const parts = entry.trim().split(/\s+/);
          const url = parts[0];
          if (/^https?:\/\/|^data:|^blob:/i.test(url)) return entry;
          try {
            parts[0] = new URL(url, baseUrl).href;
          } catch {}
          return parts.join(" ");
        })
        .join(", ");
      return pre + resolved + post;
    },
  );
  return result;
}

/**
 * Inject a `<base href="…">` into the `<head>` of an HTML document so
 * that relative URLs resolve to the original remote origin.
 */
function _injectBase(html: string, url: string): string {
  const baseTag = `<base href="${_escapeAttr(url)}">`;
  // Insert after <head> if present
  const headMatch = html.match(/<head([^>]*)>/i);
  if (headMatch) {
    const idx = headMatch.index! + headMatch[0].length;
    return html.slice(0, idx) + baseTag + html.slice(idx);
  }
  // Fallback: prepend
  return baseTag + html;
}

function _escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Parse body attributes string into key-value pairs.
 */
function _parseAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    const name = m[1];
    if (name.startsWith("on")) continue; // Skip event handlers
    attrs[name] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Fetch a remote page and prepare it for SSR rendering as a virtual frame.
 *
 * @param {string} url                  The remote URL to fetch.
 * @param {object} [options]
 * @param {Record<string,string>} [options.headers]  Extra headers for the fetch.
 * @param {string} [options.selector]   CSS selector to project a subset.
 * @param {string} [options.isolate]    Shadow DOM mode ("open" | "closed").
 *                                      Defaults to "open" for SSR (required for
 *                                      declarative shadow DOM).
 * @param {RequestInit} [options.fetchOptions]  Additional fetch() init options.
 * @returns {Promise<VirtualFrameResult>}
 */
export async function fetchVirtualFrame(
  url: string,
  options: FetchVirtualFrameOptions = {},
): Promise<VirtualFrameResult> {
  const fetchOpts: RequestInit = {
    headers: {
      Accept: "text/html",
      ...options.headers,
    },
    ...options.fetchOptions,
  };

  const response = await fetch(url, fetchOpts);
  if (!response.ok) {
    throw new Error(
      `virtual-frame SSR: failed to fetch ${url} (${response.status} ${response.statusText})`,
    );
  }

  const rawHtml = await response.text();

  // Fetch linked stylesheets in parallel
  const styleEntries = _extractStyles(rawHtml, url);
  const fetchPromises = styleEntries
    .filter((s: StyleEntry) => s.type === "link")
    .map(async (s: StyleEntry) => {
      try {
        const r = await fetch(s.href!, {
          headers: { Accept: "text/css" },
        });
        if (r.ok) {
          const text = await r.text();
          // Vite dev serves .css files as JS modules containing
          // `const __vite__css = "…"` — extract the compiled CSS.
          if (text.includes("__vite__css")) {
            s.css = _extractCssFromViteModule(text);
          } else {
            s.css = text;
          }
        } else {
          s.css = "";
          console.warn(
            `virtual-frame SSR: failed to fetch stylesheet ${s.href}`,
          );
        }
      } catch (e) {
        s.css = "";
        console.warn(
          `virtual-frame SSR: failed to fetch stylesheet ${s.href}:`,
          e,
        );
      }
    });
  await Promise.all(fetchPromises);

  const result = await renderVirtualFrame(rawHtml, {
    ...options,
    url,
    _styles: styleEntries,
  });

  // Expose a render() helper so the caller can re-render with different
  // options (e.g. a selector) without re-fetching HTML or stylesheets.
  result.render = (overrides: Partial<RenderVirtualFrameOptions> = {}) =>
    renderVirtualFrame(rawHtml, {
      url,
      isolate: options.isolate,
      _styles: styleEntries,
      ...overrides,
    });

  return result;
}

/**
 * Parse already-fetched HTML and produce SSR output.
 *
 * Typically called via `fetchVirtualFrame`, but can also be used directly
 * if you already have the HTML string.
 *
 * When `selector` is specified, only the matching element is rendered in the
 * shadow DOM (extracted using a DOM parser).  A diff array in the resume delta
 * carries the surrounding body content so the full page can be reconstructed.
 *
 * @param {string} rawHtml     Full HTML of the remote page.
 * @param {object} [options]
 * @param {string} [options.url]        Original URL (for resolving relative URLs).
 * @param {string} [options.selector]   CSS selector — only the matching element
 *                                      is placed in the shadow DOM.
 * @param {string} [options.isolate]    Shadow DOM mode. Defaults to "open".
 * @param {Array}  [options._styles]    Pre-parsed style entries (internal).
 * @returns {VirtualFrameResult}
 */
export async function renderVirtualFrame(
  rawHtml: string,
  options: RenderVirtualFrameOptions = {},
): Promise<VirtualFrameResult> {
  const { url, selector, _styles } = options;
  const isolate = options.isolate ?? "open";

  // 1. Extract styles (or reuse pre-parsed ones)
  const styleEntries = _styles || _extractStyles(rawHtml, url);

  // 2. Rewrite CSS for shadow DOM
  const rewrittenStyles = styleEntries
    .filter((s): s is StyleEntry & { css: string } => !!s.css)
    .map((s) => ({
      ...s,
      css: _rewriteCSS(s.css),
    }));

  const stylesHtml = rewrittenStyles
    .map((s) => `<style data-iframe-stylesheet="${s.index}">${s.css}</style>`)
    .join("\n");

  // 3. Extract body info
  const { attrs: bodyAttrsStr, content: bodyContent } = _extractBody(rawHtml);
  const bodyAttrs = _parseAttrs(bodyAttrsStr);
  const bodyScripts = _extractBodyScripts(rawHtml);
  const trailingScripts = _extractTrailingScripts(rawHtml);
  const allScripts = [bodyScripts, trailingScripts].filter(Boolean).join("\n");

  // 4. Build shadow DOM body content + diff operations.
  //
  //    The diff ("d") is an array of string fragments.  The client
  //    concatenates them to reconstruct the full <body> for the iframe:
  //      body = d.join("")
  //
  //    The diff always uses the ORIGINAL relative URLs from the remote
  //    page.  The iframe's <base href> tag handles URL resolution, and
  //    the remote app's client-side code (next/image, next/link, etc.)
  //    generates relative URLs during hydration — so the diff must match.
  //
  //    The shadow DOM body (processedBody) uses ABSOLUTE URLs via
  //    _resolveRelativeUrls, because the host page has no <base> tag
  //    and images/links need to resolve to the remote origin.

  let processedBody: string; // HTML for <div data-vf-body>…</div>
  let diffOps: string[]; // the "d" array for the resume delta
  let useBodyAttrs = true; // copy <body> attrs onto data-vf-body?

  if (selector) {
    // ── Selector mode: use DOM parser to extract only the matched element ──
    const parseHTML = await getParseHTML();
    const doc = parseHTML(rawHtml);
    const bodyEl = doc.querySelector("body") || doc;
    const matchEl = bodyEl.querySelector(selector);

    if (!matchEl) {
      console.warn(
        `virtual-frame SSR: selector "${selector}" matched nothing — rendering full body`,
      );
      const strippedBody = _stripScripts(bodyContent);
      processedBody = url
        ? _resolveRelativeUrls(strippedBody, url)
        : strippedBody;
      diffOps = allScripts ? [strippedBody, allScripts] : [strippedBody];
    } else {
      // Get consistent serialisations from the parser.
      const matchOuter = matchEl.outerHTML;
      const bodyInner = bodyEl.innerHTML;

      // Replace the match with a unique placeholder in the serialised body
      // so we can process the whole string (strip scripts, resolve URLs)
      // and then split cleanly around it.
      const PH = "<!--VF_SPLIT_" + Date.now() + "-->";
      const idx = bodyInner.indexOf(matchOuter);

      if (idx < 0) {
        // Extremely unlikely with the same parser — fall back to full body
        const strippedBody = _stripScripts(bodyContent);
        processedBody = url
          ? _resolveRelativeUrls(strippedBody, url)
          : strippedBody;
        diffOps = allScripts ? [strippedBody, allScripts] : [strippedBody];
      } else {
        // Splice the placeholder into the body string
        const modifiedBody =
          bodyInner.slice(0, idx) +
          PH +
          bodyInner.slice(idx + matchOuter.length);

        // Strip scripts from the body-with-placeholder, then split around it.
        // We compute TWO versions:
        //   • "resolved" (absolute URLs) → for the shadow DOM display in the host
        //   • "unresolved" (relative URLs) → for the diff ops / iframe reconstruction
        //
        // The iframe has a <base href> tag that handles URL resolution, and
        // the remote app's client-side code generates relative URLs during
        // hydration.  Using relative URLs in the diff ops prevents hydration
        // mismatches (e.g. next/image, next/link).
        const strippedModified = _stripScripts(modifiedBody);

        // Unresolved split (for diff ops)
        const [unresolvedPrefix, unresolvedSuffix] =
          strippedModified.split(PH);

        // Process the matched element
        const strippedMatch = _stripScripts(matchOuter);
        processedBody = url
          ? _resolveRelativeUrls(strippedMatch, url)
          : strippedMatch;

        // Build diff with unresolved (relative URL) content
        diffOps = [];
        if (unresolvedPrefix) diffOps.push(unresolvedPrefix);
        diffOps.push(strippedMatch);
        if (unresolvedSuffix) diffOps.push(unresolvedSuffix);
        if (allScripts) diffOps.push(allScripts);

        // Don't copy <body> attributes onto the wrapper when projecting a subset
        useBodyAttrs = false;
      }
    }
  } else {
    // ── Full body mode ─────────────────────────────────────
    //
    // The shadow DOM gets absolute URLs (via _resolveRelativeUrls) so that
    // images and links work in the host page context.  The diff ops carry
    // the original relative URLs because the iframe has a <base href> tag
    // and the remote app's client-side code (e.g. next/image, next/link)
    // generates relative URLs during hydration.
    const strippedBody = _stripScripts(bodyContent);
    processedBody = url
      ? _resolveRelativeUrls(strippedBody, url)
      : strippedBody;
    diffOps = allScripts ? [strippedBody, allScripts] : [strippedBody];
  }

  // 5. Build the <div data-vf-body> wrapper
  let bodyAttrHtml = ' data-vf-body=""';
  if (useBodyAttrs) {
    for (const [k, v] of Object.entries(bodyAttrs)) {
      bodyAttrHtml += ` ${k}="${_escapeAttr(v)}"`;
    }
  }
  const bodyHtml = `<div${bodyAttrHtml}>${processedBody}</div>`;

  // 6. Prepare srcdoc (full original page with <base> injected)
  let srcdoc = rawHtml;
  if (url) {
    srcdoc = _injectBase(srcdoc, url);
  }

  // 7. Build the resume diff delta.
  //    h = full <head> innerHTML (including scripts — the iframe needs them)
  //    d = diff operations array (strings + null sentinel)
  //
  //    On the client, element.js reconstructs the srcdoc from this delta
  //    and injects a tiny URL shim so that `new URL(x, window.location.href)`
  //    works even inside a srcdoc frame (where location.href is "about:srcdoc").
  const fullHead = _extractFullHead(rawHtml);
  const htmlAttrs = _extractHtmlAttrs(rawHtml);
  const resumeDelta = {
    u: url || "",
    h: fullHead,
    a: bodyAttrsStr.trim(),
    r: htmlAttrs,
    d: diffOps,
  };
  // Escape `</` inside JSON to prevent `</script>` from closing the carrier tag
  const resumeJson = JSON.stringify(resumeDelta).replace(/<\//g, "<\\/");
  const resumeScript = `<script type="text/vf-resume">${resumeJson}</script>`;

  // 8. Assemble <virtual-frame> HTML
  const srcAttr = url ? ` src="${_escapeAttr(url)}"` : "";
  const isolateAttr = isolate ? ` isolate="${isolate}"` : "";
  const selectorAttr = selector ? ` selector="${_escapeAttr(selector)}"` : "";

  const shadowContent = `${stylesHtml}\n${bodyHtml}`;

  let html;
  if (isolate) {
    html =
      `<virtual-frame${srcAttr}${isolateAttr}${selectorAttr} data-vf-ssr="">` +
      `<template shadowrootmode="${isolate}">` +
      shadowContent +
      `</template>` +
      resumeScript +
      `</virtual-frame>`;
  } else {
    html =
      `<virtual-frame${srcAttr}${selectorAttr} data-vf-ssr="">` +
      shadowContent +
      resumeScript +
      `</virtual-frame>`;
  }

  return {
    /** Rewritten `<style>` tags as HTML string. */
    styles: stylesHtml,
    /** Body content wrapped in `<div data-vf-body>`. */
    body: bodyHtml,
    /** Full HTML string to use as iframe srcdoc (with `<base>` injected). */
    srcdoc,
    /**
     * Complete `<virtual-frame>` HTML tag including declarative shadow DOM
     * and resume diff.  Ready to be emitted into the server response.
     */
    html,
    /** The raw (unprocessed) HTML fetched from the remote page. */
    rawHtml,
    /**
     * Resume delta object for client-side iframe reconstruction.
     * Contains the head HTML, body attrs, html attrs, and diff operations.
     * Used by framework integrations (e.g. @virtual-frame/next) that
     * reconstruct the srcdoc iframe without the custom element.
     */
    resumeDelta,
    /**
     * Re-render with different options (e.g. a selector) without
     * re-parsing styles.  Only available when called via
     * `fetchVirtualFrame` (which pre-fetches stylesheets).
     */
    render: (overrides: Partial<RenderVirtualFrameOptions> = {}) =>
      renderVirtualFrame(rawHtml, {
        url,
        isolate,
        _styles: styleEntries,
        ...overrides,
      }),
  };
}
