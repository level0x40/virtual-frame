# TanStack Start

`@virtual-frame/tanstack-start` provides first-class TanStack Start integration with **server rendering**. The remote page is fetched during SSR inside a `createServerFn` handler and embedded in the response — the user sees styled content on first paint with zero layout shift, and the client resumes live updates without an extra network request.

## Installation

```sh
npm install virtual-frame @virtual-frame/tanstack-start @virtual-frame/store
```

## Route Loader (Server Rendering)

Use `createServerFn` to fetch the remote page during SSR. The server function runs on the server, keeping `node-html-parser` out of the client bundle.

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { fetchVirtualFrame, prepareVirtualFrameProps } from "@virtual-frame/tanstack-start/server";
import { VirtualFrame } from "@virtual-frame/tanstack-start";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3005";

const loadFrame = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame);
});

export const Route = createFileRoute("/")({
  loader: () => loadFrame(),
  component: HostPage,
});

function HostPage() {
  const frameProps = Route.useLoaderData();
  return <VirtualFrame {...frameProps} />;
}
```

### Selector Projection

Project only a specific part of the remote page:

```tsx
const loadCounter = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame, {
    selector: "#counter-card",
  });
});
```

### Multiple Projections from One Fetch

Fetch once, display multiple sections — both `VirtualFrame` instances share a single hidden iframe:

```tsx
const loadFrames = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
});

export const Route = createFileRoute("/")({
  loader: () => loadFrames(),
  component: HostPage,
});

function HostPage() {
  const { fullFrame, counterFrame } = Route.useLoaderData();
  return (
    <>
      <VirtualFrame {...fullFrame} />
      <VirtualFrame {...counterFrame} />
    </>
  );
}
```

See the [Shared Store](#shared-store) section below for host + remote bridge wiring.

## Remote Side

The remote is a normal TanStack Start app. Add the bridge script to your root route — it auto-initialises when loaded inside an iframe and is a no-op when loaded standalone:

```tsx
// src/routes/__root.tsx
import "virtual-frame/bridge";
```

See the [Shared Store](#shared-store) section below for how to read and write the bridged store from the remote.

## Shared Store

A **shared store** keeps state in sync between the host app and the remote app (including every projected frame) over a `MessagePort` bridge. Writes on either side propagate to the other automatically, and every `useStore(...)` subscription re-renders when the underlying value changes.

The store lives in the host — the remote connects to it at runtime via the hidden iframe `VirtualFrame` mounts. You do **not** duplicate the store on the remote: the remote-side `useStore()` returns a proxy that forwards reads and writes across the port.

### 1. Create the store on the host

```ts
// src/store.ts
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store.count = 0;
```

`createStore()` returns a plain reactive object. Assign initial values directly — nested objects and arrays are supported. Paths are addressed as string arrays: `["count"]`, `["user", "name"]`, `["items", 0]`.

### 2. Pass the store to `<VirtualFrame>` on the host

Fetch the frame props through a `createServerFn()` loader and hand them to a client component that owns the store:

```tsx
// src/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { fetchVirtualFrame, prepareVirtualFrameProps } from "@virtual-frame/tanstack-start/server";
import { HostFrames } from "../components/HostFrames";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3005";

const loadFrames = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
});

export const Route = createFileRoute("/")({
  loader: () => loadFrames(),
  component: HostPage,
});

function HostPage() {
  const { fullFrame, counterFrame } = Route.useLoaderData();
  return <HostFrames frameProps={fullFrame} counterProps={counterFrame} />;
}
```

```tsx
// src/components/HostFrames.tsx
import { VirtualFrame } from "@virtual-frame/tanstack-start";
import { useStore } from "@virtual-frame/react";
import { store } from "../store";

export function HostFrames({ frameProps, counterProps }) {
  // Subscribe to a path — returns the current value, re-renders on change.
  const count = useStore<number>(store, ["count"]);

  return (
    <>
      <p>Host count: {count ?? 0}</p>
      <button onClick={() => (store.count = (count ?? 0) + 1)}>Increment from host</button>
      <button onClick={() => (store.count = 0)}>Reset</button>

      {/* Any VirtualFrame that receives store= joins the same sync bridge. */}
      <VirtualFrame {...frameProps} store={store} />
      <VirtualFrame {...counterProps} store={store} />
    </>
  );
}
```

- **Host reads/writes are direct**: `store.count` operates on the host's in-memory object — no serialisation, no round-trip.
- **Passing `store={store}` wires up the bridge**: when the hidden iframe loads and the remote signals `vf-store:ready`, the component opens a `MessageChannel`, transfers one port to the iframe, and calls `connectPort()` on the host side. Multiple `<VirtualFrame>` instances sharing the same `src` share one iframe _and_ one port — the store is bridged exactly once.

### 3. Consume the store on the remote

On the remote, use `useStore` from `@virtual-frame/tanstack-start`. It's a two-mode hook — no args returns the singleton `StoreProxy`, a path returns a reactive value:

```tsx
import { useStore } from "@virtual-frame/tanstack-start";

