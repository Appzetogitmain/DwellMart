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
    chunkSizeWarningLimit: 600,
    modulePreload: {
      // Prevent role-specific admin/vendor/delivery chunks and charts/sockets
      // from being preloaded into the customer storefront index.html
      resolveDependencies: (filename, deps) => {
        return deps.filter(
          (dep) =>
            !dep.includes("chunk-admin") &&
            !dep.includes("chunk-vendor") &&
            !dep.includes("chunk-delivery") &&
            !dep.includes("vendor-charts") &&
            !dep.includes("vendor-socket") &&
            !dep.includes("vendor-firebase")
        );
      },
    },
    rollupOptions: {
      output: {
        // C9 (DEBT-4) & Phase 11 (P2-PERF-03): Targeted chunk boundaries
        // Decomposes the monolithic vendor bundle (>1 MB) into balanced chunks.
        manualChunks: (id) => {
          const norm = id.replace(/\\/g, "/");
          if (norm.includes("/node_modules/")) {
            if (norm.includes("/recharts/") || norm.includes("/d3-") || norm.includes("/victory")) {
              return "vendor-charts";
            }
            if (norm.includes("@lottiefiles") || norm.includes("lottie-react")) {
              return "vendor-lottie";
            }
            if (norm.includes("framer-motion") || norm.includes("/gsap/")) {
              return "vendor-animation";
            }
            if (norm.includes("/firebase/") || norm.includes("/@firebase/")) {
              return "vendor-firebase";
            }
            if (
              norm.includes("/socket.io-client/") ||
              norm.includes("/engine.io-client/") ||
              norm.includes("/socket.io-parser/") ||
              norm.includes("/engine.io-parser/") ||
              norm.includes("/@socket.io/")
            ) {
              return "vendor-socket";
            }
            if (norm.includes("/lucide-react/") || norm.includes("/react-icons/")) {
              return "vendor-icons";
            }
            return "vendor-core";
          }
          if (norm.includes("/modules/Admin/")) return "chunk-admin";
          if (norm.includes("/modules/Vendor/")) return "chunk-vendor";
          if (norm.includes("/modules/Delivery/")) return "chunk-delivery";
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
