# Shadow DOM Isolation

Virtual Frame can render projected content inside a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) so host-page CSS never bleeds into the projected subtree — and vice versa. This is the single most important option when composing apps from different teams, origins, or styling conventions: without it, one stylesheet's `body { margin: 0 }` or utility-class reset instantly breaks the other. With it, each side keeps its own rules, its own fonts, and its own cascade.

This page covers what isolation does, how to choose open vs. closed, which CSS constructs Virtual Frame rewrites so that styles keep working inside a shadow tree, and the caveats that apply.

## When to use it

Turn isolation on whenever **either side** has CSS you don't want leaking:

- The projected document has its own design system — component CSS, scoped utilities, a CSS reset — and you don't want the host page's rules touching it.
- The host page has global styles (Tailwind preflight, a normalize.css, a base typography sheet) that would otherwise clobber the projected layout.
- You're composing remote widgets from multiple teams and need a hard boundary so a careless selector on one side doesn't show up as a visual bug on the other.

Leave it off (`isolate` omitted) only when you deliberately want the host's tokens and typography to style the projected content — for example, a CMS-rendered fragment that should inherit your page's heading styles. In that mode, the projected DOM lands in the host's light tree and is fully subject to host CSS.

**Default recommendation:** if you're not sure, use `isolate: "open"`. It's what every framework wrapper and the `<virtual-frame>` custom element default to in realistic compositions, and it's the only mode SSR supports (see [SSR → How resumption works](/guide/ssr#how-resumption-works)).

## Usage

With the core class:

```js
import { VirtualFrame } from "virtual-frame";

const vf = new VirtualFrame(iframe, host, { isolate: "open" });
```

Declaratively with the custom element:

```html
<virtual-frame src="./dashboard.html" isolate="open"></virtual-frame>
```

