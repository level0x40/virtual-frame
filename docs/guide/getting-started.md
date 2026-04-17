# Getting Started

By the end of this page you'll have a projection working on your page: a remote document rendering inside a host element, with CSS isolation, full interactivity, and no iframe rectangle. If you haven't read [What is Virtual Frame?](/guide/what-is-virtual-frame), skim that first — the mental model (the remote runs in a hidden iframe; Virtual Frame mirrors its DOM into your host) makes the rest easier to follow.

There are three ways to integrate: the custom element (HTML / vanilla JS), the `VirtualFrame` class (when you need imperative control), and a framework wrapper (React, Vue, Svelte, Solid, Angular, plus the meta-framework variants). Pick the one that matches how your page is built and skip the rest.

## Installation

Install the core package from npm:

::: code-group

```sh [npm]
npm install virtual-frame
```

```sh [pnpm]
pnpm add virtual-frame
```

```sh [yarn]
yarn add virtual-frame
```

:::

The core package is everything you need for the custom element and the `VirtualFrame` class. Framework wrappers are separate packages — install them alongside the core (see below).

## Your first projection

### Path A: the `<virtual-frame>` custom element

If your page is plain HTML, a static site, or server-rendered templates, this is the shortest path. Load the element once, then drop `<virtual-frame>` anywhere it makes sense:

```html
<script type="module">
  import "virtual-frame/element";
</script>

<virtual-frame
  src="./dashboard.html"
  isolate="open"
  style="width: 100%; height: 400px"
></virtual-frame>
```

That's a full working projection. When the element connects to the DOM it creates a hidden iframe pointed at `src`, attaches a Shadow DOM to the element (because of `isolate="open"`), and starts mirroring the source's `<body>` into the shadow — with CSS rewritten so the source renders to the element's box rather than the browser viewport. User interactions are proxied back to the source iframe. When the element is removed, everything is torn down.

**Size it with CSS.** The projection fills the element's box, so give it a width and a height (via explicit `style`, a class, or flex/grid layout). An element with no size renders nothing.

See [Vanilla JS](/guide/vanilla) for the full attribute reference and the `VirtualFrame` class if you need imperative control.

### Path B: the `VirtualFrame` class

Reach for the class when you need to create, move, or destroy projections programmatically — for animations, custom lifecycles, or framework wrappers:

```js
import { VirtualFrame } from "virtual-frame";

const iframe = document.getElementById("my-source"); // <iframe>
const host = document.getElementById("projection-host"); // <div>

const vf = new VirtualFrame(iframe, host, {
  isolate: "open",
  selector: "#main-content",
});

// Later, when you're done:
vf.destroy();
```

You bring the iframe and the host element; Virtual Frame wires them together. Projection starts synchronously from the constructor, but the first _content_ arrives once the iframe finishes loading — wait for `iframe.onload` or poll `vf.isInitialized` if you need to know when to read the projected DOM. Full lifecycle and options in the [API reference](/api/).

### Path C: a framework wrapper

If your page is built in a framework, use the corresponding wrapper — they handle mount/unmount, prop reactivity, refs, and state bridging idiomatically:

::: code-group

```sh [React]
npm install virtual-frame @virtual-frame/react
```

```sh [Vue]
npm install virtual-frame @virtual-frame/vue
```

```sh [Svelte]
npm install virtual-frame @virtual-frame/svelte
```

```sh [Solid]
npm install virtual-frame @virtual-frame/solid
```

```sh [Angular]
npm install virtual-frame @virtual-frame/angular
```

:::

Then import the component / directive from the wrapper and use it like any native component. Each framework guide walks through props, lifecycle, imperative handles, and testing:

- [React](/guide/react) · [Vue](/guide/vue) · [Svelte](/guide/svelte) · [Solid](/guide/solid) · [Angular](/guide/angular)

::: tip Using a meta-framework?
If you're on Next.js, Nuxt, SvelteKit, TanStack Start, SolidStart, Analog, React Router, or `@lazarv/react-server`, install the matching integration package instead of the client-only one. The meta-framework packages wire up SSR (inline the projection on the server, resume on the client), routing-aware navigation, and the `proxy` option for rewriting remote-origin requests through your host:

- React-based: [Next.js](/guide/nextjs) · [React Router](/guide/react-router) · [TanStack Start](/guide/tanstack-start) · [@lazarv/react-server](/guide/react-server)
- Vue-based: [Nuxt](/guide/nuxt)
- Svelte-based: [SvelteKit](/guide/sveltekit)
- Solid-based: [SolidStart](/guide/solid-start)
- Angular-based: [Analog](/guide/analog)
  :::

