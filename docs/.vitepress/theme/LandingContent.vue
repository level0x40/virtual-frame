<template>
  <div class="vf-landing">
    <!-- ═══════════════════════════════════════════════
         SECTION 1 — Pitch in code
         ═══════════════════════════════════════════════ -->
    <section class="vf-section vf-pitch">
      <div class="vf-pitch-prose">
        <div class="vf-eyebrow">The pitch</div>
        <h2>A remote app, projected into your layout.</h2>
        <p>
          An iframe gives you perfect isolation and zero composability — a rigid rectangle that
          fights your page on sizing, focus, and theme. A shared bundle gives you composability and
          zero isolation — shared globals, shared CSS cascade, shared bugs.
        </p>
        <p>
          Virtual Frame does neither. It loads the remote in a
          <em>hidden</em> iframe — so its framework, router, and runtime work normally — and mirrors
          the live DOM into a host element you control, with CSS rewritten, events replayed, and
          full cross-origin support.
        </p>
        <p class="vf-pitch-cta">
          <a :href="withBase('/guide/what-is-virtual-frame')" class="vf-link-arrow"
            >Read the mental model<span aria-hidden="true">&nbsp;→</span></a
          >
        </p>
      </div>
      <div class="vf-pitch-code">
        <div class="vf-code-window">
          <div class="vf-code-window-bar">
            <span class="vf-dot vf-dot-r" />
            <span class="vf-dot vf-dot-y" />
            <span class="vf-dot vf-dot-g" />
            <span class="vf-code-window-title">index.html</span>
          </div>
          <pre
            class="vf-code"
          ><code><span class="vf-t-c">&lt;!-- One import, anywhere on the page --&gt;</span>
<span class="vf-t-k">&lt;script</span> <span class="vf-t-a">type</span>=<span class="vf-t-s">"module"</span><span class="vf-t-k">&gt;</span>
  <span class="vf-t-kw">import</span> <span class="vf-t-s">"virtual-frame/element"</span>;
<span class="vf-t-k">&lt;/script&gt;</span>

<span class="vf-t-c">&lt;!-- Drop it in like a native element --&gt;</span>
<span class="vf-t-k">&lt;virtual-frame</span>
  <span class="vf-t-a">src</span>=<span class="vf-t-s">"https://remote.example.com/dashboard"</span>
  <span class="vf-t-a">isolate</span>=<span class="vf-t-s">"open"</span>
  <span class="vf-t-a">selector</span>=<span class="vf-t-s">"#chart"</span>
  <span class="vf-t-a">style</span>=<span class="vf-t-s">"width: 100%; height: 400px"</span><span class="vf-t-k">&gt;</span>
