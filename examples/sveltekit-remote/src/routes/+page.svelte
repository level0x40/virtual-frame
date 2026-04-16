<script lang="ts">
  import { useStore as useRemoteStore } from "@virtual-frame/sveltekit/store";
  import { useStore } from "@virtual-frame/sveltekit";

  const store = useRemoteStore();
  const count = useStore<number>(store, ["count"]);
</script>

<div class="card" id="info-card">
  <h1>Remote SvelteKit App</h1>
  <p>
    This page is a standalone SvelteKit application. During SSR, the host
    app fetches this page and renders it instantly inside a virtual frame
    — no extra client-side network request needed! The counter below is
    backed by a shared store, synced with the host via MessagePort.
  </p>
</div>

<div class="card" id="counter-card">
  <h2>Counter (shared store)</h2>
  <div class="counter">{$count ?? 0}</div>
  <button onclick={() => (store["count"] = ($count ?? 0) + 1)}>
    Increment
  </button>
  <button onclick={() => (store["count"] = 0)}>Reset</button>
</div>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>
