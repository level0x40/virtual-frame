# Next.js

`@virtual-frame/next` provides first-class Next.js integration with **server rendering**. The remote page is fetched during SSR and embedded in the response — the user sees styled content on first paint with zero layout shift, and the client resumes live updates without an extra network request.

Both **App Router** (Server Components) and **Pages Router** (`getServerSideProps`) are supported with a single `VirtualFrame` import.

## Installation

```sh
npm install virtual-frame @virtual-frame/next @virtual-frame/store
```

## App Router (Server Components)

In a Server Component, `VirtualFrame` is an **async** component that fetches the remote page and streams it into the response.

```tsx
// app/page.tsx
import { VirtualFrame } from "@virtual-frame/next";

export default async function Page() {
  return <VirtualFrame src="http://remote:3001" />;
}
```

### Selector Projection

```tsx
<VirtualFrame src="http://remote:3001" selector="#counter-card" />
```

### Multiple Projections from One Fetch

```tsx
import { fetchVirtualFrame, VirtualFrame } from "@virtual-frame/next";

export default async function Page() {
  const frame = await fetchVirtualFrame("http://remote:3001");

  return (
    <>
      <VirtualFrame frame={frame} />
      <VirtualFrame frame={frame} selector="#counter-card" />
    </>
  );
}
```

