<template>
  <footer class="vf-footer">
    <div class="vf-footer-inner">
      <div class="vf-footer-brand">
        <a href="https://level0x40.com" target="_blank" rel="noopener noreferrer">
          <img :src="logoSrc" alt="Level 0x40 Labs" class="vf-footer-logo" />
        </a>
        <p class="vf-footer-tagline">Open-source tools for the modern web</p>
      </div>

      <div class="vf-footer-links">
        <div class="vf-footer-col">
          <h4>Project</h4>
          <ul>
            <li>
              <a :href="withBase('/guide/getting-started')">Getting Started</a>
            </li>
            <li><a :href="withBase('/api/')">API Reference</a></li>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame"
                target="_blank"
                rel="noopener noreferrer"
                >GitHub</a
              >
            </li>
          </ul>
        </div>

        <div class="vf-footer-col">
          <h4>Community</h4>
          <ul>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame/issues"
                target="_blank"
                rel="noopener noreferrer"
                >Issues</a
              >
            </li>
            <li>
              <a
                href="https://github.com/level0x40/virtual-frame/discussions"
                target="_blank"
                rel="noopener noreferrer"
                >Discussions</a
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
          </ul>
        </div>

        <div class="vf-footer-col">
          <h4>Level 0<span>x</span>40</h4>
          <ul>
            <li>
              <a href="https://level0x40.com" target="_blank" rel="noopener noreferrer">Website</a>
            </li>
            <li>
              <a href="https://github.com/level0x40" target="_blank" rel="noopener noreferrer"
                >GitHub</a
              >
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="vf-footer-bottom">
      <p>
        &copy; {{ year }} Level 0x40 Labs. All rights reserved.
        <a
          href="https://github.com/level0x40/virtual-frame/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          >License</a
        >
      </p>
    </div>
  </footer>
</template>

<script setup>
import { withBase } from "vitepress";

const year = new Date().getFullYear();
const logoSrc = withBase("/lvl-logo.svg");
</script>

<style scoped>
.vf-footer {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  padding: 48px 24px 24px;
  margin-top: 64px;
}

.vf-footer-inner {
  max-width: 1152px;
  margin: 0 auto;
  display: flex;
  gap: 48px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.vf-footer-brand {
  flex: 0 0 auto;
  max-width: 240px;
}

.vf-footer-logo {
  height: 32px;
  width: auto;
  display: block;
}

.vf-footer-tagline {
  margin-top: 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.vf-footer-links {
  display: flex;
  gap: 48px;
  flex-wrap: wrap;
}

.vf-footer-col h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vf-footer-col h4 span {
  text-transform: lowercase;
}

.vf-footer-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.vf-footer-col li {
  margin: 0;
  padding: 0;
}

.vf-footer-col a {
  display: block;
  padding: 4px 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.vf-footer-col a:hover {
  color: var(--vp-c-brand-1);
}

.vf-footer-bottom {
  max-width: 1152px;
  margin: 32px auto 0;
  padding-top: 24px;
  border-top: 1px solid var(--vp-c-divider);
  text-align: center;
}

.vf-footer-bottom p {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin: 0;
}

.vf-footer-bottom a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.vf-footer-bottom a:hover {
  color: var(--vp-c-brand-1);
}

@media (max-width: 768px) {
  .vf-footer-inner {
    flex-direction: column;
    gap: 32px;
  }

  .vf-footer-brand {
    max-width: none;
  }

  .vf-footer-links {
    gap: 32px;
  }
}
</style>
