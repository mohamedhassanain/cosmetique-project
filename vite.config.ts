/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
// import { visualizer } from "rollup-plugin-visualizer"; // Diagnostic : décommenter pour analyser le bundle
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react() /* , visualizer({ open: false, filename: 'stats.html', gzipSize: true, brotliSize: true }) */].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Code splitting : isole les grosse bibliothèques du bundle principal.
        // Chaque vendor devient un chunk séparé (mis en cache par le navigateur),
        // ce qui supprime le warning « chunk larger than 500 kB ».
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router")) return "react-router";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@radix-ui")) return "radix-ui";
          if (id.includes("@tanstack")) return "tanstack-query";
          if (id.includes("@sentry")) return "sentry";
          if (id.includes("leaflet")) return "leaflet";
          if (id.includes("recharts")) return "recharts";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-core";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}));