<span class="vf-t-k">&lt;/virtual-frame&gt;</span></code></pre>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════
         SECTION 2 — Architecture
         ═══════════════════════════════════════════════ -->
    <section class="vf-section vf-arch">
      <div class="vf-section-header">
        <div class="vf-eyebrow">How it works</div>
        <h2>Three primitives. Real DOM. No magic.</h2>
        <p class="vf-section-lede">
          Virtual Frame doesn't re-execute your app — it observes it. A hidden iframe keeps the
          remote's runtime intact. A mirror layer copies DOM into your host. Events flow back.
          That's the whole model.
        </p>
      </div>

      <div class="vf-arch-figure">
        <img
          :src="archSrc"
          alt="Architecture diagram. Left: your host page with a virtual-frame element containing a shadow root mirror. Right: a hidden iframe where the remote actually runs. Arrows between them: mirror flowing left, replay flowing right. Bottom: an optional shared store (dashed) bridging both sides."
          loading="lazy"
        />
      </div>

      <div class="vf-primitives">
        <div class="vf-primitive">
          <div class="vf-primitive-index">01</div>
          <h3>Source iframe</h3>
          <p>
            Hidden off-screen, pointed at the remote URL. The remote runs as a complete standalone
            application — its framework, router, effects, fonts. Nothing is re-executed.
          </p>
        </div>
        <div class="vf-primitive">
          <div class="vf-primitive-index">02</div>
          <h3>Host element</h3>
          <p>
            Any element on your page — a
            <code>&lt;div&gt;</code>, a section, a component root. Virtual Frame attaches an
            optional Shadow DOM and mirrors the remote's <code>&lt;body&gt;</code> subtree in.
          </p>
        </div>
        <div class="vf-primitive">
          <div class="vf-primitive-index">03</div>
          <h3>Sync layer</h3>
          <p>
            Same-origin uses a MutationObserver and CSS rewriter. Cross-origin routes through a
            bridge script over <code>postMessage</code>. Events replay. Inputs stay in sync. Scroll
            is bidirectional.
          </p>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════
         SECTION 3 — Framework stack
         ═══════════════════════════════════════════════ -->
    <section class="vf-section vf-stack">
      <div class="vf-section-header">
        <div class="vf-eyebrow">Ecosystem</div>
        <h2>Works with your stack.</h2>
        <p class="vf-section-lede">
          First-class bindings for every major framework, and SSR-ready integrations for the
          meta-frameworks. Host and remote can be any combination — they don't need to match.
        </p>
      </div>

      <div class="vf-stack-group">
        <div class="vf-stack-group-label">Client frameworks</div>
        <div class="vf-logos">
          <a
            v-for="f in clientFrameworks"
            :key="f.href"
            :href="withBase(f.href)"
            class="vf-logo-tile"
          >
            <span class="vf-logo-icon" :style="{ backgroundImage: f.icon }" />
            <span class="vf-logo-label">{{ f.label }}</span>
          </a>
        </div>
      </div>

      <div class="vf-stack-group">
        <div class="vf-stack-group-label">Meta-frameworks (SSR-ready)</div>
        <div class="vf-logos">
          <a
            v-for="f in metaFrameworks"
            :key="f.href"
            :href="withBase(f.href)"
            class="vf-logo-tile"
          >
            <span class="vf-logo-icon" :class="f.iconClass" :style="{ backgroundImage: f.icon }" />
            <span class="vf-logo-label">{{ f.label }}</span>
          </a>
        </div>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════
         SECTION 4 — Dive deeper / CTA
         ═══════════════════════════════════════════════ -->
    <section class="vf-section vf-cta">
      <div class="vf-cta-grid">
        <div class="vf-cta-col">
          <h4>Start here</h4>
          <ul>
            <li>
              <a :href="withBase('/guide/what-is-virtual-frame')">What is Virtual Frame?</a>
            </li>
            <li><a :href="withBase('/guide/getting-started')">Getting Started</a></li>
            <li><a :href="withBase('/guide/vanilla')">Vanilla JS</a></li>
            <li>
              <a :href="withBase('/guide/troubleshooting')">Troubleshooting</a>
            </li>
          </ul>
        </div>

        <div class="vf-cta-col">
          <h4>Core concepts</h4>
          <ul>
            <li><a :href="withBase('/guide/shadow-dom')">Shadow DOM</a></li>
            <li><a :href="withBase('/guide/selector')">Selector projection</a></li>
            <li><a :href="withBase('/guide/cross-origin')">Cross-origin & bridge</a></li>
            <li><a :href="withBase('/guide/streaming-fps')">Streaming FPS</a></li>
          </ul>
        </div>

        <div class="vf-cta-col">
          <h4>Advanced</h4>
          <ul>
            <li><a :href="withBase('/guide/ssr')">Server-side rendering</a></li>
            <li><a :href="withBase('/guide/store')">Shared store</a></li>
            <li><a :href="withBase('/guide/testing')">Testing</a></li>
            <li><a :href="withBase('/guide/stability')">Stability</a></li>
          </ul>
        </div>

        <div class="vf-cta-col">
          <h4>Reference</h4>
          <ul>
            <li><a :href="withBase('/api/')">API</a></li>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame"
                target="_blank"
                rel="noopener noreferrer"
                >GitHub</a
              >
            </li>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame/releases"
                target="_blank"
                rel="noopener noreferrer"
                >Releases</a
              >
            </li>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame/issues"
                target="_blank"
                rel="noopener noreferrer"
                >Issues</a
              >
            </li>
          </ul>
        </div>
      </div>

      <div class="vf-cta-banner">
        <div class="vf-cta-banner-text">
          <h3>Ready to compose?</h3>
          <p>Install once. Drop it in. Ship the rectangle to the bin.</p>
        </div>
        <div class="vf-cta-banner-actions">
          <a :href="withBase('/guide/getting-started')" class="vf-btn vf-btn-brand">Get Started</a>
          <a :href="withBase('/api/')" class="vf-btn vf-btn-alt">API Reference</a>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { withBase } from "vitepress";

