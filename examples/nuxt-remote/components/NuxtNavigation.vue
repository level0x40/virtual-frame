<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <div class="card" id="link-card">
    <h2>NuxtLink</h2>
    <p>
      Client-side navigation with prefetching. Current path:
      <code>{{ route.path }}</code>
    </p>
    <div class="link-list">
      <NuxtLink to="/" class="nav-link">Home</NuxtLink>
      <NuxtLink to="/about" class="nav-link">About</NuxtLink>
      <NuxtLink
        to="https://github.com/level0x40/virtual-frame"
        class="nav-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub ↗
      </NuxtLink>
    </div>
  </div>
</template>
