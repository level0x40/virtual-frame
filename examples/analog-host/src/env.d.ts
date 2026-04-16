/// <reference types="vite/client" />

// Minimal process.env typing for the SSR entry (main.server.ts).
// The full @types/node package is not needed — only process.env is
// used at runtime, and Analog/Nitro provides it in the server bundle.
declare const process: { env: Record<string, string | undefined> };
