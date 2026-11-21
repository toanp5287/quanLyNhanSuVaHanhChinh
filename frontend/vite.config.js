import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8080";

const apiProxy = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
