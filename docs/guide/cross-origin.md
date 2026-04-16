# Cross-Origin

Same-origin projection reads the iframe's live DOM directly. Cross-origin projection can't — the browser's same-origin policy blocks it. Virtual Frame handles this with a small **bridge script** served from the remote origin: the bridge serializes the document back to the host over `postMessage`, and the host reconstructs and mirrors it exactly as it would a same-origin tree. All other features — [`isolate`](/guide/shadow-dom), [`selector`](/guide/selector), [`streamingFps`](/guide/streaming-fps), SSR — work across the origin boundary with no change to your host code.

This page covers setup, the message protocol (so you can debug a broken bridge), the `proxy` option for rewriting same-origin traffic, and the security surface you're taking on.

## Setup

### 1. Include the bridge on the remote page

```html
<!-- Inside the cross-origin source document, BEFORE your framework -->
<script src="https://unpkg.com/virtual-frame/dist/bridge.js"></script>
```

Or, if you control the source build:

```js
import "virtual-frame/bridge";
```

Load the bridge **before** your framework runtime. It installs a MutationObserver and several prototype patches (for fetch, history, the URL constructor) that need to be in place before the page starts mutating or issuing requests.

The bridge auto-initializes when it detects it's running inside an iframe (`window.parent !== window`). If you're embedding the script in an SSR template, there's no extra call needed.

### 2. Use Virtual Frame normally on the host

No special host-side configuration is required. Virtual Frame detects that the iframe's `contentDocument` is inaccessible and falls into bridge mode automatically.

```html
<virtual-frame
  src="https://remote.example.com/dashboard.html"
  isolate="open"
></virtual-frame>
```

## Handshake

When the bridge loads, it begins sending `vf:ready` to its parent every 100 ms. The retries continue until the host acknowledges with `vf:ack` and then asks for the first snapshot via `vf:requestSnapshot`. The bridge replies with `vf:snapshot`, and from that point on it streams incremental `vf:mutations` as the source DOM changes.

```
bridge → host : vf:ready         (every 100 ms until acked)
host   → bridge: vf:ack           (confirms channel + streaming config)
host   → bridge: vf:requestSnapshot
bridge → host : vf:snapshot      (full DOM descriptor tree + CSS + fonts)
bridge → host : vf:mutations     (ongoing, one message per MutationObserver callback)
```

The 100 ms retry loop is intentional — it means a bridge that loaded before the host was ready (race) will still connect within a frame or two. If you see `vf:ready` firing forever in the remote console, the host never acknowledged: check that your host code is actually mounting the `<virtual-frame>` element and that no origin / CSP blocker is dropping the message.

## Message protocol

Each message has the envelope `{ __virtualFrame: true, channel, type, ... }`. `channel` is a random id per bridge instance (set at `createBridge()` time) used to demultiplex messages when multiple bridges post to the same window.

| Direction       | Message              | Purpose                                                              |
| --------------- | -------------------- | -------------------------------------------------------------------- |
| bridge → host   | `vf:ready`           | Bridge is loaded; retries until acked.                               |
| host → bridge   | `vf:ack`             | Confirms channel; carries `streamingIntervals` config.               |
| host → bridge   | `vf:requestSnapshot` | Ask for an initial full snapshot (sent after ack, and on re-mount).  |
| bridge → host   | `vf:snapshot`        | Full serialized DOM descriptor tree + stylesheet entries + fonts.    |
| bridge → host   | `vf:mutations`       | Incremental batch: `childList`, `attributes`, `characterData`.       |
| bridge → host   | `vf:css`             | Dynamic stylesheet changes (additions, CSSOM writes).                |
| bridge → host   | `vf:canvasFrame`     | Canvas or video frame as a base64 data URL (see [Streaming FPS](/guide/streaming-fps)). |
| bridge → host   | `vf:scrollUpdate`    | Source-side scroll position (normalized percentage).                  |
| host → bridge   | `vf:event`           | Replay a user event on the target element.                           |
| bridge → host   | `vf:eventResult`     | Echoes back whether the event was prevented.                          |
| host → bridge   | `vf:input`           | Sync a form field value (and/or `checked`) into the remote.           |
| host → bridge   | `vf:scroll`          | Sync scroll position back to the remote.                             |
| host → bridge   | `vf:navigate`        | Tell the remote to navigate to a URL.                                |