function Counter() {
  const store = useStore(); // StoreProxy singleton
  const count = useStore<number>(["count"]); // reactive value at path

  return <button onClick={() => (store.count = (count ?? 0) + 1)}>Count: {count ?? 0}</button>;
}
```

| Call                  | Returns      | Purpose                                                              |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| `useStore()`          | `StoreProxy` | **Remote singleton.** Connects to the host store on first call.      |
| `useStore(["count"])` | `T`          | **Reactive subscription.** Re-renders the component on value change. |

### Standalone fallback

When the remote page is loaded directly in the browser (not through a VirtualFrame), there is no host and no port. In that case `useStore()` returns a plain in-memory store, so the page still works as a standalone TanStack Start app. Writes stay local; reads return whatever was last written.

### Tips

- **Initialise on the host, not the remote.** The host's values are the source of truth on first connect. Anything the remote writes before the port is open is kept local until the bridge finishes handshaking.
- **Keep values serialisable.** Values cross a `postMessage` boundary — prefer plain objects, arrays, primitives. No class instances, functions, or DOM nodes.
- **Namespace per feature.** For multiple features in one app, group keys under stable prefixes (`["cart", "items"]`, `["auth", "user"]`).
- **One store per remote URL is typical.** Pass the same `store` to every frame that targets the same remote.

## How Server Rendering Works

<svg viewBox="0 0 720 546" xmlns="http://www.w3.org/2000/svg" style="max-width:720px;width:100%;height:auto;font-family:system-ui,sans-serif">
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#6964ff"/></marker>
    <marker id="ah2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#8010e1"/></marker>
  </defs>

  <!-- Server Phase -->
  <rect x="20" y="20" width="680" height="220" rx="10" fill="rgba(105,100,255,0.04)" stroke="rgba(105,100,255,0.2)" stroke-width="1"/>
  <text x="40" y="48" font-size="14" font-weight="700" fill="#6964ff">Server (createServerFn)</text>

  <!-- Step 1 -->
  <rect x="40" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="140" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">1. Fetch remote page</text>
  <text x="140" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Download and parse HTML</text>

  <!-- Step 2 -->
  <rect x="260" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="360" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">2. Extract styles + body</text>
  <text x="360" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Prepare styles and content</text>

  <!-- Step 3 -->
  <rect x="480" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="580" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">3. Render to response</text>
  <text x="580" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Styled content, zero JS needed</text>

  <!-- Arrows server -->
  <line x1="240" y1="94" x2="258" y2="94" stroke="#6964ff" stroke-width="1.5" marker-end="url(#ah)"/>
  <line x1="460" y1="94" x2="478" y2="94" stroke="#6964ff" stroke-width="1.5" marker-end="url(#ah)"/>

  <!-- HTML output -->
  <rect x="40" y="144" width="640" height="80" rx="8" fill="rgba(105,100,255,0.05)" stroke="rgba(105,100,255,0.2)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="360" y="172" text-anchor="middle" font-size="12" font-weight="600" fill="#6964ff">Loader Output</text>
  <text x="360" y="192" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">SSR HTML wrapped in declarative shadow DOM — visible on first paint</text>
  <text x="360" y="210" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Serialised via Seroval and delivered as loader data</text>

  <!-- Server -> Client arrow -->
  <line x1="360" y1="240" x2="360" y2="260" stroke="#7a3af0" stroke-width="1.5" marker-end="url(#ah2)"/>
  <text x="374" y="254" font-size="9" fill="currentColor" opacity="0.9">HTML response</text>

  <!-- Client Phase -->
  <rect x="20" y="260" width="680" height="266" rx="10" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="40" y="288" font-size="14" font-weight="700" fill="#8010e1">Client</text>

  <!-- Step 4 -->
  <rect x="40" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="140" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">4. Resume</text>
  <text x="140" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Hidden iframe loads remote app</text>
  <text x="140" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Bridge auto-initialises</text>

  <!-- Step 5 -->
  <rect x="260" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="360" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">5. Live projection</text>
  <text x="360" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Content stays in sync</text>
  <text x="360" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Full interactivity enabled</text>

  <!-- Step 6 -->
  <rect x="480" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="580" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">6. Shared resources</text>
  <text x="580" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Multiple projections</text>
  <text x="580" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">One iframe, many views</text>

  <!-- Arrows client -->
  <line x1="240" y1="338" x2="258" y2="338" stroke="#8010e1" stroke-width="1.5" marker-end="url(#ah2)"/>
  <line x1="460" y1="338" x2="478" y2="338" stroke="#8010e1" stroke-width="1.5" marker-end="url(#ah2)"/>

  <!-- Benefits -->
  <rect x="40" y="392" width="300" height="120" rx="8" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="60" y="418" font-size="11" font-weight="600" fill="#7a3af0">Benefits</text>
  <text x="60" y="440" font-size="10" fill="currentColor" opacity="0.9">Instant paint — content visible before JS runs</text>
  <text x="60" y="458" font-size="10" fill="currentColor" opacity="0.9">No flash of unstyled content</text>
  <text x="60" y="476" font-size="10" fill="currentColor" opacity="0.9">No extra network requests on the client</text>
  <text x="60" y="494" font-size="10" fill="currentColor" opacity="0.9">Ref-counted shared iframes across projections</text>

  <!-- Store bridge -->
  <rect x="360" y="392" width="320" height="120" rx="8" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="380" y="418" font-size="11" font-weight="600" fill="#7a3af0">Store bridge (optional)</text>
  <text x="380" y="440" font-size="10" fill="currentColor" opacity="0.9">Pass a store to VirtualFrame</text>
  <text x="380" y="458" font-size="10" fill="currentColor" opacity="0.9">State syncs automatically via MessagePort</text>
  <text x="380" y="476" font-size="10" fill="currentColor" opacity="0.9">Changes propagate in both directions</text>
  <text x="380" y="494" font-size="10" fill="currentColor" opacity="0.9">Works across host and remote</text>
</svg>

## Client-Side Navigation (Proxy)

When the remote app performs client-side navigation, it needs to fetch data from the remote server. The `proxy` prop ensures these requests reach the correct server by routing them through a Vinxi/Nitro server middleware on the host.

Without `proxy`, client-side navigation in the remote app will fail with network errors. This is required whenever the host and remote run on different origins.

### 1. Add a proxy to the host's `app.config.ts`

```ts
// app.config.ts (host)
import { defineConfig } from "@tanstack/react-start/config";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3005";

