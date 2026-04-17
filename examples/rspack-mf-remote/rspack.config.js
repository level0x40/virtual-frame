const rspack = require("@rspack/core");
const refreshPlugin = require("@rspack/plugin-react-refresh");
const { ModuleFederationPlugin } = require("@module-federation/enhanced/rspack");

const isDev = process.env.NODE_ENV === "development";
const PORT = Number(process.env.PORT) || 3013;

/** @type {import('@rspack/cli').Configuration} */
module.exports = {
  entry: { main: "./src/index.tsx" },
  resolve: { extensions: ["...", ".ts", ".tsx", ".jsx"] },

  devServer: {
    port: PORT,
    host: "127.0.0.1",
    // HMR is disabled on the remote. Module Federation providers with
    // `exposes` route hot-updates through `self.webpackHotUpdatemf_remote`,
    // which reaches into the container's module registry — any shape
    // mismatch between the patch and the container crashes with
    //   Cannot set properties of undefined (setting '…lazy-compilation-proxy')
    // The remote still rebuilds on save; the standalone :3011 page just
    // does a full reload, which is an acceptable dev-ergonomics tradeoff
    // for a provider that's primarily consumed by the host anyway.
    hot: false,
    liveReload: true,
    // webpack-dev-server (which rspack-dev-server inherits from) rejects
    // requests whose Host header doesn't match the bound host with
    // "Invalid Host/Origin header". Because the server binds to
    // 127.0.0.1 but browsers/MF-runtime requests can arrive with either
    // `localhost` or `127.0.0.1` in the Host header — and the e2e
    // harness binds to dynamic ports — accept any host. Safe in dev.
    allowedHosts: "all",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization",
    },
  },

  // Disable lazy compilation.
  //
  // MUST be set at the top level, NOT under `experiments`. `@rspack/cli`
  // has this auto-enable block for web-only builds:
  //
  //   if (isWebAppOnly && void 0 === userConfig.lazyCompilation)
  //     compiler.options.lazyCompilation = { imports: true, entries: false };
  //
  // It checks `userConfig.lazyCompilation` (top-level), so
  // `experiments.lazyCompilation: false` does NOT gate it — the CLI sees
  // top-level as `undefined` and turns lazy compilation ON for every
  // dynamic `import()`. That wraps MF's own async consume chunks in a
  // `*_lazy-compilation-proxy.js` shim that calls back to rspack's
  // `/lazy-compilation/` endpoint on port 3011. When the remote is
  // loaded through the host's `/remote` proxy at port 3010, those
  // callbacks are cross-origin and silently never fire — the iframe's
  // `#root` stays empty. Worse, hot-updates for those proxy modules
  // crash with:
  //   Cannot set properties of undefined
  //     (setting '…!lazy-compilation-proxy')
  //   at self.webpackHotUpdatemf_remote (remoteEntry.js)
  // because the hot-update slot was never created on the MF container.
  lazyCompilation: false,

  devtool: "source-map",
  output: {
    uniqueName: "mf_remote",
    // "auto" lets rspack determine the public path at runtime based on the
    // document URL.  This is critical because the remote is loaded two ways:
    //   1. Directly at http://localhost:3011/  (standalone)
    //   2. Proxied through the host at /remote/  (Virtual Frame iframe)
    // An absolute URL here would cause scripts in the proxied iframe to
    // bypass the proxy and load cross-origin, silently breaking rendering.
    publicPath: "auto",
    filename: "[name].js",
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.(jsx?|tsx?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: { syntax: "typescript", tsx: true },
                transform: {
                  react: {
                    runtime: "automatic",
                    development: isDev,
                    refresh: isDev,
                  },
                },
              },
            },
          },
        ],
      },
    ],
  },

  plugins: [
    new rspack.HtmlRspackPlugin({
      template: "./src/index.html",
    }),
    new ModuleFederationPlugin({
      name: "mf_remote",
      filename: "remoteEntry.js",
      // manifest is emitted automatically by @module-federation/enhanced
      // when `exposes` is set — do not add `manifest: true` explicitly
      // or it will conflict with the default emit (duplicate asset error).

      // ── Exposed modules ───────────────────────────────
      // These components can be consumed by the host via
      // Module Federation — no iframe, same JS context.
      exposes: {
        "./Counter": "./src/components/Counter.tsx",
      },

      // ── Shared modules ────────────────────────────────
      //
      // This remote is dual-purpose: an MF provider (exposes ./Counter)
      // AND a standalone web app at `/`. Its standalone bundle imports
      // react / react-dom / @virtual-frame/*, all listed below as
      // `shared`. MF rewrites those imports into runtime `consume()`
      // calls that require the shared scope to have been initialised
      // first.
      //
      // For that to work standalone (no host present to call init), the
      // remote's entry MUST go through an async boundary:
      //
      //   src/index.tsx     →  import("./bootstrap")
      //   src/bootstrap.tsx →  the actual createRoot / render code
      //
      // The dynamic `import()` creates a chunk split. MF inserts the
      // `__webpack_init_sharing__` + container init dance into the
      // initial chunk, then loads the bootstrap chunk only after the
      // shared scope is ready. Without that boundary, the standalone
      // page errors on first load with "Shared module is not available
      // for eager consumption" or returns the rspack error overlay.
      //
      // Do NOT use `eager: true` here as a shortcut — eager shares get
      // bundled into `main.js` instead of flowing through the container,
      // which breaks `remoteEntry.js`'s self-registration on
      // `window.mf_remote`. The host then crashes with
      // "[Federation Runtime]: remoteEntryExports is undefined".
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
        "@virtual-frame/store": { singleton: true },
        "@virtual-frame/react": { singleton: true },
      },
    }),
    isDev ? new refreshPlugin() : null,
  ].filter(Boolean),
};
