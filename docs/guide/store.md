# Shared Store

Virtual Frame includes an optional **synchronized store** that lets host and remote frames share reactive state in real time. You read and write state like a normal object, and changes are automatically synchronized across both sides.

## Why a Shared Store?

When composing microfrontends with Virtual Frame, the host and remote applications run in separate contexts. They can project content, but they can't share JavaScript state directly. Common workarounds — URL parameters, shared cookies, custom messaging — are either fragile or limited.

The Virtual Frame store solves this by providing a **transparent, two-way reactive state layer** between host and remote:

- The host writes `store.count = 1` — the remote sees the update instantly
- The remote writes `store.user.name = "Alice"` — the host re-renders
- No manual serialization, no message protocols, no boilerplate

## Installation

::: code-group

```sh [npm]
npm install @virtual-frame/store
```

```sh [pnpm]
pnpm add @virtual-frame/store
```

```sh [yarn]
yarn add @virtual-frame/store
```

:::

## Quick Start

### Host Side

Create a store and pass it to `VirtualFrame`:

```jsx
import { createStore } from "@virtual-frame/store";
import { VirtualFrame } from "@virtual-frame/react";

const store = createStore();
store.count = 0;

function App() {
  return <VirtualFrame src="/remote/" store={store} />;
}
```

### Remote Side

In the remote application, use the framework-specific `useStore` hook to access the shared state:

```jsx
import { useStore } from "@virtual-frame/react/store";
import { useStore as useStoreValue } from "@virtual-frame/react";

function Counter() {
  const store = useStore();
  const count = useStoreValue(store, ["count"]);

  return (
    <button onClick={() => store.count++}>
      Count: {count}
    </button>
  );
}
```

