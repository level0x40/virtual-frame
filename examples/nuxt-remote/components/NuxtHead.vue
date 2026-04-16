<script setup lang="ts">
import { ref, onMounted } from "vue";

const meta = ref<{
  title: string;
  description: string;
  viewport: string;
} | null>(null);

onMounted(() => {
  meta.value = {
    title: document.title,
    description:
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") ?? "\u2014",
    viewport:
      document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute("content") ?? "\u2014",
  };
});
</script>

<template>
  <div class="card" id="head-card">
    <h2>useHead()</h2>
    <p>
      Nuxt's <code>useHead()</code> and <code>useSeoMeta()</code> set
      <code>&lt;head&gt;</code> tags — fully SSR'd and reactive.
    </p>
    <div v-if="meta" class="meta-list">
      <div class="meta-item">
        <span class="meta-key">title</span>
        <span class="meta-value">{{ meta.title }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">description</span>
        <span class="meta-value">{{ meta.description }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">viewport</span>
        <span class="meta-value">{{ meta.viewport }}</span>
      </div>
    </div>
  </div>
</template>
