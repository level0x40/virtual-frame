# SolidStart

`@virtual-frame/solid-start` provides first-class [SolidStart](https://start.solidjs.com) integration with **server rendering**. The remote page is fetched during SSR inside a route query marked with `"use server"` and embedded in the response — the user sees styled content on first paint with zero layout shift, and the client resumes live updates without an extra network request.

## Installation

```sh
npm install virtual-frame @virtual-frame/solid-start @virtual-frame/solid @virtual-frame/store
```

### Required `app.config.ts` setup

SolidStart needs a couple of hints so that Vite compiles Solid-aware packages from source (including `@solidjs/router` and the Virtual Frame Solid packages). This is the same recipe every third-party Solid package uses — it's not specific to Virtual Frame.

```ts
// app.config.ts
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  ssr: true,
  vite: {
    ssr: {
      // Force Vite to transform these packages through vite-plugin-solid
      // instead of Node-importing their prebuilt output. Without this,
      // Node's ESM resolver bypasses the `solid` export condition and
      // loads the browser build on the server, which throws
      // "Client-only API called on the server side".
      noExternal: [
        "@solidjs/router",
        "@virtual-frame/solid",
        "@virtual-frame/solid-start",
      ],
      resolve: {
        // `solid` must come first so packages that expose a `solid`
        // export condition (pointing at raw source JSX/TSX) are picked
        // up and compiled in SSR mode by vite-plugin-solid.
        conditions: ["solid", "node", "import", "module", "default"],
      },
    },
    resolve: {
      // Same treatment on the client so SSR and browser builds use the
      // same compilation pipeline — otherwise hydration templates
      // emitted by SSR won't line up with those rebuilt in the client
      // and you'll hit "Failed attempt to create new DOM elements
      // during hydration".
      conditions: ["solid", "browser", "import", "module", "default"],
    },
  },
});
```

::: tip Why is this needed?
Solid's compiler only emits hydration-safe code when a component is compiled **inside a hydration boundary** — i.e., as part of the host app's build, not as a prebuilt library chunk. That's why every Solid ecosystem package (including `@solidjs/router`, `@solidjs/meta`, etc.) ships JSX source under the `solid` export condition and relies on the consuming app to compile it. The `noExternal` + `resolve.conditions` lines above tell Vite to do exactly that.
:::

## Route Query (Server Rendering)

Create a `query(..., "frames")` function that runs `"use server"` to fetch the remote page during SSR. The function runs on the server, keeping `node-html-parser` out of the client bundle. Expose it as the route's `preload` so data is ready before the component mounts, and consume it with `createAsync()`.

```tsx
// src/routes/index.tsx
import { query, createAsync, type RouteDefinition } from "@solidjs/router";
import { Show } from "solid-js";
import { VirtualFrame } from "@virtual-frame/solid-start";
import {
  fetchVirtualFrame,
  prepareVirtualFrameProps,
} from "@virtual-frame/solid-start/server";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3015";

const getFrames = query(async () => {
  "use server";
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame),
  };
}, "frames");

export const route = {
  preload: () => getFrames(),
} satisfies RouteDefinition;

export default function Home() {
  const data = createAsync(() => getFrames());
  return (
    <Show when={data()}>
      {(frames) => <VirtualFrame {...frames().frame} />}
    </Show>
  );
}
```

### Selector Projection

Project only a specific part of the remote page:

```tsx
const getFrames = query(async () => {
  "use server";
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
}, "frames");
```

### Multiple Projections from One Fetch

Fetch once, display multiple sections — every `<VirtualFrame>` instance targeting the same `src` shares a single hidden iframe:

```tsx
const getFrames = query(async () => {
  "use server";
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    fullFrame: await prepareVirtualFrameProps(frame),
    counterFrame: await prepareVirtualFrameProps(frame, {
      selector: "#counter-card",
    }),
  };
}, "frames");

export default function Home() {
  const data = createAsync(() => getFrames());
  return (
    <Show when={data()}>
      {(frames) => (
        <>
          <VirtualFrame {...frames().fullFrame} />
          <VirtualFrame {...frames().counterFrame} />
        </>
      )}
    </Show>
  );
}
```

## Remote Side

The remote is a normal SolidStart app. Add the bridge script to `src/entry-client.tsx` — it auto-initialises when loaded inside an iframe and is a no-op when loaded standalone:

```tsx
// src/entry-client.tsx
import { mount, StartClient } from "@solidjs/start/client";

// Virtual Frame bridge — auto-initialises inside an iframe.
import "virtual-frame/bridge";

mount(() => <StartClient />, document.getElementById("app")!);
```

See the [Shared Store](#shared-store) section below for how to read and write the bridged store from the remote.

## Shared Store

A **shared store** keeps state in sync between the host app and the remote app (including every projected frame) over a `MessagePort` bridge. Writes on either side propagate to the other automatically, and every `useStore(...)` subscription re-renders via Solid signals when the underlying value changes.

The store lives in the host — the remote connects to it at runtime via the hidden iframe `VirtualFrame` mounts. You do **not** duplicate the store on the remote: the remote-side `useStore()` returns a proxy that forwards reads and writes across the port.

### 1. Create the store on the host

```ts
// src/store.ts
import { createStore } from "@virtual-frame/store";

export const store = createStore();
store["count"] = 0;
```

`createStore()` returns a plain reactive object. Assign initial values directly — nested objects and arrays are supported. Paths are addressed as string arrays: `["count"]`, `["user", "name"]`, `["items", 0]`.

### 2. Pass the store to `<VirtualFrame>` on the host

```tsx
// src/routes/index.tsx
import { createAsync } from "@solidjs/router";
import { Show } from "solid-js";
import { VirtualFrame, useStore } from "@virtual-frame/solid-start";
import { store } from "../store";

export default function Home() {
  const data = createAsync(() => getFrames());
  // Subscribe to a path — returns a Solid signal accessor.
  const count = useStore<number>(store, ["count"]);

  return (
    <>
      <p>Host count: {count() ?? 0}</p>
      <button onClick={() => (store["count"] = (count() ?? 0) + 1)}>
        Increment from host
      </button>
      <button onClick={() => (store["count"] = 0)}>Reset</button>

      <Show when={data()}>
        {(frames) => (
          <>
            {/* Any VirtualFrame that receives store= joins the same sync bridge. */}
            <VirtualFrame {...frames().fullFrame} store={store} />
            <VirtualFrame {...frames().counterFrame} store={store} />
          </>
        )}
      </Show>
    </>
  );
}
```

- **Host reads/writes are direct**: `store["count"]` operates on the host's in-memory object — no serialisation, no round-trip.
- **Passing `store={store}` wires up the bridge**: when the hidden iframe loads and the remote signals `vf-store:ready`, the component opens a `MessageChannel`, transfers one port to the iframe, and calls `connectPort()` on the host side. Multiple `<VirtualFrame>` instances sharing the same `src` share one iframe *and* one port — the store is bridged exactly once.

### 3. Consume the store on the remote

On the remote, use `useStore` from `@virtual-frame/solid-start/store` (singleton that connects to the incoming `MessagePort`) together with `useStore` from `@virtual-frame/solid-start` (reactive subscription):

```tsx
// src/routes/index.tsx (remote)
import { useStore as useRemoteStore } from "@virtual-frame/solid-start/store";
import { useStore } from "@virtual-frame/solid-start";

export default function Home() {
  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);

  return (
    <div id="counter-card">
      <div>{count() ?? 0}</div>
      <button onClick={() => (store["count"] = (count() ?? 0) + 1)}>
        Increment
      </button>
      <button onClick={() => (store["count"] = 0)}>Reset</button>
    </div>
  );
}
```

Two imports, two different functions, both named `useStore`:

| Import                                             | Purpose                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `useStore` from `@virtual-frame/solid-start/store` | **Remote singleton.** Returns the `StoreProxy` for the remote app. Sets up the `MessagePort` bridge on first call. |
| `useStore` from `@virtual-frame/solid-start`       | **Reactive subscription.** Takes a `StoreProxy` + path and returns a Solid signal accessor. |

### Standalone fallback

When the remote page is loaded directly in the browser (not through a VirtualFrame), there is no host and no port. In that case `useRemoteStore()` returns a plain in-memory store, so the page still works as a standalone SolidStart app. Writes stay local; reads return whatever was last written.

### Tips

- **Initialise on the host, not the remote.** The host's values are the source of truth on first connect. Anything the remote writes before the port is open is kept local until the bridge finishes handshaking.
- **Keep values serialisable.** Values cross a `postMessage` boundary — prefer plain objects, arrays, primitives. No class instances, functions, or DOM nodes.
- **Namespace per feature.** For multiple features in one app, group keys under stable prefixes (`["cart", "items"]`, `["auth", "user"]`).
- **One store per remote URL is typical.** Pass the same `store` to every frame that targets the same remote.

## How Server Rendering Works

<svg viewBox="0 0 720 546" xmlns="http://www.w3.org/2000/svg" style="max-width:720px;width:100%;height:auto;font-family:system-ui,sans-serif">
  <defs>
    <marker id="ss-ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#2c4f7c"/></marker>
    <marker id="ss-ah2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#446b9e"/></marker>
  </defs>

  <rect x="20" y="20" width="680" height="220" rx="10" fill="rgba(44,79,124,0.05)" stroke="rgba(44,79,124,0.25)" stroke-width="1"/>
  <text x="40" y="48" font-size="14" font-weight="700" fill="#2c4f7c">Server ("use server" route query)</text>

  <rect x="40" y="64" width="200" height="60" rx="8" fill="rgba(44,79,124,0.08)" stroke="rgba(44,79,124,0.35)" stroke-width="1"/>
  <text x="140" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#2c4f7c">1. Fetch remote page</text>
  <text x="140" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Download and parse HTML</text>

  <rect x="260" y="64" width="200" height="60" rx="8" fill="rgba(44,79,124,0.08)" stroke="rgba(44,79,124,0.35)" stroke-width="1"/>
  <text x="360" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#2c4f7c">2. Extract styles + body</text>
  <text x="360" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Prepare styles and content</text>

  <rect x="480" y="64" width="200" height="60" rx="8" fill="rgba(44,79,124,0.08)" stroke="rgba(44,79,124,0.35)" stroke-width="1"/>
  <text x="580" y="88" text-anchor="middle" font-size="11" font-weight="600" fill="#2c4f7c">3. Return from query()</text>
  <text x="580" y="106" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Styled content, zero JS needed</text>

  <line x1="240" y1="94" x2="258" y2="94" stroke="#2c4f7c" stroke-width="1.5" marker-end="url(#ss-ah)"/>
  <line x1="460" y1="94" x2="478" y2="94" stroke="#2c4f7c" stroke-width="1.5" marker-end="url(#ss-ah)"/>

  <rect x="40" y="144" width="640" height="80" rx="8" fill="rgba(44,79,124,0.05)" stroke="rgba(44,79,124,0.25)" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="360" y="172" text-anchor="middle" font-size="12" font-weight="600" fill="#2c4f7c">Route Query Output</text>
  <text x="360" y="192" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">SSR HTML wrapped in declarative shadow DOM — visible on first paint</text>
  <text x="360" y="210" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Serialised through createAsync() into the Solid component</text>

  <line x1="360" y1="240" x2="360" y2="260" stroke="#446b9e" stroke-width="1.5" marker-end="url(#ss-ah2)"/>
  <text x="374" y="254" font-size="9" fill="currentColor" opacity="0.9">HTML response</text>

  <rect x="20" y="260" width="680" height="266" rx="10" fill="rgba(68,107,158,0.05)" stroke="rgba(68,107,158,0.25)" stroke-width="1"/>
  <text x="40" y="288" font-size="14" font-weight="700" fill="#446b9e">Client</text>

  <rect x="40" y="304" width="200" height="68" rx="8" fill="rgba(68,107,158,0.07)" stroke="rgba(68,107,158,0.35)" stroke-width="1"/>
  <text x="140" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#446b9e">4. Resume</text>
  <text x="140" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Hidden iframe loads remote app</text>
  <text x="140" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Bridge auto-initialises</text>

  <rect x="260" y="304" width="200" height="68" rx="8" fill="rgba(68,107,158,0.07)" stroke="rgba(68,107,158,0.35)" stroke-width="1"/>
  <text x="360" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#446b9e">5. Live projection</text>
  <text x="360" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Content stays in sync</text>
  <text x="360" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Full interactivity enabled</text>

  <rect x="480" y="304" width="200" height="68" rx="8" fill="rgba(68,107,158,0.07)" stroke="rgba(68,107,158,0.35)" stroke-width="1"/>
  <text x="580" y="326" text-anchor="middle" font-size="11" font-weight="600" fill="#446b9e">6. Shared resources</text>
  <text x="580" y="342" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">Multiple projections</text>
  <text x="580" y="358" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.9">One iframe, many views</text>

  <line x1="240" y1="338" x2="258" y2="338" stroke="#446b9e" stroke-width="1.5" marker-end="url(#ss-ah2)"/>
  <line x1="460" y1="338" x2="478" y2="338" stroke="#446b9e" stroke-width="1.5" marker-end="url(#ss-ah2)"/>

  <rect x="40" y="392" width="300" height="120" rx="8" fill="rgba(68,107,158,0.05)" stroke="rgba(68,107,158,0.25)" stroke-width="1"/>
  <text x="60" y="418" font-size="11" font-weight="600" fill="#446b9e">Benefits</text>
  <text x="60" y="440" font-size="10" fill="currentColor" opacity="0.9">Instant paint — content visible before JS runs</text>
  <text x="60" y="458" font-size="10" fill="currentColor" opacity="0.9">No flash of unstyled content</text>
  <text x="60" y="476" font-size="10" fill="currentColor" opacity="0.9">No extra network requests on the client</text>
  <text x="60" y="494" font-size="10" fill="currentColor" opacity="0.9">Ref-counted shared iframes across projections</text>

  <rect x="360" y="392" width="320" height="120" rx="8" fill="rgba(68,107,158,0.05)" stroke="rgba(68,107,158,0.25)" stroke-width="1"/>
  <text x="380" y="418" font-size="11" font-weight="600" fill="#446b9e">Store bridge (optional)</text>
  <text x="380" y="440" font-size="10" fill="currentColor" opacity="0.9">Pass a store to VirtualFrame</text>
  <text x="380" y="458" font-size="10" fill="currentColor" opacity="0.9">State syncs automatically via MessagePort</text>
  <text x="380" y="476" font-size="10" fill="currentColor" opacity="0.9">Changes propagate in both directions</text>
  <text x="380" y="494" font-size="10" fill="currentColor" opacity="0.9">Works across host and remote</text>
</svg>

## Client-Side Navigation (Proxy)

When the remote app performs client-side navigation, it needs to fetch data from the remote server. The `proxy` option ensures these requests reach the correct server by routing them through a dev proxy on the host.

Without `proxy`, client-side navigation in the remote app will fail with network errors whenever the host and remote run on different origins.

### 1. Add a dev proxy to the host's SolidStart config

```ts
// app.config.ts (host)
import { defineConfig } from "@solidjs/start/config";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3015";

export default defineConfig({
  server: {
    devProxy: {
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

```tsx
const getFrames = query(async () => {
  "use server";
  const frame = await fetchVirtualFrame(REMOTE_URL);
  return {
    frame: await prepareVirtualFrameProps(frame, { proxy: "/__vf" }),
  };
}, "frames");
```

::: tip
The proxy prefix (`/__vf`) is a convention — you can use any path that doesn't conflict with your host app's routes. For multiple remotes, use a different prefix for each.
:::

## API Reference

### `<VirtualFrame>`

Solid component that displays server-fetched content and resumes live mirroring.

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

Subscribes to a store path and returns a Solid signal accessor.

```tsx
import { useStore } from "@virtual-frame/solid-start";

const count = useStore<number>(store, ["count"]); // signal accessor
// use as count() in JSX
```

### `useStore()` (remote-side)

Remote-side helper. Returns the shared store singleton and sets up the MessagePort bridge. Import from `@virtual-frame/solid-start/store`.

```tsx
import { useStore as useRemoteStore } from "@virtual-frame/solid-start/store";

const store = useRemoteStore();
```

### `fetchVirtualFrame(url, options?)`

Server-only. Fetches a remote page and produces a server render result. Import from `@virtual-frame/solid-start/server`.

### `prepareVirtualFrameProps(frame, options?)`

Server-only. Converts a server render result into serialisable props for `<VirtualFrame>`. Returns a **`Promise`** — always `await` it.

| Option     | Type                 | Default  | Description                                         |
| ---------- | -------------------- | -------- | --------------------------------------------------- |
| `selector` | `string`             | —        | CSS selector for partial projection                 |
| `isolate`  | `"open" \| "closed"` | `"open"` | Shadow DOM mode                                     |
| `proxy`    | `string`             | —        | Same-origin proxy prefix for client-side navigation |

## Examples

- **[SolidStart example](https://github.com/level0x40/virtual-frame/tree/main/examples/solid-start-host)** — `pnpm example:solid-start`
