<script lang="ts">
  import { VirtualFrame, useStore } from "@virtual-frame/sveltekit";
  import { store } from "$lib/store";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const count = useStore<number>(store, ["count"]);
</script>

<div class="page">
  <h1>Virtual Frame — SvelteKit SSR Example</h1>
  <p class="subtitle">
    Two separate SvelteKit apps: <strong>host</strong> (port 3018) fetches
    <strong>remote</strong> (port 3019) during SSR via a <code>+page.server.ts</code>
    load function, then VirtualFrame mirrors on the client. A shared store
    keeps the counter in sync across host and both projected frames.
  </p>

  <section class="panel host-panel">
    <h2>Host controls (shared store)</h2>
    <p>Host count: <strong>{$count ?? 0}</strong></p>
    <button onclick={() => (store["count"] = ($count ?? 0) + 1)}>
      Increment from host
    </button>
    <button onclick={() => (store["count"] = 0)}>Reset</button>
  </section>

  <div class="layout">
    <section class="panel">
      <h2>Full page projection</h2>
      <VirtualFrame {...data.fullFrame} {store} />
    </section>

    <section class="panel">
      <h2>Selector projection — <code>#counter-card</code></h2>
      <VirtualFrame {...data.counterFrame} {store} />
    </section>
  </div>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family:
      system-ui,
      -apple-system,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;
    background: #f0f2f5;
    padding: 32px;
    color: #1a1a2e;
  }

  .page h1 {
    margin-bottom: 8px;
  }

  .subtitle {
    color: #555;
    margin-bottom: 24px;
    line-height: 1.5;
  }

  .layout {
    display: grid;
    gap: 24px;
  }

  .panel {
    background: #fff;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .panel h2 {
    margin-bottom: 16px;
  }

  .host-panel {
    margin-bottom: 24px;
    border-left: 4px solid #ff3e00;
  }

  .host-panel button {
    margin-right: 8px;
    margin-top: 8px;
    padding: 6px 12px;
    background: #ff3e00;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9em;
  }

  .host-panel button:hover {
    background: #cc3200;
  }

  code {
    background: rgba(0, 0, 0, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }
</style>
