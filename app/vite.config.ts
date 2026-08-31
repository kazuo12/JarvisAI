import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // caminho relativo: o build funciona servido de qualquer pasta
  base: "./",
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false },
  server: {
    port: 5173,
    // durante o "npm run dev", as chamadas de cerebro vao para o server.js
    proxy: { "/api": "http://localhost:8787" }
  }
});
