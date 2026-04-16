# Server-Side Rendering

Virtual Frame includes a server-side rendering path: fetch the remote document on your server, emit the projected HTML inline, and let the client-side `<virtual-frame>` element pick up where the server left off — without a second network round-trip from the browser to the remote origin.

This page documents the primitives (`fetchVirtualFrame` and `renderVirtualFrame`). For framework-specific integration see the [Next.js](/guide/nextjs), [Nuxt](/guide/nuxt), [SvelteKit](/guide/sveltekit), [TanStack Start](/guide/tanstack-start), [SolidStart](/guide/solid-start), and [Analog](/guide/analog) guides — they wire these helpers into each framework's SSR pipeline.

## When to use SSR

Client-only projection works in two phases: the browser loads the host page, the `<virtual-frame>` element mounts, then it fetches the remote document and renders. That's one extra round-trip of latency between first paint and useful content.

SSR collapses those phases. Your server fetches the remote once, inlines the rendered HTML (plus stylesheets rewritten for Shadow DOM) into the host page, and the browser sees finished content on first paint. The client-side element still mounts, but it **resumes** from the inlined markup instead of re-fetching.

Reach for SSR when:

- The remote origin is slow enough that the extra client round-trip is visible.
- You care about SEO or social-card crawlers for the projected content.
- The host and remote are in the same network boundary — your server can fetch the remote faster than the browser can.

Skip SSR when:

- The remote is personalized per user in ways your server can't replicate.
- The remote is heavy and its full DOM doesn't need to be inlined — a loading state is fine.
- You're already hitting a CDN at the edge and client fetch is effectively free.

## How resumption works

`fetchVirtualFrame` produces a complete `<virtual-frame>` element with three payloads baked in:

1. **Declarative Shadow DOM** — the projected body, already inside a `<template shadowrootmode="…">`. The browser applies it on parse; styles render immediately.
2. **Rewritten stylesheets** — source `<style>` and `<link rel="stylesheet">` contents inlined and rewritten for the Shadow DOM (body/html retargeting, viewport units, font-face handling — same transforms as client-side; see [Shadow DOM](/guide/shadow-dom)).
3. **A resume delta** — a compact JSON blob that lets the client rebuild the iframe's `<body>` string from the shadow DOM innerHTML plus surrounding fragments. The client creates a same-origin `srcdoc` iframe seeded with that reconstruction, avoiding a cross-origin fetch.

Because it uses declarative Shadow DOM, SSR requires `isolate` to be `"open"` or `"closed"` — `"open"` is the default.

## `fetchVirtualFrame(url, options?)`

```ts
import { fetchVirtualFrame } from "virtual-frame/ssr";

const frame = await fetchVirtualFrame("https://remote.example.com/dashboard");

return new Response(`<!doctype html>
<html>
  <body>
    ${frame.html}
  </body>
</html>`, { headers: { "content-type": "text/html" } });
```

`frame.html` is a ready-to-emit `<virtual-frame>` tag with the shadow template and resume delta inline.

### Options

| Option         | Type                         | Default  | Description                                                                                  |
| -------------- | ---------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `headers`      | `Record<string, string>`     | `{}`     | Extra request headers (merged with `Accept: text/html`). Forward cookies or auth from the incoming request here. |
| `selector`     | `string`                     | —        | CSS selector — only the matched element is placed in the shadow DOM. The rest of the body is preserved via the resume delta for full-page reconstruction on the client. |
| `isolate`      | `"open" \| "closed"`         | `"open"` | Shadow DOM mode. `"open"` is required for most hydration scenarios because the client needs to read `host.shadowRoot`. |
| `fetchOptions` | `RequestInit`                | —        | Escape hatch: any other `fetch()` init options (method, body, signal). Merged with the computed `headers`. |

### Errors

A non-2xx response throws:

```
virtual-frame SSR: failed to fetch <url> (<status> <statusText>)
```

Network errors propagate directly from `fetch`. Wrap calls in try/catch if you want to fall back to client-only projection.

## `renderVirtualFrame(rawHtml, options?)`

