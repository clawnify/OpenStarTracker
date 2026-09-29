import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src/client") } },
  server: {
    proxy: {
      // `clawnify dev` runs the API on 8787 and generates its own toolchain
      // config; nothing in this repo configures the Worker.
      //
      // On the platform every request carries a verified X-Clawnify-Org-Id that
      // the perimeter injects and a client cannot forge. There is no perimeter
      // in front of `vite dev`, so without these headers every route answers
      // 403 on a fresh clone and the app looks broken.
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        headers: { "X-Clawnify-Org-Id": "local-dev-org", "X-Clawnify-Caller": "user" },
      },
    },
  },
});
