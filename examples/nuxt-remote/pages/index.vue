<script setup lang="ts">
useSeoMeta({
  title: "Remote Nuxt App",
  description: "A Nuxt remote app embedded via virtual-frame SSR",
});
</script>

<template>
  <div class="card" id="info-card">
    <h1>Remote Nuxt App</h1>
    <p>
      This page is a standalone Nuxt application. During SSR, the host app fetches this page and
      renders it instantly inside a virtual frame — no extra client-side network request needed!
    </p>
    <Timestamp />
  </div>

  <Counter />

  <NuxtImage />

  <NuxtFont />

  <NuxtNavigation />

  <NuxtHead />

  <NuxtAsync />

  <EchoInput />

  <ToggleCheck />
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
  background: linear-gradient(135deg, #00dc82 0%, #00a86b 100%);
  color: #fff;
  min-height: 100vh;
  padding: 32px;
}

p {
  margin: 0 0 16px;
  opacity: 0.9;
  line-height: 1.6;
}

code {
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 14px;
}

.card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 16px;
}

.card h1,
.card h2 {
  margin-bottom: 12px;
}

.counter {
  font-size: 48px;
  font-weight: bold;
  text-align: center;
  margin: 16px 0;
}

button {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: rgba(255, 255, 255, 0.35);
}

input[type="text"] {
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  outline: none;
  margin-bottom: 8px;
}

input[type="text"]::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

input[type="text"]:focus {
  border-color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.18);
}

.echo {
  font-style: italic;
  opacity: 0.8;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.timestamp {
  font-size: 12px;
  text-align: right;
  opacity: 0.6;
  margin-top: 8px;
}

/* NuxtImg */
.image-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.image-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-caption {
  font-size: 12px;
  opacity: 0.7;
  text-align: center;
}

/* @nuxt/fonts */
.font-samples {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.font-sample {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
}

.font-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
  margin-bottom: 8px;
}

.font-preview {
  display: block;
  font-size: 20px;
}

/* NuxtLink */
.link-list {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.nav-link {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.2s;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.35);
}

/* Metadata */
.meta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  display: flex;
  gap: 12px;
  align-items: baseline;
  font-size: 13px;
}

.meta-key {
  font-weight: 600;
  opacity: 0.7;
  min-width: 100px;
  font-family: monospace;
}

.meta-value {
  opacity: 0.9;
}

/* Async / Suspense */
.suspense-loading {
  padding: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  text-align: center;
  opacity: 0.7;
  animation: pulse 1.5s ease-in-out infinite;
}

.suspense-loaded {
  padding: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  border-left: 3px solid rgba(255, 255, 255, 0.5);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.8;
  }
}
</style>
