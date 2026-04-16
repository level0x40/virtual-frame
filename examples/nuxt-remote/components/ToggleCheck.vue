<script setup lang="ts">
import { ref } from "vue";

const checked = ref(false);
</script>

<template>
  <div class="card" id="toggle-card">
    <h2>Toggle Checkbox</h2>
    <label class="checkbox-label">
      <input type="checkbox" v-model="checked" />
      Toggle me
    </label>
    <p>{{ checked ? "Checked" : "Unchecked" }}</p>
  </div>
</template>
