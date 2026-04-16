<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";

// Use an empty string during SSR so the server and client render the same
// initial text.  The real clock starts only after hydration completes.
const time = ref("");
let interval: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  time.value = new Date().toISOString();
  interval = setInterval(() => {
    time.value = new Date().toISOString();
  }, 1000);
});

onBeforeUnmount(() => {
  if (interval) clearInterval(interval);
});
</script>

<template>
  <p class="timestamp">Rendered at: {{ time }}</p>
</template>