## Cross-origin in 30 seconds

Same-origin projection works out of the box. For a cross-origin source, include the bridge script once in the remote document, _before_ your framework runtime:

```html
<!-- Inside the cross-origin source document -->
<script src="https://unpkg.com/virtual-frame/dist/bridge.js"></script>
```

Then use Virtual Frame on the host normally — it detects the cross-origin source and negotiates with the bridge automatically. All options (`isolate`, `selector`, `streamingFps`) work identically across origins. See [Cross-Origin](/guide/cross-origin) for the protocol, CSP requirements, and the `proxy` option.

## Options at a glance

These are accepted by the `VirtualFrame` constructor. The custom element exposes them as kebab-case HTML attributes (`streaming-fps`, etc.) — see the [API reference](/api/#virtual-frame-custom-element) for the full mapping, and the linked guides for each option's semantics in depth.

| Option         | Type                               | Default     | Description                                                                                                          |
| -------------- | ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `isolate`      | `"open" \| "closed"`               | `undefined` | Shadow DOM mode for CSS isolation. See [Shadow DOM](/guide/shadow-dom).                                              |
| `selector`     | `string`                           | `undefined` | CSS selector — only project a matching subtree. See [Selector](/guide/selector).                                     |
| `streamingFps` | `number \| Record<string, number>` | `undefined` | Canvas/video streaming rate (`undefined` = smooth rAF, same-origin only). See [Streaming FPS](/guide/streaming-fps). |

::: tip Custom-element-only: `proxy`
The `<virtual-frame>` element also supports a `proxy` attribute — a same-origin prefix under which the env shim rewrites host-origin `fetch`/XHR back to the remote. The core `VirtualFrame` class doesn't accept this as a constructor option; it's a property of the env shim that the custom element and the meta-framework packages build when they create the iframe. See [Cross-Origin → the env shim and the `proxy` option](/guide/cross-origin#the-env-shim-and-the-proxy-option).
:::

## Sanity-checking your first projection

A few things to verify when a projection doesn't appear:

- **The host element has a size.** The projection fills the host's box; a zero-sized host renders zero. Set `width` and `height` explicitly (or via flex/grid layout).
- **The source iframe has loaded.** Projection kicks off asynchronously. For the class path, wait for `iframe.onload` or poll `vf.isInitialized` before asserting on the projected DOM. For the custom element and framework wrappers, use `findBy…` / `waitFor` in tests rather than synchronous queries.
- **For cross-origin sources, the bridge is in the remote.** Open devtools on the remote (load it directly in a new tab) and check that `virtual-frame/bridge` actually executes. If you see `vf:ready` repeating in the remote console, the host side never acknowledged — make sure the `<virtual-frame>` element is mounted and CSP isn't dropping the postMessage.
- **CSP / `frame-src`.** If your host page has a Content Security Policy, `frame-src` must allow the remote origin, and `script-src` must allow the bridge URL if it's on a CDN.
- **`isolate` for CSS-heavy sources.** Projecting a full-page app without `isolate` mixes its body/html rules with yours and usually produces a mess. When in doubt, use `isolate="open"`.

## What's next

- **Framework binding.** [React](/guide/react) · [Vue](/guide/vue) · [Svelte](/guide/svelte) · [Solid](/guide/solid) · [Angular](/guide/angular). Pick yours — each guide covers props, lifecycle, imperative control, testing, and framework-specific gotchas.
- **Core concepts in depth.** [Shadow DOM](/guide/shadow-dom) (isolation, CSS rewriting, fonts), [Selector](/guide/selector) (project a subtree), [Cross-Origin](/guide/cross-origin) (bridge, proxy, protocol), [Streaming FPS](/guide/streaming-fps) (canvas/video).
- **SSR.** [Server-Side Rendering](/guide/ssr) — inline the projection on the server, resume on the client without a second round-trip.
- **Shared state.** [Store](/guide/store) — a typed, reactive message channel between host and remote.
- **Production testing.** [Testing](/guide/testing) — the library depends on real browser primitives (MutationObserver, Shadow DOM, postMessage, canvas capture); jsdom/happy-dom won't cut it. Use Vitest browser mode or Playwright.
- **Reference.** [API](/api/) — every option, property, method, and the full custom-element attribute mapping.
