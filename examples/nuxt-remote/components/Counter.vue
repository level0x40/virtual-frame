<script setup lang="ts">
import { useStore as useRemoteStore } from "@virtual-frame/nuxt/store";
import { useStore } from "@virtual-frame/vue";

const store = useRemoteStore();
const count = useStore<number>(store, ["count"]);
</script>

<template>
  <div class="card" id="counter-card">
    <h2>Counter</h2>
    <div class="counter">{{ count ?? 0 }}</div>
    <div style="display: flex; gap: 8px; justify-content: center">
      <button @click="store.count = (count ?? 0) - 1">- Decrement</button>
      <button @click="store.count = (count ?? 0) + 1">+ Increment</button>
    </div>
  </div>
</template>
