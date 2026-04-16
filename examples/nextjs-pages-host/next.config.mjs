/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next.js to transpile the workspace-linked packages
  // so that their ESM source (and node-html-parser) is bundled correctly.
  transpilePackages: ["virtual-frame", "@virtual-frame/next"],
  // Next 16 rejects requests from origins that don't match the dev
  // server's hostname. Allow 127.0.0.1 so the e2e harness (which
  // connects via 127.0.0.1) and manual browsing both work.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
