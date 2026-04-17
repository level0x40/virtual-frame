<script setup lang="ts"></script>

<template>
  <div class="card" id="font-card">
    <h2>@nuxt/fonts</h2>
    <p>
      Google Fonts loaded via <code>@nuxt/fonts</code> — zero layout shift, self-hosted, and
      optimized.
    </p>
    <div class="font-samples">
      <div class="font-sample" style="font-family: &quot;Playfair Display&quot;, serif">
        <span class="font-label">Playfair Display</span>
        <span class="font-preview"> The quick brown fox jumps over the lazy dog </span>
      </div>
      <div class="font-sample" style="font-family: &quot;Fira Code&quot;, monospace">
        <span class="font-label">Fira Code</span>
        <span class="font-preview"> const vf = await fetch(url); </span>
      </div>
    </div>
  </div>
</template>
