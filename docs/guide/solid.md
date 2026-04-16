# Solid

`@virtual-frame/solid` wraps the core [`VirtualFrame`](/api/#virtualframe-class) class in a Solid component, a shared-source primitive, and a reactive-subscription primitive for the shared store. It's a thin, idiomatic binding — the component renders a `<div>`, owns a hidden `<iframe>`, and mirrors the iframe's live DOM into the `<div>` (optionally inside a Shadow DOM).

The package is **client-only**. If you need SSR — server-rendered HTML for SEO, faster first paint, or streaming — use [`@virtual-frame/solid-start`](/guide/solid-start) instead. It wraps the same engine with SolidStart-side SSR wiring. See the [SSR guide](/guide/ssr) for the underlying primitives.

## Installation

```sh
npm install virtual-frame @virtual-frame/solid
```

`virtual-frame` (the core) is a peer of `@virtual-frame/solid` — install both.

## Your first projection

```jsx
import { VirtualFrame } from "@virtual-frame/solid";

function App() {
  return (
    <VirtualFrame
      src="./dashboard.html"
      isolate="open"
      style={{ width: "100%", height: "400px" }}
    />
  );
}
```

What happens on mount:

1. The component renders a `<div>` (any style / class / attribute props you pass land on it).
2. It creates a hidden `<iframe>` pointed at `src`, attaches a Shadow DOM to the `<div>` (because `isolate="open"`), and starts mirroring the iframe's live DOM into the shadow root.
3. CSS from the source document is rewritten so `html` / `body` / viewport units target the host container instead of the browser viewport. Fonts declared in the source are promoted to the host `document.fonts`. See [Shadow DOM](/guide/shadow-dom).
4. User interactions — clicks, input, scroll, drag, keyboard — are proxied back to the source iframe. To the source app, the projection is indistinguishable from running standalone.

When the component unmounts (via `onCleanup`), the iframe is torn down, mutation observers and capture streams are released, and any injected font faces are removed.

## Props

| Prop           | Type                               | Description                                                                                             |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src`          | `string`                           | URL to load and project. Mutually exclusive with `frame`.                                               |
| `frame`        | `VirtualFrameRef`                  | Shared source from [`createVirtualFrame()`](#sharing-one-source-across-components). Mutually exclusive with `src`. |
| `isolate`      | `"open" \| "closed"`               | Shadow DOM mode for CSS isolation. Omit to render into the host `<div>` directly. See [Shadow DOM](/guide/shadow-dom). |
| `selector`     | `string`                           | CSS selector — only project a matching subtree. See [Selector Projection](/guide/selector).             |
| `streamingFps` | `number \| Record<string, number>` | FPS for `<canvas>` / `<video>` capture. Omit for smooth per-frame rAF same-origin (cross-origin falls back to ~5 FPS — set an explicit number for higher). See [Streaming FPS](/guide/streaming-fps). |
| `store`        | `StoreProxy`                       | Shared store from `@virtual-frame/store`. When provided, state syncs between host and remote. See [Shared Store](#shared-store). |
| `ref`          | `(handle: VirtualFrameHandle) => void` | Callback ref receiving `{ refresh() }`. See [Imperative handle](#imperative-handle).                 |

All other props — `class`, `style`, `id`, `data-*`, `aria-*`, event handlers — are spread onto the host `<div>`. Size the `<div>` with CSS; the projection fills it.

::: info No `proxy` prop on `@virtual-frame/solid`
This package doesn't expose `proxy` — the same-origin `fetch` / `XHR` rewrite prefix used for cross-origin SolidStart remotes. That feature needs framework-level server cooperation (a dev-proxy rule in `app.config.ts`), so it lives in `@virtual-frame/solid-start`. See the [SolidStart guide](/guide/solid-start#client-side-navigation-proxy) and [Cross-Origin](/guide/cross-origin).
:::

### Reactivity

`src`, `isolate`, `selector`, `streamingFps`, and `store` are tracked via `createEffect` internally — changing any of them triggers a re-projection automatically. Changing `src` tears down the old iframe and creates a new one; changing `selector` re-evaluates the match without touching the iframe.

## Imperative handle

Solid uses callback refs instead of ref objects. Capture the handle in a local variable when you need to force a re-projection — for example, after the source iframe has navigated in a way Solid can't observe, or after you've swapped content in the source via a channel that bypasses the MutationObserver.

```jsx
import { VirtualFrame } from "@virtual-frame/solid";

function App() {
  let vfHandle;

  return (
    <>
      <button onClick={() => vfHandle?.refresh()}>Refresh</button>
      <VirtualFrame
        ref={(h) => (vfHandle = h)}
        src="./dashboard.html"
        isolate="open"
      />
    </>
  );
}
```

The exposed surface is intentionally minimal:

```ts
interface VirtualFrameHandle {
  refresh(): void;
}
```

`refresh()` tears down the current projection and re-initializes against the same iframe. It's idempotent and cheap — feel free to wire it to user-visible "reload" buttons.

## Sharing one source across components

`createVirtualFrame()` creates a single shared source that multiple `<VirtualFrame>` components can project from. This is the right pattern when you want to compose several views of the **same** remote app — for example, a header in the nav and a sidebar widget from the same SaaS product — without loading the remote twice.

```jsx
import { VirtualFrame, createVirtualFrame } from "@virtual-frame/solid";

function App() {
  const frame = createVirtualFrame("/remote/");

  return (
    <>
      <VirtualFrame frame={frame} selector="#header" />
      <VirtualFrame frame={frame} selector="#counter" />
    </>
  );
}
```

One hidden iframe loads, both components project different subtrees from it, and both stay in sync as the remote app navigates or mutates.

### `createVirtualFrame(src, options?)`

| Parameter       | Type              | Description                          |
| --------------- | ----------------- | ------------------------------------ |
| `src`           | `string`          | URL to load                          |
| `options.store` | `StoreProxy`      | Optional store for shared state      |
| **Returns**     | `VirtualFrameRef` | Opaque handle — pass via `frame`     |

Must be called during component initialisation so `onCleanup` can register teardown. The source is ref-counted: the iframe is created on first use and torn down when the last consuming component unmounts.

When you use a shared frame with a store, pass the store to `createVirtualFrame({ store })` — **not** to individual `<VirtualFrame>` instances. The store bridge is established once per source.

## Shared Store

Share reactive state between host and remote frames using [`@virtual-frame/store`](/guide/store). Writes on either side propagate over a `MessagePort` bridge; every subscriber re-renders when its watched path changes. See the [Store guide](/guide/store) for the full model — this section covers the Solid integration.

### Installation

```sh
npm install @virtual-frame/store
```

### Host side

Create the store, seed initial values, and pass it to your `<VirtualFrame>` — either directly or via `createVirtualFrame()`:

```jsx
import { createStore } from "@virtual-frame/store";
import { VirtualFrame, createVirtualFrame, useStore } from "@virtual-frame/solid";

const store = createStore();
store.theme = "dark";
store.count = 0;

function App() {
  // Reactive subscription — returns a signal accessor.
  const count = useStore(store, ["count"]);

  return (
    <>
      <p>Host count: {count() ?? 0}</p>

      {/* Option A: one frame, pass store directly */}
      <VirtualFrame src="/remote/" store={store} />

      {/* Option B: shared frame — pass store to the primitive */}
      {/* const frame = createVirtualFrame("/remote/", { store }); */}
      {/* <VirtualFrame frame={frame} selector="#header" /> */}
    </>
  );
}
```

### Remote side

The remote app gets a singleton proxy that's wired to the host's port. Call `useStore()` from the `/store` subpath once to obtain the singleton, then subscribe to paths reactively with the main-package `useStore()`:

```tsx
import { useStore as useRemoteStore } from "@virtual-frame/solid/store";
import { useStore } from "@virtual-frame/solid";

function Counter() {
  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);
  const theme = useStore<string>(store, ["theme"]);

  return (
    <div data-theme={theme()}>
      <button onClick={() => store.count++}>
        Count: {count()}
      </button>
    </div>
  );
}
```

::: warning Two primitives with the same name
`@virtual-frame/solid` exports `useStore(store, selector?)` — a reactive subscription primitive, used by **both** host and remote code once you have a store. `@virtual-frame/solid/store` exports a separate `useStore()` — a zero-argument primitive that returns the **remote-side singleton** connected to the host. Aliasing the remote one (`useStore as useRemoteStore`) is the convention this project uses to keep them straight.
:::

### `useStore(store, selector?)`

Subscribes to a path in the store and returns a Solid signal accessor. Call it like a function to read the value.

```tsx
// Subscribe to a single key
const count = useStore<number>(store, ["count"]);

