<script setup lang="ts">
const { data } = await useFetch("/api/frame");
</script>

<template>
  <div class="page">
    <h1>Virtual Frame — Nuxt SSR Example</h1>
    <p class="subtitle">
      Two separate Nuxt apps: <strong>host</strong> (port 3008) fetches
      <strong>remote</strong> (port 3009) during SSR via a server API route,
      then VirtualFrame mirrors on the client.
    </p>

    <HostFrames
      v-if="data"
      :frame-props="data.fullFrame"
      :counter-props="data.counterFrame"
    />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  background: #f0f2f5;
  padding: 32px;
  color: #1a1a2e;
}

h1 {
  margin-bottom: 8px;
}

.subtitle {
  color: #555;
  margin-bottom: 24px;
  line-height: 1.5;
}

.layout {
  display: grid;
  gap: 24px;
}

.panel {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.panel h2 {
  margin-bottom: 16px;
}

.info {
  background: #e8f5e9;
  border-left: 4px solid #4caf50;
  color: #2e7d32;
}

code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
</style>
