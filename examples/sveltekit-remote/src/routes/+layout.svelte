<script lang="ts">
  let { children } = $props();
</script>

{@render children()}

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
    background: linear-gradient(135deg, #ff3e00 0%, #ff7a45 100%);
    color: #fff;
    min-height: 100vh;
    padding: 32px;
  }

  :global(p) {
    margin: 0 0 16px;
    opacity: 0.95;
    line-height: 1.6;
  }

  :global(.card) {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 16px;
  }

  :global(.card h1),
  :global(.card h2) {
    margin-bottom: 12px;
  }

  :global(button) {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  :global(button:hover) {
    background: rgba(255, 255, 255, 0.35);
  }

  :global(.counter) {
    font-size: 48px;
    font-weight: bold;
    text-align: center;
    margin: 16px 0;
  }

  :global(nav a) {
    color: #fff;
    text-decoration: none;
    padding: 6px 14px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    margin-right: 8px;
    font-size: 14px;
  }

  :global(nav a:hover) {
    background: rgba(255, 255, 255, 0.32);
  }
</style>
