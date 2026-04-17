# API Reference

The `virtual-frame` package exposes a low-level class (`VirtualFrame`), a custom element (`<virtual-frame>`), and a cross-origin bridge entry point. Most applications use a framework wrapper (see the [framework guides](/guide/getting-started#framework-components)) and never touch these APIs directly — reach for them when you need fine-grained control over projection lifetime, roots, or transports.

## `VirtualFrame` class

```js
import { VirtualFrame } from "virtual-frame";
```

The projection engine. Given a source `<iframe>` and a host element, it mirrors the iframe's live DOM into the host — with mutation tracking, event re-dispatch, CSS rewriting, and optional Shadow DOM isolation.

### Constructor

```ts
new VirtualFrame(
  iframe: HTMLIFrameElement,
  host: HTMLElement,
  options?: VirtualFrameOptions,
)
```

Projection starts immediately; the constructor calls [`init()`](#init) internally. Subscribe to the iframe's `load` event or await navigation separately if you need a "ready" signal.

| Parameter | Type                  | Description                                       |
| --------- | --------------------- | ------------------------------------------------- |
| `iframe`  | `HTMLIFrameElement`   | Source iframe whose document will be projected    |
| `host`    | `HTMLElement`         | Container element that receives the projected DOM |
| `options` | `VirtualFrameOptions` | See [Options](#options). Optional.                |

### Options

The `VirtualFrameOptions` type:

```ts
interface VirtualFrameOptions {
  isolate?: "open" | "closed";
  selector?: string;
  streamingFps?: number | Record<string, number>;
}
```

| Option         | Type                               | Default     | Description                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isolate`      | `"open" \| "closed"`               | `undefined` | Attach a Shadow DOM of the given mode to the host for CSS isolation. Omit to render into the host's light DOM. See [Shadow DOM](/guide/shadow-dom).                                                                                                                               |
| `selector`     | `string`                           | `undefined` | CSS selector to project only a matching subtree of the iframe document. See [Selector Projection](/guide/selector).                                                                                                                                                               |
| `streamingFps` | `number \| Record<string, number>` | `undefined` | Frames-per-second for canvas/video streams. `undefined` means smooth per-frame (rAF) rendering same-origin; cross-origin falls back to ~5 FPS (set an explicit number for higher). A `{ selector: fps }` map allows per-element rates. See [Streaming FPS](/guide/streaming-fps). |

::: info Custom element only
The `<virtual-frame>` element also accepts a `proxy` attribute (same-origin fetch/XHR rewrite prefix). This is **not** part of `VirtualFrameOptions` — it's applied to the generated env shim before the iframe loads. See [`<virtual-frame>`](#virtual-frame-custom-element) below and [Cross-Origin](/guide/cross-origin).
:::

### Properties

Read-only after construction.

| Property        | Type                                            | Description                                                                                        |
| --------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `iframe`        | `HTMLIFrameElement`                             | The source iframe passed to the constructor.                                                       |
| `host`          | `HTMLElement`                                   | The host element receiving projected content.                                                      |
| `isolate`       | `"open" \| "closed" \| undefined`               | Shadow DOM mode in use.                                                                            |
| `selector`      | `string \| null`                                | CSS selector, normalized to `null` when omitted.                                                   |
| `streamingFps`  | `number \| Record<string, number> \| undefined` | The FPS configuration in effect.                                                                   |
| `shadowRoot`    | `ShadowRoot \| null`                            | Open shadow root, when `isolate: "open"`. For closed mode use [`getShadowRoot()`](#getshadowroot). |
| `isInitialized` | `boolean`                                       | `true` after `init()` has completed at least once.                                                 |

### Methods

#### `destroy()`

```ts
destroy(): void
```

Stop projecting and release resources: detach the MutationObserver, remove event/message listeners, stop canvas/video capture streams, delete injected `FontFace` entries, and clear the host subtree. Safe to call multiple times. After `destroy()` the instance can be revived with [`refresh()`](#refresh).

#### `refresh()`

```ts
refresh(): void
```

Equivalent to `destroy(); init()`. Use when the source iframe has changed in a way the mutation observer can't see (e.g., you replaced the iframe's `src` programmatically and want a clean re-projection without recreating the `VirtualFrame` instance).

#### `getShadowRoot()`

```ts
getShadowRoot(): ShadowRoot | null
```

Returns the shadow root attached to the host, regardless of `"open"` or `"closed"` mode. Use this when `isolate: "closed"` prevents access via `host.shadowRoot`. Returns `null` if `isolate` was not set.

#### `init()` <Badge type="info" text="internal" />

Called automatically by the constructor and by [`refresh()`](#refresh). You typically don't need to invoke this directly; it is documented for completeness.

---

## `<virtual-frame>` custom element

```js
import "virtual-frame/element";
```

Declarative wrapper around `VirtualFrame`. Each element manages its own hidden `<iframe>` (shared between sibling elements pointing at the same `src` to avoid duplicate loads) and projects into its own subtree.

### Attributes

HTML attributes use kebab-case and always stringify. The element maps them to camelCase options at setup time.

| Attribute       | Maps to        | Description                                                                                                     |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `src`           | —              | URL of the remote document, or `#id` to reference an existing `<iframe>` / element in-page.                     |
| `isolate`       | `isolate`      | `"open"` or `"closed"`.                                                                                         |
| `selector`      | `selector`     | CSS selector to project a subtree.                                                                              |
| `streaming-fps` | `streamingFps` | Either a number (e.g. `streaming-fps="30"`) or a JSON object (e.g. `streaming-fps='{"canvas":30,"video":60}'`). |
| `proxy`         | — (env shim)   | Same-origin proxy prefix for `fetch`/`XHR` rewriting. See [Cross-Origin](/guide/cross-origin).                  |

Any attribute change on a connected element triggers a teardown + re-setup on the next microtask. To swap the source without restarting projection, prefer calling [`refresh()`](#refresh-1) on the underlying `VirtualFrame`.

### Methods

#### `refresh()`

```ts
element.refresh(): void
```

Equivalent to the `VirtualFrame` method of the same name — force a full re-projection.

---

## Bridge entry point

```js
// Served from the remote origin before any framework code
import "virtual-frame/bridge";
```

The bridge is a small script that runs inside the projected document when it lives on a different origin than the host. It serialises DOM, CSS, events, and input back to the host via `postMessage`. See [Cross-Origin](/guide/cross-origin) for the end-to-end flow and the message protocol.

---

## Types

### `VirtualFrameOptions`

```ts
export interface VirtualFrameOptions {
  isolate?: "open" | "closed";
  selector?: string;
  streamingFps?: number | Record<string, number>;
}
```

See [Options](#options).

### `EnvShimOptions`

```ts
export interface EnvShimOptions {
  /**
   * Same-origin proxy prefix. When set, the fetch/XHR shim rewrites
   * host-origin requests to `location.origin + proxyBase + pathname`,
   * keeping traffic same-origin and avoiding CORS.
   *
   * The host server must proxy `proxyBase/:path*` → `remoteOrigin/:path*`.
   */
  proxyBase?: string;
}
```

Consumed by the internal `_buildEnvShim()` helper that composes the `<script>` injected into the projected iframe before any framework code runs. Framework integrations and the custom element expose this as `proxy` / `proxyBase`.

---

## SSR entry point

```js
import {} from /* … */ "virtual-frame/ssr";
```

Server-side helpers used by the Next.js, Nuxt, SvelteKit, TanStack Start, and other SSR integrations to seed projection payloads at render time. Most users consume these transitively through a framework wrapper. See the [SSR guide](/guide/ssr) for the primitives (`fetchVirtualFrame`, `renderVirtualFrame`) and the [Next.js guide](/guide/nextjs) for a framework-integrated walkthrough.

---

## Framework packages

Each framework package wraps the core engine with idiomatic bindings (components, hooks, signals, stores). See the guide for the package you use:

| Package                         | Guide                                       |
| ------------------------------- | ------------------------------------------- |
| `@virtual-frame/react`          | [React](/guide/react)                       |
| `@virtual-frame/next`           | [Next.js](/guide/nextjs)                    |
| `@virtual-frame/react-router`   | [React Router](/guide/react-router)         |
| `@virtual-frame/tanstack-start` | [TanStack Start](/guide/tanstack-start)     |
| `@virtual-frame/react-server`   | [@lazarv/react-server](/guide/react-server) |
| `@virtual-frame/vue`            | [Vue](/guide/vue)                           |
| `@virtual-frame/nuxt`           | [Nuxt](/guide/nuxt)                         |
| `@virtual-frame/svelte`         | [Svelte](/guide/svelte)                     |
| `@virtual-frame/sveltekit`      | [SvelteKit](/guide/sveltekit)               |
| `@virtual-frame/solid`          | [Solid](/guide/solid)                       |
| `@virtual-frame/solid-start`    | [SolidStart](/guide/solid-start)            |
| `@virtual-frame/angular`        | [Angular](/guide/angular)                   |
| `@virtual-frame/analog`         | [Analog](/guide/analog)                     |
| `@virtual-frame/store`          | [Shared Store](/guide/store)                |
