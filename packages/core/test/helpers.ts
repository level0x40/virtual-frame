/**
 * Shared test helpers for Virtual Frame browser-mode tests.
 */

/**
 * Create a same-origin iframe pointing at a fixture page, append it to the
 * document, wait for it to load, and return it.
 *
 * @param {string} fixturePath - Path relative to the test fixtures dir,
 *   e.g. "basic.html".  Resolved against the current module URL.
 * @returns {Promise<HTMLIFrameElement>}
 */
export async function createIframe(fixturePath) {
  const url = new URL(`./fixtures/${fixturePath}`, import.meta.url).href;
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:800px;height:600px;border:none;";
  iframe.src = url;
  document.body.appendChild(iframe);
  await new Promise((resolve) => iframe.addEventListener("load", resolve));
  return iframe;
}

/**
 * Create a host `<div>` and append it to the document body.
 */
export function createHost() {
  const host = document.createElement("div");
  host.style.cssText = "width:800px;height:600px;overflow:auto;";
  document.body.appendChild(host);
  return host;
}

/**
 * Wait for a VirtualFrame instance to finish initialising.
 * Uses a polling approach — checks `isInitialized` flag.
 */
export async function waitForInit(vf, timeout = 5000) {
  const start = Date.now();
  while (!vf.isInitialized && Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!vf.isInitialized) {
    throw new Error("VirtualFrame did not initialise within timeout");
  }
}

/**
 * Wait for the next `requestAnimationFrame` tick.
 */
export function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Wait for a fixed delay (ms).
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clean up all iframes and host divs added during a test.
 */
export function cleanup() {
  document.querySelectorAll("iframe").forEach((el) => el.remove());
  document.querySelectorAll("div[style]").forEach((el) => {
    if (el.closest("body") === document.body) el.remove();
  });
}
