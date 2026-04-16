/** @type {import('next').NextConfig} */
const nextConfig = {
  // See nextjs-app-host/next.config.mjs for why this is required:
  // Next 16 dev blocks client-side actions when the browser origin
  // doesn't match the advertised dev origin. E2E uses 127.0.0.1.
  allowedDevOrigins: ["localhost", "127.0.0.1"],

  transpilePackages: ["@virtual-frame/next", "@virtual-frame/store"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
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
