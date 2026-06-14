import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages *project* pages the site is served from /<repo-name>/.
// Override via BASE_PATH env (set to "/" once the site moves to Cloudflare Pages).
const base = process.env.BASE_PATH ?? "/Run-Hub/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2022",
  },
  esbuild: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
});

