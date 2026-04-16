const REMOTE_URL = process.env.REMOTE_URL ?? "http://127.0.0.1:3001";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 dev enforces an origin allowlist for client-side requests
  // (Server Actions, HMR, fetch to `/_next/*`). The default only allows
  // the exact host the browser used to load the page. Our e2e helper
  // navigates via `127.0.0.1:<dynamic>` (forced, because Vite 8 doesn't
  // listen on `::1`), while `next dev` advertises itself as `localhost`
  // — origin mismatch silently breaks hydration + click handlers with
  // NO console error. Allow both loopback spellings here so both manual
  // runs and e2e work.
  allowedDevOrigins: ["localhost", "127.0.0.1"],

  // Proxy requests from the virtual frame iframe to the remote server.
  // This keeps all fetch/XHR requests same-origin, avoiding CORS.
  async rewrites() {
    return [
      {
        source: "/__vf/:path*",
        destination: `${REMOTE_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
