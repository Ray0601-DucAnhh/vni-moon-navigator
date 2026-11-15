import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // three.js + React Three Fiber in their own long-cached chunk.
        manualChunks(id: string) {
          if (/node_modules[\/](three|@react-three)[\/]/.test(id)) return "three";
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
