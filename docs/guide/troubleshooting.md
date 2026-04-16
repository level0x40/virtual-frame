# Troubleshooting

A consolidated index of the most common failure modes, with pointers to the guide that explains the underlying mechanic. This page doesn't go deep — it's a decision tree. Follow the cross-links for root-cause explanations.

## Projection doesn't appear

**The host is empty and there are no errors.**

1. **The host element has no size.** Virtual Frame fills the host's box. A host with `height: 0` or no layout-participating size renders empty. Set explicit `width` and `height`, or place it in a flex/grid cell.
2. **The source iframe's `src` didn't resolve.** The hidden iframe sits at `position: fixed; left: -9999px` — open it in devtools and confirm its document loaded (no 404, no redirect loop).
3. **You're reading the projection synchronously.** Projection kicks off from the constructor but the first content arrives asynchronously after the iframe finishes loading. Wait for `vf.isInitialized` or `iframe.onload` before asserting on DOM. In tests, use `findBy…` / `waitFor`.
4. **For cross-origin sources, the bridge didn't run.** Open the source document's own devtools (load it directly in a new tab) and confirm `virtual-frame/bridge` actually executes. If you see `vf:ready` firing forever in the remote console, the host never acknowledged — see [Cross-Origin](/guide/cross-origin).
5. **`selector` matched nothing.** Projection stays empty until a match appears, then updates live. See [Selector → No-match behavior](/guide/selector#no-match-behavior).

## Styles look wrong

**Content is there but unstyled, or styled the wrong way.**

- **Host styles bleed into the projection.** You forgot `isolate`. Add `isolate="open"` — that's the default for all framework wrappers and what SSR requires.
- **First paint looks wrong, hydration fixes it.** A `<link rel="stylesheet">` wasn't inlined server-side. Use `fetchVirtualFrame` (not `renderVirtualFrame` on a pre-fetched string), which fetches linked stylesheets server-side. See [SSR → Common issues](/guide/ssr#common-issues).
- **Host fonts don't render inside the projection.** Fonts declared only in the host's stylesheet don't cross into a closed shadow tree. Declare fonts in the source document, or load them from the top-level page where both sides inherit them. See [Shadow DOM → `@font-face` promotion](/guide/shadow-dom#font-face-promotion).
- **CSS custom properties from a host theme don't apply.** Custom properties inherit through the shadow boundary only when set on a host-side ancestor. Set them on the `<virtual-frame>` element itself, on `:host` inside the shadow, or on the host page's `html` / `:root`.
- **`height: 100vh` inside the projection fills the browser, not the host element.** Expected: only *width* viewport units (`vw`/`svw`/`dvw`/`lvw`) are rewritten to `cqw`. Height units are intentionally left alone because the host doesn't use `container-type: size`. If the projection needs to fit the host exactly, give the host an explicit height and let the source use percentages. See [Shadow DOM → Viewport units](/guide/shadow-dom#viewport-units).

## Interactivity is broken

**Events fire but don't do what you expect.**

- **`event.isTrusted` checks fail.** Replayed events (cross-origin) are synthetic and never trusted. Operations that require a trusted event — clipboard writes, fullscreen, autoplay unlock — won't work from a replayed event. Adjust the remote listener or live with the limitation.
- **Framework router classifies navigation as external.** The env shim keeps `location.origin` pointing at the host for same-origin consistency. If you see full-page reloads instead of client-side nav, verify that the remote framework reads `window.location` (not `document.baseURI`) for its router, and that you've set `proxy` correctly if you're doing host-origin API calls.
- **Checkbox or radio clicks don't toggle `checked`.** The bridge handles this by calling native `element.click()` rather than dispatching a synthetic event, because synthetic clicks don't toggle state. If you're seeing this fail, confirm you're on a current bridge version.
- **React `<input>` state drifts.** The bridge uses `HTMLInputElement.prototype`'s native `value` setter descriptor to punch through React's overridden setter. If this isn't working, confirm the bridge is current and that the input isn't being re-rendered underneath the change.
- **Form input doesn't sync.** Same-origin is automatic via MutationObserver; cross-origin routes through `vf:input` messages. Add a temporary `window.addEventListener("message", console.log)` in the remote to confirm messages are arriving.

## Cross-origin fails silently

- **No snapshot arrives.** The bridge loaded but never acknowledged. Look for `vf:ready` repeating on an interval in the remote console — if you see it, the host's `vf:ack` isn't coming through. Check that your host is actually mounting the `<virtual-frame>` element and that CSP isn't dropping the `postMessage`.
- **Import the bridge *before* your framework runtime.** If your framework clobbers `fetch`, `history`, or prototype listeners before the bridge patches them, cross-origin breaks in subtle ways.
- **CSP blocks the bridge.** Host: `frame-src` must allow the remote origin. Remote: `script-src` must allow the bridge URL if it's loaded from a CDN. Look for `Refused to load` in both consoles.
- **Multiple `<virtual-frame>` elements pointed at the same remote.** Works out of the box via the custom element's hidden-iframe ref-counting. If you're constructing `VirtualFrame` instances directly, you need to share the iframe yourself — a single bridge can only broadcast to `window.parent`. See [Cross-Origin → Channel IDs and multiple hosts](/guide/cross-origin#channel-ids-and-multiple-hosts).
- **Channel crosstalk.** Each `createBridge()` generates a random channel id. If you passed an explicit `channel` string, make sure it's unique per bridge instance — two bridges on the same channel will deliver messages to both hosts.

## `proxy` doesn't seem to work

- **The core `VirtualFrame` class doesn't accept `proxy`.** It's a property of the env shim applied by the `<virtual-frame>` custom element and the meta-framework packages (`@virtual-frame/next`, `-sveltekit`, `-nuxt`, etc.). The client-only framework packages (`@virtual-frame/react`, `-vue`, `-svelte`, `-solid`, `-angular`) don't expose it either — use the SSR wrapper if you need it.
- **The host server isn't rewriting the proxy path.** `proxy="/proxy/remote"` requires the host to implement `/proxy/remote/:path*` → `https://remote.example.com/:path*`. Without the server rewrite, requests return 404.
- **Paths leak through without rewriting.** The shim patches `fetch`, `XMLHttpRequest`, `URL`, `history`, and `location` — but **not** `WebSocket` and not dynamic `import()` of absolute cross-origin URLs. Keep realtime sockets and module imports at the remote origin, or proxy them at the network layer. See [Cross-Origin → The env shim and the `proxy` option](/guide/cross-origin#the-env-shim-and-the-proxy-option).

## Selector doesn't match what I expected

- **Multiple elements match but only one shows.** Expected — `selector` uses `querySelector` (first-match) semantics, not `querySelectorAll`. Use a more specific selector, or use multiple `<virtual-frame>` elements. See [Selector → How matching works](/guide/selector#how-matching-works).
- **Match is gone but old content lingers briefly.** Expected — the mirror *freezes* with previous content while watching for a replacement match, rather than flashing empty. If a replacement appears, projection resumes.
- **Selector matches on the client but not at SSR time.** Server-side matching runs against the fetched HTML string; if the target only mounts during hydration, SSR falls back to rendering the full body and the client re-evaluates on mount. Not a bug; pick a selector stable in server output or accept the fallback.

## SSR-specific

- **`selector` matched nothing at render time.** Virtual Frame renders the full body as fallback and logs a warning. See [Selector → SSR behavior](/guide/selector#ssr-behavior).
- **Hydration mismatch between server and client HTML.** Ensure you're using the same `isolate` and `selector` options on both sides, and that `proxy` is aligned. Mismatched options produce different shadow templates.
- **`frame.html` is enormous.** Full-page SSR inlines all stylesheets and the whole body. Trim with `selector` or skip SSR on low-priority pages.

## Streaming / canvas

- **Cross-origin projection is choppy.** Cross-origin defaults to ~5 FPS (200 ms interval); there is no smooth-rAF equivalent cross-origin because per-frame data-URL encoding would saturate `postMessage`. Set `streamingFps: 30` (or higher) explicitly. See [Streaming FPS → Default behavior](/guide/streaming-fps#default-behavior-streamingfps-omitted).
- **Canvas shows a stale frame.** The source canvas only redraws on events; smooth mode rAF ticks faster than the source is drawing. Set `streamingFps` to a polled interval so captures happen regardless.
- **Canvas is CORS-tainted.** A canvas that has drawn a cross-origin image without CORS headers throws when you try to read pixels; the bridge silently drops the error and the projection doesn't update. Fix the image's CORS headers at the source.
- **CPU spikes with many canvases.** Smooth mode captures every canvas per frame. Cap globally (`streamingFps: 30`) or use per-selector rules — remember that selectors match **in declaration order, first-wins**, not by specificity.
- **Video audio plays from the source.** Expected — audio stays in the source document; the projected video is muted. Unmute / mute in the source.
- **Per-selector FPS rule doesn't apply.** Keys are matched via `Element.matches` in object-declaration order. Put more-specific keys first (`{ ".preview": 5, canvas: 30 }`, not the other way around).

## Shared store

- **State isn't syncing between host and remote.** Check that both sides hold the same store reference (host) or open the singleton (remote). For manual transports, verify `handle.onOperation` callbacks on one side are reaching `handle.apply` on the other — see [Store → Custom transport](/guide/store#the-operation-type).
- **Concurrent writes "lose" one value.** Expected under last-writer-wins — the newer `ts` wins. For stronger semantics (CRDTs, counters), layer your logic on top of the raw store.
- **Mutation didn't trigger a re-render.** Framework subscriptions batch at microtask boundaries. Multiple writes in the same task coalesce into one notification — this is intentional.

## Development-only quirks

- **Vite dev serves stylesheets as JS modules.** SSR extracts CSS from `__vite__css` markers automatically. If you're building a custom fetcher, replicate that extraction.
- **Fast-refresh in the source iframe loses projection.** Expected when the source document fully reloads — projection re-initializes on the next `load` event. Navigation inside the iframe (SPA route change) keeps projection alive.
- **Devtools Elements panel doesn't show the projected DOM.** Expand the host element's `#shadow-root (open)` node — projected content lives inside the shadow root, not the light DOM. In closed mode, the panel hides it entirely; use `vf.getShadowRoot()` in the console to reach it.

## Scroll sync looks off

- **Projection scrolls but source doesn't, or vice versa.** Scroll sync is bidirectional and uses normalized percentages (0–1). If only one side scrolls, check that both host and remote are receiving the relevant `vf:scroll` / `vf:scrollUpdate` messages.
- **Scroll position drifts on dynamic content.** Expected — percentages survive layout changes, so a 50% position stays at 50% as content grows. If you want pixel-exact sync, you need to observe content size on both sides and translate yourself.

## When to open an issue

If your problem doesn't match any of the categories above, a minimal reproducible example against `packages/core/test/fixtures/` style fixtures is by far the fastest path to a fix. Include:

- Source document (or a minimal equivalent)
- Host setup (class / element / framework)
- Browser + version, and whether the same repro behaves differently in Vitest browser mode vs. a real browser tab
- Full console output from both the host and the source frame
- For cross-origin issues: the exchange of `vf:*` messages (paste the `postMessage` log from both sides)
