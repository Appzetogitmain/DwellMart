import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@modules": path.resolve(__dirname, "./src/modules"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // C9 (DEBT-4): Explicit chunk boundaries prevent Admin/Vendor/Delivery
        // code from landing in the customer-facing bundle.
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) {
              return "vendor-charts";
            }
            if (id.includes("react-dom") || id.includes("react-router")) {
              return "vendor-react";
            }
            return "vendor";
          }
          if (id.includes("/modules/Admin/")) return "chunk-admin";
          if (id.includes("/modules/Vendor/")) return "chunk-vendor";
          if (id.includes("/modules/Delivery/")) return "chunk-delivery";
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
