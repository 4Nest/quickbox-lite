import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  base: "/console-assets/",
  build: { outDir: "../console-dist", emptyOutDir: true },
  server: {
    proxy: {
      "/console/api": "http://127.0.0.1:8575",
      "/socket.io": { target: "http://127.0.0.1:8575", ws: true },
    },
  },
});
