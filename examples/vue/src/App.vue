<script setup>
import { ref } from "vue";
import { VirtualFrame } from "@virtual-frame/vue";

const pages = [
  { label: "Hello", src: "/hello.html" },
  { label: "Forms", src: "/forms.html" },
  { label: "SVG", src: "/svg.html" },
  { label: "Media", src: "/media.html" },
];

const current = ref(pages[0]);
</script>

<template>
  <div style="font-family: system-ui, sans-serif; margin: 20px">
    <h1>Virtual Frame — Vue Example</h1>
    <p>This example uses <code>@virtual-frame/vue</code> to mirror pages into a shadow DOM.</p>

    <nav style="display: flex; gap: 8px; margin-bottom: 16px">
      <button
        v-for="p in pages"
        :key="p.label"
        @click="current = p"
        :style="{
          padding: '8px 16px',
          borderRadius: '6px',
          border: '1px solid #ccc',
          background: current === p ? '#007acc' : '#fff',
          color: current === p ? '#fff' : '#333',
          cursor: 'pointer',
        }"
      >
        {{ p.label }}
      </button>
    </nav>

    <VirtualFrame
      :src="current.src"
      :style="{
        border: '2px dashed #007acc',
        borderRadius: '8px',
        minHeight: '400px',
      }"
    />
  </div>
</template>
