import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "spa"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "android/app/src/main/assets/www"),
    emptyOutDir: true,
  },
});
