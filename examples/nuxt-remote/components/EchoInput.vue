<script setup lang="ts">
import { ref } from "vue";

const text = ref("");
</script>

<template>
  <div class="card" id="echo-card">
    <h2>Echo Input</h2>
    <input type="text" v-model="text" placeholder="Type here..." />
    <p class="echo">{{ text || "..." }}</p>
  </div>
</template>
