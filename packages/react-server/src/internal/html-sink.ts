/**
 * SECURITY BOUNDARY — intentional HTML sinks for virtual-frame.
 *
 * The functions in this module embed HTML that was fetched from a
 * caller-chosen remote origin directly into the server response.  That
 * is the whole purpose of virtual-frame: it is a "virtual iframe" which
 * renders remote HTML inline, analogous to `<iframe srcdoc>`.  The trust
 * model is documented in SECURITY.md ("Security model for embedded
 * content") — callers are responsible for choosing a trusted origin, the
 * same way they are when they write `<iframe src="…">`.
 *
 * CodeQL's `js/html-constructed-from-input` and `js/xss-through-dom`
 * queries fire on these templates by design.  Alerts on this specific
 * file are suppressed via `.github/codeql/codeql-config.yml` (path
 * filter), so the rest of the codebase stays under full analysis while
 * this narrow boundary is audited by hand.
 *
 * Keep this file small and focused.  Do not add general-purpose string
 * assembly here — every line should be reviewable as an intentional HTML
 * sink.
 */

export type IsolateMode = "open" | "closed";

/**
 * Compose the SSR HTML fragment for a virtual frame, optionally wrapping
 * the embedded styles + body in a declarative shadow root.
 *
 * All three content arguments (`styles`, `body`, `resumeScript`) are
 * concatenated unescaped — that is the point.  The only user-influenced
 * *attribute* is `isolate`, and it is normalised to a fixed two-value
 * set before being interpolated to prevent attribute injection.
 *
 * @param styles         Pre-rewritten `<style>` tags from the remote page.
 * @param body           Body wrapper (`<div data-vf-body>…</div>`) built by core.
 * @param resumeScript   Serialised resume-delta `<script>` tag.
 * @param isolate        Shadow-root mode, or `undefined` for no shadow root.
 * @returns HTML fragment ready to emit into a server response.
 */
export function composeShadowFragment(
  styles: string,
  body: string,
  resumeScript: string,
  isolate?: IsolateMode,
): string {
  if (!isolate) {
    return `${styles}\n${body}${resumeScript}`;
  }
  // Normalise to the known-good set.  Anything other than "closed" falls
  // back to "open" — the library's documented default — which prevents
  // attribute injection via a crafted `isolate` value.
  const mode: IsolateMode = isolate === "closed" ? "closed" : "open";
  return `<template shadowrootmode="${mode}">${styles}\n${body}${resumeScript}</template>`;
}
