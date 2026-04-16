# Vanilla JS

The core `virtual-frame` package has no framework dependency. You can use it two ways — a declarative custom element (`<virtual-frame>`) for ordinary HTML pages and server-rendered markup, or the `VirtualFrame` class directly for full programmatic control. Both are thin layers over the same engine.

## When to pick which

| Scenario                                                                                          | Use                    |
| ------------------------------------------------------------------------------------------------- | ---------------------- |
| Plain HTML page, static site generator, or a server-rendered template                              | Custom element         |
| You control the source iframe yourself (an existing `<iframe>` in the page you want to project)    | Custom element with `src="#id"` |
| You need to create, move, or destroy projections imperatively (e.g. animations, custom lifecycles) | `VirtualFrame` class   |
| You're writing a framework binding or a wrapper component                                          | `VirtualFrame` class   |

The two paths compose: the custom element is implemented in ~200 lines on top of `VirtualFrame`, and you can mix them freely in the same page.

## Custom element

Load the element once, then use it anywhere in your HTML:

```html
<script type="module">
  import "virtual-frame/element";
</script>

<virtual-frame src="./dashboard.html" isolate="open"
               style="width: 100%; height: 400px"></virtual-frame>
```

What happens when the element connects:

1. The element schedules a microtask that reads its attributes.
2. It creates a hidden `<iframe>` pointed at `src`, inserts it as a sibling, attaches a Shadow DOM to itself (because `isolate="open"`), and starts mirroring the iframe's live DOM into the shadow root.
3. CSS from the source document is rewritten so `html` / `body` / viewport units target the element's own box instead of the browser viewport. Fonts declared in the source are promoted to the host `document.fonts`. See [Shadow DOM](/guide/shadow-dom).
4. User interactions — clicks, input, scroll, drag, keyboard — are proxied back to the source iframe. To the source app, the projection is indistinguishable from running standalone.

When the element is removed from the DOM, the iframe is torn down, mutation observers and capture streams are released, and any injected font faces are removed. Size the element with CSS; the projection fills it.

::: tip Shared iframes across sibling elements
If you mount two `<virtual-frame>` elements with the same `src`, they share a single hidden iframe under the hood (ref-counted, torn down when the last consumer disconnects). That makes it cheap to compose several views of the same remote app — one full-page, one widget slot — from plain HTML, with no extra coordination.
:::

### Attributes

HTML attributes are kebab-case and always stringify. The element maps them to camelCase options at setup time.

| Attribute       | Maps to         | Description                                                                                             |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `src`           | —               | URL of the remote document, or `#id` to reference an existing in-page `<iframe>` (see below).           |
| `isolate`       | `isolate`       | Shadow DOM mode: `"open"` or `"closed"`. Omit to render into the element's light DOM. See [Shadow DOM](/guide/shadow-dom). |
| `selector`      | `selector`      | CSS selector — only project a matching subtree. See [Selector Projection](/guide/selector).             |
| `streaming-fps` | `streamingFps`  | Either a number (`streaming-fps="30"`) or a JSON object (`streaming-fps='{"canvas":30,"video":60}'`). See [Streaming FPS](/guide/streaming-fps). |
| `proxy`         | — (env shim)    | Same-origin proxy prefix for `fetch` / `XHR` rewriting. See [Cross-Origin](/guide/cross-origin).        |

Any attribute change on a connected element triggers a teardown + re-setup on the next microtask. To refresh in place without recreating resources, use the element's [`refresh()`](#imperative-control) method.

### Referencing an existing iframe

Pass `src="#id"` to project from an `<iframe>` that already exists in your page. The element will not create or manage the iframe — you own its lifetime.

```html
<iframe id="my-source" src="./dashboard.html"
        style="position: fixed; left: -9999px"></iframe>

<virtual-frame src="#my-source" isolate="open"></virtual-frame>
```

This is useful when the iframe needs to outlive the projection, or when you want to manage `iframe.src` changes yourself (e.g. routing the source app independently of the host). The custom element's internal shared-iframe map is bypassed in this mode.

### Imperative control

The element exposes one method:

```ts
element.refresh(): void
```

Call `refresh()` when the source iframe has changed in a way the MutationObserver can't see — for example, after a `document.write` or an event channel that bypasses DOM mutations. It's idempotent and cheap.

```js
const vf = document.querySelector("virtual-frame");
document.getElementById("reload").addEventListener("click", () => vf.refresh());
```

## Core class

For full programmatic control, use the `VirtualFrame` class directly. You bring your own iframe and your own host element:

```js
import { VirtualFrame } from "virtual-frame";

const iframe = document.querySelector("iframe");
const host = document.getElementById("host");

const vf = new VirtualFrame(iframe, host, {
  isolate: "open",
  selector: ".main",
  streamingFps: { canvas: 30, video: 10 },
});
```

Projection starts immediately — the constructor calls `init()` synchronously. Subscribe to `iframe.load` if you need to wait for the source to finish loading before asserting on content, or poll `vf.isInitialized`.

### Lifecycle

```js
// Force a full re-projection against the same iframe.
vf.refresh();

// Stop projecting and release all resources.
vf.destroy();
```

- `refresh()` is equivalent to `destroy(); init()`. Use after a source change the observer can't see. Cheap; idempotent.
- `destroy()` detaches the MutationObserver, clears the host subtree, releases capture streams, removes injected fonts, and drops listeners. Safe to call multiple times. After `destroy()` the instance can be revived with `refresh()`.

### Reading the shadow root

With `isolate: "open"`, the shadow root is on `host.shadowRoot` as usual. With `isolate: "closed"`, use `vf.getShadowRoot()` — the engine stashes the reference so you can still reach it from your own code.

```js
const root = vf.getShadowRoot();
root?.querySelector(".counter");
```

### Full reference

See the [API reference](/api/) for the complete constructor signature, every option, every property (`isInitialized`, `shadowRoot`, `iframe`, `host`, etc.), and every method.

## When to reach for a framework wrapper instead

If your page already uses React / Vue / Svelte / Solid / Angular, use the corresponding framework package — they handle mount/unmount, prop reactivity, refs, and store bridging idiomatically, and the ergonomics are materially better than calling the custom element from framework code. If you need server rendering, reach directly for the SSR-capable framework wrapper (`@virtual-frame/next`, `@virtual-frame/nuxt`, `@virtual-frame/sveltekit`, `@virtual-frame/tanstack-start`, `@virtual-frame/solid-start`, `@virtual-frame/analog`, `@virtual-frame/react-server`). See the [framework guides](/guide/getting-started#framework-components) for the full list.

## Common issues

**"Nothing appears."** The iframe hasn't loaded yet — projection is asynchronous. Wait for `iframe.load` or poll `vf.isInitialized` before asserting on content. For the element, use `waitFor` / `findBy…` in tests.

**"Why is the iframe positioned off-screen instead of `display: none`?"** `display: none` stops the iframe from running scripts in some browsers, which would break the projection. The engine positions it fixed at `left: -9999px` so it remains active but invisible.

**"Changing `src` feels heavy."** Every `src` change tears down and recreates the iframe. For fast switching between several views of the same source, prefer loading the source once (either a single `<virtual-frame>` or a single hidden `<iframe>` you reference with `src="#id"`) and change `selector` instead — that re-evaluates the match without a new load.

**"CSS variables from my theme don't apply inside the projection."** Custom properties inherit through the shadow boundary only when set on a host-side ancestor. Set them on the `<virtual-frame>` element itself, or on `:host` inside the shadow. See [Shadow DOM → Common issues](/guide/shadow-dom#common-issues).
