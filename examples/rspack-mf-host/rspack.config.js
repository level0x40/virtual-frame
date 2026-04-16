const rspack = require("@rspack/core");
const refreshPlugin = require("@rspack/plugin-react-refresh");
const { ModuleFederationPlugin } = require("@module-federation/enhanced/rspack");

const isDev = process.env.NODE_ENV === "development";
const PORT = Number(process.env.PORT) || 3012;
// REMOTE_URL is read at build time by the e2e harness (rebuilds with
// this env set per run) AND at dev-serve time.
const REMOTE_URL = process.env.REMOTE_URL || "http://127.0.0.1:3013";

/** @type {import('@rspack/cli').Configuration} */
module.exports = {
  entry: { main: "./src/index.tsx" },
  resolve: { extensions: ["...", ".ts", ".tsx", ".jsx"] },

  devServer: {
    port: PORT,
    host: "127.0.0.1",
    hot: true,
    liveReload: false,
    // See rspack-mf-remote/rspack.config.js for the full explanation.
    // webpack-dev-server rejects requests whose Host header doesn't match
    // the bound host ("Invalid Host/Origin header"). We bind 127.0.0.1 but
    // browsers may arrive with `localhost`, and the e2e harness uses
    // dynamic ports — accept any host. Safe in dev.
    allowedHosts: "all",
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization",
    },
    // Proxy the remote's dev server so the Virtual Frame iframe is same-origin.
    // Module Federation loads remoteEntry.js directly (cross-origin is fine),
    // but Virtual Frame needs same-origin to read the iframe's DOM.
    proxy: [
      {
        context: ["/remote"],
        target: REMOTE_URL,
        pathRewrite: { "^/remote": "" },
      },
    ],
  },

  // See rspack-mf-remote/rspack.config.js for the full explanation.
  // Must be top-level (not under `experiments`) — @rspack/cli force-
  // enables `{imports: true, entries: false}` when top-level
  // `lazyCompilation` is undefined.
  lazyCompilation: false,

  devtool: "source-map",
  output: {
    uniqueName: "mf_host",
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
    new rspack.DefinePlugin({
      // Expose the remote's URL to client code so VirtualFrame can load
      // the remote cross-origin (via the bridge) when no dev proxy is
      // available (e.g. prod served by `npx serve`).
      __VF_REMOTE_URL__: JSON.stringify(REMOTE_URL),
    }),
    new rspack.HtmlRspackPlugin({
      template: "./src/index.html",
    }),
    new ModuleFederationPlugin({
      name: "mf_host",
      // Prefer provides already loaded in the shared scope over the
      // nominally-highest-version one. Default ("version-first") ties
      // when host and remote ship the same react version — the remote's
      // remoteEntry registers last and wins, so the host's consume
      // resolves to a factory that lives in a remote-owned chunk the
      // browser hasn't fetched yet, crashing with
      //   factory is undefined (webpack/sharing/consume/default/react/react)
      // until the remote app has been visited directly and its vendor
      // chunk is cached. "loaded-first" makes the host use its own
      // already-loaded react provide.
      shareStrategy: "loaded-first",
      // No filename or manifest — the host is a consumer only.
      // Setting filename here would emit a remoteEntry.js + mf-manifest.json
      // that conflicts with the remote's manifest fetched at runtime.

      // ── Consume the remote's Counter via Module Federation ──
      remotes: {
        mf_remote: `mf_remote@${REMOTE_URL}/mf-manifest.json`,
      },

      // The async bootstrap boundary (index.tsx → import("./bootstrap"))
      // ensures shared modules are resolved before app code runs.
      // Do NOT use eager: true — it causes "factory is undefined" in
      // pnpm monorepos because the sync entry chunk tries to use the
      // shared module before MF runtime has registered it.
      // `eager: true` on the HOST only. The host has no `exposes` and
      // emits no remoteEntry.js, so eager shares just bundle into
      // main.js and register synchronously during host bootstrap —
      // exactly what we want. Without eager here, the remote's
      // lazy-registered provide stubs win the share-scope slot (same
      // version tie) and the host's consume resolves to a factory that
      // doesn't exist yet, crashing with:
      //   factory is undefined (webpack/sharing/consume/default/react)
      // until the remote app has been visited directly.
      //
      // Do NOT copy this pattern to the REMOTE — eager on a provider
      // with `exposes` breaks remoteEntry.js self-registration and
      // crashes the host with "remoteEntryExports is undefined".
      shared: {
        react: { singleton: true, eager: true },
        "react-dom": { singleton: true, eager: true },
        // Store and react bindings MUST be singletons so host and remote
        // share WeakMap identity for getStore().
        "@virtual-frame/store": { singleton: true, eager: true },
        "@virtual-frame/react": { singleton: true, eager: true },
      },
    }),
    isDev ? new refreshPlugin() : null,
  ].filter(Boolean),
};
