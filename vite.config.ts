import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"]
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa.svg", "pwa-192.png", "pwa-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "骑行训练记录",
        short_name: "骑行训练",
        description: "本地优先的骑行训练、体重和执行记录 PWA",
        lang: "zh-CN",
        theme_color: "#f7f7f2",
        background_color: "#f7f7f2",
        display: "standalone",
        orientation: "portrait",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "pwa.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          },
          {
            src: "pwa-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,ico,png}"],
        navigateFallback: "index.html"
      }
    })
  ]
});
