import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import react from "@vitejs/plugin-react";

// Root loads the client from its own folder, so asset paths must be relative.
export default defineConfig({
  base: "./",
  server: { open: false, fs: { allow: [".."] } },
  plugins: [react(), checker({ typescript: true })],
});