const archSrc = withBase("/architecture.svg");

const clientFrameworks = [
  { label: "Vanilla JS", href: "/guide/vanilla", icon: "var(--icon-js)" },
  { label: "React", href: "/guide/react", icon: "var(--icon-react)" },
  { label: "Vue", href: "/guide/vue", icon: "var(--icon-vue)" },
  { label: "Svelte", href: "/guide/svelte", icon: "var(--icon-svelte)" },
  { label: "Solid", href: "/guide/solid", icon: "var(--icon-solid)" },
  { label: "Angular", href: "/guide/angular", icon: "var(--icon-angular)" },
];

const metaFrameworks = [
  {
    label: "Next.js",
    href: "/guide/nextjs",
    icon: "var(--icon-nextjs)",
    iconClass: "vf-icon-nextjs",
  },
  { label: "Nuxt", href: "/guide/nuxt", icon: "var(--icon-nuxt)", iconClass: "vf-icon-nuxt" },
  { label: "SvelteKit", href: "/guide/sveltekit", icon: "var(--icon-svelte)" },
  { label: "SolidStart", href: "/guide/solid-start", icon: "var(--icon-solid)" },
  { label: "Analog", href: "/guide/analog", icon: "var(--icon-analog)" },
  {
    label: "TanStack Start",
    href: "/guide/tanstack-start",
    icon: "var(--icon-tanstack)",
    iconClass: "vf-icon-tanstack",
  },
  {
    label: "React Router",
    href: "/guide/react-router",
    icon: "var(--icon-react-router)",
    iconClass: "vf-icon-react-router",
  },
  { label: "@lazarv/react-server", href: "/guide/react-server", icon: "var(--icon-react-server)" },
];
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════
   Layout primitives
   ═══════════════════════════════════════════════════════════════ */

.vf-landing {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

.vf-section {
  padding: 64px 0;
  border-top: 1px solid var(--vp-c-divider);
}

.vf-section:first-child {
  border-top: none;
  padding-top: 32px;
}

.vf-section-header {
  text-align: center;
  max-width: 720px;
  margin: 0 auto 48px;
}

.vf-eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 12px;
}

.vf-section h2 {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 16px;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  border: none;
  padding: 0;
}

.vf-section-lede {
  font-size: 16px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 1 — Pitch
   ═══════════════════════════════════════════════════════════════ */

.vf-pitch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
}

.vf-pitch-prose h2 {
  font-size: 28px;
  margin-bottom: 20px;
}

.vf-pitch-prose p {
  font-size: 15px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
  margin: 0 0 14px;
}

.vf-pitch-prose em {
  color: var(--vp-c-text-1);
  font-style: italic;
}

.vf-pitch-cta {
  margin-top: 20px !important;
}

.vf-link-arrow {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
  transition: color 0.15s;
}

.vf-link-arrow:hover {
  color: var(--vp-c-brand-2);
}

/* — Code window — */

.vf-code-window {
  background: var(--vp-code-block-bg, #1b1b1f);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.18),
    0 2px 6px rgba(0, 0, 0, 0.08);
}

.vf-code-window-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--vp-c-divider);
}

.vf-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: inline-block;
}

.vf-dot-r {
  background: #ff5f57;
}
.vf-dot-y {
  background: #febc2e;
}
.vf-dot-g {
  background: #28c840;
}

.vf-code-window-title {
  margin-left: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.vf-code {
  margin: 0;
  padding: 18px 20px;
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  line-height: 1.65;
  color: #e4e4ef;
  overflow-x: auto;
  background: transparent;
}

/* light mode: darken the code text a bit for contrast against light bg */
:root:not(.dark) .vf-code-window {
  background: #1b1b1f;
}

/* syntax colors — brand-aligned, readable on both themes */
.vf-t-c {
  color: #7c7c9a;
  font-style: italic;
} /* comment */
.vf-t-k {
  color: #aaffff;
} /* tag */
.vf-t-a {
  color: #ff96ff;
} /* attr name */
.vf-t-s {
  color: #a5e1a7;
} /* string */
.vf-t-kw {
  color: #ff96ff;
} /* keyword */

/* ═══════════════════════════════════════════════════════════════
   SECTION 2 — Architecture
   ═══════════════════════════════════════════════════════════════ */

.vf-arch-figure {
  max-width: 900px;
  margin: 0 auto 56px;
  padding: 8px;
  background: linear-gradient(
    135deg,
    rgba(170, 255, 255, 0.08),
    rgba(105, 100, 255, 0.08) 50%,
    rgba(128, 16, 225, 0.08) 80%,
    rgba(255, 150, 255, 0.08)
  );
  border-radius: 18px;
  border: 1px solid var(--vp-c-divider);
}

.vf-arch-figure img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 800 / 440;
  border-radius: 12px;
}

