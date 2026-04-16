<script setup lang="ts">
// Simulate an async data fetch with a 1-second delay
const { data, status } = await useFetch("/api/slow-data", {
  lazy: true,
});
</script>

<template>
  <div class="card" id="async-card">
    <h2>Lazy useFetch() + Suspense</h2>
    <p>
      Async data fetching with <code>useFetch()</code> in lazy mode — the
      loading state renders first, then the resolved content replaces it.
    </p>
    <div v-if="status === 'pending'" class="suspense-loading">
      Loading async data...
    </div>
    <div v-else class="suspense-loaded">
      {{ data?.message }}
    </div>
  </div>
</template>
