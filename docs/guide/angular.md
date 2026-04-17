# Angular

`@virtual-frame/angular` wraps the core [`VirtualFrame`](/api/#virtualframe-class) class in a standalone Angular directive, a shared-source factory, and injection-based primitives for the shared store. It's a thin, idiomatic binding — the directive attaches to a `<div>`, owns a hidden `<iframe>`, and mirrors the iframe's live DOM into the `<div>` (optionally inside a Shadow DOM).

The package is **client-only**. If you need SSR — server-rendered HTML for SEO, faster first paint, or streaming — use [`@virtual-frame/analog`](/guide/analog) instead. It wraps the same engine with Nitro-side SSR wiring for Analog.js. See the [SSR guide](/guide/ssr) for the underlying primitives.

## Installation

```sh
npm install virtual-frame @virtual-frame/angular
```

`virtual-frame` (the core) is a peer of `@virtual-frame/angular` — install both.

## Your first projection

```typescript
import { Component } from "@angular/core";
import { VirtualFrameDirective } from "@virtual-frame/angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [VirtualFrameDirective],
  template: `
    <div
      virtualFrame
      src="./dashboard.html"
      isolate="open"
      style="width: 100%; height: 400px"
    ></div>
  `,
})
export class AppComponent {}
```

What happens on `ngOnInit`:

1. The directive attaches to the host `<div>` (any style / class / attribute bindings you put on it are preserved).
2. It creates a hidden `<iframe>` pointed at `src`, attaches a Shadow DOM to the `<div>` (because `isolate="open"`), and starts mirroring the iframe's live DOM into the shadow root.
3. CSS from the source document is rewritten so `html` / `body` / viewport units target the host container instead of the browser viewport. Fonts declared in the source are promoted to the host `document.fonts`. See [Shadow DOM](/guide/shadow-dom).
4. User interactions — clicks, input, scroll, drag, keyboard — are proxied back to the source iframe. To the source app, the projection is indistinguishable from running standalone.

On `ngOnDestroy`, the iframe is torn down, mutation observers and capture streams are released, and any injected font faces are removed.

## Inputs

| Input          | Type                               | Description                                                                                                                                                                                           |
| -------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`          | `string`                           | URL to load and project. Mutually exclusive with `frame`.                                                                                                                                             |
| `frame`        | `VirtualFrameRef`                  | Shared source from [`createVirtualFrame()`](#sharing-one-source-across-directives). Mutually exclusive with `src`.                                                                                    |
| `isolate`      | `"open" \| "closed"`               | Shadow DOM mode for CSS isolation. Omit to render into the host `<div>` directly. See [Shadow DOM](/guide/shadow-dom).                                                                                |
| `selector`     | `string`                           | CSS selector — only project a matching subtree. See [Selector Projection](/guide/selector).                                                                                                           |
| `streamingFps` | `number \| Record<string, number>` | FPS for `<canvas>` / `<video>` capture. Omit for smooth per-frame rAF same-origin (cross-origin falls back to ~5 FPS — set an explicit number for higher). See [Streaming FPS](/guide/streaming-fps). |
| `store`        | `StoreProxy`                       | Shared store from `@virtual-frame/store`. When provided, state syncs between host and remote. See [Shared Store](#shared-store).                                                                      |

All other attributes and bindings on the host `<div>` are preserved — the directive never rewrites the element's own markup. Size the `<div>` with CSS; the projection fills it.

::: info No `proxy` input on `@virtual-frame/angular`
This package doesn't expose `proxy` — the same-origin `fetch` / `XHR` rewrite prefix used for cross-origin Analog.js remotes. That feature needs framework-level server cooperation (a dev proxy and a server route), so it lives in `@virtual-frame/analog`. See the [Analog guide](/guide/analog#client-side-navigation-proxy) and [Cross-Origin](/guide/cross-origin).
:::

### Change detection

The directive implements `OnChanges`. Any time Angular's change detection sees a new value for one of the inputs above, it calls `setup()` again — tearing down the old projection and starting a new one. Changing `src` tears down the old iframe and creates a new one; changing `selector` re-evaluates the match without touching the iframe.

## Imperative handle

Use a `ViewChild` reference when you need to force a re-projection. Typical cases: the source iframe navigated in a way Angular can't observe, or you swapped content in the source via a channel that bypasses the MutationObserver.

```typescript
import { Component, ViewChild } from "@angular/core";
import { VirtualFrameDirective } from "@virtual-frame/angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [VirtualFrameDirective],
  template: `
    <button (click)="onRefresh()">Refresh</button>
    <div #vf virtualFrame src="./dashboard.html" isolate="open"></div>
  `,
})
export class AppComponent {
  @ViewChild("vf", { read: VirtualFrameDirective })
  vf!: VirtualFrameDirective;

