import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => {
  const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:5001";

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: "generateSW",
        injectRegister: false,
        manifest: false,
        workbox: {
          globPatterns: ["**/*.{js,css,woff2,png,webmanifest,html}"],
          globIgnores: ["logo.png"],
          // Vite builds with base "/static/" and Flask serves built frontend files from /static.
          // Prepend /static/ so precache keys match browser request URLs.
          modifyURLPrefix: { "": "/static/" },
          navigateFallback: "/static/index.html",
          skipWaiting: true,
          clientsClaim: true,
          navigateFallbackDenylist: [/^\/api/, /^\/d\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-stylesheets",
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    base: command === "build" ? "/static/" : "/",
    server: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          timeout: 0,
          proxyTimeout: 0,
        },
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
