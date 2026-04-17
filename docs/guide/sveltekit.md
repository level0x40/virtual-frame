# SvelteKit

`@virtual-frame/sveltekit` provides first-class [SvelteKit](https://kit.svelte.dev) integration with **server rendering**. The remote page is fetched during SSR inside a `+page.server.ts` load function and embedded in the response — the user sees styled content on first paint with zero layout shift, and the client resumes live updates without an extra network request.

## Installation

```sh
npm install virtual-frame @virtual-frame/sveltekit @virtual-frame/svelte @virtual-frame/store
```

## Load Function (Server Rendering)

Create a `+page.server.ts` load function to fetch the remote page during SSR. The function runs on the server, keeping `node-html-parser` out of the client bundle.

```ts
// src/routes/+page.server.ts
import { fetchVirtualFrame, prepareVirtualFrameProps } from "@virtual-frame/sveltekit/server";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3013";

export const load = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame),
  };
};
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { VirtualFrame } from "@virtual-frame/sveltekit";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<VirtualFrame {...data.frame} />
```

### Selector Projection

Project only a specific part of the remote page:

```ts
// src/routes/+page.server.ts
export const load = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
};
```

### Multiple Projections from One Fetch

Fetch once, display multiple sections — both `<VirtualFrame>` instances share a single hidden iframe:

```ts
// src/routes/+page.server.ts
export const load = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
};
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { VirtualFrame } from "@virtual-frame/sveltekit";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<VirtualFrame {...data.fullFrame} />
<VirtualFrame {...data.counterFrame} />
```

### With Shared Store

Create a store and pass it to `<VirtualFrame>`:

```ts
// src/lib/store.ts
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store["count"] = 0;
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { VirtualFrame, useStore } from "@virtual-frame/sveltekit";
  import { store } from "$lib/store";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const count = useStore<number>(store, ["count"]);
</script>

<p>Count: {$count ?? 0}</p>
<button onclick={() => store["count"]++}>Increment</button>

<VirtualFrame {...data.fullFrame} {store} />
<VirtualFrame {...data.counterFrame} {store} />
```

## Remote Side

The remote is a normal SvelteKit app. Import the bridge script from `src/hooks.client.ts` — it auto-initialises when loaded inside an iframe and is a no-op when loaded standalone:

```ts
// src/hooks.client.ts
import "virtual-frame/bridge";
```

Use `useStore` from `@virtual-frame/sveltekit/store` (remote-side singleton) together with `useStore` from `@virtual-frame/sveltekit` (reactive subscriptions):

```svelte
<script lang="ts">
  import { useStore as useRemoteStore } from "@virtual-frame/sveltekit/store";
  import { useStore } from "@virtual-frame/sveltekit";

  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);
</script>

<button onclick={() => store["count"]++}>Count: {$count ?? 0}</button>
```

| Call                         | Returns       | Purpose                                 |
| ---------------------------- | ------------- | --------------------------------------- |
| `useRemoteStore()`           | `StoreProxy`  | Store instance (connects to host store) |
| `useStore(store, ["count"])` | `Readable<T>` | Reactive value at path                  |

## How Server Rendering Works

<svg viewBox="0 0 720 546" xmlns="http://www.w3.org/2000/svg" style="max-width:720px;width:100%;height:auto;font-family:system-ui,sans-serif">
  <defs>
    <marker id="sk-ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#ff3e00"/></marker>
    <marker id="sk-ah2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#cc3200"/></marker>
  </defs>

  <!-- Server Phase -->
  <rect x="20" y="20" width="680" height="220" rx="10" fill="rgba(255,62,0,0.05)" stroke="rgba(255,62,0,0.25)" stroke-width="1"/>
  <text x="40" y="48" font-size="14" font-weight="700" fill="#ff3e00">Server (+page.server.ts)</text>

  <rect x="40" y="64" width="200" height="60" rx="8" fill="rgba(255,62,0,0.08)" stroke="rgba(255,62,0,0.35)" stroke-width="1"/>
  <text x="140" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#ff3e00">1. Fetch remote page</text>
  <text x="140" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Download and parse HTML</text>

  <rect x="260" y="64" width="200" height="60" rx="8" fill="rgba(255,62,0,0.08)" stroke="rgba(255,62,0,0.35)" stroke-width="1"/>
  <text x="360" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#ff3e00">2. Extract styles + body</text>
  <text x="360" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Prepare styles and content</text>

  <rect x="480" y="64" width="200" height="60" rx="8" fill="rgba(255,62,0,0.08)" stroke="rgba(255,62,0,0.35)" stroke-width="1"/>
  <text x="580" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#ff3e00">3. Return from load()</text>
  <text x="580" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Styled content, zero JS needed</text>

  <line x1="240" y1="94" x2="258" y2="94" stroke="#ff3e00" stroke-width="1.5" marker-end="url(#sk-ah)"/>
  <line x1="460" y1="94" x2="478" y2="94" stroke="#ff3e00" stroke-width="1.5" marker-end="url(#sk-ah)"/>

  <rect x="40" y="144" width="640" height="80" rx="8" fill="rgba(255,62,0,0.05)" stroke="rgba(255,62,0,0.25)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="360" y="172" text-anchor="middle" font-size="12" font-weight="600" fill="#ff3e00">Load Function Output</text>
  <text x="360" y="192" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">SSR HTML wrapped in declarative shadow DOM — visible on first paint</text>
  <text x="360" y="210" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Serialised through PageData into the Svelte component</text>

  <line x1="360" y1="240" x2="360" y2="260" stroke="#cc3200" stroke-width="1.5" marker-end="url(#sk-ah2)"/>
  <text x="374" y="254" font-size="9" fill="currentColor" opacity="0.9">HTML response</text>

  <!-- Client Phase -->
  <rect x="20" y="260" width="680" height="266" rx="10" fill="rgba(204,50,0,0.05)" stroke="rgba(204,50,0,0.25)" stroke-width="1"/>
  <text x="40" y="288" font-size="14" font-weight="700" fill="#cc3200">Client</text>

  <rect x="40" y="304" width="200" height="68" rx="8" fill="rgba(204,50,0,0.07)" stroke="rgba(204,50,0,0.35)" stroke-width="1"/>
  <text x="140" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#cc3200">4. Resume</text>
  <text x="140" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Hidden iframe loads remote app</text>
  <text x="140" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Bridge auto-initialises</text>

  <rect x="260" y="304" width="200" height="68" rx="8" fill="rgba(204,50,0,0.07)" stroke="rgba(204,50,0,0.35)" stroke-width="1"/>
  <text x="360" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#cc3200">5. Live projection</text>
  <text x="360" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Content stays in sync</text>
  <text x="360" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Full interactivity enabled</text>

  <rect x="480" y="304" width="200" height="68" rx="8" fill="rgba(204,50,0,0.07)" stroke="rgba(204,50,0,0.35)" stroke-width="1"/>
  <text x="580" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#cc3200">6. Shared resources</text>
  <text x="580" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Multiple projections</text>
  <text x="580" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">One iframe, many views</text>

  <line x1="240" y1="338" x2="258" y2="338" stroke="#cc3200" stroke-width="1.5" marker-end="url(#sk-ah2)"/>
  <line x1="460" y1="338" x2="478" y2="338" stroke="#cc3200" stroke-width="1.5" marker-end="url(#sk-ah2)"/>

  <rect x="40" y="392" width="300" height="120" rx="8" fill="rgba(204,50,0,0.05)" stroke="rgba(204,50,0,0.25)" stroke-width="1"/>
  <text x="60" y="418" font-size="11" font-weight="600" fill="#cc3200">Benefits</text>
  <text x="60" y="440" font-size="10" fill="currentColor" opacity="0.9">Instant paint — content visible before JS runs</text>
  <text x="60" y="458" font-size="10" fill="currentColor" opacity="0.9">No flash of unstyled content</text>
  <text x="60" y="476" font-size="10" fill="currentColor" opacity="0.9">No extra network requests on the client</text>
  <text x="60" y="494" font-size="10" fill="currentColor" opacity="0.9">Ref-counted shared iframes across projections</text>

  <rect x="360" y="392" width="320" height="120" rx="8" fill="rgba(204,50,0,0.05)" stroke="rgba(204,50,0,0.25)" stroke-width="1"/>
  <text x="380" y="418" font-size="11" font-weight="600" fill="#cc3200">Store bridge (optional)</text>
  <text x="380" y="440" font-size="10" fill="currentColor" opacity="0.9">Pass a store to VirtualFrame</text>
  <text x="380" y="458" font-size="10" fill="currentColor" opacity="0.9">State syncs automatically via MessagePort</text>
  <text x="380" y="476" font-size="10" fill="currentColor" opacity="0.9">Changes propagate in both directions</text>
  <text x="380" y="494" font-size="10" fill="currentColor" opacity="0.9">Works across host and remote</text>
</svg>

## Shared Store

A **shared store** keeps state in sync between the host app and the remote app (including all projected frames) over a `MessagePort` bridge. Writes on either side propagate to the other automatically, and every `useStore(...)` subscription re-renders when the underlying value changes.

The store lives in the host — the remote connects to it at runtime via the hidden iframe the VirtualFrame component mounts. You do **not** need to duplicate the store on the remote: `useRemoteStore()` returns a proxy that forwards reads and writes across the port.

### 1. Create the store on the host

```ts
// src/lib/store.ts (host)
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store["count"] = 0;
```

`createStore()` returns a plain reactive object. Assign initial values directly — nested objects and arrays are supported. Paths are addressed as string arrays: `["count"]`, `["user", "name"]`, `["items", 0]`.

### 2. Pass the store to `<VirtualFrame>` on the host

```svelte
<!-- src/routes/+page.svelte (host) -->
<script lang="ts">
  import { VirtualFrame, useStore } from "@virtual-frame/sveltekit";
  import { store } from "$lib/store";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Subscribe to a path — returns a Svelte `Readable` you can use with `$`.
  const count = useStore<number>(store, ["count"]);
</script>

<p>Host count: {$count ?? 0}</p>
<button onclick={() => (store["count"] = ($count ?? 0) + 1)}>
  Increment from host
</button>
<button onclick={() => (store["count"] = 0)}>Reset</button>

<!-- Any VirtualFrame that receives {store} joins the same sync bridge. -->
<VirtualFrame {...data.fullFrame} {store} />
<VirtualFrame {...data.counterFrame} {store} />
```

Two things to notice:

- **Host reads/writes are direct**: `store["count"]` and `$count` operate on the host's in-memory object — no serialisation, no round-trip.
- **Passing `{store}` to `<VirtualFrame>` wires up the bridge**: when the hidden iframe finishes loading and the remote signals `vf-store:ready`, the component opens a `MessageChannel`, transfers one port to the iframe, and calls `connectPort()` on the host side. When multiple `<VirtualFrame>` instances share the same `src`, they share one iframe _and_ one port — the store is bridged exactly once.

### 3. Consume the store on the remote

On the remote, use the singleton helper `useStore` from `@virtual-frame/sveltekit/store`. It connects to the incoming `MessagePort` on first call and returns a `StoreProxy` that behaves like a plain reactive object:

```svelte
<!-- src/routes/+page.svelte (remote) -->
<script lang="ts">
  import { useStore as useRemoteStore } from "@virtual-frame/sveltekit/store";
  import { useStore } from "@virtual-frame/sveltekit";

  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);
</script>

<div id="counter-card">
  <div class="counter">{$count ?? 0}</div>
  <button onclick={() => (store["count"] = ($count ?? 0) + 1)}>
    Increment
  </button>
  <button onclick={() => (store["count"] = 0)}>Reset</button>
</div>
```

Two imports, two different functions, both named `useStore`:

| Import                                           | Purpose                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `useStore` from `@virtual-frame/sveltekit/store` | **Remote singleton.** Returns the `StoreProxy` for the remote app. Sets up the `MessagePort` bridge on first call.               |
| `useStore` from `@virtual-frame/sveltekit`       | **Reactive subscription.** Takes a `StoreProxy` + path and returns a Svelte `Readable<T>`. Use with the `$` prefix in templates. |

### Standalone fallback

When the remote page is loaded directly in the browser (not through a VirtualFrame), there is no host and no port. In that case `useRemoteStore()` returns a plain in-memory store, so your page still works as a standalone SvelteKit app. Writes stay local; reads return whatever was last written.

### Tips

- **Initialise on the host, not the remote.** The host's values are the source of truth on first connect. Anything the remote writes before the port is open is kept local until the bridge finishes handshaking.
- **Keep values serialisable.** Values cross a `postMessage` boundary, so prefer plain objects, arrays, primitives — no class instances, functions, or DOM nodes.
- **Namespace per feature.** For multiple independent features in one app, group keys under stable prefixes (`["cart", "items"]`, `["auth", "user"]`) to keep paths predictable.
- **One store per remote URL is typical.** If you project the same remote into several frames, pass the same `store` to each — they all share the bridge. If you have two distinct remotes, create two stores.

## Client-Side Navigation (Proxy)

When the remote app performs client-side navigation, it needs to fetch data from the remote server. The `proxy` option ensures these requests reach the correct server by routing them through a dev-proxy on the host.

Without `proxy`, client-side navigation in the remote app will fail with network errors whenever the host and remote run on different origins.

### 1. Add a dev proxy to the host's Vite config

```ts
// vite.config.ts (host)
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://localhost:3013";

export default defineConfig({
  plugins: [sveltekit()],
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
// src/routes/+page.server.ts
export const load = async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame, { proxy: "/__vf" }),
  };
};
```

::: tip
The proxy prefix (`/__vf`) is a convention — you can use any path that doesn't conflict with your host app's routes. For multiple remotes, use a different prefix for each.
:::

## API Reference

### `<VirtualFrame>`

Svelte component that displays server-fetched content and resumes live mirroring.

| Prop           | Type                               | Default  | Description                                         |
| -------------- | ---------------------------------- | -------- | --------------------------------------------------- |
| `src`          | `string`                           | —        | Remote URL to fetch and project                     |
| `selector`     | `string`                           | —        | CSS selector for partial projection                 |
| `isolate`      | `"open" \| "closed"`               | `"open"` | Shadow DOM mode                                     |
| `streamingFps` | `number \| Record<string, number>` | —        | Canvas/video streaming FPS                          |
| `store`        | `StoreProxy`                       | —        | Shared store for cross-frame state sync             |
| `proxy`        | `string`                           | —        | Same-origin proxy prefix for client-side navigation |
| `_vfHtml`      | `string`                           | —        | SSR HTML from `prepareVirtualFrameProps()`          |

### `useStore(store, path?)`

Subscribes to a store path and returns a Svelte `Readable`.

```ts
import { useStore } from "@virtual-frame/sveltekit";

const count = useStore<number>(store, ["count"]); // readable store
// use as $count in templates
```

### `useStore()` (remote-side)

Remote-side helper. Returns the shared store singleton and sets up the MessagePort bridge. Import from `@virtual-frame/sveltekit/store`.

```ts
import { useStore as useRemoteStore } from "@virtual-frame/sveltekit/store";

const store = useRemoteStore();
```

### `fetchVirtualFrame(url, options?)`

Server-only. Fetches a remote page and produces a server render result. Import from `@virtual-frame/sveltekit/server`.

### `prepareVirtualFrameProps(frame, options?)`

Server-only. Converts a server render result into serialisable props for `<VirtualFrame>`. Returns a **`Promise`** — always `await` it.

| Option     | Type                 | Default  | Description                                         |
| ---------- | -------------------- | -------- | --------------------------------------------------- |
| `selector` | `string`             | —        | CSS selector for partial projection                 |
| `isolate`  | `"open" \| "closed"` | `"open"` | Shadow DOM mode                                     |
| `proxy`    | `string`             | —        | Same-origin proxy prefix for client-side navigation |

## Examples

- **[SvelteKit example](https://github.com/level0x40/virtual-frame/tree/main/examples/sveltekit-host)** — `pnpm example:sveltekit`
