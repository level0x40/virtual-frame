/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 rejects requests from origins that don't match the dev
  // server's hostname. Allow 127.0.0.1 so the e2e harness and manual
  // browsing both work.
  allowedDevOrigins: ["127.0.0.1"],
  // Allow the host app to embed this page in an iframe (srcdoc) and
  // fetch resources cross-origin during SSR.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },
};

export default nextConfig;