With a framework wrapper the prop is just `isolate="open"` on the component — see the [framework guides](/guide/getting-started#framework-components).

## Open vs closed

| Mode       | `host.shadowRoot` | `vf.getShadowRoot()` | When to pick                                                                                                                       |
| ---------- | ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `"open"`   | accessible        | returns the root     | Default. Host scripts (devtools, analytics, a11y tooling, tests) can still traverse the subtree.                                  |
| `"closed"` | `null`            | returns the root     | Actively discourages other scripts on the host page from reaching into the projected DOM. Use `getShadowRoot()` for legitimate access. |

Closed mode is **not a security boundary.** Scripts on the same page can still patch prototypes, monkey-patch `attachShadow`, or otherwise work around it — so don't rely on it to hide secrets. It's a strong *signal* that the subtree is not meant to be poked at, and it hides the tree from casual DOM walks, but no more than that.

::: info Accessing a closed root from your own code
When you construct a `VirtualFrame` with `isolate: "closed"`, the engine keeps a reference to the root on the instance. Call [`vf.getShadowRoot()`](/api/#getshadowroot) to reach it from the host — this works identically in open mode, so you can write host code that doesn't care which mode is in use.
:::

## What gets rewritten

A stylesheet written for a standalone document assumes that `body` exists, that `html` is the root, that `100vh` means the viewport, and that `@font-face` rules resolve globally. Inside a shadow tree, **none of those assumptions hold**. Virtual Frame rewrites the source CSS at collection time so the projected document renders the same as it would standalone. These rewrites are transparent — you don't opt into them, they just happen.

### Selector retargeting

- `html` and `:root` → `:host`. Rules defined at the document root (design tokens, CSS custom properties, base typography) now bind to the shadow host, which is where the projection lives.
- `body` → `[data-vf-body]`. Virtual Frame mirrors the projected `<body>` into the shadow as a `<div data-vf-body>` (a div, because shadow roots can't contain a real `<body>`), and rewrites body-targeted rules to hit it. `body { margin: 0; font-family: system-ui }` keeps working inside the projection.

This rewrite runs once per stylesheet when it's collected; dynamically added `<style>` tags and rules inserted via CSSOM (`sheet.insertRule`, `replaceSync`, etc.) are detected and rewritten as they appear.

### Viewport units

Width units are rewritten to **container query units**:

| Source unit  | Rewritten to |
| ------------ | ------------ |
| `vw`         | `cqw`        |
| `svw`        | `cqw`        |
| `dvw`        | `cqw`        |
| `lvw`        | `cqw`        |
| `vh` / `svh` / `dvh` / `lvh` | unchanged |
| `vmin` / `vmax` | unchanged |

The host element is given `container-type: inline-size`, so `100cqw` is the host's width — exactly what a source rule meant by "fill the viewport" when the page stood alone.

**Heights are intentionally left as-is.** `container-type: size` (which would be needed to rewrite `vh`) would cause the host to collapse to zero height unless the consumer explicitly sized it, which is a footgun. The projection scrolls natively: if the source wants a `100vh` hero, the host container scrolls and the hero stays full-height relative to the browser viewport, which is usually what you actually want for an embedded widget. If you need height to track the host box specifically, set an explicit `height` on the `<virtual-frame>` element and let the projection fill it.

### `@font-face` promotion

Shadow DOMs can reference fonts, but a `@font-face` rule declared *inside* a shadow tree is scoped to it and cannot be used by any other shadow tree or by the main document. That matters because the projected document may declare its own custom fonts, and those need to render.

Virtual Frame handles fonts in two passes:

1. **Rule rewriting.** `@font-face` blocks are kept in the collected stylesheet but the `font-family` name is **namespaced with a content-hash prefix** (a short djb2 hash of the source). All `font-family` references in the same sheet are rewritten to the prefixed name. This prevents the projection's "Inter" from colliding with the host's "Inter" — they're the same-shaped font faces under different internal names.
2. **JS `FontFace` promotion.** Any `FontFace` objects already loaded in the source document's `document.fonts` registry (common with frameworks that load fonts dynamically) are added to the **host document's** `document.fonts`. They're tracked on the instance and cleaned up on [`destroy()`](/api/#destroy) so you don't leak fonts across projection lifetimes.

The net effect: fonts declared in the source render correctly inside the projection, and they don't accidentally become available (or conflict) on the host page.

### Dynamic style mutations

If the source document adds a `<style>` tag at runtime (Vite HMR, styled-components, a dynamic theme switch), Virtual Frame picks it up:

- A **MutationObserver** watches the source `<head>` and body for `<style>` / `<link rel="stylesheet">` insertions, removals, and text changes, and re-collects CSS when they happen.
- For **CSSOM mutations** that don't touch the DOM (`sheet.insertRule`, `sheet.deleteRule`, `sheet.replaceSync`), the engine patches `CSSStyleSheet.prototype` in the iframe context to detect writes. Updates are debounced on a 16 ms frame so a burst of rule insertions coalesces into one recollection.

You shouldn't need to do anything to opt into this — it's the default for same-origin projections. In cross-origin setups the bridge serializes style changes across `postMessage` as part of the same mutation stream.

## Accessing the shadow root

Once projection has started, the shadow root is available via both APIs in open mode:

```js
const vf = new VirtualFrame(iframe, host, { isolate: "open" });

// Either works in open mode:
const root = host.shadowRoot;
const sameRoot = vf.getShadowRoot();
```

For closed mode, only the instance method works:

```js
const vf = new VirtualFrame(iframe, host, { isolate: "closed" });

host.shadowRoot;          // null — hidden by the browser
vf.getShadowRoot();       // returns the root
```

**Timing.** The shadow root is attached synchronously inside the constructor, so `getShadowRoot()` returns non-null immediately after `new VirtualFrame(...)`. The *content* inside the root appears asynchronously as the iframe finishes loading and projection starts streaming — so if you need to read rendered DOM, wait until `vf.isInitialized` is true, then use `waitFor` / `findBy…` patterns if you're in a test. See [Testing](/guide/testing).

## CSS custom properties across the boundary

CSS custom properties (`--color-accent`, etc.) inherit through the shadow boundary the same way they inherit through any DOM tree: a shadow tree sees properties set on ancestors of its host. That means:

- Setting a variable on the `<virtual-frame>` element itself, or on any host-side ancestor, makes it available inside the shadow. This is the intended path for theming a projection from the outside.
- Setting a variable on `:root` / `html` in the **host page** and expecting it to cross into the projection works too, because the shadow host is a descendant of the host `html`.
- Setting a variable only inside the **source document's** `:root` stays inside the projection (where `:root` has been rewritten to `:host`), and does not leak out to the host page.

If a host-side variable isn't applying, the usual cause is specificity: a rule inside the shadow that sets the same property wins. Inspect the shadow in devtools and look at the computed value on the element you expect it to affect.

## Composing with `selector`

[`selector`](/guide/selector) narrows **what** is projected; `isolate` determines **where** it renders. They're orthogonal and almost always used together:

```js
new VirtualFrame(iframe, host, {
  isolate: "open",
  selector: "#dashboard-widget",
});
```

CSS rewriting runs against the source document's stylesheets regardless of selector, so a subtree designed to render full-bleed in its own page (with `100vw`, `body { font: …}`) sizes itself relative to the host container when it's projected as a widget. This is how you take an existing page and embed a slice of it without restyling.

## SSR and declarative Shadow DOM

Server-side rendering emits the projected content inside a `<template shadowrootmode="open">` (or `"closed"`) so the browser applies the shadow tree on parse — no extra round-trip, no flash of unstyled content. This is why SSR requires `isolate` to be set: there's no mechanism to serialize a light-DOM projection with scoped styles intact.

On the client, the `<virtual-frame>` element reads the declarative template plus a `<script type="text/vf-resume">` sibling holding a JSON delta, and uses both to reconstruct a same-origin `srcdoc` iframe — so the browser never re-fetches the remote. See [SSR → How resumption works](/guide/ssr#how-resumption-works) for the full flow.

## Limitations

A few things the rewriter does **not** handle. Call them out up-front so you don't trip on them mid-integration:

- **Height-based viewport units are not retargeted.** `100vh` inside a projection still means the browser viewport, not the host box (see the reasoning above). If a source component strictly requires "fill my container height," give the `<virtual-frame>` an explicit height and let the source layout with percentages.
- **`::slotted` and slot semantics don't apply.** The projection is a mirrored tree, not distributed children. If the source document uses slotted composition internally it still works inside its own shadow; but you can't project "the slot content" independently from the host.
- **Selectors matching host-side elements won't cross.** If the source CSS targets a class or ID that only exists on the host page (unlikely, but possible), it won't find a match inside the shadow — and it shouldn't, since that would defeat isolation.
- **Global CSS features that depend on document-level context.** `@container`, `@scope`, and `@layer` work normally inside the shadow; but media queries evaluated against the browser viewport still evaluate against the viewport, not the host. Use container queries in the source if you want it to respond to the host's size.

## Common issues

**"My fonts look wrong in the projection."**  Fonts declared via `@font-face` in the *source* document are picked up automatically (rule-rewritten and, if already loaded as JS `FontFace` objects, promoted). Fonts declared only in the *host* page's stylesheet do not cross into the shadow, and would need a content-matching `@font-face` inside the source — or you can leave isolation off if you want host-side fonts.

**"A CSS variable from my host theme isn't applying inside the projection."**  Custom properties inherit through the shadow boundary when set on a host-side ancestor. Set the variable on the `<virtual-frame>` element itself, on `:host` inside the shadow, or on `html` of the host page — don't set it only inside the source document and expect the host to read it back.

**"`host.shadowRoot` returns `null` even though I used `isolate: 'open'`."**  If you're reading it synchronously before the element is in the DOM (custom element path) or before the constructor runs (core class path), it may not exist yet. In the custom element path, the shadow is attached on `connectedCallback`, so read `element.shadowRoot` after the element is connected or use `vf.getShadowRoot()` after the core instance is constructed.

**"Styles from the host page show up inside the projection anyway."**  Either isolation is off (`isolate` not set — you rendered into light DOM), or the "leak" is inherited through custom properties / inherited font stacks. Shadow DOM isolates *selectors*, not inherited values.

**"Host-side devtools can't find the projected elements."**  In closed mode that's the point. In open mode, Chrome/Firefox devtools show shadow roots under the host element — expand the `#shadow-root (open)` entry. If you're using a testing tool that doesn't pierce shadow DOM, prefer `vf.getShadowRoot()` to reach the subtree programmatically.

**"Projected SVG or canvas looks pixelated."**  Unrelated to Shadow DOM — that's [streaming FPS](/guide/streaming-fps) territory. Canvas / video frames are captured at buffer dimensions (no DPR scaling). If the source sizes its canvas without multiplying by `devicePixelRatio`, the projection will look soft on high-DPI displays; fix that on the source side. For motion smoothness, raise `streamingFps` (or omit it same-origin for smooth rAF).
