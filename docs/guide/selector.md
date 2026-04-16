# Selector Projection

Instead of projecting the whole source document, `selector` narrows projection to a specific subtree. This turns Virtual Frame from "embed a whole app" into "compose a widget" — useful when the source page contains chrome (headers, navigation, footers, ads) that the host already provides, or when you want to surface a single panel of a larger app without a second iframe load.

The mental model is: the source runs as a complete document (its router, its stylesheets, its scripts all execute normally), and you project just the slice you want. Everything outside the slice is invisible to the host but still alive in the background — so state, navigation, and in-page interactions continue to work inside the projected region.

## When to reach for it

- **Widget composition.** A dashboard page exposes a chart component you want on your landing page. Point `src` at the dashboard and `selector` at the chart.
- **Embedding a remote page without its header.** You want the *content* of `/docs/article` but not the site's nav and footer.
- **Multiple views of the same source.** Two or three `<virtual-frame>` elements with the same `src` but different selectors show different slices of one shared hidden iframe (the custom element ref-counts these — see [vanilla.md's shared iframes tip](/guide/vanilla#custom-element)).

Skip `selector` when you actually want the whole document — it's not zero-cost (the full source still loads, style-rewrites, and runs), so use it to reduce *what the user sees*, not to reduce what the browser does.

## Usage

```js
import { VirtualFrame } from "virtual-frame";

const vf = new VirtualFrame(iframe, host, {
  isolate: "open",
  selector: "#main-content",
});
```

Declaratively:

```html
<virtual-frame
  src="./page.html"
  isolate="open"
  selector="#main-content"
></virtual-frame>
```

Any valid CSS selector works — IDs, classes, attribute selectors, `:nth-of-type`, `[data-region="content"]`. Matching follows the same rules as `document.querySelector`.

## How matching works

**Single match, first-wins.** Virtual Frame uses `querySelector` under the hood, so only the **first** match is projected. If the selector matches multiple elements, the rest are ignored. If you want multiple regions projected, use multiple `<virtual-frame>` elements with different selectors — all pointing at the same `src` — and the custom element will share one hidden iframe across them.

**The ancestor chain is preserved.** The engine doesn't lift the matched element into an orphan tree; it mirrors the path from `<body>` down to the match, with all siblings of that chain pruned. This matters because some frameworks carry scoping context on ancestors — Angular's view-encapsulation attributes, Tailwind's `class="dark"` flag, CSS custom properties set on parents — and those need to reach the projected subtree for it to render correctly. You don't need to think about this; it just works.

**Stylesheets are collected in full.** Even though you're projecting a subtree, *all* of the source document's stylesheets are collected, rewritten for Shadow DOM (see [Shadow DOM → What gets rewritten](/guide/shadow-dom#what-gets-rewritten)), and applied inside the projection. That keeps the widget visually faithful: a component styled by a rule three levels away in a different sheet will still look right when you pull just that component into a host page.

## Lifecycle under source changes

The selector is evaluated against the source document's **live DOM**, and Virtual Frame keeps it in sync as the source evolves:

- **Attribute, text, and subtree mutations inside the matched element** propagate through the same MutationObserver pipeline as full-document projection — no special selector handling needed.
- **A match that appears later** (for example, because the source is still hydrating, or a lazy-mounted component just rendered) is picked up automatically. The observer watches for added nodes that match the selector, and re-mirrors when one shows up.
- **A match that is removed** — including via an ancestor being removed — triggers a *freeze*: the mirror holds its previous content while the selector watches for a replacement. When a new matching element appears, projection resumes against it. If nothing replaces it, the frozen content stays as a fallback rather than flashing empty.
- **Navigation inside the source iframe** — a SPA route change, a full reload — causes the selector to re-evaluate against the new document. A selector like `#main-content` keeps working as the user navigates the projected app, as long as the new page also has an element matching it.

This behavior is the reason `selector` is safe to use with apps that hydrate lazily or animate mounts: you don't have to predict *when* the match will appear, only describe *what* to look for.

## No-match behavior

If the selector matches nothing when projection starts:

- A warning is logged: `virtual-frame: selector "…" matched nothing in iframe`.
- The host renders empty (no content in the shadow root).
- The MutationObserver keeps watching, so a match that appears later is projected as soon as it enters the DOM.

For SSR, no-match behaves differently: see [SSR behavior](#ssr-behavior) below.

## Cross-origin

With a cross-origin source, the bridge serializes the source document as a full descriptor tree and posts it to the host. **The host evaluates the selector against the serialized tree** — the remote side doesn't know or care about the selector. This keeps the bridge protocol simple and lets multiple host compositions pick different selectors against the same serialized snapshot without coordinating with the remote.

The lifecycle rules above (freeze on remove, re-match on late arrivals, re-evaluate on navigation) all carry through cross-origin — they're implemented against the descriptor tree with the same logic that runs against a live DOM in same-origin mode.

## SSR behavior

On the server, `fetchVirtualFrame` / `renderVirtualFrame` evaluate the selector against the fetched HTML. Two cases:

**Match found.** The matched subtree goes into the declarative Shadow DOM template. The resume delta carries the **full body** with a placeholder splitting it around the match, so the client can reconstruct the entire source document into a `srcdoc` iframe — not just the matched slice. This is what lets the source app keep working normally after hydration: its router, its event handlers, its lazy-mounted children all see the document they expect.

**No match at server time.** Virtual Frame logs a warning and falls back to rendering the **full body** into the template. The client-side element then re-evaluates the selector against the live DOM on mount, so selectors that need hydration to resolve still work — you just don't get the SSR fast-path benefit for that page.

This fallback is why `selector` is safe to use with SSR even when your remote app hydrates some of its regions client-side: worst case, SSR degrades to "render everything and let the client pick," not "render nothing."

## Composing with Shadow DOM

`selector` and [`isolate`](/guide/shadow-dom) are orthogonal: the selector narrows **what** is projected; `isolate` determines **where** it renders. A typical widget-composition uses both:

```js
new VirtualFrame(iframe, host, {
  isolate: "open",
  selector: "#widget",
});
```

CSS rewriting still applies (`html`/`:root` → `:host`, `body` → `[data-vf-body]`, width viewport units → `cqw`), so a component designed to render full-bleed in its own page sizes itself relative to the host container inside the projection.

## Limitations

- **First match only.** If your selector matches multiple elements, the rest are silently ignored. For multi-region projection, use multiple elements.
- **Selector is element-based, not children-based.** There's no "project the children of this node" mode. Wrap the children in a stable element in the source, or target each child with its own `<virtual-frame>`.
- **Can't re-parent across the match boundary.** If a mutation in the source moves an element out of the matched subtree, it leaves the projection. If you want a node to survive arbitrary source-side reparenting, anchor on a stable wrapper selector rather than the node itself.

## Common issues

**"My selector matches but nothing renders."**  The match may resolve before the matched element has children — common with apps that render a container first and populate it on the next microtask. Mutations stream in as the source hydrates; if nothing ever appears, open devtools on the source document (open its URL directly in a new tab) and verify the selector there.

**"I want to project the children of an element, not the element itself."**  Selector projection is element-based. Wrap the children in a stable element in the source (`<div data-region="content">…</div>`), or target each child directly (`.card` instead of `.cards`) with multiple `<virtual-frame>` elements.

**"Projected layout shifts when the source navigates."**  The selector re-evaluates on each new source document. If different pages have different top-level elements for the same logical region, pick a selector that matches on all of them — `main`, `[data-region="content"]`, or a class convention — rather than a brittle ID.

**"I got a 'matched nothing' warning in my server logs."**  Your SSR pass ran against a server-rendered HTML string that didn't contain the element. Either the selector targets something your framework only mounts on the client (in which case SSR falls back to full-body and the client picks up the match), or the selector is wrong. Check the fetched HTML directly before debugging the rewriter.

**"Multiple elements match but only one appears."**  Expected — `selector` uses first-match semantics. Use a more specific selector to target the one you want, or compose multiple `<virtual-frame>` elements.
