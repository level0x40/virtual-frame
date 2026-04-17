/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { raw } from "hono/html";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { fetchVirtualFrame } from "virtual-frame/ssr";

const app = new Hono();

// ── Serve virtual-frame client dist files ───────────────────
// The browser needs access to element.js + core.js to hydrate.
const VF_DIST = join(import.meta.dirname, "../../../packages/core/dist");

app.get("/vf/:file", async (c) => {
  try {
    const fileName = c.req.param("file");
    // Only allow .js files for security
    if (!fileName.endsWith(".js")) return c.notFound();
    const content = await readFile(join(VF_DIST, fileName), "utf-8");
    c.header("Content-Type", "application/javascript; charset=utf-8");
    return c.body(content);
  } catch {
    return c.notFound();
  }
});

// ── Remote app ──────────────────────────────────────────────
// A simple "remote" page that will be embedded via virtual frame.
// In a real setup this would live on a different server / port.

app.get("/remote", (c) => {
  return c.html(
    <html>
      <head>
        <meta charset="utf-8" />
        <style>{`
          body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            box-sizing: border-box;
          }
          .card {
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 16px;
            border: 1px solid rgba(255,255,255,0.2);
          }
          h1 { margin: 0 0 8px; font-size: 28px; }
          p  { margin: 0 0 16px; opacity: 0.9; line-height: 1.6; }
          code {
            background: rgba(255,255,255,0.15);
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 14px;
          }
          .counter {
            font-size: 48px;
            font-weight: bold;
            text-align: center;
            padding: 16px;
          }
          button {
            background: rgba(255,255,255,0.25);
            color: white;
            border: 1px solid rgba(255,255,255,0.4);
            padding: 10px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            margin: 4px;
            transition: background 0.2s;
          }
          button:hover { background: rgba(255,255,255,0.4); }
          .actions { text-align: center; }
          input[type="text"] {
            width: 100%;
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.3);
            background: rgba(255,255,255,0.15);
            color: white;
            font-size: 16px;
            box-sizing: border-box;
            outline: none;
          }
          input[type="text"]::placeholder { color: rgba(255,255,255,0.5); }
          input[type="text"]:focus {
            border-color: rgba(255,255,255,0.6);
            background: rgba(255,255,255,0.2);
          }
          .echo { margin-top: 8px; font-style: italic; opacity: 0.8; }
          .timestamp { font-size: 12px; opacity: 0.6; text-align: right; }
        `}</style>
      </head>
      <body>
        <div class="card" id="info-card">
          <h1>🚀 Remote App</h1>
          <p>
            This page is fetched during SSR and rendered instantly. The iframe is initialised with{" "}
            <code>srcdoc</code> from the already-fetched HTML — no extra network request!
          </p>
          <p class="timestamp" id="ts">
            Server-rendered at: {new Date().toISOString()}
          </p>
        </div>

        <div class="card" id="counter-card">
          <div class="counter" id="count">
            0
          </div>
          <div class="actions">
            <button id="dec">− Decrement</button>
            <button id="inc">+ Increment</button>
          </div>
        </div>

        <div class="card" id="echo-card">
          <p>Type something — it mirrors live through the virtual frame:</p>
          <input type="text" id="echoInput" placeholder="Type here…" />
          <div class="echo" id="echoOutput">
            …
          </div>
        </div>

        <script>
          {raw(`
          // Simple interactive counter
          let count = 0;
          const countEl = document.getElementById('count');
          document.getElementById('dec').addEventListener('click', () => {
            countEl.textContent = --count;
          });
          document.getElementById('inc').addEventListener('click', () => {
            countEl.textContent = ++count;
          });

          // Echo input
          const echoInput = document.getElementById('echoInput');
          const echoOutput = document.getElementById('echoOutput');
          echoInput.addEventListener('input', () => {
            echoOutput.textContent = echoInput.value || '…';
          });

          // Live timestamp
          setInterval(() => {
            document.getElementById('ts').textContent =
              'Live at: ' + new Date().toISOString();
          }, 1000);
        `)}
        </script>
      </body>
    </html>,
  );
});

// ── Host page (SSR) ─────────────────────────────────────────

app.get("/", async (c) => {
  const remoteUrl = new URL("/remote", c.req.url).href;

  // Fetch the remote page during SSR and produce pre-rendered output.
  const frame = await fetchVirtualFrame(remoteUrl);

  // Re-render with a selector — no extra fetch!  Uses frame.render() to
  // produce a second <virtual-frame> that shows only the counter card.
  // On the client both elements share a single iframe.
  const counterFrame = await frame.render({ selector: "#counter-card" });

  return c.html(
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Virtual Frame — Hono SSR Example</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #f0f2f5;
            min-height: 100vh;
            padding: 32px;
          }
          h1 {
            text-align: center;
            color: #1a1a2e;
            margin-bottom: 8px;
            font-size: 32px;
          }
          .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 32px;
            font-size: 14px;
          }
          .layout {
            max-width: 900px;
            margin: 0 auto;
            display: grid;
            gap: 24px;
          }
          .panel {
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          }
          .panel h2 {
            color: #333;
            margin-bottom: 16px;
            font-size: 18px;
          }
          virtual-frame {
            display: block;
            border-radius: 8px;
            overflow: hidden;
            min-height: 200px;
          }
          .info {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
            padding: 12px 16px;
            border-radius: 4px;
            font-size: 14px;
            color: #2e7d32;
            line-height: 1.5;
          }
          .info code {
            background: rgba(0,0,0,0.06);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
          }
        `}</style>
      </head>
      <body>
        <h1>Virtual Frame — SSR Example</h1>
        <p class="subtitle">
          Remote content fetched on the server, pre-rendered via declarative shadow DOM, then
          resumed on the client.
        </p>

        <div class="layout">
          <div class="panel info">
            <strong>How it works:</strong> The server fetches the remote page once and renders two{" "}
            <code>&lt;virtual-frame&gt;</code> elements — one showing the full page, one showing
            only <code>#counter-card</code> (via <code>frame.render()</code> with a selector). On
            the client, both elements <strong>share a single hidden iframe</strong> (ref-counted).
            The diff-based resume delta reconstructs the full page from the shadow DOM content —
            zero extra network requests, zero iframe duplication.
          </div>

          <div class="panel">
            <h2>Full Remote App (no selector)</h2>
            {raw(frame.html)}
          </div>

          <div class="panel">
            <h2>
              Counter Card Only (selector: <code>#counter-card</code>)
            </h2>
            {raw(counterFrame.html)}
          </div>
        </div>

        {raw(`
          <script type="importmap">
            {
              "imports": {
                "virtual-frame/element": "/vf/element.js",
                "virtual-frame/": "/vf/"
              }
            }
          </script>
          <script type="module">
            // Register the <virtual-frame> custom element.
            // It detects the SSR content and resumes with srcdoc.
            import "virtual-frame/element";
          </script>
        `)}
      </body>
    </html>,
  );
});

// ── Start server ────────────────────────────────────────────

const port = Number(process.env.PORT) || 8000;
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`\n  🚀 Hono SSR example running at:`);
  console.log(`  ➜ http://localhost:${info.port}/\n`);
  console.log(`  Remote page:  http://localhost:${info.port}/remote`);
  console.log(`  Host (SSR):   http://localhost:${info.port}/\n`);
});
