import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const root = resolve(import.meta.dirname);
  const env = loadEnv(mode, resolve(root, ".."), "");
  const apiPort = env.DOCKYARD_PORT || "36969";
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    root,
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyDirBeforeWrite: true,
    },
    server: {
      port: 5173,
      proxy: {
        "/work-orders": { target: apiTarget, changeOrigin: true },
        "/issues": { target: apiTarget, changeOrigin: true },
        "/dates": { target: apiTarget, changeOrigin: true },
        "/health": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
