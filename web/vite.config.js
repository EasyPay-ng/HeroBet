import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/HeroBet/" : "/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        dashboard: resolve(root, "dashboard.html"),
        markets: resolve(root, "markets.html"),
        notfound: resolve(root, "404.html"),
      },
      output: {
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
          charts: ["lightweight-charts"],
        },
      },
    },
  },
});