Node IDs are assigned lazily in the bridge (incrementing integers, tracked in a `WeakMap`), so mutation batches reference numeric IDs rather than repeating descriptors. IDs are never reused within a session.

Mutation batches are **not debounced** — the MutationObserver callback fires once per browser task, and each firing produces one `vf:mutations` message. If the source is churning (dozens of mutations per frame) you'll see dozens of messages. The host handles them as they arrive; on the remote side there's no backpressure.

## Channel IDs and multiple hosts

`createBridge({ channel: "…" })` lets you pin a deterministic channel id; omit for a random one per page load. Channel IDs demultiplex on the host side when multiple bridge instances post to the same window.

However, **one bridge only broadcasts to `window.parent`.** A single bridge cannot fan out to multiple hosts in different frames. If you want multiple `<virtual-frame>` elements in the same host page projecting from the same remote, the custom element handles this by ref-counting a single hidden iframe — all the elements share one bridge. If you're rolling your own integration with the `VirtualFrame` class directly, you'll need to do the same ref-counting yourself, or use the custom element.

## `createBridge()`

The default entry point (`import "virtual-frame/bridge"`) boots a bridge with defaults. For custom transports — workers, relays, non-iframe carriers — construct the bridge yourself:

```ts
import { createBridge } from "virtual-frame/bridge";

const bridge = createBridge({
  channel: "dashboard",                   // fixed channel id (default: random)
  postMessage: (msg) => relay.send(msg),  // override outbound delivery
});

bridge.start();
```

| Option        | Type                      | Description                                                                   |
| ------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `channel`     | `string`                  | Stable channel id. Omit for a random id per page load.                        |
| `postMessage` | `(msg: object) => void`   | Replace the default `window.parent.postMessage(msg, "*")` with a custom sink. |

The returned object exposes `start()`, `destroy()`, and `send()` — useful if you're relaying messages over `BroadcastChannel`, a `SharedWorker`, or a `WebSocket`.

## What gets serialized

A `vf:snapshot` message carries three payloads:

- **Body descriptor tree.** A recursive serialization of `<body>` — tag name, attributes, text content, children — with `<script>` and `<noscript>` nodes skipped and `on*` inline event handlers stripped. Node IDs are attached to each descriptor so future mutations can reference them.
- **Stylesheet entries.** `document.styleSheets` entries are iterated: for readable sheets (same-origin to the remote), rule text is concatenated and included. For CORS-blocked sheets, only the `href` is sent, and the **host** fetches the stylesheet at its own origin — which may or may not succeed depending on the remote server's headers. Inline `<style>` tag contents are always included verbatim.
- **Font manifest.** A list of `@font-face` declarations and `document.fonts` entries, with a `jsOnly` flag on fonts that can't be reconstructed from CSS alone. The host uses this to promote fonts into its own `document.fonts` registry (see [Shadow DOM → `@font-face` promotion](/guide/shadow-dom#font-face-promotion)).

## Event replay

When the host sends `vf:event`, the bridge rebuilds a synthetic event of the right type (`MouseEvent`, `PointerEvent`, `KeyboardEvent`, `TouchEvent`, etc.) and dispatches it on the target element. Mouse, pointer, keyboard, touch, drag, and form-submit events are all supported.

A few special cases:

