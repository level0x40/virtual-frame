# Streaming FPS

The projected DOM doesn't include the **visual output** of `<canvas>` or `<video>` — those are pixel buffers, not serializable nodes. Virtual Frame captures them as live frames and mirrors the pixels into the host. `streamingFps` controls the capture rate, which is a tradeoff between visual smoothness, CPU cost, and (in cross-origin setups) bandwidth over `postMessage`.

This page documents the capture model, what actually happens at each FPS setting, and the asymmetry between same-origin and cross-origin projections — which matters more than most people realize.

## How capture works

Same-origin and cross-origin projections use **different pipelines**:

- **Same-origin.** The host holds a direct reference to the source canvas / video element and copies pixels into a mirror canvas on the host side every animation frame. No serialization, no `postMessage`, no encoding — just a `drawImage` per rAF tick.
- **Cross-origin.** Frames are captured _inside_ the remote iframe by the bridge, encoded as base64 data URLs (PNG for canvas, JPEG at ~0.6 quality for video), and posted to the host via `postMessage`. Each frame is tens of KB; the capture interval directly controls bandwidth.

`streamingFps` affects each pipeline differently. The default behavior is not the same on both sides — read the following sections carefully if you're going cross-origin.

## Default behavior (`streamingFps` omitted)

**Same-origin:** the host mirror runs on a `requestAnimationFrame` loop, copying pixels every frame. This matches the browser's native repaint cadence — typically 60 FPS on desktop, higher on 120 Hz displays, lower on low-power devices. It's the right default for interactive canvases and games, and it's free (no encoding overhead).

```js
new VirtualFrame(iframe, host, {
  // streamingFps omitted — smooth rAF-paced mirror, same-origin only
});
```

**Cross-origin:** the bridge falls back to a default capture rate of **~5 FPS** (200 ms interval) for every canvas and video. There is no smooth-mode equivalent cross-origin — the pipeline cost (encode, postMessage, decode, paint) is too high to run every frame. If you need higher framerate for cross-origin streaming content, set `streamingFps` explicitly.

::: warning Cross-origin smooth mode doesn't exist
If you're projecting an animated canvas across origins and haven't set `streamingFps`, you'll get ~5 FPS and probably think something is broken. Set an explicit number (e.g. `streamingFps: 30`) to get a proper framerate.
:::

## Global FPS cap

A number pins all `<canvas>` and `<video>` elements to a fixed capture rate — `setInterval(1000 / fps)` under the hood, both same-origin and cross-origin:

```js
new VirtualFrame(iframe, host, { streamingFps: 30 });
```

```html
<virtual-frame src="./game.html" streaming-fps="30"></virtual-frame>
```

Use this when you want predictable CPU / bandwidth behavior across devices. No clamping is applied — `streamingFps: 1` and `streamingFps: 120` are both respected literally, so use sane values.

## Per-selector FPS

Pass an object to configure different rates per element group:

```js
new VirtualFrame(iframe, host, {
  streamingFps: {
    canvas: 30, // any element matching `canvas`
    video: 10, // any element matching `video`
    ".preview": 5, // any element matching `.preview`
    "*": 2, // catch-all fallback
  },
});
```

Via the custom element, pass the same object as JSON:

```html
<virtual-frame src="./page.html" streaming-fps='{"canvas": 30, "video": 10}'></virtual-frame>
```

Keys are **full CSS selectors** (not tag names specifically — anything `Element.matches` accepts works: `.class`, `#id`, `[data-role]`, `canvas.chart`, etc.). For each captured element, the engine walks the object's keys in **declaration order** and picks the **first one that matches** — there is no specificity calculation.

::: info First-match wins, not most-specific-wins
If your object is `{ canvas: 30, ".preview": 5 }` and an element is `<canvas class="preview">`, the `canvas` rule wins (it was listed first). Put the more specific rule first if you want it to take precedence:

```js
{ ".preview": 5, canvas: 30 }  // .preview canvases capture at 5, others at 30
```

The `"*"` key acts as a catch-all for elements that don't match any other selector.
:::

## Choosing a value

Picking an FPS is a tradeoff between visual smoothness, CPU cost on the host, and (cross-origin) serialization/network cost. Rough starting points:

| Scenario                           | Suggested FPS | Rationale                                                           |
| ---------------------------------- | ------------- | ------------------------------------------------------------------- |
| Interactive canvas / game          | `undefined`   | Smooth rAF mirror (same-origin). Cross-origin: 60 if motion demands |
| Real-time chart or data viz        | 15–30         | Charts rarely need >30 FPS                                          |
| Ambient background animation       | 10            | Motion is noticeable, precision isn't needed                        |
| Status indicator / pulse / avatar  | 2–5           | Low-motion content — keep CPU and bandwidth down                    |
| Static preview that rarely updates | 1             | Effectively "poll for change"                                       |

