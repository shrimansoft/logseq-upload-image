import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    build: {
        target: "esnext",
        minify: "esbuild",
        outDir: "dist",
        emptyOutDir: true,
    },
});
