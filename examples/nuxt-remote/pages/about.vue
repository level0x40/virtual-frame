<script setup lang="ts">
useSeoMeta({
  title: "About — Remote Nuxt App",
  description: "About page demonstrating client-side navigation within a virtual frame",
});
</script>

<template>
  <div class="card" id="info-card">
    <h1>About</h1>
    <p>
      This is a second page in the remote Nuxt app, demonstrating client-side navigation within a
      <code>&lt;virtual-frame&gt;</code>.
    </p>
    <p>
      Clicking <strong>Home</strong> below navigates back to the main page entirely inside the
      hidden iframe — the host page never reloads.
    </p>
  </div>

  <NuxtNavigation />
</template>
