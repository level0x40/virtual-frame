# Stability & Versioning

Virtual Frame is currently in the **0.x** line. All packages in this monorepo share the same major version so that the core class, custom element, bridge, and framework integrations stay compatible with each other.

## What 0.x means

Following [semver](https://semver.org/) convention for 0.x releases:

- **Minor** version bumps (`0.1.x` → `0.2.x`) may include breaking changes. Read the release notes before upgrading.
- **Patch** version bumps (`0.1.0` → `0.1.1`) do not change the public surface. They may fix bugs or add internal instrumentation.
- **Public API** is the surface documented in this site — the `VirtualFrame` class, the `<virtual-frame>` custom element, the bridge protocol, the SSR helpers, the store primitives, and each framework package's documented exports. Anything with a leading underscore (`_rewriteCSS`, `_buildEnvShim`, `__virtualFrameShadowRoot`) is internal and may change without notice.

## Version alignment

Virtual Frame has two distinct compatibility surfaces: the packages installed alongside each other in a single host process, and the bridge protocol that runs between a host and a cross-origin remote. They follow different rules.

### Packages in the same host

Install `virtual-frame` and `@virtual-frame/*` packages from the same minor line. They share internal types and runtime conventions, and mixing minors inside one host is not tested.

```jsonc
{
  "dependencies": {
    "virtual-frame": "^0.1.0",
    "@virtual-frame/react": "^0.1.0",
    "@virtual-frame/store": "^0.1.0",
  },
}
```

Because these are all part of the same install, keeping them in sync is typically a no-op — `pnpm up @virtual-frame/*` (or your package manager's equivalent) brings the whole set forward together.

### Host ↔ bridge (cross-origin)

The bridge script on the remote and the host library must speak a **compatible bridge protocol** — not the exact same npm version. This distinction matters because the whole point of cross-origin projection is that the host and the remote ship on independent schedules.

- **Within a minor line** (e.g. any pair of `0.1.x` versions): always compatible, in either direction. An older host can talk to a newer bridge and vice versa.
- **Across minor lines**: the protocol is usually unchanged, but when it moves, release notes call it out explicitly. Check before bumping one side of the deployment ahead of the other.

Pinning the bridge CDN URL (`https://unpkg.com/virtual-frame@0.1.0/dist/bridge.js`) is a good practice for reproducible builds, but it is not a compatibility requirement. If you want the remote to pick up bug fixes automatically without host redeploys, pin to a minor line (`@0.1`) instead of an exact patch.

### In practice

Most teams will never need to think about this: the default `^0.1.0` range gives you the same-minor guarantee for in-process packages, and any sensible CDN pin for the bridge (pin-to-minor or pin-exact) satisfies the cross-origin rule. The two places it actually matters:

- **Rolling a protocol-affecting minor bump**: upgrade both sides to the new line; release notes will tell you when this applies.
- **Running a long-lived unpinned bridge script from a CDN**: if it rolls forward into a protocol-changing minor while the host stays behind, the pairing will break. Pin the bridge.

## Browser support

Virtual Frame targets modern evergreen browsers with these baseline capabilities:

- [Shadow DOM v1](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [`Element.getRootNode()`](https://developer.mozilla.org/en-US/docs/Web/API/Node/getRootNode)
- [`postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) with structured clone
- [`HTMLCanvasElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) — only required when streaming `<canvas>` / `<video>`
- [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) — only required for SSR

Chrome, Edge, Firefox, and Safari current stable are all supported. IE11 and legacy Edge are not.

## Server runtimes (SSR)

`virtual-frame/ssr` uses `fetch` and a small dependency (`node-html-parser`) for HTML parsing. It runs on any runtime that implements the Fetch API:

- Node.js 18+
- Bun
- Deno
- Cloudflare Workers
- Vercel Edge / Netlify Edge

## Road to 1.0

The 1.0 boundary will lock the public API and the bridge protocol. Until then, expect:

- Additive changes most releases
- Targeted breaking changes when they materially improve the API or fix a design mistake
- Release notes that call out migration steps explicitly

Follow [releases on GitHub](https://github.com/level0x40/virtual-frame/releases) for version-by-version notes.