  onRefresh() {
    this.vf.refresh();
  }
}
```

`refresh()` tears down the current projection and re-initializes against the same iframe. It's idempotent and cheap — feel free to wire it to user-visible "reload" buttons.

## Sharing one source across directives

`createVirtualFrame()` creates a single shared source that multiple directives can project from. This is the right pattern when you want to compose several views of the **same** remote app — for example, a header in the nav and a sidebar widget from the same SaaS product — without loading the remote twice.

Angular's directive lifecycle doesn't track shared source handles for you, so you are responsible for calling `destroyVirtualFrame(frame)` when the owning component is destroyed:

```typescript
import { Component, OnDestroy } from "@angular/core";
import {
  VirtualFrameDirective,
  createVirtualFrame,
  destroyVirtualFrame,
} from "@virtual-frame/angular";
import type { VirtualFrameRef } from "@virtual-frame/angular";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [VirtualFrameDirective],
  template: `
    <div virtualFrame [frame]="frame" selector="#header"></div>
    <div virtualFrame [frame]="frame" selector="#counter"></div>
  `,
})
export class AppComponent implements OnDestroy {
  frame: VirtualFrameRef = createVirtualFrame("/remote/");

  ngOnDestroy() {
    destroyVirtualFrame(this.frame);
  }
}
```

One hidden iframe loads, both directives project different subtrees from it, and both stay in sync as the remote app navigates or mutates.

### `createVirtualFrame(src, options?)`

| Parameter       | Type              | Description                        |
| --------------- | ----------------- | ---------------------------------- |
| `src`           | `string`          | URL to load                        |
| `options.store` | `StoreProxy`      | Optional store for shared state    |
| **Returns**     | `VirtualFrameRef` | Opaque handle — pass via `[frame]` |

### `destroyVirtualFrame(frame)`

Cleans up the shared source and, if one was bridged, the store's `MessagePort`. Call it from `ngOnDestroy()` of the component that created the frame.

When you use a shared frame with a store, pass the store to `createVirtualFrame({ store })` — **not** to individual directive instances. The store bridge is established once per source.

## Shared Store

Share reactive state between host and remote frames using [`@virtual-frame/store`](/guide/store). Writes on either side propagate over a `MessagePort` bridge; every `injectStoreValue()` subscription re-renders via Angular signals when the underlying value changes. See the [Store guide](/guide/store) for the full model — this section covers the Angular integration.

### Installation

```sh
npm install @virtual-frame/store
```

### Host side

Create the store, seed initial values, and bind it to the directive:

```typescript
import { Component } from "@angular/core";
import { VirtualFrameDirective, injectStoreValue } from "@virtual-frame/angular";
import { createStore } from "@virtual-frame/store";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [VirtualFrameDirective],
  template: `
    <p>Host count: {{ count() ?? 0 }}</p>
    <button (click)="inc()">Increment</button>

    <div virtualFrame src="/remote/" isolate="open" [store]="store"></div>
  `,
})
export class AppComponent {
  store = createStore();
  // Reactive subscription — returns a read-only Angular `Signal`.
  count = injectStoreValue<number>(this.store, ["count"]);

  constructor() {
    this.store.theme = "dark";
    this.store.count = 0;
  }

