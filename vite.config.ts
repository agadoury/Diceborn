import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icons/apple-touch-icon.svg",
      ],
      manifest: {
        name: "Pact of Heroes",
        short_name: "Pact of Heroes",
        description: "Pact of Heroes — a 1v1 dice-and-card duel. Mobile-first, installable as a PWA.",
        theme_color: "#0E0814",
        background_color: "#0E0814",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.svg",      sizes: "192x192",   type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon-512.svg",      sizes: "512x512",   type: "image/svg+xml", purpose: "any" },
          { src: "/icons/icon-maskable.svg", sizes: "512x512",   type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
