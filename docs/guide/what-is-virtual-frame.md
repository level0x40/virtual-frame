# What is Virtual Frame?

Virtual Frame is a library for composing independently deployed web applications into a single page. You point it at a URL (or an existing iframe), and it projects that document's live DOM into a host element you control — with CSS isolation, full interactivity, and cross-origin support. The projected content flows with your layout, listens to your theme, and participates in your composition the way a native component would, without any build-time coupling between host and remote.

This page is the conceptual overview: what projection means, why it's different from an iframe or a component library, and when it's the right tool. For install + first code, skip to [Getting Started](/guide/getting-started).

## The problem

Building applications from independently deployed services is the norm. Composing those pieces into one cohesive UI is where it breaks down. Every approach has a tax:

- **Module federation, workspace packages, shared bundles.** Great when host and remote share a build pipeline. Useless when they don't. Any team autonomy you wanted evaporates the moment you need a coordinated version bump.
- **Iframes.** Perfect isolation, zero composability. The remote is a rigid rectangle that doesn't flow with your page, can't inherit your theme, and fights you on sizing, focus, and accessibility.
- **Server-side composition (Edge Includes, ESI, fragments).** Fine for static markup. Falls apart when the remote needs interactivity or its own runtime — you end up re-inventing hydration or shipping both versions.
- **Ad-hoc SPA microfrontends.** A single-page shell that loads each team's bundle at runtime. Shared globals, shared DOM, shared CSS cascade, shared bugs.

Virtual Frame is aimed at the case where teams ship fully independent web applications — different repos, different stacks, different deploys — and the host page wants to treat one of them (or a slice of one) as a composable UI element. No shared build, no shared runtime, no iframe rectangle.

## The idea, in one paragraph

An iframe renders a remote document in its own browsing context. Virtual Frame still loads the remote document in a (hidden) iframe — so the remote's scripts, router, SSR, and state all work _normally_ — but it then **mirrors the remote's live DOM into a host element on your page**. A [MutationObserver](https://developer.mozilla.org/docs/Web/API/MutationObserver) keeps the mirror in sync; user events on the mirror replay on the original; stylesheets are rewritten so `body` / viewport units / `@font-face` make sense inside your layout. For cross-origin sources, a small bridge script running in the remote serializes the document back over `postMessage` and the host rebuilds it locally. The projected content is real DOM in your tree — so your layout, your theme, your tests, your a11y tooling all see it and can interact with it.

## How projection works

Three primitives make it go:

1. **A source iframe.** Hidden off-screen at `left: -9999px`, pointed at the remote URL. The remote runs as a complete standalone application — its framework, its router, its effects, its fonts. This is crucial: _Virtual Frame doesn't re-execute your app, it observes it._
2. **A host element.** Any element on your page — a `<div>`, a `<section>`, a component root. Virtual Frame attaches an optional [Shadow DOM](/guide/shadow-dom) to it and mirrors the remote's `<body>` subtree into the shadow.
3. **A sync layer.** Same-origin: a MutationObserver on the source, plus CSS rewriting and event re-dispatch. Cross-origin: the [bridge script](/guide/cross-origin) serializes DOM + events over `postMessage`, and the host reconstructs.

Everything else — [selector projection](/guide/selector), [streaming FPS](/guide/streaming-fps), [SSR](/guide/ssr), [shared state](/guide/store) — builds on this three-part model.

## What that gets you

- **Real DOM, real composition.** Projected content is part of your page's DOM. It participates in flex and grid layouts, inherits CSS custom properties from your theme, and responds to your media queries. Focus rings, tab order, and screen-reader navigation flow naturally.
- **Style isolation without visual isolation.** Shadow DOM keeps host and remote stylesheets from colliding, while custom properties still cross the boundary so you can theme the projection from the outside. Viewport units and `body`/`html` selectors are rewritten so the remote sizes itself to your host, not to the browser viewport.
- **Framework independence.** The host can be React, Vue, Svelte, Solid, Angular, or nothing at all; the remote can be any of the above, or something else entirely. There's a first-class binding for each (see [framework guides](/guide/getting-started#framework-components)) but they all sit on the same core engine.
- **Cross-origin without proxy gymnastics.** Ship the [bridge](/guide/cross-origin) in the remote once; every host on every origin can project it. A `proxy` option (in the SSR-capable packages) lets you keep first-party cookies and avoid CORS preflights for the remote's own API calls.
- **SSR with resumption.** Server-fetch the remote, emit declarative Shadow DOM inline, let the browser resume client-side without a second round-trip. See [SSR](/guide/ssr).
- **Partial projection.** Pull a single widget, panel, or region out of a larger remote page with a [CSS selector](/guide/selector) — the rest of the source still runs in the background, so the selected subtree behaves exactly as it would in its native page.

## What it is not

A few framings to keep clean, because they come up in design reviews:

- **Not an iframe replacement.** Virtual Frame still uses an iframe under the hood — that's how the remote's runtime gets its own browsing context. What Virtual Frame does differently is _project the iframe's DOM into your host_, so visually and compositionally it isn't an iframe anymore.
- **Not a trust boundary from the host's side.** The iframe does sandbox the remote's _script execution_ — the remote's JS runs in its own global, behind the same-origin policy, and cannot reach host DOM or variables directly. What's _not_ isolated is the projected output: once the remote's DOM is mirrored into your host, host code can read and manipulate the mirrored tree. `isolate: "closed"` is a signal, not a wall. If you need the remote's rendered content to stay hidden from the host page (untrusted remote, confidential DOM), keep the iframe visible and don't project.
- **Not module federation.** Nothing is shared at build time. No shared React instance, no shared bundle graph. If you need shared runtime state, use the [shared store](/guide/store) — a typed message channel over which both sides read and write — not a hidden bundle hand-off.
- **Not a hydration framework.** The remote hydrates normally inside its own iframe; Virtual Frame observes the result. You don't need to rewrite your remote app to be "projectable."

## When to reach for it

Virtual Frame is a good fit when you need to:

- Compose multiple independently deployed apps into one page without coordinating a build.
- Embed UI from another team, tenant, or origin, while keeping layout flow and interactivity (focus, scroll, theming).
- Retire a user-visible iframe embed that looks and feels like an iframe.
- Project only part of a remote app — a chart, a sidebar, a single panel — while the rest of the remote keeps running normally in the background.

Skip it when:

- Host and remote already share a build. Module federation, workspace packages, or a plain component export is lighter.
- You need a hard security boundary. Keep the iframe visible; Virtual Frame projects the DOM into your host and does not sandbox script execution.
- The remote doesn't need interactivity and doesn't change often. A server-rendered include or a static fragment is simpler.
- You want deep, synchronous, bidirectional framework state sharing (e.g., shared React context). Use one app, not two with a projection.

## Where to go next

- **First code.** [Getting Started](/guide/getting-started) — install, first projection, framework pointers.
- **Framework binding.** Pick the one you're using from the [framework guides](/guide/getting-started#framework-components). Each includes props, lifecycle, testing, and framework-specific gotchas.
- **Concepts in depth.** [Shadow DOM](/guide/shadow-dom), [Selector Projection](/guide/selector), [Cross-Origin](/guide/cross-origin), [Streaming FPS](/guide/streaming-fps).
- **SSR.** [Server-Side Rendering](/guide/ssr) — fetch the remote on your server, inline the projection, resume on the client.
- **Shared state.** [Store](/guide/store) — a reactive message channel for bidirectional state between host and remote.
- **API reference.** [API](/api/) — every option, property, and method on the `VirtualFrame` class and the `<virtual-frame>` custom element.