  inc() {
    (this.store as any).count++;
  }
}
```

### Remote side

The remote app gets a singleton proxy that's wired to the host's port. Call `injectStore()` inside an injection context to obtain the singleton, then subscribe to paths reactively with `injectStoreValue()`:

```typescript
import { Component } from "@angular/core";
import { injectStore, injectStoreValue } from "@virtual-frame/angular";

@Component({
  selector: "app-counter",
  standalone: true,
  template: `
    <div [attr.data-theme]="theme()">
      <button (click)="increment()">Count: {{ count() }}</button>
    </div>
  `,
})
export class CounterComponent {
  private store = injectStore();
  count = injectStoreValue<number>(this.store, ["count"]);
  theme = injectStoreValue<string>(this.store, ["theme"]);

  increment() {
    (this.store as any).count++;
  }
}
```

::: tip Why `injectStore` and `injectStoreValue`?
Angular's dependency-injection conventions reserve the `use…` prefix for lifecycle hooks and form primitives. The store-side helpers use `inject…` to make it clear they require an injection context (component constructor, service, effect). Both names map to the same runtime behaviour you'd expect from `useStore` / `useStore(store, path)` in the other framework bindings.
:::

### `injectStore()`

Returns the shared store singleton. Must be called inside an injection context (e.g. component constructor). Connects to the host store automatically after the first render — and falls back to a standalone in-memory store if the component is loaded outside a VirtualFrame.

### `injectStoreValue(store, selector?)`

Subscribes to a path in the store and returns a read-only Angular `Signal<T>` that updates when the path changes. Must be called inside an injection context.

```typescript
// Subscribe to a single key
count = injectStoreValue<number>(store, ["count"]);

// Subscribe to a nested path
name = injectStoreValue<string>(store, ["user", "name"]);

// Subscribe to every change (no selector — expensive, avoid in hot paths)
all = injectStoreValue(store);
```

| Parameter   | Type            | Description                                         |
| ----------- | --------------- | --------------------------------------------------- |
| `store`     | `StoreProxy`    | Store proxy from `createStore()` or `injectStore()` |
| `selector`  | `PropertyKey[]` | Path to subscribe to (omit for root)                |
| **Returns** | `Signal<T>`     | Read-only Angular signal with current value         |

The subscription is automatically cleaned up via `DestroyRef`.

## Testing

The directive is a thin wrapper over the core class, so testing patterns apply equally. Run tests in a real browser (Vitest browser mode or Playwright) — jsdom/happy-dom don't provide enough DOM fidelity. Wait for projection to settle with `findBy…` or `waitFor`, not `getBy…`, because projection completes across a few microtasks after `ngOnInit`. See [Testing](/guide/testing) for the full patterns.

## Common issues

**"The `<div>` renders but stays empty."** The iframe hasn't finished loading, or the MutationObserver hasn't caught up. Don't query the shadow root synchronously after `ngOnInit` — use `findBy…` / `waitFor`, or an `afterRender` / `effect` that watches the directive reference.

**"Changing `src` feels slow."** Changing `src` fully tears down the iframe and creates a new one. For fast switching between several remote views, prefer loading one source via `createVirtualFrame()` and switching the `selector` on consuming directives.

**"My remote app does client-side navigation but requests fail in production."** Cross-origin remote + no proxy. Use `@virtual-frame/analog` with a dev-proxy rule (see [Analog → Client-Side Navigation](/guide/analog#client-side-navigation-proxy)) or host the remote same-origin.

**"Store writes don't reach the remote."** Ensure the store is passed to exactly one place per source: either directly as a `[store]` binding on `<div virtualFrame src="…">`, or as `{ store }` on `createVirtualFrame()` — not both.

**"`NG0203: inject() must be called from an injection context`."** `injectStore()` / `injectStoreValue()` must run in a constructor, a `@Component` field initialiser, or inside `runInInjectionContext`. They can't be called from a `setTimeout` callback or event handler without forwarding an injector.
