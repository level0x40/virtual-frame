# Analog

`@virtual-frame/analog` provides first-class [Analog.js](https://analogjs.org) integration with **server rendering**. The remote page is fetched during SSR inside a Nitro server route and embedded in the response — the user sees styled content on first paint with zero layout shift, and the client resumes live updates without an extra network request.

## Installation

```sh
npm install virtual-frame @virtual-frame/analog @virtual-frame/angular @virtual-frame/store
```

## Server Route (Server Rendering)

Create an Analog API route (Nitro server handler) to fetch the remote page during SSR. The route runs on the server, keeping `node-html-parser` out of the client bundle.

```ts
// src/server/routes/api/frame.ts
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/analog/server";
import { defineEventHandler } from "h3";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3011";

export default defineEventHandler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame);
});
```

```ts
// src/app/pages/index.page.ts
import { Component, inject, TransferState, makeStateKey } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { toSignal } from "@angular/core/rxjs-interop";
import { VirtualFrameComponent } from "@virtual-frame/analog";

const FRAME_KEY = makeStateKey<Awaited<
  ReturnType<typeof import("@virtual-frame/analog/server").prepareVirtualFrameProps>
>>("vf-frame");

@Component({
  selector: "app-home",
  standalone: true,
  imports: [VirtualFrameComponent],
  template: `
    @if (frame(); as f) {
      <virtual-frame
        [src]="f.src"
        [isolate]="f.isolate"
        [vfHtml]="f._vfHtml"
      ></virtual-frame>
    }
  `,
})
export default class HomeComponent {
  private http = inject(HttpClient);
  private state = inject(TransferState);

  frame = toSignal(this.http.get("/api/frame").pipe(
    // Cache SSR-fetched props via TransferState so the client
    // does not re-fetch after hydration.
    (src) => src,
  ));
}
```

### Selector Projection

Project only a specific part of the remote page:

```ts
// src/server/routes/api/frame.ts
export default defineEventHandler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame, {
    selector: "#counter-card",
  });
});
```

### Multiple Projections from One Fetch

Fetch once, display multiple sections — both `<virtual-frame>` instances share a single hidden iframe:

```ts
// src/server/routes/api/frame.ts
export default defineEventHandler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
});
```

```ts
// src/app/pages/index.page.ts — template
template: `
  @if (data(); as d) {
    <virtual-frame [src]="d.fullFrame.src"
                   [isolate]="d.fullFrame.isolate"
                   [vfHtml]="d.fullFrame._vfHtml"></virtual-frame>
    <virtual-frame [src]="d.counterFrame.src"
                   [isolate]="d.counterFrame.isolate"
                   [selector]="d.counterFrame.selector"
                   [vfHtml]="d.counterFrame._vfHtml"></virtual-frame>
  }
`
```

See the [Shared Store](#shared-store) section below for host + remote bridge wiring.

## Remote Side

The remote is a normal Analog.js app. Import the bridge script from `main.ts` — it auto-initialises when loaded inside an iframe and is a no-op when loaded standalone:

```ts
// src/main.ts
import "zone.js";
import "@angular/compiler";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

// Virtual Frame bridge — auto-initialises inside an iframe.
import "virtual-frame/bridge";

bootstrapApplication(AppComponent, appConfig).catch(console.error);
```

See the [Shared Store](#shared-store) section below for how to read and write the bridged store from the remote.

## Shared Store

A **shared store** keeps state in sync between the host app and the remote app (including every projected frame) over a `MessagePort` bridge. Writes on either side propagate to the other automatically, and `injectStoreValue(...)` subscriptions re-render via Angular signals when the underlying value changes.

The store lives in the host — the remote connects to it at runtime via the hidden iframe `<virtual-frame>` mounts. You do **not** duplicate the store on the remote: `injectStore()` on the remote returns a proxy that forwards reads and writes across the port.

### 1. Create the store on the host

```ts
// src/app/store.ts
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store["count"] = 0;
```

`createStore()` returns a plain reactive object. Assign initial values directly — nested objects and arrays are supported. Paths are addressed as string arrays: `["count"]`, `["user", "name"]`, `["items", 0]`.

### 2. Pass the store to `<virtual-frame>` on the host

```ts
// src/app/pages/index.page.ts
import { Component, signal } from "@angular/core";
import { VirtualFrameComponent, injectStoreValue } from "@virtual-frame/analog";
import { store } from "../store";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [VirtualFrameComponent],
  template: `
    <p>Host count: {{ count() ?? 0 }}</p>
    <button (click)="inc()">Increment from host</button>
    <button (click)="reset()">Reset</button>

    <!-- Any <virtual-frame> that receives [store] joins the same sync bridge. -->
    <virtual-frame
      [src]="frame().src"
      [isolate]="frame().isolate"
      [vfHtml]="frame()._vfHtml"
      [store]="store"
    ></virtual-frame>
  `,
})
export default class HomeComponent {
  store = store;
  count = injectStoreValue<number>(store, ["count"]);
  inc() { store["count"] = (this.count() ?? 0) + 1; }
  reset() { store["count"] = 0; }
  frame = signal({ src: "", isolate: "open" as const, _vfHtml: "" });
}
```

- **Host reads/writes are direct**: `store["count"]` operates on the host's in-memory object — no serialisation, no round-trip.
- **Passing `[store]` wires up the bridge**: when the hidden iframe loads and the remote signals `vf-store:ready`, the component opens a `MessageChannel`, transfers one port to the iframe, and calls `connectPort()` on the host side. Multiple `<virtual-frame>` instances sharing the same `src` share one iframe *and* one port — the store is bridged exactly once.

### 3. Consume the store on the remote

On the remote, use `injectStore` from `@virtual-frame/analog/store` (singleton that connects to the incoming `MessagePort`) together with `injectStoreValue` for reactive subscriptions:

```ts
import { Component } from "@angular/core";
import { injectStore, injectStoreValue } from "@virtual-frame/analog/store";

@Component({
  selector: "app-counter",
  standalone: true,
  template: `<button (click)="inc()">Count: {{ count() ?? 0 }}</button>`,
})
export class CounterComponent {
  store = injectStore();
  count = injectStoreValue<number>(this.store, ["count"]);
  inc() { this.store["count"] = (this.count() ?? 0) + 1; }
}
```

| Call                                 | Returns       | Purpose                                                                           |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------------- |
| `injectStore()`                      | `StoreProxy`  | **Remote singleton.** Connects to the host store over `MessagePort` on first call. |
| `injectStoreValue(store, ["count"])` | `Signal<T>`   | **Reactive subscription.** Re-renders dependents via Angular signals.             |

### Standalone fallback

When the remote page is loaded directly in the browser (not through a virtual frame), there is no host and no port. In that case `injectStore()` returns a plain in-memory store, so the page still works as a standalone Analog.js app. Writes stay local; reads return whatever was last written.

### Tips

- **Initialise on the host, not the remote.** The host's values are the source of truth on first connect. Anything the remote writes before the port is open is kept local until the bridge finishes handshaking.
- **Keep values serialisable.** Values cross a `postMessage` boundary — prefer plain objects, arrays, primitives. No class instances, functions, or DOM nodes.
- **Namespace per feature.** For multiple features in one app, group keys under stable prefixes (`["cart", "items"]`, `["auth", "user"]`).
- **One store per remote URL is typical.** Pass the same `store` to every frame that targets the same remote.

## How Server Rendering Works

<svg viewBox="0 0 720 546" xmlns="http://www.w3.org/2000/svg" style="max-width:720px;width:100%;height:auto;font-family:system-ui,sans-serif">
  <defs>
    <marker id="analog-ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#f26522"/></marker>
    <marker id="analog-ah2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#e02d37"/></marker>
  </defs>

  <!-- Server Phase -->
  <rect x="20" y="20" width="680" height="220" rx="10" fill="rgba(242,101,34,0.05)" stroke="rgba(242,101,34,0.25)" stroke-width="1"/>
  <text x="40" y="48" font-size="14" font-weight="700" fill="#f26522">Server (Analog API route)</text>

  <rect x="40" y="64" width="200" height="60" rx="8" fill="rgba(242,101,34,0.08)" stroke="rgba(242,101,34,0.35)" stroke-width="1"/>
  <text x="140" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#f26522">1. Fetch remote page</text>
  <text x="140" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Download and parse HTML</text>

  <rect x="260" y="64" width="200" height="60" rx="8" fill="rgba(242,101,34,0.08)" stroke="rgba(242,101,34,0.35)" stroke-width="1"/>
  <text x="360" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#f26522">2. Extract styles + body</text>
  <text x="360" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Prepare styles and content</text>

  <rect x="480" y="64" width="200" height="60" rx="8" fill="rgba(242,101,34,0.08)" stroke="rgba(242,101,34,0.35)" stroke-width="1"/>
  <text x="580" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#f26522">3. Render to response</text>
  <text x="580" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Styled content, zero JS needed</text>

  <line x1="240" y1="94" x2="258" y2="94" stroke="#f26522" stroke-width="1.5" marker-end="url(#analog-ah)"/>
  <line x1="460" y1="94" x2="478" y2="94" stroke="#f26522" stroke-width="1.5" marker-end="url(#analog-ah)"/>

  <rect x="40" y="144" width="640" height="80" rx="8" fill="rgba(242,101,34,0.05)" stroke="rgba(242,101,34,0.25)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="360" y="172" text-anchor="middle" font-size="12" font-weight="600" fill="#f26522">API Route Output</text>
  <text x="360" y="192" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">SSR HTML wrapped in declarative shadow DOM — visible on first paint</text>
  <text x="360" y="210" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Serialised through TransferState into the Angular app</text>

  <line x1="360" y1="240" x2="360" y2="260" stroke="#e02d37" stroke-width="1.5" marker-end="url(#analog-ah2)"/>
  <text x="374" y="254" font-size="9" fill="currentColor" opacity="0.9">HTML response</text>

  <!-- Client Phase -->
  <rect x="20" y="260" width="680" height="266" rx="10" fill="rgba(224,45,55,0.05)" stroke="rgba(224,45,55,0.25)" stroke-width="1"/>
  <text x="40" y="288" font-size="14" font-weight="700" fill="#e02d37">Client</text>

  <rect x="40" y="304" width="200" height="68" rx="8" fill="rgba(224,45,55,0.07)" stroke="rgba(224,45,55,0.35)" stroke-width="1"/>
  <text x="140" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#e02d37">4. Resume</text>
  <text x="140" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Hidden iframe loads remote app</text>
  <text x="140" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Bridge auto-initialises</text>

  <rect x="260" y="304" width="200" height="68" rx="8" fill="rgba(224,45,55,0.07)" stroke="rgba(224,45,55,0.35)" stroke-width="1"/>
  <text x="360" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#e02d37">5. Live projection</text>
  <text x="360" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Content stays in sync</text>
  <text x="360" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Full interactivity enabled</text>

  <rect x="480" y="304" width="200" height="68" rx="8" fill="rgba(224,45,55,0.07)" stroke="rgba(224,45,55,0.35)" stroke-width="1"/>
  <text x="580" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#e02d37">6. Shared resources</text>
  <text x="580" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Multiple projections</text>
  <text x="580" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">One iframe, many views</text>

  <line x1="240" y1="338" x2="258" y2="338" stroke="#e02d37" stroke-width="1.5" marker-end="url(#analog-ah2)"/>
  <line x1="460" y1="338" x2="478" y2="338" stroke="#e02d37" stroke-width="1.5" marker-end="url(#analog-ah2)"/>

  <rect x="40" y="392" width="300" height="120" rx="8" fill="rgba(224,45,55,0.05)" stroke="rgba(224,45,55,0.25)" stroke-width="1"/>
  <text x="60" y="418" font-size="11" font-weight="600" fill="#e02d37">Benefits</text>
  <text x="60" y="440" font-size="10" fill="currentColor" opacity="0.9">Instant paint — content visible before JS runs</text>
  <text x="60" y="458" font-size="10" fill="currentColor" opacity="0.9">No flash of unstyled content</text>
  <text x="60" y="476" font-size="10" fill="currentColor" opacity="0.9">No extra network requests on the client</text>
  <text x="60" y="494" font-size="10" fill="currentColor" opacity="0.9">Ref-counted shared iframes across projections</text>

  <rect x="360" y="392" width="320" height="120" rx="8" fill="rgba(224,45,55,0.05)" stroke="rgba(224,45,55,0.25)" stroke-width="1"/>
  <text x="380" y="418" font-size="11" font-weight="600" fill="#e02d37">Store bridge (optional)</text>
  <text x="380" y="440" font-size="10" fill="currentColor" opacity="0.9">Pass a store to virtual-frame</text>
  <text x="380" y="458" font-size="10" fill="currentColor" opacity="0.9">State syncs automatically via MessagePort</text>
  <text x="380" y="476" font-size="10" fill="currentColor" opacity="0.9">Changes propagate in both directions</text>
  <text x="380" y="494" font-size="10" fill="currentColor" opacity="0.9">Works across host and remote</text>
</svg>

## Client-Side Navigation (Proxy)

When the remote app performs client-side navigation, it needs to fetch data from the remote server. The `proxy` option ensures these requests reach the correct server by routing them through a dev-proxy on the host.

Without `proxy`, client-side navigation in the remote app will fail with network errors whenever the host and remote run on different origins.

### 1. Add a dev proxy to the host's Vite config

```ts
// vite.config.ts (host)
import { defineConfig } from "vite";
import analog from "@analogjs/platform";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3011";

export default defineConfig({
  plugins: [analog()],
  server: {
    proxy: {
      "/__vf": {
        target: REMOTE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__vf/, ""),
      },
    },
  },
});
```

### 2. Pass the `proxy` option

```ts
// src/server/routes/api/frame.ts
export default defineEventHandler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame, { proxy: "/__vf" });
});
```

::: tip
The proxy prefix (`/__vf`) is a convention — you can use any path that doesn't conflict with your host app's routes. For multiple remotes, use a different prefix for each.
:::

## API Reference

### `<virtual-frame>`

Standalone Angular component that displays server-fetched content and resumes live mirroring.

| Input          | Type                               | Default  | Description                                         |
| -------------- | ---------------------------------- | -------- | --------------------------------------------------- |
| `src`          | `string`                           | —        | Remote URL to fetch and project                     |
| `selector`     | `string`                           | —        | CSS selector for partial projection                 |
| `isolate`      | `"open" \| "closed"`               | `"open"` | Shadow DOM mode                                     |
| `streamingFps` | `number \| Record<string, number>` | —        | Canvas/video streaming FPS                          |
| `store`        | `StoreProxy`                       | —        | Shared store for cross-frame state sync             |
| `proxy`        | `string`                           | —        | Same-origin proxy prefix for client-side navigation |
| `vfHtml`       | `string`                           | —        | SSR HTML from `prepareVirtualFrameProps()`          |

### `injectStore()`

Remote-side helper. Returns the shared store singleton and sets up the MessagePort bridge. Import from `@virtual-frame/analog/store`.

### `injectStoreValue(store, path?)`

Subscribes to a store path and returns an Angular `Signal`.

```ts
import { injectStore, injectStoreValue } from "@virtual-frame/analog/store";

const store = injectStore();
const count = injectStoreValue<number>(store, ["count"]);
```

### `fetchVirtualFrame(url, options?)`

Server-only. Fetches a remote page and produces a server render result. Import from `@virtual-frame/analog/server`.

### `prepareVirtualFrameProps(frame, options?)`

Server-only. Converts a server render result into serialisable props for `<virtual-frame>`. Returns a **`Promise`** — always `await` it.

| Option     | Type                 | Default  | Description                                         |
| ---------- | -------------------- | -------- | --------------------------------------------------- |
| `selector` | `string`             | —        | CSS selector for partial projection                 |
| `isolate`  | `"open" \| "closed"` | `"open"` | Shadow DOM mode                                     |
| `proxy`    | `string`             | —        | Same-origin proxy prefix for client-side navigation |

## Examples

- **[Analog example](https://github.com/level0x40/virtual-frame/tree/main/examples/analog-host)** — `pnpm example:analog`
