<script setup lang="ts">
import { VirtualFrame } from "@virtual-frame/nuxt";
import { useStore } from "@virtual-frame/vue";
import { store } from "~/composables/store";

interface FrameProps {
  _vfHtml: string;
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}

const props = defineProps<{
  frameProps: FrameProps;
  counterProps: FrameProps;
}>();

const count = useStore<number>(store, ["count"]);
</script>

<template>
  <div class="layout">
    <div class="panel info">
      <strong>How it works:</strong> The host calls
      <code>fetchVirtualFrame()</code> in a Nitro server route to fetch the
      remote Nuxt page during SSR.
      <code>prepareVirtualFrameProps()</code> wraps the content in declarative
      shadow DOM for instant display. On the client, a hidden
      <code>&lt;iframe src&gt;</code> loads the remote app at its real origin —
      the <strong>cross-origin bridge</strong> handles live DOM mirroring via
      <code>postMessage</code>. Two <code>&lt;VirtualFrame&gt;</code>
      components are rendered — one showing the full page, one showing only
      <code>#counter-card</code>. Both
      <strong>share a single hidden iframe</strong> (ref-counted). The
      <code>store</code> prop bridges <code>@virtual-frame/store</code> state
      between the host and remote via a <code>MessagePort</code>.
    </div>

    <div class="panel">
      <h2>Shared Store</h2>
      <p style="color: #666; font-size: 14px; margin-bottom: 16px">
        Modify the counter from the host — changes propagate live to the remote
        app via <code>@virtual-frame/store</code>.
      </p>
      <div style="display: flex; align-items: center; gap: 16px">
        <button @click="store.count = (count ?? 0) - 1">- Decrement</button>
        <span
          style="
            font-size: 32px;
            font-weight: bold;
            min-width: 60px;
            text-align: center;
          "
        >
          {{ count ?? 0 }}
        </span>
        <button @click="store.count = (count ?? 0) + 1">+ Increment</button>
      </div>
    </div>

    <div class="panel">
      <h2>Full Remote App (no selector)</h2>
      <VirtualFrame v-bind="frameProps" :store="store" />
    </div>

    <div class="panel">
      <h2>
        Counter Card Only (selector: <code>#counter-card</code>)
      </h2>
      <VirtualFrame v-bind="counterProps" :store="store" />
    </div>
  </div>
</template>