// Subscribe to a nested path
const name = useStore<string>(store, ["user", "name"]);

// Subscribe to every change (no selector — expensive, avoid in hot paths)
const snapshot = useStore(store);

// Read values by calling the accessor
<p>{count()}</p>
```

| Parameter   | Type            | Description                                 |
| ----------- | --------------- | ------------------------------------------- |
| `store`     | `StoreProxy`    | Store proxy from `createStore()` or the remote-side `useStore()` |
| `selector`  | `PropertyKey[]` | Path to subscribe to (omit for root)        |
| **Returns** | `() => T`       | Signal accessor with the current value      |

The subscription is automatically cleaned up via `onCleanup`.

## Testing

The Solid component is a thin wrapper over the core class, so testing patterns apply equally. Run tests in a real browser (Vitest browser mode or Playwright) — jsdom/happy-dom don't provide enough DOM fidelity. Wait for projection to settle with `findBy…` or `waitFor`, not `getBy…`, because projection completes across a few microtasks after mount. See [Testing](/guide/testing) for the full patterns.

## Common issues

**"The `<div>` renders but stays empty."** The iframe hasn't finished loading, or the MutationObserver hasn't caught up. Don't query the shadow root synchronously after mount — use `findBy…` / `waitFor`, or an `onMount` callback that watches the ref.

**"Changing `src` feels slow."** Changing `src` fully tears down the iframe and creates a new one. For fast switching between several remote views, prefer loading one source via `createVirtualFrame()` and switching the `selector` on consuming components.

**"My remote app does client-side navigation but requests fail in production."** Cross-origin remote + no proxy. Use `@virtual-frame/solid-start` with a dev-proxy rule (see [SolidStart → Client-Side Navigation](/guide/solid-start#client-side-navigation-proxy)) or host the remote same-origin.

**"Store writes don't reach the remote."** Ensure the store is passed to exactly one place per source: either directly as a `store` prop on `<VirtualFrame src="…" />`, or as `{ store }` on `createVirtualFrame()` — not both.
