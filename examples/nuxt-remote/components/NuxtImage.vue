<script setup lang="ts"></script>

<template>
  <div class="card" id="image-card">
    <h2>NuxtImg</h2>
    <p>
      Optimized image component via <code>@nuxt/image</code> — processed through IPX with automatic
      format conversion, lazy loading, and responsive sizing.
    </p>
    <div class="image-grid">
      <div class="image-item">
        <NuxtImg
          src="https://fastly.picsum.photos/id/459/400/300.jpg?hmac=O9_O6dz6-xcbSPb5JLHrBKZLOlXO15SwplmhXBUcrnA"
          alt="Remote image via NuxtImg"
          width="400"
          height="300"
          style="border-radius: 12px; width: 100%; height: auto"
        />
        <span class="image-caption">IPX optimized (400x300)</span>
      </div>
      <div class="image-item">
        <NuxtImg
          src="https://fastly.picsum.photos/id/558/400/300.jpg?hmac=z14LFlrCUFsvy7UwCWgvmVn4Ly8nEwbdhZwG5_iHvrc"
          alt="Second remote image"
          width="400"
          height="300"
          style="border-radius: 12px; width: 100%; height: auto"
          loading="eager"
        />
        <span class="image-caption">Eagerly loaded via IPX</span>
      </div>
    </div>
  </div>
</template>
