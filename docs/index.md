---
layout: home

hero:
  name: Virtual Frame
  text: Microfrontend projection for the web
  tagline: Compose independently deployed applications into a unified interface. Framework agnostic. Cross-origin ready. Full interactivity.
  image:
    src: /logo.svg
    alt: Virtual Frame logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What is Virtual Frame?
      link: /guide/what-is-virtual-frame
    - theme: alt
      text: View on GitHub
      link: https://github.com/level0x40/virtual-frame

features:
  - title: Framework & Platform Agnostic
    details: Works with React, Vue, Svelte, Solid, Angular — or plain HTML. No shared build, no shared runtime. Host and remote stay fully independent.
  - title: Shadow DOM Isolation
    details: Open or closed shadow roots keep host and remote stylesheets from colliding. CSS custom properties still cross the boundary, so theming works end-to-end.
  - title: Cross-Origin Ready
    details: A small bridge script on the remote. The host auto-negotiates over postMessage — snapshot, mutations, events, inputs, scroll — with a same-origin proxy option to keep cookies and avoid CORS.
  - title: Selector Projection
    details: Project a single widget, panel, or region out of a larger remote page with one CSS selector. The rest of the remote keeps running in the background.
  - title: SSR with Resumption
    details: Server-fetch the remote, inline the projection inside declarative Shadow DOM, and resume on the client without a second round-trip. First paint is styled.
  - title: Shared Reactive Store
    details: A typed, reactive message channel between host and remote. Last-writer-wins by default, pluggable transport for workers, relays, or custom sockets.
---