export default defineConfig({
  server: {
    routeRules: {
      "/__vf/**": { proxy: `${REMOTE_URL}/**` },
    },
  },
});
```

### 2. Pass the `proxy` prop

```tsx
const loadFrame = createServerFn().handler(async () => {
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return await prepareVirtualFrameProps(frame, { proxy: "/__vf" });
});
```

::: tip
The proxy prefix (`/__vf`) is a convention — you can use any path that doesn't conflict with your host app's routes. For multiple remotes, use a different prefix for each.
:::

## API Reference

### `<VirtualFrame>`

Client component that displays server-fetched content and resumes live mirroring.

| Prop           | Type                               | Default  | Description                                         |
| -------------- | ---------------------------------- | -------- | --------------------------------------------------- |
| `src`          | `string`                           | —        | Remote URL to fetch and project                     |
| `selector`     | `string`                           | —        | CSS selector for partial projection                 |
| `isolate`      | `"open" \| "closed"`               | `"open"` | Shadow DOM mode                                     |
| `streamingFps` | `number \| Record<string, number>` | —        | Canvas/video streaming FPS                          |
| `store`        | `StoreProxy`                       | —        | Shared store for cross-frame state sync             |
| `proxy`        | `string`                           | —        | Same-origin proxy prefix for client-side navigation |
| `ref`          | `React.Ref`                        | —        | Exposes `{ refresh() }`                             |

### `useStore(selector?)`

Remote-side hook. Returns the store instance or a reactive value at a path.

```tsx
const store = useStore(); // store instance
const count = useStore<number>(["count"]); // reactive value
```

### `fetchVirtualFrame(url, options?)`

Server-only. Fetches a remote page and produces a server render result. Import from `@virtual-frame/tanstack-start/server`.

### `prepareVirtualFrameProps(frame, options?)`

Server-only. Converts a server render result into serialisable props for `<VirtualFrame>`. Returns a **`Promise`** — always `await` it.

| Option     | Type                 | Default  | Description                                         |
| ---------- | -------------------- | -------- | --------------------------------------------------- |
| `selector` | `string`             | —        | CSS selector for partial projection                 |
| `isolate`  | `"open" \| "closed"` | `"open"` | Shadow DOM mode                                     |
| `proxy`    | `string`             | —        | Same-origin proxy prefix for client-side navigation |

## Examples

- **[TanStack Start example](https://github.com/level0x40/virtual-frame/tree/main/examples/tanstack-start-host)** — `pnpm example:tanstack-start`