See the [framework-specific guides](#framework-integration) below for Vue, Svelte, Solid, and Angular examples.

## How It Works

### Plain Object API

You never call special mutation methods — just write to the object:

```js
store.user = { name: "Alice", age: 30 };  // set
store.user.name = "Bob";                   // nested set
delete store.user.age;                     // delete
store.items.push("new");                   // array mutation
```

Arrays, Maps, and Sets are all supported with their full native APIs.

### Deterministic Synchronization

Both sides always converge to the same state, even with concurrent writes. Operations are totally ordered — if both the host and remote write to the same key simultaneously, the result is deterministic (last-writer-wins by timestamp).

### Batching

Multiple mutations in the same microtask are batched into a single subscriber notification. This means rapid writes don't cause excessive re-renders:

```js
store.a = 1;
store.b = 2;
store.c = 3;
// → One notification, not three
```

## Core API

### `createStore(options?)`

Creates a new store proxy.

```js
import { createStore } from "@virtual-frame/store";

const store = createStore();
const store2 = createStore({ sourceId: "host-01" });
```

| Option     | Type     | Description                                |
| ---------- | -------- | ------------------------------------------ |
| `sourceId` | `string` | Unique runtime identifier (auto-generated) |

### `getStore(proxy)`

Returns the control handle for a store proxy. Works with the root proxy or any nested child proxy.

```js
import { getStore } from "@virtual-frame/store";

const handle = getStore(store);
```

The handle exposes:

| Property / Method                  | Description                                   |
| ---------------------------------- | --------------------------------------------- |
| `handle.proxy`                     | The root store proxy                          |
| `handle.sourceId`                  | This runtime's unique ID                      |
| `handle.log`                       | The operation log (read-only array)           |
| `handle.apply(op)`                 | Apply a single remote [`Operation`](#the-operation-type) |
| `handle.applyBatch(ops)`           | Apply a batch of remote operations            |
| `handle.snapshot()`                | Deep clone of the current materialized state  |
| `handle.readPath(path)`            | Read the raw value at a path (no proxy wrapping) — use for `useSyncExternalStore`-style snapshot comparisons where stable object identity would defeat change detection |
| `handle.subscribe(cb)`             | Subscribe to any change (root). Returns an unsubscribe function |
| `handle.subscribe(path, cb)`       | Subscribe to changes that touch `path` (e.g., `["user", "name"]`) |
| `handle.onOperation(cb)`           | Listen to every local write — the hook for building custom transports |
| `handle.destroy()`                 | Tear down the store and release resources     |

### `connectPort(store, port)`

Low-level API for connecting two store instances over a `MessagePort`. When using the framework integrations with the `store` prop, the connection is handled automatically — you typically don't need this.

```js
import { connectPort } from "@virtual-frame/store";

const channel = new MessageChannel();
const disconnect = connectPort(hostStore, channel.port1);

// Later: disconnect
disconnect();
```

### `isStoreProxy(value)`

Returns `true` if the value is a store proxy.

```js
import { isStoreProxy } from "@virtual-frame/store";

isStoreProxy(store);       // true
isStoreProxy({});          // false
isStoreProxy(store.child); // true
```

### The `Operation` type

Most users never see this — the framework integrations take care of transporting operations for you. If you're building a **custom transport** (e.g., piping the store through a WebSocket, a Worker, or a server) you'll read operations from `handle.onOperation` and replay them via `handle.apply` / `handle.applyBatch`.

```ts
type OperationType =
  | "set"         // assign a value at path
  | "delete"      // delete the property at path
  | "splice"      // array splice
  | "map-set"     // Map.set
  | "map-delete"  // Map.delete
  | "map-clear"   // Map.clear
  | "set-add"     // Set.add
  | "set-delete"  // Set.delete
  | "set-clear"   // Set.clear

type Operation = {
  ts: number;              // performance.now() at creation
  source: string;          // originating runtime's sourceId
  seq: number;             // per-source monotonic counter
  type: OperationType;
  path: PropertyKey[];     // e.g. ["user", "name"]
  value?: unknown;         // for set, map-set, set-add
  deleteCount?: number;    // for splice
  items?: unknown[];       // for splice
  index?: number;          // for splice
  key?: unknown;           // for map-set, map-delete
};
```

Operations are JSON-safe provided the `value` / `items` / `key` payloads are. Ordering across sources is decided by `(ts, source, seq)` — the default last-writer-wins rule. If you reorder or buffer operations on the transport, apply them with the same ordering on the peer.

#### Minimal custom transport

```js
import { createStore, getStore, connectPort } from "@virtual-frame/store";

// ── Option A: MessagePort (simplest, bidirectional) ─────────
const channel = new MessageChannel();
const store = createStore();
const disconnect = connectPort(store, channel.port1);
// Send channel.port2 to the peer context.

// ── Option B: custom transport via onOperation/apply ────────
const handle = getStore(store);
const off = handle.onOperation((op) => socket.send(JSON.stringify(op)));
socket.onmessage = (e) => handle.apply(JSON.parse(e.data));
```

## Supported Data Types

| Type          | Read | Write | Notes                                                  |
| ------------- | ---- | ----- | ------------------------------------------------------ |
| Primitives    | ✓    | ✓     | `string`, `number`, `boolean`, `null`, `undefined`     |
| Plain objects | ✓    | ✓     | Arbitrarily nested                                     |
| Arrays        | ✓    | ✓     | `push`, `pop`, `splice`, `sort`, `reverse`, `fill` etc |
| Maps          | ✓    | ✓     | `set`, `get`, `delete`, `clear`, iteration             |
| Sets          | ✓    | ✓     | `add`, `delete`, `clear`, iteration                    |

## Framework Integration

Each framework package provides two store-related exports:

1. **Remote hook** (`@virtual-frame/<framework>/store`) — singleton store for the remote side, connects to the host automatically.
2. **Reactive subscription** (`@virtual-frame/<framework>`) — subscribes to a store path and returns a framework-native reactive value.

See the framework-specific pages for detailed usage:

- [React](/guide/react#shared-store)
- [Vue](/guide/vue#shared-store)
- [Svelte](/guide/svelte#shared-store)
- [Solid](/guide/solid#shared-store)
- [Angular](/guide/angular#shared-store)

## Shared Store vs Module Federation

[Module Federation](https://module-federation.io/) (Webpack/Rspack) is the most widely adopted approach to sharing code and state across microfrontends. It works by exposing JavaScript modules from one build and consuming them in another at runtime — including shared singleton state managers like Redux or Zustand.

The Virtual Frame shared store takes a fundamentally different approach. Understanding when to use each is key to making the right architectural choice.

### How They Differ

|                        | Module Federation                          | Virtual Frame Shared Store                  |
| ---------------------- | ------------------------------------------ | ------------------------------------------- |
| **Isolation model**    | Same JavaScript context (shared `window`)  | Separate contexts with full isolation       |
| **What's shared**      | Arbitrary JS — functions, classes, stores   | Serializable data (no functions)            |
| **Build coupling**     | Shared dependencies must be version-aligned | None — host and remote are fully independent builds |
| **Framework coupling** | Shared singletons must use same framework   | Framework agnostic — React host, Vue remote works |
| **Consistency**        | Immediate (same memory)                     | Eventual (< 1ms latency)                   |
| **Failure isolation**  | A crash in one microfrontend can take down the host | Crash is contained — host survives        |
| **CSS isolation**      | Requires conventions or tooling             | Built-in via Shadow DOM                     |
| **Security boundary**  | None — shared `window` means full access    | Strong — separate origins, CSP, sandboxing  |

### When to Use Module Federation

Module Federation is the better choice when:

- **Microfrontends share the same framework and version** — you want to share React context, providers, or router state without serialization overhead
- **You need to share functions or class instances** — callbacks, event emitters, service objects that can't be serialized
- **Latency is critical** — same-memory access is instantaneous; even sub-millisecond delay is too much (rare in practice)
- **Your team controls all builds** — you can coordinate dependency versions and deploy together when needed

### When to Use the Virtual Frame Shared Store

The shared store is the better choice when:

- **Microfrontends are independently deployed** — different teams, different release schedules, no shared build pipeline
- **You mix frameworks** — a React host composing Vue, Svelte, or Angular remotes
- **You need strong isolation** — a crash, memory leak, or rogue script in one microfrontend must not affect the host
- **Security matters** — the remote runs untrusted or semi-trusted content and you want strong isolation
- **State is data, not behavior** — you're sharing configuration, user preferences, feature flags, form state, or counters — not function references
- **You want zero build coordination** — no shared dependency version matrix to maintain

### Using Both Together

The two approaches are not mutually exclusive. A common pattern in large organizations:

1. **Module Federation** for tightly coupled microfrontends owned by the same team (shared design system, shared auth context)
2. **Virtual Frame + shared store** for loosely coupled microfrontends owned by different teams (embedded dashboards, third-party widgets, independently versioned features)

The decision boundary is usually **team ownership**: if the same team owns both sides, Module Federation's tighter coupling is fine. If different teams own each side, the isolation and independence of Virtual Frame pays for itself.

## Design Tradeoffs

### Benefits

- **Zero-boilerplate state sharing** — write to a plain object, both sides stay in sync
- **Framework agnostic** — the core store has no framework dependencies
- **Deterministic convergence** — event sourcing with total ordering guarantees both sides agree
- **Memory efficient** — lazy evaluation and caching minimize overhead
- **Microtask batching** — multiple mutations coalesce into a single render cycle

### Tradeoffs

- **Eventual consistency** — there is a brief propagation delay (typically < 1ms). If both sides write to the same key simultaneously, last-writer-wins by timestamp
- **Serializable values only** — functions, DOM nodes, and other non-serializable objects cannot be stored
- **No persistence** — the store lives in memory. Page refreshes reset it. If you need persistence, snapshot to `localStorage` or a server on your own
