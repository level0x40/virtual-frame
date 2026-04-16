# Accessibility

Virtual Frame projects a remote's DOM into the host's shadow tree, preserving structure and attributes along the way. For assistive technologies — screen readers, keyboard navigation, switch control, voice control — this means the projection is seen as real, reachable DOM, not as opaque iframe content. That's the strong baseline: every semantic attribute in the source survives into the host, and every element remains in the accessibility tree.

The shadow DOM boundary and the indirection through mirroring do introduce a handful of effects you should know about. This page covers what Virtual Frame preserves automatically, where the boundary changes behavior, and what to verify when you ship.

## What's preserved automatically

All of the following ride along with regular DOM mirroring — there is no special handling needed, and nothing to configure:

- **ARIA attributes.** `aria-label`, `aria-describedby`, `aria-live`, `aria-expanded`, `aria-hidden`, `role`, and every other ARIA attribute is copied verbatim from the source element to the projected element. Changes in the source trigger mutation events that update the mirror.
- **Element semantics.** `<button>` stays a button. `<nav>` stays a nav. `<input type="checkbox">` stays a checkbox. Virtual Frame never substitutes element types during mirroring; the tag name round-trips.
- **IDs and id-based references inside the projection.** IDs are preserved verbatim in the shadow root. An `aria-labelledby="title"` inside the projected tree resolves to `id="title"` inside the same shadow root, because both sides live in the same scope. This is the normal shadow DOM ID-scoping behavior working in your favor.
- **Form state.** Input values, checked states, selected options, and form fields associated by `<label for="">` all mirror correctly. Clicking a `<label>` that wraps or references a checkbox / radio activates the input, just as it would in a standalone page.
- **Focus and blur events.** When a projected element receives focus, Virtual Frame dispatches synthetic `focus` / `focusin` / `blur` / `focusout` events on the source element inside the iframe so the source application's handlers fire. The visible focus ring stays on the element the user actually interacts with, in the host's shadow tree.

For most projections, the above is the whole story. The following sections cover where the boundary starts to matter.

::: info Cross-origin has parity
Every guarantee on this page holds for both projection paths — the same-origin MutationObserver path and the cross-origin bridge path. The bridge serializes the source DOM into a snapshot + incremental mutation batches sent over `postMessage`; ARIA attributes, roles, IDs, and IDREF values all round-trip through that serialization unchanged. URL-valued attributes (`src`, `href`, …) are resolved against the remote's base URL during deserialization, but IDREF attributes are never treated as URLs and are delivered verbatim to the shadow tree. Both paths are covered by the test suite.

