import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const port = Number(process.env.PORT) || 3006;

export default defineConfig({
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  plugins: [reactRouter()],
});