```ts
import { renderVirtualFrame } from "virtual-frame/ssr";

const frame = await renderVirtualFrame(htmlString, {
  url: "https://remote.example.com/dashboard", // for resolving relative URLs
  selector: "#widget",
});
```

Use this when you already have the HTML — for example, from an internal service call, a filesystem read, or a cached response. It skips the outbound `fetch` and the automatic stylesheet-fetch pass.

### Options

| Option     | Type                 | Default  | Description                                                                 |
| ---------- | -------------------- | -------- | --------------------------------------------------------------------------- |
| `url`      | `string`             | —        | Original URL, used to resolve relative `href`/`src` in the extracted body.  |
| `selector` | `string`             | —        | As above.                                                                   |
| `isolate`  | `"open" \| "closed"` | `"open"` | As above.                                                                   |

::: warning Linked stylesheets are not fetched
`renderVirtualFrame` only inlines `<style>` tags found in the HTML string. If the remote uses `<link rel="stylesheet">`, those are preserved as links — the browser will fetch them client-side, re-introducing a round-trip. Use `fetchVirtualFrame` (which fetches linked stylesheets server-side) when you want everything inlined.
:::

## `VirtualFrameResult`

Both helpers return the same shape:

```ts
interface VirtualFrameResult {
  html: string;          // Complete <virtual-frame> tag — emit this
  srcdoc: string;        // The srcdoc value alone, if you need to build the tag yourself
  body: string;          // Projected body HTML (inside the shadow template)
  styles: string;        // Inlined <style> block(s) with rewritten CSS
  rawHtml: string;       // Original unmodified HTML from the fetch
  resumeDelta: {
    u: string;           // Source URL
    h: string;           // <html> tag attrs
    a: string;           // <body> tag attrs
    r: string;           // Shadow DOM root content (processed body)
    d: string[];         // Body fragments — client reconstructs: d.join("")
  };
  render: (
    overrides?: Partial<RenderVirtualFrameOptions>,
  ) => Promise<VirtualFrameResult>;
}
```

The `render()` helper on a result from `fetchVirtualFrame` lets you re-render the same page with different options (for example, a different `selector`) **without** re-fetching the HTML or stylesheets — useful when the same remote document feeds several panels:

```ts
const frame = await fetchVirtualFrame(url);
const [header, body] = await Promise.all([
  frame.render({ selector: "header" }),
  frame.render({ selector: "main" }),
]);
```

## Selector-mode caveats

With a `selector`, the shadow DOM carries only the matched element, but the resume delta carries the surrounding body so the client can reconstruct the full iframe document. If the selector **matches nothing** at server time, Virtual Frame falls back to rendering the full body and logs a warning — client-side projection then takes over as if SSR hadn't been used.

## Forwarding the incoming request

Your server usually wants to pass through cookies, auth tokens, or locale headers so the remote renders the right content:

```ts
// Hono / Fetch-based servers
app.get("/", async (c) => {
  const frame = await fetchVirtualFrame("https://remote.example.com/dashboard", {
    headers: {
      cookie: c.req.header("cookie") ?? "",
      authorization: c.req.header("authorization") ?? "",
      "accept-language": c.req.header("accept-language") ?? "",
    },
  });
  return c.html(frame.html);
});
```

## Common issues

**"Styles look wrong on first paint, then correct after hydration."** A stylesheet was loaded via `<link>` and not inlined. Check that you're using `fetchVirtualFrame` (not `renderVirtualFrame` on a pre-fetched string) so linked stylesheets are fetched and inlined server-side.

**"I get a 'selector matched nothing' warning."** The selector is evaluated against the server-rendered HTML, before any client hydration. Pick a selector that's stable in the server output, or let the client-side element project once the subtree appears.

**"The projected content shows up twice in devtools."** You're emitting `frame.html` more than once, or the surrounding page is re-rendering around it. Emit the `<virtual-frame>` tag exactly where projection should live; the shadow template is moved into the element on parse.

**"`frame.html` is huge."** That's expected — the whole shadow DOM plus rewritten styles is inline. For typical dashboard pages a few hundred KB is normal. Trim with `selector`, or skip SSR for pages where first-paint latency doesn't matter.
