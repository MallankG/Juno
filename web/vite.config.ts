import { defineConfig } from "vite"

// Builds the phone app into web/dist. scripts/embed-web.mjs then embeds the
// files into the agent, which serves them at its own address.
export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    target: "es2022"
  }
})