- **Checkbox and radio clicks** call `element.click()` directly rather than dispatching a synthetic click. Synthetic clicks don't toggle `checked` — the native activation path does, so the bridge bypasses dispatch for these.
- **Anchor clicks** (`<a href=…>`) that aren't `preventDefault`-ed fall back to assigning `window.location.href`, which routes through the host-initiated navigation path (see below).
- **`event.isTrusted` is `false`.** All replayed events are synthetic. If your framework or library branches on `isTrusted` — for example, to refuse programmatic form submissions — it will reject the replayed event. This is rare in practice, but worth knowing if you hit unexplained "click does nothing" bugs.

The bridge echoes back `vf:eventResult` with a `defaultPrevented` flag so the host can mirror the effect locally (for example, a host-side `<a>` capture won't navigate if the remote handler canceled).

## Input and scroll sync

Form-field sync (`vf:input`) uses the native `value` property descriptor from `HTMLInputElement.prototype` when setting the value, specifically to work with **React's synthetic event system** — React overrides the `value` setter on input instances, and bypassing it would skip React's state updates. With the native descriptor, React sees the change and dispatches its own events.

`type="file"` inputs are a browser-enforced special case: no script can set `value` on a file input, and cross-origin iframes have additional restrictions. File uploads need to happen inside the remote itself — the host can't hand off a file picked on its page.

Scroll sync (`vf:scroll` / `vf:scrollUpdate`) is **bidirectional** and uses **normalized percentages** (0.0 – 1.0) rather than pixel positions. This survives dynamic content layout changes — if the remote's content grows while the host shows scroll position 0.5, the projection stays at 50% regardless of the new height. Both sides use echo-guard flags to prevent feedback loops.

## Navigation

The host can initiate a navigation with `vf:navigate { url }`. The bridge simply assigns `window.location.href = url` — it does *not* filter the URL, so a navigate command with an off-origin URL will attempt a cross-origin navigation that usually fails with a CORS error rather than silently succeeding. Keep navigation targets on the remote origin unless you've explicitly set up the host-side fetch path (see below).

When the host is in charge of navigation (for example, intercepting `<a>` clicks to animate a transition), it calls its own `_navigateIframe(url)` which *fetches* the destination from the remote server and injects it into the iframe via `document.open`/`write`/`close`. This keeps the iframe same-origin to the host (`about:srcdoc`), so subsequent same-origin projection continues to work. This path re-injects the env shim and a `<base>` tag so relative URLs resolve correctly.

## The env shim and the `proxy` option

When the host builds a cross-origin iframe, it injects an **env shim** — a small `<script>` that monkey-patches the iframe's execution environment before any framework code runs. The shim is there to make the remote *think* it's running at its own origin when the iframe is actually same-origin to the host.

The shim patches:

- **`fetch`** and **`XMLHttpRequest`**: rewrites any request to a host-origin URL so it resolves against the right origin.
- **`URL` constructor**: handles `new URL(path, location.origin)` which frameworks use to build API endpoints.
- **`history.pushState` / `replaceState`**: rewrites URLs so the browser's URL bar stays sane and the framework router sees same-origin paths.
- **`location.href` / `location.assign` / `location.replace`** and the **Navigation API**: intercepts imperative navigations and routes them through the bridge's navigate path.

The shim does **not** patch WebSockets and does not fully handle native ES module `import()` of cross-origin URLs — those stay at the remote origin and need to be reachable directly.

### With `proxy`

By default, the shim rewrites host-origin requests to go directly to the remote origin. That's simple but forces the browser through CORS preflights on every API call and won't carry first-party cookies.

Setting `proxy` reroutes those requests to a **same-origin path on the host server**, which you proxy to the remote:

```html
<virtual-frame
  src="/proxy/remote/dashboard.html"
  proxy="/proxy/remote"
></virtual-frame>
```

With `proxy="/proxy/remote"`, a request inside the remote document to `/api/data` is rewritten to `{host-origin}/proxy/remote/api/data`, which your host server rewrites to `https://remote.example.com/api/data`. Everything stays same-origin to the browser — no CORS, first-party cookies, simpler caching. The host server needs one rewrite rule: `/proxy/remote/:path*` → `https://remote.example.com/:path*`. See [Next.js](/guide/nextjs), [Nuxt](/guide/nuxt), and [SvelteKit](/guide/sveltekit) guides for framework-specific examples.

::: info Proxy is a meta-framework feature
The `proxy` option is applied when the host builds the iframe's env shim, which is part of the SSR / meta-framework integration — not the client-only framework packages (`@virtual-frame/react`, `-vue`, `-svelte`, `-solid`). Use the framework's SSR wrapper (`@virtual-frame/next`, `@virtual-frame/sveltekit`, etc.) to get `proxy` support.
:::

## Security

A frank list of what the bridge does and doesn't protect against:

- **The bridge runs inside the remote document.** It cannot reach the host's DOM. Any assumption the remote makes about `window.top` or `window.parent` can still hold, because the bridge doesn't hide those.
- **`postMessage` targets are `"*"` by default.** Both directions. The bridge and host filter incoming messages by source frame reference and channel id, not by origin. If your threat model requires origin pinning, replace `postMessage` via the `createBridge({ postMessage })` hook and set an explicit target origin.
- **Scripts and inline event handlers are stripped on both sides.** `<script>` / `<noscript>` nodes are skipped during serialization on the bridge and filtered again when the host builds descriptors; `on*` attributes are dropped. The remote's scripts run *in the remote*, not on the host — but anything the script produces (DOM, styles) is mirrored.
- **Event replay is synthetic.** No privileged operations (clipboard, fullscreen, autoplay unlock) can be triggered from a replayed event — browsers require `isTrusted: true` for those, which is read-only.
- **Stylesheet fetch happens on the host.** CORS-blocked sheets are fetched by the host origin rather than the remote. If the host can see them, they're inlined into the projection; if not, the projection renders without them. Don't rely on this path for sensitive CSS — the host fetches with host credentials.

## Common issues

**"The projection stays empty and I see no errors."**  The bridge didn't load or never got `vf:ready` through. Open the remote iframe's devtools and confirm `virtual-frame/bridge` actually ran before your framework. If you see `vf:ready` firing on an interval, the host isn't acknowledging — check that your host code mounted the `<virtual-frame>` element and that CSP isn't dropping the message (`frame-src` must allow the remote origin).

**"It works in dev but not in production."**  In production the bridge is usually served from a CDN. Verify the `<script src>` URL resolves and isn't blocked by CSP (`script-src` must allow the bridge host), and that your remote's CORS headers let the host-origin page fetch stylesheets if you're relying on that fallback.

**"Events fire but don't do what I expect."**  Replayed events are synthetic — `event.isTrusted === false`. If the remote framework listens on a capturing ancestor, replay works normally. If it compares `event.isTrusted`, it won't — adjust the remote listener or live with the limitation.

**"My React inputs don't update when the user types."**  Make sure you're on a version of the bridge that uses the native `value` property descriptor (current versions do). If you're seeing React-specific state drift, it's likely a different bug — the descriptor path is designed around React's setter override.

**"I need multiple `<virtual-frame>` elements pointing at the same remote."**  That works out of the box when you use the `<virtual-frame>` custom element: it ref-counts one hidden iframe across all sibling consumers and they share a bridge. If you're constructing `VirtualFrame` instances by hand, you need to share the iframe yourself.

**"My remote's API calls get blocked by CORS."**  Either add CORS headers on the remote, or set `proxy` (and add the corresponding host-side rewrite). The proxy path keeps everything same-origin and carries first-party cookies, which is what you usually want anyway.

**"Navigation goes to a blank page."**  The bridge's `vf:navigate` doesn't filter URLs — if you send an off-origin URL, the remote iframe does a true cross-origin navigation that breaks the bridge. Keep navigation targets on the remote origin, or intercept on the host and use the host-side fetch-and-inject path.