.vf-primitives {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.vf-primitive {
  padding: 24px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  transition:
    border-color 0.15s,
    transform 0.15s;
}

.vf-primitive:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}

.vf-primitive-index {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  margin-bottom: 10px;
  letter-spacing: 0.08em;
}

.vf-primitive h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--vp-c-text-1);
  border: none;
  padding: 0;
}

.vf-primitive p {
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0;
}

.vf-primitive code {
  font-size: 12.5px;
  padding: 1px 5px;
  background: var(--vp-c-bg);
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 3 — Framework stack
   ═══════════════════════════════════════════════════════════════ */

.vf-stack-group {
  margin-top: 40px;
}

.vf-stack-group:first-of-type {
  margin-top: 0;
}

.vf-stack-group-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  text-align: center;
  margin-bottom: 20px;
}

.vf-logos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.vf-logo-tile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 500;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.15s;
}

.vf-logo-tile:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  transform: translateY(-2px);
}

.vf-logo-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.vf-logo-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* dark-mode icon swaps — match the rules in custom.css */
.dark .vf-icon-nextjs {
  filter: invert(1);
}
.dark .vf-icon-react-router {
  background-image: url("/react-router-white.svg") !important;
}
.dark .vf-icon-tanstack {
  background-image: url("/tanstack-white.svg") !important;
}
.dark .vf-icon-nuxt {
  background-image: url("/nuxt-white.svg") !important;
}

/* ═══════════════════════════════════════════════════════════════
   SECTION 4 — CTA
   ═══════════════════════════════════════════════════════════════ */

.vf-cta-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 32px;
  margin-bottom: 56px;
}

.vf-cta-col h4 {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-c-text-1);
  margin: 0 0 14px;
}

.vf-cta-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.vf-cta-col li {
  margin: 0;
  padding: 0;
}

.vf-cta-col a {
  display: block;
  padding: 5px 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.15s;
}

.vf-cta-col a:hover {
  color: var(--vp-c-brand-1);
}

.vf-cta-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 36px 40px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(170, 255, 255, 0.1),
    rgba(105, 100, 255, 0.14) 50%,
    rgba(128, 16, 225, 0.14) 80%,
    rgba(255, 150, 255, 0.1)
  );
  border: 1px solid var(--vp-c-divider);
}

.vf-cta-banner-text h3 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
  color: var(--vp-c-text-1);
  border: none;
  padding: 0;
  letter-spacing: -0.01em;
}

.vf-cta-banner-text p {
  margin: 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.vf-cta-banner-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.vf-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 22px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;
}

.vf-btn-brand {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-brand-1);
}

.vf-btn-brand:hover {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.vf-btn-alt {
  background: transparent;
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.vf-btn-alt:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

/* ═══════════════════════════════════════════════════════════════
   Responsive
   ═══════════════════════════════════════════════════════════════ */

@media (max-width: 960px) {
  .vf-section {
    padding: 48px 0;
  }
  .vf-pitch {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .vf-primitives {
    grid-template-columns: 1fr;
  }
  .vf-cta-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
  .vf-cta-banner {
    flex-direction: column;
    text-align: center;
    gap: 20px;
  }
  .vf-section h2 {
    font-size: 26px;
  }
  .vf-pitch-prose h2 {
    font-size: 24px;
  }
}

@media (max-width: 640px) {
  .vf-landing {
    padding: 0 20px;
  }
  .vf-section {
    padding: 40px 0;
  }
  .vf-cta-grid {
    grid-template-columns: 1fr;
  }
  .vf-cta-banner {
    padding: 28px 24px;
  }
  .vf-cta-banner-actions {
    flex-direction: column;
    width: 100%;
  }
  .vf-btn {
    justify-content: center;
    width: 100%;
  }
  .vf-code {
    font-size: 12px;
    padding: 14px 16px;
  }
  .vf-arch-figure {
    padding: 4px;
    border-radius: 12px;
  }
}
</style>