Cross-origin multiplies every FPS you add: each frame is encoded and serialized. For dashboards with several canvases, set per-selector rules rather than a global cap — the canvas that matters gets 30, the sparklines get 5.

## Video: two capture paths

`<video>` elements go through a different path depending on what's in them:

**Path A — `MediaStream` source.** If the video has `srcObject` set to a `MediaStream` (WebRTC, `getUserMedia`, `MediaRecorder` output), the engine reuses that stream directly via `element.captureStream(fps)`. No frame encoding, no polling — the stream flows into the host's mirror video natively. This is the fast path.

**Path B — file or URL source.** A plain `<video src="movie.mp4">` (or streaming via `<source>` tags) doesn't expose a `MediaStream`, so the bridge falls back to per-interval `drawImage` onto a helper canvas and ships data URLs over `postMessage`, same as canvas capture. The video must be playing and past `readyState >= 2` for the capture to produce frames — paused or not-ready videos are skipped.

Either way, **audio plays from the source document, not the mirrored element.** The projected video is muted and `playsInline`. If you need audio, it has to come from the source iframe itself — the host doesn't re-play it.

## Lifecycle

- **Destroy.** `vf.destroy()` clears all capture intervals and releases mirror canvases. Safe to call multiple times.
- **Navigation inside the iframe.** When the source navigates (SPA route change or full load), capture streams are torn down and re-initialized against the new document. If the new document has different canvases, the engine picks them up automatically — no intervention needed.
- **Element removal from source.** When a `<canvas>` or `<video>` is removed from the source DOM, its capture stops on the next tick. Re-adding it re-starts capture.

## Limitations

A handful of footguns worth knowing about up front:

- **No offscreen pause.** Capture runs unconditionally once started. If a projection scrolls offscreen or sits inside a hidden tab, frames are still captured and shipped. There's no IntersectionObserver-based throttling.
- **CORS-tainted canvas is silently skipped.** A canvas that has drawn a cross-origin image without proper CORS headers throws when you try to read its pixels; the bridge catches and drops the error, and the projection simply won't update. Fix the CORS headers on the image source — nothing the host can do.
- **No DPR scaling.** Frames are captured at `canvas.width × canvas.height` (the buffer dimensions, not the CSS size). If your source sizes its canvas without multiplying by `devicePixelRatio`, the projection will look soft on high-DPI displays. This is a source-side concern, not something Virtual Frame can paper over.
- **No backpressure cross-origin.** If the `postMessage` queue backs up (slow host, too many high-FPS canvases), frames pile up rather than drop. Lowering FPS is the fix.
- **Audio isn't projected for `<video>`.** As noted above, it stays in the source iframe.

## Common issues

**"My canvas shows a stale frame and doesn't update."** Check that the source document is actually drawing into the canvas after projection starts. Canvases that only redraw on pointer events fire less often than the capture loop expects — drop `streamingFps` to a polled interval so captures happen regardless of source repaints. Also check you're not tripping the CORS-tainted-canvas case (see above).

**"CPU usage spikes when I open a page with many canvases."** Smooth mode (same-origin) captures every canvas on every frame. With >2–3 canvases, set a global cap (e.g., `streamingFps: 30`) or add per-selector rules for the ones that don't need full rate.

**"Cross-origin projection is choppy even though the source is smooth."** Cross-origin defaults to ~5 FPS. Set `streamingFps: 30` (or higher) explicitly — there's no smooth-mode equivalent cross-origin because per-frame encoding would saturate `postMessage`.

**"My video is blank in the projection."** Either the video hasn't started playing yet (paused or `readyState < 2` videos are skipped), or the source loaded it from a URL without CORS headers, or the video has `srcObject` but the stream has ended. Open devtools on the source iframe directly and confirm it's playing there first.

**"My per-selector rule isn't picking up the element I expected."** Selectors match in object-declaration order, first-wins. If a general key like `canvas` is listed before a specific one like `.preview`, the general one wins. Reorder so specific keys come first. Invalid selectors are silently skipped — if you're not sure, test the selector with `document.querySelectorAll(...)` on the source page.

**"Streaming stops after a navigation inside the iframe."** Capture streams are re-initialized on each source document. If the new document doesn't yet have the canvases the selector expects, projection will pick them up as they mount — no intervention needed. If it never recovers, check that the new page actually renders the elements.