See the [Shared Store](#shared-store) section below for host + remote bridge wiring.

## Pages Router

Use `getServerSideProps` with the same `VirtualFrame` component:

```tsx
// pages/index.tsx
import type { GetServerSideProps } from "next";
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
  VirtualFrame,
} from "@virtual-frame/next";

export const getServerSideProps: GetServerSideProps = async () => {
  const frame = await fetchVirtualFrame("http://remote:3003");
  return {
    props: {
      fullPage: await prepareVirtualFrameProps(frame),
      counter: await prepareVirtualFrameProps(frame, { selector: "#counter-card" }),
    },
  };
};

export default function Page({ fullPage, counter }) {
  return (
    <>
      <VirtualFrame {...fullPage} />
      <VirtualFrame {...counter} />
    </>
  );
}
```

## Remote Side

The remote is a normal Next.js app. See the [Shared Store](#shared-store) section below for how to read and write the bridged store from a `"use client"` component.

## Shared Store

A **shared store** keeps state in sync between the host app and the remote app (including every projected frame) over a `MessagePort` bridge. Writes on either side propagate to the other automatically, and every `useStore(...)` subscription re-renders when the underlying value changes.

The store lives in the host — the remote connects to it at runtime via the hidden iframe `VirtualFrame` mounts. You do **not** duplicate the store on the remote: the remote-side `useStore()` returns a proxy that forwards reads and writes across the port.

### 1. Create the store on the host

```ts
// app/store.ts
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store.count = 0;
```

`createStore()` returns a plain reactive object. Assign initial values directly — nested objects and arrays are supported. Paths are addressed as string arrays: `["count"]`, `["user", "name"]`, `["items", 0]`.

### 2. Pass the store to `<VirtualFrame>` on the host

Because the store is a client-only object, fetch the frame props in a Server Component and hand them to a `"use client"` wrapper that owns the store:

```tsx
// app/page.tsx (Server Component)
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/next";
import { HostFrames } from "./components/HostFrames";

export default async function Page() {
  const frame = await fetchVirtualFrame("http://remote:3001");
  return (
    <HostFrames
      frameProps={await prepareVirtualFrameProps(frame)}
      counterProps={await prepareVirtualFrameProps(frame, {
        selector: "#counter-card",
      })}
    />
  );
}
```

```tsx
// app/components/HostFrames.tsx
"use client";

import { VirtualFrame } from "@virtual-frame/next";
import { useStore } from "@virtual-frame/react";
import { store } from "../store";

export function HostFrames({ frameProps, counterProps }) {
  // Subscribe to a path — returns the current value, re-renders on change.
  const count = useStore<number>(store, ["count"]);

  return (
    <>
      <p>Host count: {count ?? 0}</p>
      <button onClick={() => (store.count = (count ?? 0) + 1)}>
        Increment from host
      </button>
      <button onClick={() => (store.count = 0)}>Reset</button>

      {/* Any VirtualFrame that receives store= joins the same sync bridge. */}
      <VirtualFrame {...frameProps} store={store} />
      <VirtualFrame {...counterProps} store={store} />
    </>
  );
}
```

- **Host reads/writes are direct**: `store.count` operates on the host's in-memory object — no serialisation, no round-trip.
- **Passing `store={store}` wires up the bridge**: when the hidden iframe loads and the remote signals `vf-store:ready`, the component opens a `MessageChannel`, transfers one port to the iframe, and calls `connectPort()` on the host side. Multiple `<VirtualFrame>` instances sharing the same `src` share one iframe *and* one port — the store is bridged exactly once.

### 3. Consume the store on the remote

On the remote, use `useStore` from `@virtual-frame/next` in a `"use client"` component. It's a two-mode hook — no args returns the singleton `StoreProxy`, a path returns a reactive value:

```tsx
"use client";

import { useStore } from "@virtual-frame/next";

function Counter() {
  const store = useStore();                    // StoreProxy singleton
  const count = useStore<number>(["count"]);   // reactive value at path

  return (
    <button onClick={() => (store.count = (count ?? 0) + 1)}>
      Count: {count ?? 0}
    </button>
  );
}
```

| Call                  | Returns      | Purpose                                                              |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| `useStore()`          | `StoreProxy` | **Remote singleton.** Connects to the host store on first call.      |
| `useStore(["count"])` | `T`          | **Reactive subscription.** Re-renders the component on value change. |

### Standalone fallback

When the remote page is loaded directly in the browser (not through a VirtualFrame), there is no host and no port. In that case `useStore()` returns a plain in-memory store, so the page still works as a standalone Next.js app. Writes stay local; reads return whatever was last written.

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
  <text x="40" y="48" font-size="14" font-weight="700" fill="#6964ff">Server</text>

  <!-- Step 1 -->
  <rect x="40" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="140" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">① Fetch remote page</text>
  <text x="140" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Download and parse HTML</text>

  <!-- Step 2 -->
  <rect x="260" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="360" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">② Extract styles + body</text>
  <text x="360" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Prepare styles and content</text>

  <!-- Step 3 -->
  <rect x="480" y="64" width="200" height="60" rx="8" fill="rgba(105,100,255,0.08)" stroke="rgba(105,100,255,0.3)" stroke-width="1"/>
  <text x="580" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#6964ff">③ Render to response</text>
  <text x="580" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Styled content, zero JS needed</text>

  <!-- Arrows server -->
  <line x1="240" y1="94" x2="258" y2="94" stroke="#6964ff" stroke-width="1.5" marker-end="url(#ah)"/>
  <line x1="460" y1="94" x2="478" y2="94" stroke="#6964ff" stroke-width="1.5" marker-end="url(#ah)"/>

  <!-- HTML output -->
  <rect x="40" y="144" width="640" height="80" rx="8" fill="rgba(105,100,255,0.05)" stroke="rgba(105,100,255,0.2)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="360" y="172" text-anchor="middle" font-size="12" font-weight="600" fill="#6964ff">Server Output</text>
  <text x="360" y="192" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Fully styled content embedded in the page — visible on first paint</text>
  <text x="360" y="210" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Everything needed for seamless client activation is included</text>

  <!-- Server → Client arrow -->
  <line x1="360" y1="240" x2="360" y2="260" stroke="#7a3af0" stroke-width="1.5" marker-end="url(#ah2)"/>
  <text x="374" y="254" font-size="9" fill="currentColor" opacity="0.9">HTML response</text>

  <!-- Client Phase -->
  <rect x="20" y="260" width="680" height="266" rx="10" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="40" y="288" font-size="14" font-weight="700" fill="#8010e1">Client</text>

  <!-- Step 4 -->
  <rect x="40" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="140" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">④ Resume</text>
  <text x="140" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Activate from server output</text>
  <text x="140" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">No extra network requests</text>

  <!-- Step 5 -->
  <rect x="260" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="360" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">⑤ Live projection</text>
  <text x="360" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Content stays in sync</text>
  <text x="360" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Full interactivity enabled</text>

  <!-- Step 6 -->
  <rect x="480" y="304" width="200" height="68" rx="8" fill="rgba(128,16,225,0.06)" stroke="rgba(128,16,225,0.3)" stroke-width="1"/>
  <text x="580" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#8010e1">⑥ Shared resources</text>
  <text x="580" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Multiple projections</text>
  <text x="580" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">One source, many views</text>

  <!-- Arrows client -->
  <line x1="240" y1="338" x2="258" y2="338" stroke="#8010e1" stroke-width="1.5" marker-end="url(#ah2)"/>
  <line x1="460" y1="338" x2="478" y2="338" stroke="#8010e1" stroke-width="1.5" marker-end="url(#ah2)"/>

  <!-- Benefits -->
  <rect x="40" y="392" width="300" height="120" rx="8" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="60" y="418" font-size="11" font-weight="600" fill="#7a3af0">Benefits</text>
  <text x="60" y="440" font-size="10" fill="currentColor" opacity="0.9">✓ Instant paint — content visible before JS runs</text>
  <text x="60" y="458" font-size="10" fill="currentColor" opacity="0.9">✓ No flash of unstyled content</text>
  <text x="60" y="476" font-size="10" fill="currentColor" opacity="0.9">✓ No extra network requests on the client</text>
  <text x="60" y="494" font-size="10" fill="currentColor" opacity="0.9">✓ Minimal data sent to the browser</text>

  <!-- Store bridge -->
  <rect x="360" y="392" width="320" height="120" rx="8" fill="rgba(128,16,225,0.04)" stroke="rgba(128,16,225,0.2)" stroke-width="1"/>
  <text x="380" y="418" font-size="11" font-weight="600" fill="#7a3af0">Store bridge (optional)</text>
  <text x="380" y="440" font-size="10" fill="currentColor" opacity="0.9">Pass a store to VirtualFrame</text>
  <text x="380" y="458" font-size="10" fill="currentColor" opacity="0.9">State syncs automatically</text>
  <text x="380" y="476" font-size="10" fill="currentColor" opacity="0.9">Changes propagate in both directions</text>
  <text x="380" y="494" font-size="10" fill="currentColor" opacity="0.9">Works across host and remote</text>
</svg>

## Client-Side Navigation (Proxy)

When the remote app performs client-side navigation (e.g. clicking a Next.js `<Link>`), it needs to fetch data (such as RSC payloads) from the remote server. The `proxy` prop ensures these requests reach the correct server by routing them through a Next.js rewrite on the host.

Without `proxy`, client-side navigation in the remote app will fail with network errors. This is required whenever the host and remote run on different origins.

### 1. Add a rewrite to the host's `next.config`

```js
// next.config.mjs (host)
const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["virtual-frame", "@virtual-frame/next"],

  // Next 16 dev enforces an origin allowlist for client-side requests
  // (Server Actions, HMR, `/_next/*` fetches). Origin mismatch silently
  // breaks hydration and click handlers with no console error. Add every
  // loopback host your browser may use to load the page.
  allowedDevOrigins: ["localhost", "127.0.0.1"],

  async rewrites() {
    return [
      {
        source: "/__vf/:path*",
        destination: `${REMOTE_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

::: warning Next 16 `allowedDevOrigins`
If you run host and remote on different loopback hosts in dev (e.g. `localhost:3000` host, `127.0.0.1:3001` remote), Next 16 dev will silently kill client-side interactions on origin mismatch. Declare both hosts in `allowedDevOrigins` on **both** the host and the remote's `next.config`. This only affects dev; production is unaffected.
:::

### 2. Pass the `proxy` prop to `VirtualFrame`

**App Router (Server Component):**

```tsx
<VirtualFrame src="http://remote:3001" proxy="/__vf" />
```

**App Router (with `prepareVirtualFrameProps`):**

```tsx
const frame = await fetchVirtualFrame("http://remote:3001");
const props = await prepareVirtualFrameProps(frame, { proxy: "/__vf" });
// props now includes proxy — spread it onto VirtualFrame
```

**Pages Router:**

```tsx
export const getServerSideProps: GetServerSideProps = async () => {
  const frame = await fetchVirtualFrame("http://remote:3003");
  return {
    props: {
      fullPage: await prepareVirtualFrameProps(frame, { proxy: "/__vf" }),
    },
  };
};
```

::: tip
The proxy prefix (`/__vf`) is a convention — you can use any path that doesn't conflict with your host app's routes. For multiple remotes, use a different prefix for each.
:::

## API Reference

### `<VirtualFrame>`

Works in Server Components, Client Components, and Pages Router.

| Prop           | Type                               | Default  | Description                             |
| -------------- | ---------------------------------- | -------- | --------------------------------------- |
| `src`          | `string`                           | —        | Remote URL to fetch and project         |
| `frame`        | `VirtualFrameResult`               | —        | Pre-fetched result from `fetchVirtualFrame` — pass directly in an RSC, or via `prepareVirtualFrameProps` in both App Router and Pages Router |
| `selector`     | `string`                           | —        | CSS selector for partial projection     |
| `isolate`      | `"open" \| "closed"`               | `"open"` | Shadow DOM mode                         |
| `streamingFps` | `number \| Record<string, number>` | —        | Canvas/video streaming FPS              |
| `store`        | `StoreProxy`                       | —        | Shared store for cross-frame state sync |
| `proxy`        | `string`                           | —        | Same-origin proxy prefix for `fetch` / `XHR` rewriting (see [Client-Side Navigation](#client-side-navigation-proxy)) |
| `ref`          | `React.Ref<{ refresh(): void }>`   | —        | Exposes `{ refresh() }`                 |

### `useStore()` <Badge type="tip" text="@virtual-frame/next" />

**Remote-side** hook for use inside the projected app. Returns the singleton `StoreProxy` once the host has connected its `MessagePort`. Pass the returned proxy to the reactive-subscription hook when you want to re-render on specific paths.

```tsx
// Inside the remote (projected) app
import { useStore } from "@virtual-frame/next";

const store = useStore(); // StoreProxy — singleton, stable identity
```

::: info Host-side subscription is a different hook
On the **host** side, subscribe to specific paths with `useStore(store, path)` imported from `@virtual-frame/react` — same name, different signature, different package. See the [Shared Store](#shared-store) section above for the full host/remote pattern.
:::

### `fetchVirtualFrame(url, options?)`

Fetches a remote page and produces a server render result.

### `prepareVirtualFrameProps(frame, options?)`

Converts a server render result into serialisable props for `<VirtualFrame>`. Returns a **`Promise`** — always `await` it.

| Option     | Type                 | Default  | Description                          |
| ---------- | -------------------- | -------- | ------------------------------------ |
| `selector` | `string`             | —        | CSS selector for partial projection  |
| `isolate`  | `"open" \| "closed"` | `"open"` | Shadow DOM mode                      |
| `proxy`    | `string`             | —        | Same-origin proxy prefix for client-side navigation |

## Examples

- **[App Router example](https://github.com/level0x40/virtual-frame/tree/main/examples/nextjs-app-host)** — `pnpm example:nextjs-app`
- **[Pages Router example](https://github.com/level0x40/virtual-frame/tree/main/examples/nextjs-pages-host)** — `pnpm example:nextjs-pages`
