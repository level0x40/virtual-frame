import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Virtual Frame",
  description:
    "Microfrontend projection library — compose independently deployed applications with full interactivity",
  base: "/",
  cleanUrls: true,

  head: [["link", { rel: "icon", href: "/logo.svg" }]],

  vite: {
    server: {
      port: 5175,
      strictPort: true,
    },
  },

  themeConfig: {
    logo: { src: "/logo.svg", style: "height: 1em" },
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      { text: "GitHub", link: "https://github.com/level0x40/virtual-frame" },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          {
            text: "What is Virtual Frame?",
            link: "/guide/what-is-virtual-frame",
          },
          { text: "Getting Started", link: "/guide/getting-started" },
        ],
      },
      {
        text: "Framework Guides",
        items: [
          { text: "Vanilla JS", link: "/guide/vanilla" },
          { text: "React", link: "/guide/react" },
          { text: "Next.js", link: "/guide/nextjs" },
          { text: "React Router", link: "/guide/react-router" },
          { text: "TanStack Start", link: "/guide/tanstack-start" },
          { text: "@lazarv/react-server", link: "/guide/react-server" },
          { text: "Vue", link: "/guide/vue" },
          { text: "Nuxt", link: "/guide/nuxt" },
          { text: "Svelte", link: "/guide/svelte" },
          { text: "SvelteKit", link: "/guide/sveltekit" },
          { text: "Solid", link: "/guide/solid" },
          { text: "SolidStart", link: "/guide/solid-start" },
          { text: "Angular", link: "/guide/angular" },
          { text: "Analog", link: "/guide/analog" },
        ],
      },
      {
        text: "Advanced",
        items: [
          { text: "Shared Store", link: "/guide/store" },
          { text: "Cross-Origin", link: "/guide/cross-origin" },
          { text: "Shadow DOM Isolation", link: "/guide/shadow-dom" },
          { text: "Accessibility", link: "/guide/accessibility" },
          { text: "Selector Projection", link: "/guide/selector" },
          { text: "Streaming FPS", link: "/guide/streaming-fps" },
          { text: "Server-Side Rendering", link: "/guide/ssr" },
        ],
      },
      {
        text: "Operating",
        items: [
          { text: "Testing", link: "/guide/testing" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
          { text: "Stability & Versioning", link: "/guide/stability" },
          { text: "License", link: "/guide/license" },
        ],
      },
      {
        text: "API Reference",
        items: [{ text: "Core API", link: "/api/" }],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/level0x40/virtual-frame" }],
  },
});
