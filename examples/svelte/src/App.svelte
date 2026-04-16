<script>
  import { VirtualFrame } from "@virtual-frame/svelte";

  const pages = [
    { label: "Hello", src: "/hello.html" },
    { label: "Forms", src: "/forms.html" },
    { label: "SVG", src: "/svg.html" },
    { label: "Media", src: "/media.html" },
  ];

  let current = $state(0);
</script>

<div style="font-family: system-ui, sans-serif; margin: 20px">
  <h1>Virtual Frame — Svelte Example</h1>
  <p>
    This example uses <code>@virtual-frame/svelte</code> to mirror pages into a
    shadow DOM.
  </p>

  <nav style="display: flex; gap: 8px; margin-bottom: 16px">
    {#each pages as p, i}
      <button
        onclick={() => (current = i)}
        style="padding: 8px 16px; border-radius: 6px; border: 1px solid #ccc; background: {current ===
        i
          ? '#007acc'
          : '#fff'}; color: {current === i ? '#fff' : '#333'}; cursor: pointer;"
      >
        {p.label}
      </button>
    {/each}
  </nav>

  <VirtualFrame
    src={pages[current].src}
    style="border: 2px dashed #007acc; border-radius: 8px; min-height: 400px;"
  />
</div>