For the broader cross-origin security posture (script stripping, inline event handler filtering, `postMessage` targeting), see [Cross-Origin → Security](/guide/cross-origin#security).
:::

## The shadow DOM constraints you inherit

Virtual Frame's isolation uses a shadow root, which means the projected DOM participates in shadow DOM's accessibility semantics. These aren't VF-specific issues — they're constraints of the shadow DOM spec — but they affect any app composed with projection.

### ARIA IDREF attributes cannot cross the shadow boundary

This is the single most common accessibility pitfall in shadow-DOM composition. ARIA attributes that reference another element _by ID_ — `aria-labelledby`, `aria-describedby`, `aria-controls`, `aria-owns`, `aria-flowto`, `aria-activedescendant`, and `<label for="…">` — resolve IDs inside the same tree scope. A shadow root is its own scope.

**What works:**

- `aria-labelledby="heading"` in the projected tree pointing to `id="heading"` also in the projected tree. Same scope — resolves fine.
- `aria-labelledby="heading"` in the host's light DOM pointing to `id="heading"` in the host's light DOM. Same scope — resolves fine.

**What silently fails:**

- `aria-labelledby="host-heading"` on an element _inside the projection_ pointing to `id="host-heading"` in the _host page_. Different scopes. AT will not find the reference.
- The reverse: a label outside the shadow pointing into the shadow. Also fails.

If you need an ARIA relationship that spans the boundary, the options are:

1. **Keep both the reference and the referenced element on the same side of the boundary.** Usually the cleanest answer: if a label "belongs to" a widget, keep them both in the projection.
2. **Use an inline `aria-label` instead of `aria-labelledby`** when the accessible name is a static string. Cross-tree references by ID fail; cross-tree inline strings do not.
3. **(Emerging)** The [Reference Target proposal](https://open-ui.org/components/reference-target.explainer/) addresses this gap, but it is not yet portable across all browsers — treat it as future-facing, not a current solution.

None of these require Virtual Frame support — they are how all shadow DOM applications handle cross-boundary ARIA.

### `<label for>` across the boundary

Same constraint as the ARIA IDREF case: a `<label for="email">` in the host page will not associate with `<input id="email">` inside the shadow. Keep the label and the input on the same side of the boundary. Forms built _within_ a single projection work normally.

### Focus order

Within a single shadow tree, tab order follows DOM order as usual. When the host page contains a `<virtual-frame>` as one of several interactive elements, tab order moves into the shadow tree at the point the `<virtual-frame>` element sits in the host's tab sequence, tabs through the projected interactive elements in order, and then moves out to the next host element. This matches the standard shadow DOM focus behavior.

If you need to skip past a projection entirely (e.g. a "skip to main content" link), make sure the skip link's target is in the host tree, not inside the projection.

## Live regions

The source document's `aria-live` regions are mirrored onto the projected element in the shadow tree. When the source mutates the live region, the mirror mutates correspondingly with the live-region attributes preserved.

::: info Mirroring is tested; announcement behavior is AT-dependent
Virtual Frame's test suite verifies that aria-live regions round-trip through the shadow projection correctly on both the same-origin MutationObserver path and the cross-origin bridge path: `role`, `aria-live`, and `aria-atomic` are preserved on mount, text updates propagate without dropping the live-region attributes, and attribute-value changes (polite → assertive) are mirrored in the shadow. The DOM preconditions for a screen reader announcement are in place after any update.

What remains AT-dependent is whether a specific screen reader then _announces_ the update. Live-region announcement behavior across shadow DOM boundaries has [historically varied between screen readers](https://github.com/w3c/aria/issues/1223) — that is a property of the AT, not of the mirroring. Validate against your audience's AT matrix (VoiceOver on macOS/iOS, NVDA and JAWS on Windows) before relying on a projected live region for a critical user flow.
:::

If you find an AT that misses the announcement inside a shadow tree, the reliable fallback is to mirror the update to a host-side live region as well — either manually, or by subscribing to a synchronized value in [`@virtual-frame/store`](/guide/store) on the host side.

## Focus management

### On initial projection

When a projection first mounts, Virtual Frame does not move focus into it. The source document's `autofocus` attribute on an input will not steal focus from the host page on projection mount — this is usually what you want, since the host controls focus order on the page as a whole.

### On SPA navigation inside the remote

If the remote is a single-page app that changes routes, and the projection uses a [`selector`](/guide/selector) that no longer matches after the navigation, Virtual Frame freezes the last-known-good subtree rather than wiping it. For focus, that means a focused element inside the frozen subtree remains focused if it was preserved.

The host application is responsible for deciding whether to move focus on route change. A typical pattern is to subscribe to a synced store value, detect the route change, and call `.focus()` on a host-side heading or landmark. Treat remote-initiated navigation as you would an SPA route change in your own code — move focus to a stable landmark, don't let it get stranded.

### Programmatic focus from the host

Calling `.focus()` on an element _inside_ the shadow tree (e.g. `vf.getShadowRoot().querySelector(...)?.focus()`) works normally. Virtual Frame dispatches the corresponding synthetic focus event into the source iframe so the source's handlers fire, without moving real focus back into the hidden iframe.

## Forms

Forms are mirrored with full interactivity:

- `<label>` wrapping an input activates the input on click.
- `<label for="id">` within the same projection associates correctly.
- Input values, `checked`, `selected`, and validation states round-trip in both directions — user edits in the projection are sent to the source iframe, and programmatic changes in the source are reflected back to the projection.
- Implicit form submission (Enter in a text input) fires the source form's submit handler.

What does _not_ work automatically: a form whose `<form>` element is on one side of the boundary and whose inputs are on the other. Keep the whole form on one side.

## Testing

- **axe-core** works inside shadow roots in modern browsers. Run it against the host page _after_ the projection is initialized (`vf.isInitialized === true`, or wait for a known selector in the shadow). axe traverses open shadow roots automatically; for closed mode, pass `vf.getShadowRoot()` as the context.
- **Keyboard-only pass.** Tab through the host page, through the projection, and back out. Verify focus is visible at every stop and that no interactive element is skipped or trapped.
- **Screen reader pass.** Validate each of: the projected heading hierarchy is announced correctly, interactive controls have accessible names, live regions announce updates. Use your production AT matrix (typically VoiceOver + NVDA + JAWS).
- **Cross-boundary ARIA audit.** Grep your codebase for `aria-labelledby`, `aria-describedby`, `aria-controls`, and `<label for>` where the reference might cross the projection boundary. These are the bugs that don't throw errors — they fail silently.

## Known limitations

- **ARIA IDREF references cannot cross the shadow boundary.** Design accessible names and relationships to live on the same side of the boundary as their target. See above for workarounds.
- **Heading outline.** Projected headings inside a shadow tree participate correctly in screen-reader navigation, but some heading-level linting tools only inspect the light tree. Validate with an AT, not a linter.
- **Name-from-content across canvas/video streams.** [Streaming mirrors](/guide/streaming-fps) replace `<canvas>` / `<video>` with a mirror element that receives a captured media stream. Accessibility falls back to element-level attributes (`aria-label`, `title`) — name the source element explicitly if its accessible presentation matters.
- **Closed-mode shadow roots are harder to audit.** Devtools and some automated AT tools cannot traverse closed shadow roots; prefer `isolate: "open"` when accessibility tooling is part of your workflow.

## Common issues

**"My `aria-labelledby` stopped working after I moved a widget into a projection."** The label's `id` is in the host's light DOM and the reference is now inside the shadow. Move one or the other so both sides share a scope, or replace the IDREF with an inline `aria-label`.

**"A user reported the screen reader skips a live-region update."** Validate against your actual AT matrix — live-region behavior across shadow DOM has historically been inconsistent. If a specific AT misses it, the reliable fallback is to mirror the update to a host-side live region.

**"Focus disappears when the remote navigates."** SPA route changes that tear down the selector target cause Virtual Frame to freeze the subtree; the focused element stays focused if it was preserved. If the active selector target was removed, focus falls back to the host body. Handle route-change focus management explicitly in the host — move focus to a stable landmark the same way you would for an in-app SPA transition.

**"A form inside the projection submits but the host doesn't see it."** Form submission fires in the _source_ iframe, not on the host. If the host needs to react, sync the state via [`@virtual-frame/store`](/guide/store) instead of listening for `submit` on the projection.
