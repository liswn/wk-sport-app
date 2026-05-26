import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type PluginOption, type ResolvedConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function githubPagesFallback(): PluginOption {
  let config: ResolvedConfig;
  return {
    name: "github-pages-fallback",
    apply: "build",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    closeBundle() {
      const indexPath = join(config.build.outDir, "index.html");
      const fallbackPath = join(config.build.outDir, "404.html");
      if (existsSync(indexPath)) {
        copyFileSync(indexPath, fallbackPath);
      }
    }
  };
}

export default defineConfig(({ command }) => {
  const base = command === "build" ? "/wk-sport-app/" : "/";

  return {
    base,
    server: {
      host: "127.0.0.1",
      port: 5271,
      strictPort: true
    },
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
      githubPagesFallback(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "pwa.svg",
          "pwa-192.png",
          "pwa-512.png",
          "apple-touch-icon.png"
        ],
        manifest: {
          name: "骑行训练记录",
          short_name: "骑行训练",
          description: "本地优先的骑行训练、体重和执行记录 PWA",
          lang: "zh-CN",
          theme_color: "#f7f7f2",
          background_color: "#f7f7f2",
          display: "standalone",
          orientation: "portrait",
          scope: base,
          start_url: base,
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
  };
});
