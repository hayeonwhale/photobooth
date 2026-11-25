import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(() => ({
  base: "/photobooth/",
  plugins: [react()],
  optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
  server: { allowedHosts: true },
  preview: { allowedHosts: true },
}));
