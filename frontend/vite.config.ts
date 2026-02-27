import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:5001";

  return {
    plugins: [react()],
    base: command === "build" ? "/static/" : "/",
    server: {
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/d": { target: proxyTarget, changeOrigin: true },
        "/static": { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      globals: true,
    },
  };
});
